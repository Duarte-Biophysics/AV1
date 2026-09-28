import { randomUUID } from "node:crypto";
import { open, readFile, rename, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { criarCredencial, type Credencial } from "../domain/auth/Credencial";
import { PapelUsuario } from "../domain/auth/PapelUsuario";
import type { Usuario } from "../domain/auth/Usuario";
import { CriptografiaArquivo } from "../infrastructure/CriptografiaArquivo";
import { RepositorioArquivo } from "../infrastructure/RepositorioArquivo";

export interface ConfiguracaoMestre {
  versao: 1;
  chaveCriptografia: string;
  administradorInicial: {
    id: string;
    login: string;
    papel: PapelUsuario.ADMINISTRADOR;
  };
  provisionadoEm: string;
}

export class ProvisionadorInicial {
  private readonly caminhoMestre: string;
  private readonly caminhoCredenciais: string;
  private readonly caminhoUsuarios: string;

  constructor(private readonly diretorioDados: string) {
    this.caminhoMestre = join(diretorioDados, "master.json");
    this.caminhoCredenciais = join(diretorioDados, "credentials.enc");
    this.caminhoUsuarios = join(diretorioDados, "users.enc");
  }

  async estaProvisionado(): Promise<boolean> {
    try {
      await readFile(this.caminhoMestre);
      return true;
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw erro;
    }
  }

  async carregarConfiguracao(): Promise<ConfiguracaoMestre> {
    const texto = await readFile(this.caminhoMestre, "utf8");
    const configuracao = JSON.parse(texto) as ConfiguracaoMestre;
    const chave = Buffer.from(configuracao.chaveCriptografia, "base64");
    if (
      configuracao.versao !== 1 ||
      chave.length !== 32 ||
      configuracao.administradorInicial?.papel !== PapelUsuario.ADMINISTRADOR
    ) {
      throw new Error("Configuracao mestre invalida.");
    }
    return configuracao;
  }

  async provisionar(loginInformado: string, senha: string): Promise<ConfiguracaoMestre> {
    if (await this.estaProvisionado()) {
      throw new Error("O sistema ja foi provisionado.");
    }

    const login = loginInformado.trim().toLowerCase();
    if (!/^[a-zA-Z0-9._-]{3,64}$/.test(login)) {
      throw new Error("Login deve ter de 3 a 64 caracteres validos.");
    }
    if (senha.length < 8) {
      throw new Error("A senha do administrador deve ter no minimo 8 caracteres.");
    }

    const chave = CriptografiaArquivo.gerarChave();
    const idAdministrador = randomUUID();
    const criptografia = new CriptografiaArquivo(chave);
    const repositorio = new RepositorioArquivo(criptografia);
    const credenciais: Credencial[] = [criarCredencial(idAdministrador, senha)];
    const usuarios: Usuario[] = [
      {
        id: idAdministrador,
        login,
        nome: login,
        papel: PapelUsuario.ADMINISTRADOR,
        ativo: true,
        criadoEm: new Date().toISOString(),
      },
    ];
    const configuracao: ConfiguracaoMestre = {
      versao: 1,
      chaveCriptografia: chave.toString("base64"),
      administradorInicial: {
        id: idAdministrador,
        login,
        papel: PapelUsuario.ADMINISTRADOR,
      },
      provisionadoEm: new Date().toISOString(),
    };

    await mkdir(this.diretorioDados, { recursive: true });
    await repositorio.gravar(this.caminhoUsuarios, usuarios);
    await repositorio.gravar(this.caminhoCredenciais, credenciais);
    await this.gravarConfiguracaoMestre(configuracao);
    return configuracao;
  }

  private async gravarConfiguracaoMestre(configuracao: ConfiguracaoMestre): Promise<void> {
    const temporario = `${this.caminhoMestre}.${process.pid}.${randomUUID()}.tmp`;
    const arquivo = await open(temporario, "wx", 0o600);
    try {
      await arquivo.writeFile(JSON.stringify(configuracao, null, 2), "utf8");
      await arquivo.sync();
    } catch (erro) {
      await arquivo.close();
      await rm(temporario, { force: true });
      throw erro;
    }
    await arquivo.close();
    try {
      await rename(temporario, this.caminhoMestre);
    } catch (erro) {
      await rm(temporario, { force: true });
      throw erro;
    }
  }
}