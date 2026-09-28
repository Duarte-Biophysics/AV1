import { join } from "node:path";
import type { RegistroJournal } from "./JournalTransacao";
import { JournalTransacao } from "./JournalTransacao";
import { CriptografiaArquivo } from "./CriptografiaArquivo";
import { RepositorioArquivo } from "./RepositorioArquivo";

export const COLECOES = [
  "organizacoes",
  "contratos",
  "lotes",
  "equipamentos",
  "movimentacoes",
  "users",
  "credentials",
  "configuracaoGlobal",
] as const;
export type ColecaoEntidade = (typeof COLECOES)[number];

export type EstadosColecoes = Partial<Record<ColecaoEntidade, unknown[]>>;

interface FotografiaColecoes {
  estados: EstadosColecoes;
}

export class RepositorioEntidades {
  private readonly repositorio: RepositorioArquivo;
  private readonly journal: JournalTransacao;
  private readonly inicializacao: Promise<void>;
  private fila: Promise<void> = Promise.resolve();
  private inconsistente = false;

  constructor(diretorioDados: string, chave: Buffer) {
    const criptografia = new CriptografiaArquivo(chave);
    this.repositorio = new RepositorioArquivo(criptografia);
    this.journal = new JournalTransacao(join(diretorioDados, "journal.log"), criptografia);
    this.diretorioDados = diretorioDados;
    this.inicializacao = this.reconciliar();
  }

  private readonly diretorioDados: string;

  async listar<T>(colecao: ColecaoEntidade): Promise<T[]> {
    await this.inicializacao;
    this.verificarConsistencia();
    return (await this.repositorio.ler<T[]>(this.caminhoColecao(colecao), [])) ?? [];
  }

  async transacionar<T, R>(
    colecao: ColecaoEntidade,
    operacao: string,
    atualizar: (estado: T[]) => { estado: T[]; resultado: R },
  ): Promise<R> {
    return this.transacionarMultiplas(operacao, [colecao], (estados) => {
      const alteracao = atualizar((estados[colecao] as T[] | undefined) ?? []);
      return { estados: { [colecao]: alteracao.estado }, resultado: alteracao.resultado };
    });
  }

  async transacionarMultiplas<R>(
    operacao: string,
    colecoes: ColecaoEntidade[],
    atualizar: (estados: EstadosColecoes) => { estados: EstadosColecoes; resultado: R },
  ): Promise<R> {
    const executar = async (): Promise<R> => {
      await this.inicializacao;
      this.verificarConsistencia();
      const estadoAtual: EstadosColecoes = {};
      for (const colecao of colecoes) {
        estadoAtual[colecao] =
          (await this.repositorio.ler<unknown[]>(this.caminhoColecao(colecao), [])) ?? [];
      }
      const alteracao = atualizar(estadoAtual);
      for (const colecao of Object.keys(alteracao.estados)) {
        if (!COLECOES.includes(colecao as ColecaoEntidade)) {
          throw new Error("Colecao de dados invalida.");
        }
        if (!Array.isArray(alteracao.estados[colecao as ColecaoEntidade])) {
          throw new Error("Estado da colecao deve ser uma lista.");
        }
      }
      await this.journal.registrar(operacao, {
        estados: alteracao.estados,
      } satisfies FotografiaColecoes);
      try {
        for (const [colecao, estado] of Object.entries(alteracao.estados)) {
          await this.repositorio.gravar(
            this.caminhoColecao(colecao as ColecaoEntidade),
            estado,
          );
        }
      } catch (erro) {
        this.inconsistente = true;
        throw erro;
      }
      return alteracao.resultado;
    };

    const resultado = this.fila.then(executar, executar);
    this.fila = resultado.then(() => undefined, () => undefined);
    return resultado;
  }

  private async reconciliar(): Promise<void> {
    const registros = await this.journal.listar();
    const estados = new Map<ColecaoEntidade, unknown[]>();
    for (const registro of registros) {
      const fotografia = registro.dados as FotografiaColecoes & {
        colecao?: ColecaoEntidade;
        estado?: unknown[];
      };
      if (fotografia?.estados && typeof fotografia.estados === "object") {
        for (const [colecao, estado] of Object.entries(fotografia.estados)) {
          if (COLECOES.includes(colecao as ColecaoEntidade) && Array.isArray(estado)) {
            estados.set(colecao as ColecaoEntidade, estado);
          }
        }
      } else if (
        fotografia &&
        fotografia.colecao &&
        COLECOES.includes(fotografia.colecao) &&
        Array.isArray(fotografia.estado)
      ) {
        estados.set(fotografia.colecao, fotografia.estado);
      }
    }
    for (const [colecao, estado] of estados) {
      await this.repositorio.gravar(this.caminhoColecao(colecao), estado);
    }
  }

  private caminhoColecao(colecao: ColecaoEntidade): string {
    return join(this.diretorioDados, `${colecao}.enc`);
  }

  private verificarConsistencia(): void {
    if (this.inconsistente) {
      throw new Error("Estado inconsistente; reinicie para recuperar pelo journal.");
    }
  }
}