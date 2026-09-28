import { randomUUID } from "node:crypto";
import { open, readFile, mkdir, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { CriptografiaArquivo } from "./CriptografiaArquivo";

export class RepositorioArquivo {
  constructor(private readonly criptografia: CriptografiaArquivo) {}

  async ler<T>(caminho: string, valorPadrao?: T): Promise<T | undefined> {
    let conteudo: string;
    try {
      conteudo = await readFile(caminho, "utf8");
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code === "ENOENT") {
        return valorPadrao;
      }
      throw erro;
    }

    return JSON.parse(this.criptografia.descriptografar(conteudo)) as T;
  }

  async gravar<T>(caminho: string, valor: T): Promise<void> {
    const diretorio = dirname(caminho);
    await mkdir(diretorio, { recursive: true });
    const temporario = `${caminho}.${process.pid}.${randomUUID()}.tmp`;
    const conteudo = this.criptografia.criptografar(JSON.stringify(valor));
    const arquivo = await open(temporario, "wx", 0o600);

    try {
      await arquivo.writeFile(conteudo, "utf8");
      await arquivo.sync();
    } catch (erro) {
      await arquivo.close();
      await rm(temporario, { force: true });
      throw erro;
    }
    await arquivo.close();

    try {
      await rename(temporario, caminho);
    } catch (erro) {
      await rm(temporario, { force: true });
      throw erro;
    }
  }
}