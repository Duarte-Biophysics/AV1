import { Validador } from "./Validador";

const PESOS_PRIMEIRO_DIGITO = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_SEGUNDO_DIGITO = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

export class ValidadorCNPJ extends Validador<string, string> {
  validar(valor: string): string {
    const cnpj = valor.replace(/[.\-/\s]/g, "").toUpperCase();
    if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj) || /^([0-9])\1{13}$/.test(cnpj)) {
      throw new Error("CNPJ deve conter 12 caracteres alfanumericos e 2 digitos verificadores.");
    }

    const primeiro = this.calcularDigito(cnpj.slice(0, 12), PESOS_PRIMEIRO_DIGITO);
    const segundo = this.calcularDigito(cnpj.slice(0, 12) + primeiro, PESOS_SEGUNDO_DIGITO);
    if (cnpj.slice(-2) !== `${primeiro}${segundo}`) {
      throw new Error("Digitos verificadores do CNPJ invalidos.");
    }
    return cnpj;
  }

  private calcularDigito(base: string, pesos: number[]): number {
    const soma = [...base].reduce(
      (total, caractere, indice) => total + (caractere.charCodeAt(0) - 48) * pesos[indice],
      0,
    );
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  }
}