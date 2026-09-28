import { randomBytes } from "node:crypto";
import { join } from "node:path";
import type { ConfiguracaoMestre } from "./ProvisionadorInicial";
import { verificarSenha, type Credencial } from "../domain/auth/Credencial";
import { PapelUsuario } from "../domain/auth/PapelUsuario";
import type { Usuario } from "../domain/auth/Usuario";
import { CriptografiaArquivo } from "../infrastructure/CriptografiaArquivo";
import { RepositorioArquivo } from "../infrastructure/RepositorioArquivo";

const TEMPO_EXPIRACAO_PADRAO = 30 * 60 * 1000;

export interface DadosSessao {
  token: string;
  usuarioId: string;
  login: string;
  papel: PapelUsuario;
  criadaEm: string;
  ultimaAtividade: string;
}

interface SessaoAtiva {
  dados: DadosSessao;
  ultimaAtividadeMs: number;
}

export class ServicoAutenticacao {
  private readonly repositorio: RepositorioArquivo;
  private readonly sessoes = new Map<string, SessaoAtiva>();

  constructor(
    diretorioDados: string,
    configuracao: ConfiguracaoMestre,
    private readonly tempoExpiracaoMs = TEMPO_EXPIRACAO_PADRAO,
    private readonly agora: () => number = Date.now,
  ) {
    if (tempoExpiracaoMs <= 0) {
      throw new Error("O tempo de expiracao deve ser positivo.");
    }
    this.repositorio = new RepositorioArquivo(
      new CriptografiaArquivo(Buffer.from(configuracao.chaveCriptografia, "base64")),
    );
    this.diretorioDados = diretorioDados;
  }

  private readonly diretorioDados: string;

  async autenticar(login: string, senha: string): Promise<DadosSessao> {
    const [usuarios, credenciais] = await Promise.all([
      this.repositorio.ler<Usuario[]>(join(this.diretorioDados, "users.enc"), []),
      this.repositorio.ler<Credencial[]>(join(this.diretorioDados, "credentials.enc"), []),
    ]);
    const loginNormalizado = login.trim().toLowerCase();
    const usuario = usuarios?.find((item) => item.login === loginNormalizado && item.ativo);
    const credencial = usuario && credenciais?.find((item) => item.usuarioId === usuario.id);
    if (!usuario || !credencial || !verificarSenha(credencial, senha)) {
      throw new Error("Login ou senha invalidos.");
    }

    const instante = this.agora();
    const data = new Date(instante).toISOString();
    const dados: DadosSessao = {
      token: randomBytes(32).toString("base64url"),
      usuarioId: usuario.id,
      login: usuario.login,
      papel: usuario.papel,
      criadaEm: data,
      ultimaAtividade: data,
    };
    this.sessoes.set(dados.token, { dados, ultimaAtividadeMs: instante });
    return { ...dados };
  }

  validarSessao(token: string): DadosSessao {
    const sessao = this.sessoes.get(token);
    if (!sessao) throw new Error("Sessao invalida ou expirada.");

    const instante = this.agora();
    if (instante - sessao.ultimaAtividadeMs >= this.tempoExpiracaoMs) {
      this.sessoes.delete(token);
      throw new Error("Sessao invalida ou expirada.");
    }

    sessao.ultimaAtividadeMs = instante;
    sessao.dados.ultimaAtividade = new Date(instante).toISOString();
    return { ...sessao.dados };
  }

  exigirPapel(token: string, papeisPermitidos: PapelUsuario[]): DadosSessao {
    const sessao = this.validarSessao(token);
    if (!papeisPermitidos.includes(sessao.papel)) {
      throw new Error("Acesso negado para este papel.");
    }
    return sessao;
  }

  encerrarSessao(token: string): void {
    this.sessoes.delete(token);
  }

  revogarSessoesUsuario(usuarioId: string): void {
    for (const [token, sessao] of this.sessoes) {
      if (sessao.dados.usuarioId === usuarioId) this.sessoes.delete(token);
    }
  }
}