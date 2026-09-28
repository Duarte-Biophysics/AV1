import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ProvisionadorInicial } from "../src/application/ProvisionadorInicial";
import { ServicoAutenticacao } from "../src/application/ServicoAutenticacao";
import { ServicoConfiguracaoGlobal } from "../src/application/ServicoConfiguracaoGlobal";
import { ServicoUsuario } from "../src/application/ServicoUsuario";
import { PapelUsuario } from "../src/domain/auth/PapelUsuario";
import { RepositorioEntidades } from "../src/infrastructure/RepositorioEntidades";

test("parametros globais ficam restritos ao administrador e persistem", async () => {
  const diretorio = await mkdtemp(join(tmpdir(), "greencode-settings-"));
  try {
    const provisionador = new ProvisionadorInicial(diretorio);
    const configuracao = await provisionador.provisionar("admin", "senha-forte-123");
    const autenticacao = new ServicoAutenticacao(diretorio, configuracao);
    const admin = await autenticacao.autenticar("admin", "senha-forte-123");
    const repositorio = new RepositorioEntidades(
      diretorio,
      Buffer.from(configuracao.chaveCriptografia, "base64"),
    );
    const servico = new ServicoConfiguracaoGlobal(repositorio, autenticacao);
    const usuarioServico = new ServicoUsuario(repositorio, autenticacao);
    const auditor = await usuarioServico.criar(
      admin.token,
      "auditor",
      "Auditor",
      PapelUsuario.AUDITOR,
      "senha-forte-auditor",
    );
    const sessaoAuditor = await autenticacao.autenticar(auditor.login, "senha-forte-auditor");

    const atualizado = await servico.atualizar(admin.token, {
      aliquotaImposto: 0.17,
      coeficienteDepreciacao: 0.2,
    });
    assert.equal((await servico.obter(admin.token)).aliquotaImposto, 0.17);
    assert.equal(atualizado.coeficienteDepreciacao, 0.2);
    await assert.rejects(
      servico.atualizar(admin.token, { aliquotaImposto: 1.1, coeficienteDepreciacao: 0.2 }),
      /entre 0 e 1/,
    );
    await assert.rejects(servico.obter(sessaoAuditor.token), /Acesso negado/);
  } finally {
    await rm(diretorio, { recursive: true, force: true });
  }
});