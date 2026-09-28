import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ProvisionadorInicial } from "../src/application/ProvisionadorInicial";
import { ServicoAutenticacao } from "../src/application/ServicoAutenticacao";
import { PapelUsuario } from "../src/domain/auth/PapelUsuario";

test("autentica, renova atividade e aplica permissao por papel", async () => {
  const diretorio = await mkdtemp(join(tmpdir(), "greencode-auth-"));
  try {
    let agora = Date.UTC(2026, 0, 1);
    const provisionador = new ProvisionadorInicial(diretorio);
    const configuracao = await provisionador.provisionar("admin", "senha-forte-123");
    const autenticacao = new ServicoAutenticacao(diretorio, configuracao, 30 * 60 * 1000, () => agora);
    const sessao = await autenticacao.autenticar("admin", "senha-forte-123");

    assert.equal(sessao.papel, PapelUsuario.ADMINISTRADOR);
    agora += 29 * 60 * 1000;
    assert.equal(autenticacao.validarSessao(sessao.token).login, "admin");
    assert.throws(
      () => autenticacao.exigirPapel(sessao.token, [PapelUsuario.AUDITOR]),
      /Acesso negado/,
    );
    agora += 30 * 60 * 1000;
    assert.throws(() => autenticacao.validarSessao(sessao.token), /expirada/);
  } finally {
    await rm(diretorio, { recursive: true, force: true });
  }
});

test("nao revela se usuario ou senha estao incorretos", async () => {
  const diretorio = await mkdtemp(join(tmpdir(), "greencode-auth-invalid-"));
  try {
    const provisionador = new ProvisionadorInicial(diretorio);
    const configuracao = await provisionador.provisionar("admin", "senha-forte-123");
    const autenticacao = new ServicoAutenticacao(diretorio, configuracao);
    await assert.rejects(autenticacao.autenticar("admin", "errada"), /Login ou senha invalidos/);
    await assert.rejects(autenticacao.autenticar("desconhecido", "errada"), /Login ou senha invalidos/);
  } finally {
    await rm(diretorio, { recursive: true, force: true });
  }
});