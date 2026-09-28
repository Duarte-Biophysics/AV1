import { join } from "node:path";
import { ProvisionadorInicial } from "./application/ProvisionadorInicial";
import { ServicoAutenticacao } from "./application/ServicoAutenticacao";
import { ServicoConfiguracaoGlobal } from "./application/ServicoConfiguracaoGlobal";
import { ServicoEquipamento } from "./application/ServicoEquipamento";
import { ServicoLote } from "./application/ServicoLote";
import { ServicoOrganizacao } from "./application/ServicoOrganizacao";
import { ServicoRelatorio } from "./application/ServicoRelatorio";
import { ServicoUsuario } from "./application/ServicoUsuario";
import { CLIInterface } from "./cli/CLIInterface";
import { perguntar, perguntarSenha } from "./cli/EntradaTerminal";
import { RepositorioEntidades } from "./infrastructure/RepositorioEntidades";

async function iniciar(): Promise<void> {
	const diretorioDados = process.env.GREENCODE_DATA_DIR ?? join(process.cwd(), "data");
	const provisionador = new ProvisionadorInicial(diretorioDados);
	let configuracao;
	if (!(await provisionador.estaProvisionado())) {
		console.log("Modo de provisionamento inicial.");
		const login = await perguntar("Login do administrador: ");
		const senha = await perguntarSenha("Senha do administrador: ");
		configuracao = await provisionador.provisionar(login, senha);
		console.log("[SUCESSO] Administrador inicial criado.");
	} else {
		configuracao = await provisionador.carregarConfiguracao();
	}

	const autenticacao = new ServicoAutenticacao(diretorioDados, configuracao);
	let sessao;
	while (!sessao) {
		const login = await perguntar("Login: ");
		const senha = await perguntarSenha("Senha: ");
		try {
			sessao = await autenticacao.autenticar(login, senha);
		} catch (erro) {
			console.error(`[ERRO] ${erro instanceof Error ? erro.message : "Falha de autenticacao."}`);
		}
	}

	const repositorio = new RepositorioEntidades(
		diretorioDados,
		Buffer.from(configuracao.chaveCriptografia, "base64"),
	);
	const servicos = {
		autenticacao,
		usuarios: new ServicoUsuario(repositorio, autenticacao),
		organizacoes: new ServicoOrganizacao(repositorio, autenticacao),
		lotes: new ServicoLote(repositorio, autenticacao),
		equipamentos: new ServicoEquipamento(repositorio, autenticacao),
		relatorios: new ServicoRelatorio(repositorio, autenticacao),
		configuracaoGlobal: new ServicoConfiguracaoGlobal(repositorio, autenticacao),
	};
	await new CLIInterface(diretorioDados, sessao, servicos).iniciar();
}

iniciar().catch((erro: unknown) => {
	console.error(`[ERRO] ${erro instanceof Error ? erro.message : "Falha fatal."}`);
	process.exitCode = 1;
});