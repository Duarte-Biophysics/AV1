import { Validador } from "./Validador";

const MILISSEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;

export class ValidadorDataEntrada extends Validador<Date | string, string> {
  constructor(private readonly agora: () => Date = () => new Date()) {
    super();
  }

  validar(valor: Date | string): string {
    const entrada = this.converterData(valor);
    const instanteAtual = this.agora();
    if (Number.isNaN(instanteAtual.getTime())) {
      throw new Error("Data atual invalida para validacao.");
    }

    const dataEntrada = Date.UTC(entrada.ano, entrada.mes - 1, entrada.dia);
    const dataAtual = Date.UTC(
      instanteAtual.getUTCFullYear(),
      instanteAtual.getUTCMonth(),
      instanteAtual.getUTCDate(),
    );
    const diasAtras = (dataAtual - dataEntrada) / MILISSEGUNDOS_POR_DIA;
    if (diasAtras < 0) {
      throw new Error("Data de entrada nao pode ser futura.");
    }
    if (diasAtras > 90) {
      throw new Error("Data de entrada nao pode ser anterior a 90 dias.");
    }
    return `${String(entrada.ano).padStart(4, "0")}-${String(entrada.mes).padStart(2, "0")}-${String(entrada.dia).padStart(2, "0")}`;
  }

  private converterData(valor: Date | string): { ano: number; mes: number; dia: number } {
    let ano: number;
    let mes: number;
    let dia: number;
    if (valor instanceof Date) {
      if (Number.isNaN(valor.getTime())) throw new Error("Data de entrada invalida.");
      ano = valor.getUTCFullYear();
      mes = valor.getUTCMonth() + 1;
      dia = valor.getUTCDate();
    } else {
      const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
      if (!partes) throw new Error("Data deve estar no formato AAAA-MM-DD.");
      ano = Number(partes[1]);
      mes = Number(partes[2]);
      dia = Number(partes[3]);
    }

    const data = new Date(Date.UTC(ano, mes - 1, dia));
    if (
      data.getUTCFullYear() !== ano ||
      data.getUTCMonth() + 1 !== mes ||
      data.getUTCDate() !== dia
    ) {
      throw new Error("Data de entrada invalida.");
    }
    return { ano, mes, dia };
  }
}