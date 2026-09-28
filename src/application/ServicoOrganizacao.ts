import { randomUUID } from "node:crypto";
import type { ServicoAutenticacao } from "./ServicoAutenticacao";
import { PapelUsuario } from "../domain/auth/PapelUsuario";
import type { Contrato, Organizacao } from "../domain/entities/Entidades";
import { StatusContrato } from "../domain/entities/EnumsDominio";
import { ValidadorCNPJ } from "../domain/validation/ValidadorCNPJ";
import type { RepositorioEntidades } from "../infrastructure/RepositorioEntidades";

const PAPEIS_LEITURA = Object.values(PapelUsuario);

export class ServicoOrganizacao {
  constructor(
    private readonly repositorio: RepositorioEntidades,
    private readonly autenticacao: ServicoAutenticacao,
    private readonly validadorCNPJ = new ValidadorCNPJ(),
  ) {}

  async criar(
    token: string,
    dados: { razaoSocial: string; nomeFantasia: string; cnpj: string },
  ): Promise<Organizacao> {
    this.autenticacao.exigirPapel(token, [PapelUsuario.ADMINISTRADOR, PapelUsuario.OPERADOR_CADASTRO]);
    const razaoSocial = dados.razaoSocial.trim();
    const nomeFantasia = dados.nomeFantasia.trim();
    const cnpj = this.validadorCNPJ.validar(dados.cnpj);
    if (!razaoSocial || !nomeFantasia) throw new Error("Razao social e nome fantasia sao obrigatorios.");
    const organizacao: Organizacao = {
      id: randomUUID(),
      razaoSocial,
      nomeFantasia,
      cnpj,
      criadaEm: new Date().toISOString(),
      ativa: true,
    };
    return this.repositorio.transacionar<Organizacao, Organizacao>("organizacoes", "organizacao.criar", (organizacoes) => {
      if (organizacoes.some((item) => item.cnpj === cnpj)) {
        throw new Error("Ja existe uma organizacao com este CNPJ.");
      }
      return { estado: [...organizacoes, organizacao], resultado: organizacao };
    });
  }

  async listar(token: string): Promise<Organizacao[]> {
    this.autenticacao.exigirPapel(token, PAPEIS_LEITURA);
    return this.repositorio.listar<Organizacao>("organizacoes");
  }

  async criarContrato(
    token: string,
    dados: { organizacaoId: string; codigo: string; dataInicio: string; dataFim?: string },
  ): Promise<Contrato> {
    this.autenticacao.exigirPapel(token, [PapelUsuario.ADMINISTRADOR, PapelUsuario.OPERADOR_CADASTRO]);
    const organizacoes = await this.repositorio.listar<Organizacao>("organizacoes");
    if (!organizacoes.some((item) => item.id === dados.organizacaoId && item.ativa)) {
      throw new Error("Organizacao ativa nao encontrada.");
    }
    const dataInicio = validarDataCalendario(dados.dataInicio);
    const dataFim = dados.dataFim ? validarDataCalendario(dados.dataFim) : undefined;
    if (dataFim && dataFim < dataInicio) throw new Error("Data final anterior a data inicial.");
    const codigo = dados.codigo.trim();
    if (!codigo) throw new Error("Codigo do contrato obrigatorio.");
    const contrato: Contrato = {
      id: randomUUID(),
      organizacaoId: dados.organizacaoId,
      codigo,
      dataInicio,
      dataFim,
      status: StatusContrato.ATIVO,
      criadoEm: new Date().toISOString(),
    };
    return this.repositorio.transacionar<Contrato, Contrato>("contratos", "contrato.criar", (contratos) => {
      if (contratos.some((item) => item.codigo === codigo)) {
        throw new Error("Ja existe um contrato com este codigo.");
      }
      return { estado: [...contratos, contrato], resultado: contrato };
    });
  }

  async listarContratos(token: string, organizacaoId?: string): Promise<Contrato[]> {
    this.autenticacao.exigirPapel(token, PAPEIS_LEITURA);
    const contratos = await this.repositorio.listar<Contrato>("contratos");
    return organizacaoId ? contratos.filter((item) => item.organizacaoId === organizacaoId) : contratos;
  }
}

function validarDataCalendario(valor: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!partes) throw new Error("Data deve estar no formato AAAA-MM-DD.");
  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() + 1 !== mes || data.getUTCDate() !== dia) {
    throw new Error("Data invalida.");
  }
  return valor;
}