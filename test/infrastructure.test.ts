import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CriptografiaArquivo } from "../src/infrastructure/CriptografiaArquivo";
import { JournalTransacao } from "../src/infrastructure/JournalTransacao";
import { RepositorioArquivo } from "../src/infrastructure/RepositorioArquivo";

test("criptografia autentica e protege o conteudo", () => {
  const chave = CriptografiaArquivo.gerarChave();
  const criptografia = new CriptografiaArquivo(chave);
  const envelope = criptografia.criptografar("dado reservado");

  assert.equal(criptografia.descriptografar(envelope), "dado reservado");
  assert.throws(() => new CriptografiaArquivo(Buffer.alloc(16)));
  assert.throws(() => criptografia.descriptografar(envelope.replace("dado", "outro")));
});

test("repositorio grava de forma criptografada e recupera o valor", async () => {
  const diretorio = await mkdtemp(join(tmpdir(), "greencode-repository-"));
  try {
    const chave = CriptografiaArquivo.gerarChave();
    const repositorio = new RepositorioArquivo(new CriptografiaArquivo(chave));
    const caminho = join(diretorio, "dados.enc");
    const valor = { organizacao: "Exemplo", cnpj: "123" };

    await repositorio.gravar(caminho, valor);
    assert.deepEqual(await repositorio.ler(caminho), valor);
    assert.equal((await readFile(caminho, "utf8")).includes("Exemplo"), false);
  } finally {
    await rm(diretorio, { recursive: true, force: true });
  }
});

test("journal registra antes de aplicar e lista apos rotacao", async () => {
  const diretorio = await mkdtemp(join(tmpdir(), "greencode-journal-"));
  try {
    const journal = new JournalTransacao(
      join(diretorio, "transacoes.log"),
      new CriptografiaArquivo(CriptografiaArquivo.gerarChave()),
      300,
    );
    let aplicacaoOcorreu = false;
    await journal.executar("organizacao.criar", { nome: "A" }, async () => {
      assert.equal((await journal.listar()).length, 1);
      aplicacaoOcorreu = true;
    });
    await journal.registrar("organizacao.criar", { nome: "B" });

    assert.equal(aplicacaoOcorreu, true);
    assert.equal((await journal.listar()).length, 2);
    assert.ok((await readdir(diretorio)).some((nome) => nome.endsWith(".archive")));
  } finally {
    await rm(diretorio, { recursive: true, force: true });
  }
});

test("journal remove cauda parcial antes de continuar apos interrupcao", async () => {
  const diretorio = await mkdtemp(join(tmpdir(), "greencode-journal-tail-"));
  try {
    const caminho = join(diretorio, "transacoes.log");
    const journal = new JournalTransacao(caminho, new CriptografiaArquivo(CriptografiaArquivo.gerarChave()));
    await journal.registrar("lote.criar", { id: "lote-1" });
    await writeFile(caminho, "{fragmento-incompleto", { flag: "a" });
    await journal.registrar("lote.criar", { id: "lote-2" });

    assert.deepEqual(
      (await journal.listar()).map((registro) => registro.dados),
      [{ id: "lote-1" }, { id: "lote-2" }],
    );
  } finally {
    await rm(diretorio, { recursive: true, force: true });
  }
});

test("journal elimina arquivos arquivados mais antigos que a retencao", async () => {
  const diretorio = await mkdtemp(join(tmpdir(), "greencode-journal-retention-"));
  try {
    const caminho = join(diretorio, "transacoes.log");
    const expirado = join(diretorio, "transacoes.log.antigo.archive");
    const journal = new JournalTransacao(
      caminho,
      new CriptografiaArquivo(CriptografiaArquivo.gerarChave()),
      1024,
      180,
    );
    await writeFile(expirado, "arquivo expirado");
    const dataAntiga = new Date(Date.now() - 181 * 24 * 60 * 60 * 1000);
    await utimes(expirado, dataAntiga, dataAntiga);
    await journal.registrar("auditoria.consultar", { id: "consulta-1" });

    await assert.rejects(readFile(expirado), { code: "ENOENT" });
  } finally {
    await rm(diretorio, { recursive: true, force: true });
  }
});