import assert from "node:assert/strict";
import test from "node:test";
import { interpretarComando } from "../src/cli/EntradaTerminal";

test("interpreta opcoes posicionais e texto citado", () => {
  assert.deepEqual(
    interpretarComando('lote criar --org ORG-001 --nf 123 --transp "Transporte Rapido"'),
    {
      grupo: "lote",
      acao: "criar",
      argumentos: [],
      opcoes: { org: "ORG-001", nf: "123", transp: "Transporte Rapido" },
    },
  );
});

test("preserva argumentos posicionais e sinalizadores sem valor", () => {
  assert.deepEqual(interpretarComando("equip listar interno --detalhes"), {
    grupo: "equip",
    acao: "listar",
    argumentos: ["interno"],
    opcoes: { detalhes: true },
  });
});