import type { ServicoAutenticacao } from "./ServicoAutenticacao";
import { PapelUsuario } from "../domain/auth/PapelUsuario";
import type { ConfiguracaoGlobal } from "../domain/entities/Entidades";
import type { RepositorioEntidades } from "../infrastructure/RepositorioEntidades";

const CONFIGURACAO_PADRAO: ConfiguracaoGlobal = {
  id: "global",
  aliquotaImposto: 0,
  coeficienteDepreciacao: 0,
  atualizadoEm: new Date(0).toISOString(),
};

export class ServicoConfiguracaoGlobal {
  constructor(
    private readonly repositorio: RepositorioEntidades,
    private readonly autenticacao: ServicoAutenticacao,
  ) {}

  async obter(token: string): Promise<ConfiguracaoGlobal> {
    this.autenticacao.exigirPapel(token, [PapelUsuario.ADMINISTRADOR]);
    return (await this.repositorio.listar<ConfiguracaoGlobal>("configuracaoGlobal"))[0] ?? {
      ...CONFIGURACAO_PADRAO,
    };
  }

  async atualizar(
    token: string,
    dados: { aliquotaImposto: number; coeficienteDepreciacao: number },
  ): Promise<ConfiguracaoGlobal> {
    this.autenticacao.exigirPapel(token, [PapelUsuario.ADMINISTRADOR]);
    for (const [nome, valor] of Object.entries(dados)) {
      if (!Number.isFinite(valor) || valor < 0 || valor > 1) {
        throw new Error(`${nome} deve estar entre 0 e 1.`);
      }
    }
    const configuracao: ConfiguracaoGlobal = {
      id: "global",
      ...dados,
      atualizadoEm: new Date().toISOString(),
    };
    return this.repositorio.transacionar<ConfiguracaoGlobal, ConfiguracaoGlobal>(
      "configuracaoGlobal",
      "configuracao_global.atualizar",
      (estado) => ({ estado: [configuracao], resultado: configuracao }),
    );
  }
}