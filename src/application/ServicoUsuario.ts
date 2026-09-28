import { randomUUID } from "node:crypto";
import type { ServicoAutenticacao } from "./ServicoAutenticacao";
import { criarCredencial, type Credencial } from "../domain/auth/Credencial";
import { PapelUsuario } from "../domain/auth/PapelUsuario";
import type { Usuario } from "../domain/auth/Usuario";
import type { RepositorioEntidades } from "../infrastructure/RepositorioEntidades";

export class ServicoUsuario {
  constructor(
    private readonly repositorio: RepositorioEntidades,
    private readonly autenticacao: ServicoAutenticacao,
  ) {}

  async criar(
    token: string,
    loginInformado: string,
    nomeInformado: string,
    papel: PapelUsuario,
    senha: string,
  ): Promise<Usuario> {
    this.autenticacao.exigirPapel(token, [PapelUsuario.ADMINISTRADOR]);
    const login = loginInformado.trim().toLowerCase();
    const nome = nomeInformado.trim();
    if (!/^[a-z0-9._-]{3,64}$/.test(login)) throw new Error("Login invalido.");
    if (!nome) throw new Error("Nome do usuario obrigatorio.");
    if (!Object.values(PapelUsuario).includes(papel)) throw new Error("Papel de usuario invalido.");
    if (senha.length < 8) throw new Error("A senha deve ter no minimo 8 caracteres.");

    const usuario: Usuario = {
      id: randomUUID(),
      login,
      nome,
      papel,
      ativo: true,
      criadoEm: new Date().toISOString(),
    };
    const credencial = criarCredencial(usuario.id, senha);
    return this.repositorio.transacionarMultiplas(
      "usuario.criar",
      ["users", "credentials"],
      (estados) => {
        const usuarios = (estados.users as Usuario[] | undefined) ?? [];
        const credenciais = (estados.credentials as Credencial[] | undefined) ?? [];
        if (usuarios.some((item) => item.login === login)) {
          throw new Error("Ja existe um usuario com este login.");
        }
        return {
          estados: {
            users: [...usuarios, usuario],
            credentials: [...credenciais, credencial],
          },
          resultado: usuario,
        };
      },
    );
  }

  async listar(token: string): Promise<Usuario[]> {
    this.autenticacao.exigirPapel(token, [PapelUsuario.ADMINISTRADOR]);
    return this.repositorio.listar<Usuario>("users");
  }

  async alterarAtivo(token: string, usuarioId: string, ativo: boolean): Promise<Usuario> {
    this.autenticacao.exigirPapel(token, [PapelUsuario.ADMINISTRADOR]);
    const atualizado = await this.repositorio.transacionar<Usuario, Usuario>("users", "usuario.alterar_status", (usuarios) => {
      const usuario = usuarios.find((item) => item.id === usuarioId);
      if (!usuario) throw new Error("Usuario nao encontrado.");
      if (!ativo && usuario.papel === PapelUsuario.ADMINISTRADOR) {
        const outrosAdministradores = usuarios.filter(
          (item) => item.id !== usuarioId && item.ativo && item.papel === PapelUsuario.ADMINISTRADOR,
        );
        if (outrosAdministradores.length === 0) {
          throw new Error("Nao e permitido desativar o ultimo administrador ativo.");
        }
      }
      const atualizado = { ...usuario, ativo };
      return {
        estado: usuarios.map((item) => (item.id === usuarioId ? atualizado : item)),
        resultado: atualizado,
      };
    });
    if (!ativo) this.autenticacao.revogarSessoesUsuario(usuarioId);
    return atualizado;
  }
}