import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CriptografiaArquivo } from "../src/infrastructure/CriptografiaArquivo";
import { JournalTransacao } from "../src/infrastructure/JournalTransacao";
import { RepositorioEntidades } from "../src/infrastructure/RepositorioEntidades";

test("recupera estado do journal apos interrupcao antes da escrita do snapshot", async () => {
  const diretorio = await mkdtemp(join(tmpdir(), "greencode-recovery-"));
  try {
    const chave = CriptografiaArquivo.gerarChave();
    const journal = new JournalTransacao(
      join(diretorio, "journal.log"),
      new CriptografiaArquivo(chave),
    );
    await journal.registrar("organizacao.criar", {
      colecao: "organizacoes",
      estado: [{ id: "org-1", razaoSocial: "Exemplo" }],
    });

    const repositorio = new RepositorioEntidades(diretorio, chave);
    assert.deepEqual(await repositorio.listar("organizacoes"), [
      { id: "org-1", razaoSocial: "Exemplo" },
    ]);
  } finally {
    await rm(diretorio, { recursive: true, force: true });
  }
});