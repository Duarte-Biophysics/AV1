import { randomUUID } from "node:crypto";
import type { ServicoAutenticacao } from "./ServicoAutenticacao";
import { PapelUsuario } from "../domain/auth/PapelUsuario";
import type { Equipamento, Lote, Movimentacao } from "../domain/entities/Entidades";
import { EstadoFisico, StatusRastreamento, TipoEquipamento } from "../domain/entities/EnumsDominio";
import type { RepositorioEntidades } from "../infrastructure/RepositorioEntidades";

const PAPEIS_OPERACAO = [PapelUsuario.ADMINISTRADOR, PapelUsuario.GESTOR_ALMOXARIFADO];
const TRANSICOES: Record<StatusRastreamento, StatusRastreamento[]> = {
  [StatusRastreamento.RECEBIDO]: [StatusRastreamento.EM_TRIAGEM],
  [StatusRastreamento.EM_TRIAGEM]: [StatusRastreamento.APTO_REUSO, StatusRastreamento.APTO_RECICLAGEM],
  [StatusRastreamento.APTO_REUSO]: [StatusRastreamento.EM_DESMONTE, StatusRastreamento.DESCARTADO],
  [StatusRastreamento.APTO_RECICLAGEM]: [StatusRastreamento.EM_DESMONTE, StatusRastreamento.DESCARTADO],
  [StatusRastreamento.EM_DESMONTE]: [StatusRastreamento.DESCARTADO],
  [StatusRastreamento.DESCARTADO]: [],
};

export class ServicoEquipamento {
  constructor(
    private readonly repositorio: RepositorioEntidades,
    private readonly autenticacao: ServicoAutenticacao,
  ) {}

  async criar(
    token: string,
    dados: { loteId: string; codigoBarras: string; tipo: TipoEquipamento; estadoFisico: EstadoFisico },
  ): Promise<Equipamento> {
    const sessao = this.autenticacao.exigirPapel(token, PAPEIS_OPERACAO);
    const codigoBarras = dados.codigoBarras.trim().toUpperCase();
    if (!/^[A-Z0-9-]{4,40}$/.test(codigoBarras)) throw new Error("Codigo de barras interno invalido.");
    if (!Object.values(TipoEquipamento).includes(dados.tipo)) throw new Error("Tipo de equipamento invalido.");
    if (!estadosFisicos().includes(dados.estadoFisico)) throw new Error("Estado fisico invalido.");
    if (!(await this.repositorio.listar<Lote>("lotes")).some((item) => item.id === dados.loteId)) {
      throw new Error("Lote nao encontrado.");
    }

    const equipamento: Equipamento = {
      id: randomUUID(),
      loteId: dados.loteId,
      codigoBarras,
      tipo: dados.tipo,
      estadoFisico: dados.estadoFisico,
      status: StatusRastreamento.RECEBIDO,
      triagemCompleta: false,
      criadoEm: new Date().toISOString(),
    };
    const movimentacao = this.novaMovimentacao(
      equipamento,
      sessao.usuarioId,
      StatusRastreamento.RECEBIDO,
      equipamento.estadoFisico,
      { observacao: "Entrada no sistema." },
    );
    return this.repositorio.transacionarMultiplas(
      "equipamento.criar",
      ["equipamentos", "movimentacoes"],
      (estados) => {
        const equipamentos = (estados.equipamentos as Equipamento[] | undefined) ?? [];
        const movimentacoes = (estados.movimentacoes as Movimentacao[] | undefined) ?? [];
        if (equipamentos.some((item) => item.codigoBarras === codigoBarras)) {
          throw new Error("Codigo de barras ja cadastrado.");
        }
        return {
          estados: {
            equipamentos: [...equipamentos, equipamento],
            movimentacoes: [...movimentacoes, movimentacao],
          },
          resultado: equipamento,
        };
      },
    );
  }

  async iniciarTriagem(token: string, equipamentoId: string): Promise<Equipamento> {
    const sessao = this.autenticacao.exigirPapel(token, PAPEIS_OPERACAO);
    return this.alterarEquipamentoComMovimentacao(
      "equipamento.iniciar_triagem",
      sessao.usuarioId,
      equipamentoId,
      (equipamento) => {
        if (equipamento.status !== StatusRastreamento.RECEBIDO || equipamento.triagemCompleta) {
          throw new Error("Equipamento nao pode iniciar triagem neste estado.");
        }
        return { ...equipamento, status: StatusRastreamento.EM_TRIAGEM };
      },
      { observacao: "Triagem iniciada." },
    );
  }

  async concluirTriagem(
    token: string,
    equipamentoId: string,
    dados: { diagnostico: string; destino: StatusRastreamento.APTO_REUSO | StatusRastreamento.APTO_RECICLAGEM },
  ): Promise<Equipamento> {
    const sessao = this.autenticacao.exigirPapel(token, PAPEIS_OPERACAO);
    const diagnostico = dados.diagnostico.trim();
    if (diagnostico.length < 5) throw new Error("Diagnostico da triagem obrigatorio.");
    if (![StatusRastreamento.APTO_REUSO, StatusRastreamento.APTO_RECICLAGEM].includes(dados.destino)) {
      throw new Error("Destino de triagem invalido.");
    }
    return this.alterarEquipamentoComMovimentacao(
      "equipamento.concluir_triagem",
      sessao.usuarioId,
      equipamentoId,
      (equipamento) => {
        if (![StatusRastreamento.RECEBIDO, StatusRastreamento.EM_TRIAGEM].includes(equipamento.status)) {
          throw new Error("Equipamento nao pode concluir triagem neste estado.");
        }
        return { ...equipamento, status: dados.destino, triagemCompleta: true };
      },
      { observacao: diagnostico },
    );
  }

  async movimentar(
    token: string,
    equipamentoId: string,
    dados: { status: StatusRastreamento; estadoFisico: EstadoFisico; justificativa?: string },
  ): Promise<Equipamento> {
    const sessao = this.autenticacao.exigirPapel(token, PAPEIS_OPERACAO);
    if (!estadosFisicos().includes(dados.estadoFisico)) throw new Error("Estado fisico invalido.");
    return this.alterarEquipamentoComMovimentacao(
      "equipamento.movimentar",
      sessao.usuarioId,
      equipamentoId,
      (equipamento) => {
        if (dados.status === StatusRastreamento.EM_DESMONTE && !equipamento.triagemCompleta) {
          throw new Error("Triagem completa obrigatoria antes do desmonte.");
        }
        if (dados.status !== equipamento.status && !TRANSICOES[equipamento.status].includes(dados.status)) {
          throw new Error("Transicao de rastreamento nao permitida.");
        }
        if (equipamento.estadoFisico - dados.estadoFisico >= 2 && !dados.justificativa?.trim()) {
          throw new Error("Justificativa obrigatoria para queda de duas categorias ou mais.");
        }
        return { ...equipamento, status: dados.status, estadoFisico: dados.estadoFisico };
      },
      { justificativa: dados.justificativa?.trim() || undefined },
    );
  }

  async listar(token: string): Promise<Equipamento[]> {
    this.autenticacao.exigirPapel(token, Object.values(PapelUsuario));
    return this.repositorio.listar<Equipamento>("equipamentos");
  }

  private async alterarEquipamentoComMovimentacao(
    operacao: string,
    usuarioId: string,
    equipamentoId: string,
    alterar: (equipamento: Equipamento) => Equipamento,
    detalhes: { justificativa?: string; observacao?: string },
  ): Promise<Equipamento> {
    return this.repositorio.transacionarMultiplas(
      operacao,
      ["equipamentos", "movimentacoes"],
      (estados) => {
        const equipamentos = (estados.equipamentos as Equipamento[] | undefined) ?? [];
        const movimentacoes = (estados.movimentacoes as Movimentacao[] | undefined) ?? [];
        const anterior = equipamentos.find((item) => item.id === equipamentoId);
        if (!anterior) throw new Error("Equipamento nao encontrado.");
        const atualizado = alterar(anterior);
        const movimentacao = this.novaMovimentacao(
          atualizado,
          usuarioId,
          anterior.status,
          anterior.estadoFisico,
          detalhes,
        );
        return {
          estados: {
            equipamentos: equipamentos.map((item) => (item.id === equipamentoId ? atualizado : item)),
            movimentacoes: [...movimentacoes, movimentacao],
          },
          resultado: atualizado,
        };
      },
    );
  }

  private novaMovimentacao(
    equipamento: Equipamento,
    usuarioId: string,
    statusAnterior: StatusRastreamento,
    estadoFisicoAnterior: EstadoFisico,
    detalhes: { justificativa?: string; observacao?: string },
  ): Movimentacao {
    return {
      id: randomUUID(),
      equipamentoId: equipamento.id,
      usuarioId,
      data: new Date().toISOString(),
      statusAnterior,
      statusNovo: equipamento.status,
      estadoFisicoAnterior,
      estadoFisicoNovo: equipamento.estadoFisico,
      ...detalhes,
    };
  }
}

function estadosFisicos(): EstadoFisico[] {
  return [EstadoFisico.INSERVIVEL, EstadoFisico.PESSIMO, EstadoFisico.RUIM, EstadoFisico.REGULAR, EstadoFisico.BOM];
}