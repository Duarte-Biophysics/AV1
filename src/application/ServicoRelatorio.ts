import type { ServicoAutenticacao } from "./ServicoAutenticacao";
import { PapelUsuario } from "../domain/auth/PapelUsuario";
import type { Contrato, Equipamento, Lote, Movimentacao, Organizacao } from "../domain/entities/Entidades";
import type { RepositorioEntidades } from "../infrastructure/RepositorioEntidades";

export interface RelatorioRastreabilidade {
  equipamento: Equipamento;
  lote: Lote;
  organizacao: Organizacao;
  contrato: Contrato;
  movimentacoes: Movimentacao[];
}

export class ServicoRelatorio {
  constructor(
    private readonly repositorio: RepositorioEntidades,
    private readonly autenticacao: ServicoAutenticacao,
  ) {}

  async rastrearEquipamento(token: string, codigoBarras: string): Promise<RelatorioRastreabilidade> {
    this.autenticacao.exigirPapel(token, Object.values(PapelUsuario));
    const codigo = codigoBarras.trim().toUpperCase();
    const [equipamentos, lotes, organizacoes, contratos, movimentacoes] = await Promise.all([
      this.repositorio.listar<Equipamento>("equipamentos"),
      this.repositorio.listar<Lote>("lotes"),
      this.repositorio.listar<Organizacao>("organizacoes"),
      this.repositorio.listar<Contrato>("contratos"),
      this.repositorio.listar<Movimentacao>("movimentacoes"),
    ]);
    const equipamento = equipamentos.find((item) => item.codigoBarras === codigo);
    if (!equipamento) throw new Error("Equipamento nao encontrado.");
    const lote = lotes.find((item) => item.id === equipamento.loteId);
    const organizacao = lote && organizacoes.find((item) => item.id === lote.organizacaoId);
    const contrato = lote && contratos.find((item) => item.id === lote.contratoId);
    if (!lote || !organizacao || !contrato) throw new Error("Rastreabilidade incompleta nos dados persistidos.");
    return {
      equipamento,
      lote,
      organizacao,
      contrato,
      movimentacoes: movimentacoes
        .filter((item) => item.equipamentoId === equipamento.id)
        .sort((primeira, segunda) => primeira.data.localeCompare(segunda.data)),
    };
  }
}