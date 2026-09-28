import { createInterface } from "node:readline/promises";

export async function perguntar(texto: string): Promise<string> {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await terminal.question(texto);
  } finally {
    terminal.close();
  }
}

export async function perguntarSenha(texto: string): Promise<string> {
  const entrada = process.stdin;
  if (!entrada.isTTY || typeof entrada.setRawMode !== "function") {
    return perguntar(texto);
  }

  process.stdout.write(texto);
  entrada.setRawMode(true);
  entrada.resume();
  return new Promise((resolve, reject) => {
    let senha = "";
    const finalizar = (erro?: Error): void => {
      entrada.removeListener("data", receberTecla);
      entrada.setRawMode(false);
      process.stdout.write("\n");
      if (erro) reject(erro);
      else resolve(senha);
    };
    const receberTecla = (dados: Buffer): void => {
      for (const caractere of dados.toString("utf8")) {
        if (caractere === "\u0003") {
          finalizar(new Error("Operacao cancelada."));
          return;
        }
        if (caractere === "\r" || caractere === "\n") {
          finalizar();
          return;
        }
        if (caractere === "\u007f" || caractere === "\b") {
          if (senha.length > 0) {
            senha = senha.slice(0, -1);
            process.stdout.write("\b \b");
          }
        } else if (caractere >= " ") {
          senha += caractere;
          process.stdout.write("*");
        }
      }
    };
    entrada.on("data", receberTecla);
  });
}

export interface ComandoInterpretado {
  grupo: string;
  acao: string;
  argumentos: string[];
  opcoes: Record<string, string | true>;
}

export function interpretarComando(linha: string): ComandoInterpretado {
  const tokens = linha.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s]+/g) ?? [];
  const normalizados = tokens.map((token) => {
    if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
      return token.slice(1, -1).replace(/\\(["'\\])/g, "$1");
    }
    return token;
  });
  const grupo = normalizados[0]?.toLowerCase() ?? "";
  const acao = normalizados[1]?.toLowerCase() ?? "";
  const argumentos: string[] = [];
  const opcoes: Record<string, string | true> = {};

  for (let indice = 2; indice < normalizados.length; indice += 1) {
    const token = normalizados[indice];
    if (!token.startsWith("--")) {
      argumentos.push(token);
      continue;
    }
    const chave = token.slice(2);
    const proximo = normalizados[indice + 1];
    if (proximo && !proximo.startsWith("--")) {
      opcoes[chave] = proximo;
      indice += 1;
    } else {
      opcoes[chave] = true;
    }
  }
  return { grupo, acao, argumentos, opcoes };
}