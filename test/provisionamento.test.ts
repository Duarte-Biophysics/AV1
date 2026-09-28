import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ProvisionadorInicial } from "../src/application/ProvisionadorInicial";
import { PapelUsuario } from "../src/domain/auth/PapelUsuario";

test("provisiona o administrador uma vez e protege as credenciais", async () => {
  const diretorio = await mkdtemp(join(tmpdir(), "greencode-bootstrap-"));
  try {
    const provisionador = new ProvisionadorInicial(diretorio);
    assert.equal(await provisionador.estaProvisionado(), false);

    const configuracao = await provisionador.provisionar("admin", "senha123");
    assert.equal(await provisionador.estaProvisionado(), true);
    assert.equal(configuracao.administradorInicial.login, "admin");
    assert.equal(configuracao.administradorInicial.papel, PapelUsuario.ADMINISTRADOR);
    assert.deepEqual(await provisionador.carregarConfiguracao(), configuracao);

    const credenciais = await readFile(join(diretorio, "credentials.enc"), "utf8");
    assert.equal(credenciais.includes("senha123"), false);
    await assert.rejects(
      provisionador.provisionar("admin", "senha123"),
      /ja foi provisionado/,
    );
  } finally {
    await rm(diretorio, { recursive: true, force: true });
  }
});

test("rejeita senha fraca sem criar configuracao mestre", async () => {
  const diretorio = await mkdtemp(join(tmpdir(), "greencode-bootstrap-invalid-"));
  try {
    const provisionador = new ProvisionadorInicial(diretorio);
    await assert.rejects(provisionador.provisionar("admin", "1234567"), /8 caracteres/);
    assert.equal(await provisionador.estaProvisionado(), false);
  } finally {
    await rm(diretorio, { recursive: true, force: true });
  }
});