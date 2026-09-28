export enum StatusLote {
  RECEBIDO = "RECEBIDO",
  EM_TRIAGEM = "EM_TRIAGEM",
  TRIADO = "TRIADO",
  FINALIZADO = "FINALIZADO",
}

export enum TipoEquipamento {
  COMPUTADOR = "COMPUTADOR",
  NOTEBOOK = "NOTEBOOK",
  CELULAR = "CELULAR",
  TABLET = "TABLET",
  IMPRESSORA = "IMPRESSORA",
  OUTRO = "OUTRO",
}

export enum EstadoFisico {
  INSERVIVEL = 0,
  PESSIMO = 1,
  RUIM = 2,
  REGULAR = 3,
  BOM = 4,
}

export enum StatusRastreamento {
  RECEBIDO = "RECEBIDO",
  EM_TRIAGEM = "EM_TRIAGEM",
  APTO_REUSO = "APTO_REUSO",
  APTO_RECICLAGEM = "APTO_RECICLAGEM",
  EM_DESMONTE = "EM_DESMONTE",
  DESCARTADO = "DESCARTADO",
}

export enum StatusContrato {
  ATIVO = "ATIVO",
  ENCERRADO = "ENCERRADO",
}