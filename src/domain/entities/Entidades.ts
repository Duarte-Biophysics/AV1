import type { EstadoFisico, StatusContrato, StatusLote, StatusRastreamento, TipoEquipamento } from "./EnumsDominio";

export interface Organizacao {
  id: string;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  criadaEm: string;
  ativa: boolean;
}

export interface Contrato {
  id: string;
  organizacaoId: string;
  codigo: string;
  dataInicio: string;
  dataFim?: string;
  status: StatusContrato;
  criadoEm: string;
}

export interface Lote {
  id: string;
  organizacaoId: string;
  contratoId: string;
  numeroNotaFiscal: string;
  transportadora: string;
  dataEntrada: string;
  status: StatusLote;
  criadoEm: string;
}

export interface Equipamento {
  id: string;
  loteId: string;
  codigoBarras: string;
  tipo: TipoEquipamento;
  estadoFisico: EstadoFisico;
  status: StatusRastreamento;
  triagemCompleta: boolean;
  criadoEm: string;
}

export interface Movimentacao {
  id: string;
  equipamentoId: string;
  usuarioId: string;
  data: string;
  statusAnterior: StatusRastreamento;
  statusNovo: StatusRastreamento;
  estadoFisicoAnterior: EstadoFisico;
  estadoFisicoNovo: EstadoFisico;
  justificativa?: string;
  observacao?: string;
}

export interface ConfiguracaoGlobal {
  id: "global";
  aliquotaImposto: number;
  coeficienteDepreciacao: number;
  atualizadoEm: string;
}