import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const TAMANHO_CHAVE = 32;
const TAMANHO_IV = 12;

interface EnvelopeCriptografado {
	versao: 1;
	iv: string;
	tag: string;
	dados: string;
}

export class CriptografiaArquivo {
	constructor(private readonly chave: Buffer) {
		if (chave.length !== TAMANHO_CHAVE) {
			throw new Error("A chave de criptografia deve ter 32 bytes.");
		}
	}

	static gerarChave(): Buffer {
		return randomBytes(TAMANHO_CHAVE);
	}

	criptografar(texto: string): string {
		const iv = randomBytes(TAMANHO_IV);
		const cifra = createCipheriv("aes-256-gcm", this.chave, iv);
		const dados = Buffer.concat([cifra.update(texto, "utf8"), cifra.final()]);
		const envelope: EnvelopeCriptografado = {
			versao: 1,
			iv: iv.toString("base64"),
			tag: cifra.getAuthTag().toString("base64"),
			dados: dados.toString("base64"),
		};
		return JSON.stringify(envelope);
	}

	descriptografar(conteudo: string): string {
		let envelope: EnvelopeCriptografado;
		try {
			envelope = JSON.parse(conteudo) as EnvelopeCriptografado;
		} catch (erro) {
			throw new Error("Envelope criptografado invalido.", { cause: erro });
		}

		if (
			envelope.versao !== 1 ||
			typeof envelope.iv !== "string" ||
			typeof envelope.tag !== "string" ||
			typeof envelope.dados !== "string"
		) {
			throw new Error("Envelope criptografado invalido.");
		}

		const iv = Buffer.from(envelope.iv, "base64");
		const tag = Buffer.from(envelope.tag, "base64");
		if (iv.length !== TAMANHO_IV || tag.length !== 16) {
			throw new Error("Envelope criptografado invalido.");
		}

		const decifra = createDecipheriv("aes-256-gcm", this.chave, iv);
		decifra.setAuthTag(tag);
		return Buffer.concat([
			decifra.update(Buffer.from(envelope.dados, "base64")),
			decifra.final(),
		]).toString("utf8");
	}
}
