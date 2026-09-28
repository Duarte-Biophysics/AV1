import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface, type Interface } from "node:readline";
import type { ServicoAutenticacao } from "../application/ServicoAutenticacao";
import type { ServicoEquipamento } from "../application/ServicoEquipamento";
import type { ServicoConfiguracaoGlobal } from "../application/ServicoConfiguracaoGlobal";
import type { ServicoLote } from "../application/ServicoLote";
import type { ServicoOrganizacao } from "../application/ServicoOrganizacao";
import type { ServicoRelatorio } from "../application/ServicoRelatorio";
import type { ServicoUsuario } from "../application/ServicoUsuario";
import type { DadosSessao } from "../application/ServicoAutenticacao";
import { PapelUsuario } from "../domain/auth/PapelUsuario";
import { interpretarComando, perguntarSenha } from "./EntradaTerminal";
import { EstadoFisico, StatusRastreamento, TipoEquipamento } from "../domain/entities/EnumsDominio";

export interface ServicosCLI {
  autenticacao: ServicoAutenticacao;
  usuarios: ServicoUsuario;
  organizacoes: ServicoOrganizacao;
  lotes: ServicoLote;
  equipamentos: ServicoEquipamento;
  relatorios: ServicoRelatorio;
  configuracaoGlobal: ServicoConfiguracaoGlobal;
}

const COMANDOS_POR_PAPEL: Record<string, string[]> = {
  ADMINISTRADOR: [
    "usuario criar", "usuario listar", "usuario desativar",
    "config obter", "config definir",
    "org criar", "org listar", "contrato criar", "contrato listar",
    "lote criar", "lote listar", "equip criar", "equip listar",
    "equip triagem-iniciar", "equip triagem-concluir", "equip movimentar", "relatorio rastrear",
  ],
  OPERADOR_CADASTRO: ["org criar", "org listar", "contrato criar", "contrato listar"],
  GESTOR_ALMOXARIFADO: [
    "lote criar", "lote listar", "equip criar", "equip listar",
    "equip triagem-iniciar", "equip triagem-concluir", "equip movimentar", "relatorio rastrear",
  ],
  AUDITOR: ["org listar", "contrato listar", "lote listar", "equip listar", "relatorio rastrear"],
};

export class CLIInterface {
  private terminal?: Interface;

  constructor(
    private readonly diretorioDados: string,
    private readonly sessao: DadosSessao,
    private readonly servicos: ServicosCLI,
  ) {}

  async iniciar(): Promise<void> {
    const comandos = [...(COMANDOS_POR_PAPEL[this.sessao.papel] ?? []), "ajuda", "sair"];
    const terminal = createInterface({
      input: process.stdin,
      output: process.stdout,
      completer: (linha: string) => {
        const prefixo = linha.trimStart();
        return [comandos.filter((comando) => comando.startsWith(prefixo)), prefixo];
      },
      historySize: 500,
      removeHistoryDuplicates: true,
    }) as ReturnType<typeof createInterface> & { history: string[] };
    this.terminal = terminal;
    const caminhoHistorico = join(this.diretorioDados, ".greencode_history");
    await mkdir(this.diretorioDados, { recursive: true });
    try {
      const historico = (await readFile(caminhoHistorico, "utf8")).split("\n").filter(Boolean);
      terminal.history = historico.reverse().slice(0, 500);
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code !== "ENOENT") throw erro;
    }

    console.log(`\nSessao: ${this.sessao.login} (${this.sessao.papel})`);
    this.exibirMenuPorPapel();
    try {
      while (true) {
        const linha = await new Promise<string>((resolve) => {
          terminal.question(`${this.sessao.login}> `, resolve);
        });
        if (!linha.trim()) continue;
        terminal.history = [linha, ...terminal.history.filter((item) => item !== linha)].slice(0, 500);
        await this.persistirHistorico(terminal.history ?? [], caminhoHistorico);
        try {
          const continuar = await this.executarComando(linha);
          if (!continuar) break;
        } catch (erro) {
          console.error(`[ERRO] ${erro instanceof Error ? erro.message : "Falha inesperada."}`);
        }
      }
    } finally {
      terminal.close();
      this.terminal = undefined;
    }
  }

  exibirMenuPorPapel(): void {
    const comandos = COMANDOS_POR_PAPEL[this.sessao.papel] ?? [];
    console.log("Comandos disponiveis:");
    for (const comando of comandos) console.log(`  ${comando}`);
    console.log("  ajuda\n  sair");
  }

  private async executarComando(linha: string): Promise<boolean> {
    const comando = interpretarComando(linha);
    const token = this.sessao.token;
    if (comando.grupo === "sair" || comando.grupo === "logout") {
      this.servicos.autenticacao.encerrarSessao(token);
      console.log("[INFO] Sessao encerrada.");
      return false;
    }
    if (comando.grupo === "ajuda") {
      this.exibirMenuPorPapel();
      return true;
    }

    let resultado: unknown;
    let mensagem: string;
    if (comando.grupo === "usuario" && comando.acao === "criar") {
      const senha = await this.capturarSenha("Senha do novo usuario: ");
      resultado = await this.servicos.usuarios.criar(
        token,
        obterOpcao(comando.opcoes, "login"),
        obterOpcao(comando.opcoes, "nome"),
        enumValue(comando.opcoes, "papel", Object.values(PapelUsuario)),
        senha,
      );
      mensagem = "Usuario criado.";
    } else if (comando.grupo === "usuario" && comando.acao === "listar") {
      resultado = await this.servicos.usuarios.listar(token);
      mensagem = "Usuarios cadastrados.";
    } else if (comando.grupo === "usuario" && comando.acao === "desativar") {
      resultado = await this.servicos.usuarios.alterarAtivo(token, obterOpcao(comando.opcoes, "id"), false);
      mensagem = "Usuario desativado e sessoes revogadas.";
    } else if (comando.grupo === "config" && comando.acao === "obter") {
      resultado = await this.servicos.configuracaoGlobal.obter(token);
      mensagem = "Configuracao global atual.";
    } else if (comando.grupo === "config" && comando.acao === "definir") {
      resultado = await this.servicos.configuracaoGlobal.atualizar(token, {
        aliquotaImposto: Number(obterOpcao(comando.opcoes, "aliquota")),
        coeficienteDepreciacao: Number(obterOpcao(comando.opcoes, "depreciacao")),
      });
      mensagem = "Configuracao global atualizada.";
    } else if (comando.grupo === "org" && comando.acao === "criar") {
      resultado = await this.servicos.organizacoes.criar(token, {
        razaoSocial: obterOpcao(comando.opcoes, "razao"),
        nomeFantasia: obterOpcao(comando.opcoes, "nome"),
        cnpj: obterOpcao(comando.opcoes, "cnpj"),
      });
      mensagem = "Organizacao criada.";
    } else if (comando.grupo === "org" && comando.acao === "listar") {
      resultado = await this.servicos.organizacoes.listar(token);
      mensagem = "Organizacoes cadastradas.";
    } else if (comando.grupo === "contrato" && comando.acao === "criar") {
      resultado = await this.servicos.organizacoes.criarContrato(token, {
        organizacaoId: obterOpcao(comando.opcoes, "org"),
        codigo: obterOpcao(comando.opcoes, "codigo"),
        dataInicio: obterOpcao(comando.opcoes, "inicio"),
        dataFim: opcaoOpcional(comando.opcoes, "fim"),
      });
      mensagem = "Contrato criado.";
    } else if (comando.grupo === "contrato" && comando.acao === "listar") {
      resultado = await this.servicos.organizacoes.listarContratos(token, opcaoOpcional(comando.opcoes, "org"));
      mensagem = "Contratos cadastrados.";
    } else if (comando.grupo === "lote" && comando.acao === "criar") {
      resultado = await this.servicos.lotes.criar(token, {
        organizacaoId: obterOpcao(comando.opcoes, "org"),
        contratoId: obterOpcao(comando.opcoes, "contrato"),
        numeroNotaFiscal: obterOpcao(comando.opcoes, "nf"),
        transportadora: obterOpcao(comando.opcoes, "transp"),
        dataEntrada: obterOpcao(comando.opcoes, "data"),
      });
      mensagem = "Lote registrado.";
    } else if (comando.grupo === "lote" && comando.acao === "listar") {
      resultado = await this.servicos.lotes.listar(token);
      mensagem = "Lotes cadastrados.";
    } else if (comando.grupo === "equip" && comando.acao === "criar") {
      resultado = await this.servicos.equipamentos.criar(token, {
        loteId: obterOpcao(comando.opcoes, "lote"),
        codigoBarras: obterOpcao(comando.opcoes, "codigo"),
        tipo: enumValue(comando.opcoes, "tipo", Object.values(TipoEquipamento)),
        estadoFisico: parseEstadoFisico(comando.opcoes, "estado"),
      });
      mensagem = "Equipamento cadastrado.";
    } else if (comando.grupo === "equip" && comando.acao === "listar") {
      resultado = await this.servicos.equipamentos.listar(token);
      mensagem = "Equipamentos cadastrados.";
    } else if (comando.grupo === "equip" && comando.acao === "triagem-iniciar") {
      resultado = await this.servicos.equipamentos.iniciarTriagem(token, obterOpcao(comando.opcoes, "id"));
      mensagem = "Triagem iniciada.";
    } else if (comando.grupo === "equip" && comando.acao === "triagem-concluir") {
      resultado = await this.servicos.equipamentos.concluirTriagem(token, obterOpcao(comando.opcoes, "id"), {
        diagnostico: obterOpcao(comando.opcoes, "diagnostico"),
        destino: enumValue(comando.opcoes, "destino", [StatusRastreamento.APTO_REUSO, StatusRastreamento.APTO_RECICLAGEM]),
      });
      mensagem = "Triagem concluida.";
    } else if (comando.grupo === "equip" && comando.acao === "movimentar") {
      resultado = await this.servicos.equipamentos.movimentar(token, obterOpcao(comando.opcoes, "id"), {
        status: enumValue(comando.opcoes, "status", Object.values(StatusRastreamento)),
        estadoFisico: parseEstadoFisico(comando.opcoes, "estado"),
        justificativa: opcaoOpcional(comando.opcoes, "justificativa"),
      });
      mensagem = "Movimentacao registrada.";
    } else if (comando.grupo === "relatorio" && comando.acao === "rastrear") {
      resultado = await this.servicos.relatorios.rastrearEquipamento(token, obterOpcao(comando.opcoes, "codigo"));
      mensagem = "Relatorio de rastreabilidade.";
    } else {
      throw new Error("Comando desconhecido. Use 'ajuda' para ver as opcoes disponiveis.");
    }

    console.log(`[SUCESSO] ${mensagem}`);
    console.log(JSON.stringify(resultado, null, 2));
    return true;
  }

  private async persistirHistorico(historicoAtual: string[], caminho: string): Promise<void> {
    const linhas = [...historicoAtual].reverse().slice(-500);
    await writeFile(caminho, linhas.length ? `${linhas.join("\n")}\n` : "", { mode: 0o600 });
  }

  private async capturarSenha(texto: string): Promise<string> {
    this.terminal?.pause();
    try {
      return await perguntarSenha(texto);
    } finally {
      this.terminal?.resume();
    }
  }
}

function obterOpcao(opcoes: Record<string, string | true>, chave: string): string {
  const valor = opcoes[chave];
  if (typeof valor !== "string" || !valor.trim()) throw new Error(`Opcao --${chave} obrigatoria.`);
  return valor.trim();
}

function opcaoOpcional(opcoes: Record<string, string | true>, chave: string): string | undefined {
  const valor = opcoes[chave];
  return typeof valor === "string" && valor.trim() ? valor.trim() : undefined;
}

function enumValue<T extends string>(
  opcoes: Record<string, string | true>,
  chave: string,
  valores: readonly T[],
): T {
  const valor = obterOpcao(opcoes, chave).toUpperCase();
  const encontrado = valores.find((item) => item.toUpperCase() === valor);
  if (!encontrado) throw new Error(`Valor invalido para --${chave}. Opcoes: ${valores.join(", ")}`);
  return encontrado;
}

function parseEstadoFisico(opcoes: Record<string, string | true>, chave: string): EstadoFisico {
  const valor = obterOpcao(opcoes, chave).toUpperCase();
  const estados: Record<string, EstadoFisico> = {
    INSERVIVEL: EstadoFisico.INSERVIVEL,
    PESSIMO: EstadoFisico.PESSIMO,
    RUIM: EstadoFisico.RUIM,
    REGULAR: EstadoFisico.REGULAR,
    BOM: EstadoFisico.BOM,
  };
  const nomeado = estados[valor];
  if (nomeado !== undefined) return nomeado;
  const numerico = Number(valor);
  if (Number.isInteger(numerico) && numerico >= EstadoFisico.INSERVIVEL && numerico <= EstadoFisico.BOM) {
    return numerico as EstadoFisico;
  }
  throw new Error(`Valor invalido para --${chave}. Opcoes: INSERVIVEL, PESSIMO, RUIM, REGULAR, BOM.`);
}