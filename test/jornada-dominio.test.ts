import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ProvisionadorInicial } from "../src/application/ProvisionadorInicial";
import { ServicoAutenticacao } from "../src/application/ServicoAutenticacao";
import { ServicoEquipamento } from "../src/application/ServicoEquipamento";
import { ServicoLote } from "../src/application/ServicoLote";
import { ServicoOrganizacao } from "../src/application/ServicoOrganizacao";
import { ServicoRelatorio } from "../src/application/ServicoRelatorio";
import { ServicoUsuario } from "../src/application/ServicoUsuario";
import { PapelUsuario } from "../src/domain/auth/PapelUsuario";
import { EstadoFisico, StatusRastreamento, TipoEquipamento } from "../src/domain/entities/EnumsDominio";
import { RepositorioEntidades } from "../src/infrastructure/RepositorioEntidades";

test("jornada completa aplica regras e produz rastreabilidade", async () => {
  const diretorio = await mkdtemp(join(tmpdir(), "greencode-journey-"));
  try {
    const provisionador = new ProvisionadorInicial(diretorio);
    const configuracao = await provisionador.provisionar("admin", "senha-forte-123");
    const autenticacao = new ServicoAutenticacao(diretorio, configuracao);
    const sessaoAdmin = await autenticacao.autenticar("admin", "senha-forte-123");
    const repositorio = new RepositorioEntidades(
      diretorio,
      Buffer.from(configuracao.chaveCriptografia, "base64"),
    );
    const usuarios = new ServicoUsuario(repositorio, autenticacao);
    const organizacoes = new ServicoOrganizacao(repositorio, autenticacao);
    const lotes = new ServicoLote(repositorio, autenticacao);
    const equipamentos = new ServicoEquipamento(repositorio, autenticacao);
    const relatorios = new ServicoRelatorio(repositorio, autenticacao);

    await assert.rejects(
      usuarios.criar(
        sessaoAdmin.token,
        "senha-curta",
        "Senha curta",
        PapelUsuario.AUDITOR,
        "1234567",
      ),
      /8 caracteres/,
    );
    const auditor = await usuarios.criar(
      sessaoAdmin.token,
      "auditor",
      "Auditor de leitura",
      PapelUsuario.AUDITOR,
      "senha123",
    );
    const sessaoAuditor = await autenticacao.autenticar("auditor", "senha123");
    const organizacao = await organizacoes.criar(sessaoAdmin.token, {
      razaoSocial: "Organizacao Exemplo Ltda",
      nomeFantasia: "Exemplo",
      cnpj: "11.222.333/0001-81",
    });
    await assert.rejects(
      organizacoes.criar(sessaoAdmin.token, {
        razaoSocial: "Duplicada Ltda",
        nomeFantasia: "Duplicada",
        cnpj: "11222333000181",
      }),
      /Ja existe uma organizacao/,
    );

    const hoje = new Date().toISOString().slice(0, 10);
    const contrato = await organizacoes.criarContrato(sessaoAdmin.token, {
      organizacaoId: organizacao.id,
      codigo: "CT-001",
      dataInicio: hoje,
    });
    const lote = await lotes.criar(sessaoAdmin.token, {
      organizacaoId: organizacao.id,
      contratoId: contrato.id,
      numeroNotaFiscal: "NF-100",
      transportadora: "Transporte Exemplo",
      dataEntrada: hoje,
    });
    const equipamento = await equipamentos.criar(sessaoAdmin.token, {
      loteId: lote.id,
      codigoBarras: "GC-0001",
      tipo: TipoEquipamento.NOTEBOOK,
      estadoFisico: EstadoFisico.BOM,
    });

    await assert.rejects(
      equipamentos.movimentar(sessaoAdmin.token, equipamento.id, {
        status: StatusRastreamento.EM_DESMONTE,
        estadoFisico: EstadoFisico.BOM,
      }),
      /Triagem completa/,
    );
    await equipamentos.iniciarTriagem(sessaoAdmin.token, equipamento.id);
    await equipamentos.concluirTriagem(sessaoAdmin.token, equipamento.id, {
      diagnostico: "Componentes e armazenamento avaliados.",
      destino: StatusRastreamento.APTO_REUSO,
    });
    await assert.rejects(
      equipamentos.movimentar(sessaoAdmin.token, equipamento.id, {
        status: StatusRastreamento.EM_DESMONTE,
        estadoFisico: EstadoFisico.RUIM,
      }),
      /Justificativa obrigatoria/,
    );
    await equipamentos.movimentar(sessaoAdmin.token, equipamento.id, {
      status: StatusRastreamento.EM_DESMONTE,
      estadoFisico: EstadoFisico.RUIM,
      justificativa: "Dano interno identificado durante a desmontagem.",
    });

    await assert.rejects(
      organizacoes.criar(sessaoAuditor.token, {
        razaoSocial: "Nao Permitida",
        nomeFantasia: "Nao Permitida",
        cnpj: "11444777000161",
      }),
      /Acesso negado/,
    );
    const relatorio = await relatorios.rastrearEquipamento(sessaoAuditor.token, "GC-0001");
    assert.equal(relatorio.organizacao.id, organizacao.id);
    assert.equal(relatorio.movimentacoes.length, 4);
    assert.equal(relatorio.equipamento.status, StatusRastreamento.EM_DESMONTE);
    assert.equal(relatorio.movimentacoes.at(-1)?.justificativa, "Dano interno identificado durante a desmontagem.");
    assert.equal(auditor.papel, PapelUsuario.AUDITOR);
  } finally {
    await rm(diretorio, { recursive: true, force: true });
  }
});

test("desativar usuario revoga suas sessoes ativas", async () => {
  const diretorio = await mkdtemp(join(tmpdir(), "greencode-revoke-"));
  try {
    const provisionador = new ProvisionadorInicial(diretorio);
    const configuracao = await provisionador.provisionar("admin", "senha-forte-123");
    const autenticacao = new ServicoAutenticacao(diretorio, configuracao);
    const admin = await autenticacao.autenticar("admin", "senha-forte-123");
    const repositorio = new RepositorioEntidades(
      diretorio,
      Buffer.from(configuracao.chaveCriptografia, "base64"),
    );
    const usuarios = new ServicoUsuario(repositorio, autenticacao);
    const operador = await usuarios.criar(
      admin.token,
      "operador",
      "Operador",
      PapelUsuario.OPERADOR_CADASTRO,
      "senha-forte-operador",
    );
    const sessao = await autenticacao.autenticar("operador", "senha-forte-operador");
    await usuarios.alterarAtivo(admin.token, operador.id, false);
    assert.throws(() => autenticacao.validarSessao(sessao.token), /invalida ou expirada/);
  } finally {
    await rm(diretorio, { recursive: true, force: true });
  }
});