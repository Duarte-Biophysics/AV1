import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export interface Credencial {
  usuarioId: string;
  salt: string;
  hashSenha: string;
}

export function criarCredencial(usuarioId: string, senha: string): Credencial {
  const salt = randomBytes(32).toString("hex");
  return { usuarioId, salt, hashSenha: calcularHash(salt, senha) };
}

export function verificarSenha(credencial: Credencial, senha: string): boolean {
  const hashInformado = Buffer.from(calcularHash(credencial.salt, senha), "hex");
  const hashArmazenado = Buffer.from(credencial.hashSenha, "hex");
  return (
    hashInformado.length === hashArmazenado.length &&
    timingSafeEqual(hashInformado, hashArmazenado)
  );
}

function calcularHash(salt: string, senha: string): string {
  return createHash("sha256").update(salt).update(":").update(senha).digest("hex");
}