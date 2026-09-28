import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { CriptografiaArquivo } from "./CriptografiaArquivo";

const TAMANHO_MAXIMO_PADRAO = 10 * 1024 * 1024;
const RETENCAO_PADRAO_DIAS = 180;

export interface RegistroJournal<T = unknown> {
  id: string;
  data: string;
  operacao: string;
  dados: T;
}

export class JournalTransacao {
  constructor(
    private readonly caminho: string,
    private readonly criptografia: CriptografiaArquivo,
    private readonly tamanhoMaximo = TAMANHO_MAXIMO_PADRAO,
    private readonly retencaoDias = RETENCAO_PADRAO_DIAS,
  ) {
    if (tamanhoMaximo <= 0 || retencaoDias <= 0) {
      throw new Error("Tamanho maximo e retencao devem ser positivos.");
    }
  }

  async registrar<T>(operacao: string, dados: T): Promise<RegistroJournal<T>> {
    const registro: RegistroJournal<T> = {
      id: randomUUID(),
      data: new Date().toISOString(),
      operacao,
      dados,
    };
    const linha = `${JSON.stringify({ conteudo: this.criptografia.criptografar(JSON.stringify(registro)) })}\n`;
    const bytes = Buffer.byteLength(linha);
    const diretorio = dirname(this.caminho);
    await mkdir(diretorio, { recursive: true });
    await this.removerArquivosExpirados(diretorio);
    await this.repararCaudaParcial();

    let tamanhoAtual = 0;
    try {
      tamanhoAtual = (await stat(this.caminho)).size;
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code !== "ENOENT") {
        throw erro;
      }
    }

    if (tamanhoAtual > 0 && tamanhoAtual + bytes > this.tamanhoMaximo) {
      const instante = new Date().toISOString().replaceAll(":", "-");
      const arquivoArquivo = `${this.caminho}.${instante}.${randomUUID()}.archive`;
      await rename(this.caminho, arquivoArquivo);
    }

    const arquivo = await open(this.caminho, "a", 0o600);
    try {
      await arquivo.writeFile(linha, "utf8");
      await arquivo.sync();
    } finally {
      await arquivo.close();
    }
    return registro;
  }

  async executar<T, R>(
    operacao: string,
    dados: T,
    aplicar: () => Promise<R>,
  ): Promise<R> {
    await this.registrar(operacao, dados);
    return aplicar();
  }

  async listar(): Promise<RegistroJournal[]> {
    const diretorio = dirname(this.caminho);
    let nomes: string[];
    try {
      nomes = await readdir(diretorio);
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw erro;
    }

    const prefixo = `${basename(this.caminho)}.`;
    const arquivosArquivados = nomes
      .filter((nome) => nome.startsWith(prefixo) && nome.endsWith(".archive"))
      .sort();
    const arquivos = [...arquivosArquivados.map((nome) => join(diretorio, nome)), this.caminho];
    const registros: RegistroJournal[] = [];

    for (const arquivo of arquivos) {
      let conteudo: string;
      try {
        conteudo = await readFile(arquivo, "utf8");
      } catch (erro) {
        if ((erro as NodeJS.ErrnoException).code === "ENOENT") {
          continue;
        }
        throw erro;
      }

      const linhas = conteudo.split("\n");
      for (const linha of linhas.slice(0, -1)) {
        if (!linha) continue;
        const envelope = JSON.parse(linha) as { conteudo: string };
        registros.push(
          JSON.parse(this.criptografia.descriptografar(envelope.conteudo)) as RegistroJournal,
        );
      }
    }
    return registros;
  }

  private async removerArquivosExpirados(diretorio: string): Promise<void> {
    const nomes = await readdir(diretorio);
    const prefixo = `${basename(this.caminho)}.`;
    const limite = Date.now() - this.retencaoDias * 24 * 60 * 60 * 1000;

    for (const nome of nomes) {
      if (!nome.startsWith(prefixo) || !nome.endsWith(".archive")) continue;
      const caminhoArquivo = join(diretorio, nome);
      if ((await stat(caminhoArquivo)).mtimeMs < limite) {
        await rm(caminhoArquivo);
      }
    }
  }

  private async repararCaudaParcial(): Promise<void> {
    let arquivo;
    try {
      arquivo = await open(this.caminho, "r+");
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code === "ENOENT") return;
      throw erro;
    }

    try {
      const conteudo = await arquivo.readFile("utf8");
      if (!conteudo.endsWith("\n")) {
        await arquivo.truncate(conteudo.lastIndexOf("\n") + 1);
        await arquivo.sync();
      }
    } finally {
      await arquivo.close();
    }
  }
}