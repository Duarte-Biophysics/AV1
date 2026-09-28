import { randomUUID } from "node:crypto";
import type { ServicoAutenticacao } from "./ServicoAutenticacao";
import { PapelUsuario } from "../domain/auth/PapelUsuario";
import type { Contrato, Lote, Organizacao } from "../domain/entities/Entidades";
import { StatusContrato, StatusLote } from "../domain/entities/EnumsDominio";
import { ValidadorDataEntrada } from "../domain/validation/ValidadorDataEntrada";
import type { RepositorioEntidades } from "../infrastructure/RepositorioEntidades";

export class ServicoLote {
  constructor(
    private readonly repositorio: RepositorioEntidades,
    private readonly autenticacao: ServicoAutenticacao,
    private readonly validadorData = new ValidadorDataEntrada(),
  ) {}

  async criar(
    token: string,
    dados: {
      organizacaoId: string;
      contratoId: string;
      numeroNotaFiscal: string;
      transportadora: string;
      dataEntrada: string;
    },
  ): Promise<Lote> {
    this.autenticacao.exigirPapel(token, [PapelUsuario.ADMINISTRADOR, PapelUsuario.GESTOR_ALMOXARIFADO]);
    const dataEntrada = this.validadorData.validar(dados.dataEntrada);
    const [organizacoes, contratos] = await Promise.all([
      this.repositorio.listar<Organizacao>("organizacoes"),
      this.repositorio.listar<Contrato>("contratos"),
    ]);
    if (!organizacoes.some((item) => item.id === dados.organizacaoId && item.ativa)) {
      throw new Error("Organizacao ativa nao encontrada.");
    }
    if (
      !contratos.some(
        (item) =>
          item.id === dados.contratoId &&
          item.organizacaoId === dados.organizacaoId &&
          item.status === StatusContrato.ATIVO &&
          item.dataInicio <= dataEntrada &&
          (!item.dataFim || item.dataFim >= dataEntrada),
      )
    ) {
      throw new Error("Contrato ativo da organizacao nao encontrado para a data do lote.");
    }
    const numeroNotaFiscal = dados.numeroNotaFiscal.trim();
    const transportadora = dados.transportadora.trim();
    if (!numeroNotaFiscal || !transportadora) throw new Error("Nota fiscal e transportadora sao obrigatorias.");
    const lote: Lote = {
      id: randomUUID(),
      organizacaoId: dados.organizacaoId,
      contratoId: dados.contratoId,
      numeroNotaFiscal,
      transportadora,
      dataEntrada,
      status: StatusLote.RECEBIDO,
      criadoEm: new Date().toISOString(),
    };
    return this.repositorio.transacionar<Lote, Lote>("lotes", "lote.criar", (lotes) => ({
      estado: [...lotes, lote],
      resultado: lote,
    }));
  }

  async listar(token: string): Promise<Lote[]> {
    this.autenticacao.exigirPapel(token, Object.values(PapelUsuario));
    return this.repositorio.listar<Lote>("lotes");
  }
}