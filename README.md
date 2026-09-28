AV1-FATEC

# GREENCODE
CLI em Node.js e TypeScript para gerenciar organizações, contratos, lotes,
equipamentos e a rastreabilidade de resíduos eletrônicos.

## Requisitos

- Node.js 24 ou superior
- npm 11 ou superior

## Instalação e validação

```sh
npm ci
npm test
npm start
```

O primeiro início solicita login e senha para provisionar o administrador.
Use uma senha com pelo menos 8 caracteres. Os próximos inícios solicitam
autenticação. Os arquivos de dados são criados em `./data`; defina
`GREENCODE_DATA_DIR` para usar outro diretório.

## Comandos

O comando `ajuda` mostra as ações permitidas para o papel conectado. Exemplos:

```text
org criar --razao "Universidade Exemplo" --nome "Exemplo" --cnpj 11222333000181
contrato criar --org ID_ORGANIZACAO --codigo CT-001 --inicio 2026-09-01
lote criar --org ID_ORGANIZACAO --contrato ID_CONTRATO --nf 123456 --transp "Trans Rapida" --data 2026-09-28
equip criar --lote ID_LOTE --codigo GC-0001 --tipo NOTEBOOK --estado BOM
equip triagem-iniciar --id ID_EQUIPAMENTO
equip triagem-concluir --id ID_EQUIPAMENTO --destino APTO_REUSO --diagnostico "Apto para reuso"
equip movimentar --id ID_EQUIPAMENTO --status EM_DESMONTE --estado RUIM --justificativa "Dano interno identificado"
relatorio rastrear --codigo GC-0001
```

Valores de estado físico: `INSERVIVEL`, `PESSIMO`, `RUIM`, `REGULAR`, `BOM`.
Os comandos de criação/alteração verificam novamente o papel na camada de
serviço; ocultar um comando do menu não é a única barreira de autorização.

## Estrutura

- `src/domain`: entidades, papéis, estados e validadores.
- `src/application`: provisionamento e serviços de negócio.
- `src/infrastructure`: criptografia, arquivos atômicos, journal e recuperação.
- `src/cli`: readline, histórico, autocompletar, menus e parser de comandos.
- `test`: testes unitários, integração da jornada e falhas simuladas.
- `docs`: arquitetura de segurança e cenários de falha.

Decisões de segurança: [arquitetura](docs/SEGURANCA.md). Cenários cobertos e
limitações: [falhas](docs/FALHAS.md).