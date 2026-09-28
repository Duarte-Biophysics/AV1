import assert from "node:assert/strict";
import test from "node:test";
import { ValidadorCNPJ } from "../src/domain/validation/ValidadorCNPJ";
import { ValidadorDataEntrada } from "../src/domain/validation/ValidadorDataEntrada";

test("valida digitos verificadores e normaliza CNPJ", () => {
  const validador = new ValidadorCNPJ();
  assert.equal(validador.validar("11.222.333/0001-81"), "11222333000181");
  assert.throws(() => validador.validar("11.222.333/0001-80"), /Digitos verificadores/);
  assert.throws(() => validador.validar("00.000.000/0000-00"), /caracteres alfanumericos/);
});

test("aceita CNPJ alfanumerico e exige digitos verificadores numericos validos", () => {
  const validador = new ValidadorCNPJ();
  assert.equal(validador.validar("12.abc.345/01de-35"), "12ABC34501DE35");
  assert.throws(() => validador.validar("12ABC34501DE36"), /Digitos verificadores/);
  assert.throws(() => validador.validar("12ABC34501D3EF"), /caracteres alfanumericos/);
});

test("aceita datas entre hoje e 90 dias atras e rejeita limites externos", () => {
  const hoje = new Date("2026-09-28T12:00:00.000Z");
  const validador = new ValidadorDataEntrada(() => hoje);
  assert.equal(validador.validar("2026-09-28"), "2026-09-28");
  assert.equal(validador.validar("2026-06-30"), "2026-06-30");
  assert.throws(() => validador.validar("2026-09-29"), /futura/);
  assert.throws(() => validador.validar("2026-06-29"), /90 dias/);
  assert.throws(() => validador.validar("2026-02-30"), /invalida/);
});