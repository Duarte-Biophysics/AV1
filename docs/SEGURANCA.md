# Arquitetura de segurança

## Proteção dos dados persistidos

Credenciais, usuários, organizações, contratos, lotes, equipamentos,
movimentações e parâmetros globais são armazenados em arquivos criptografados
com AES-256-GCM, disponível no módulo `node:crypto`. O GCM fornece
confidencialidade e autenticação: alteração do conteúdo, IV ou tag invalida a
leitura. Cada gravação gera um IV aleatório de 96 bits e uma tag de 128 bits.

A chave de 256 bits é gerada por `crypto.randomBytes`. O arquivo mestre contém
a chave codificada em Base64 e os dados do primeiro administrador, conforme o
formato pedido pelo trabalho. Ele é criado por último, após os arquivos
iniciais, e por gravação temporária seguida de renomeação. O arquivo mestre
precisa ser protegido pelo usuário do sistema operacional: qualquer pessoa com
acesso de leitura a ele também pode descriptografar os dados. Uma implantação
real deve substituir esse armazenamento por um KMS ou cofre de segredos e
planejar rotação e recuperação de chaves.

O repositório grava em arquivo temporário exclusivo no mesmo diretório,
sincroniza o conteúdo e renomeia sobre o destino. A substituição via rename é
atômica no sistema de arquivos local suportado pelo Node. Isso evita arquivos
parcialmente escritos; não substitui backup, redundância ou sincronização de
metadados do diretório contra perda de energia.

## Journal e recuperação

Antes de aplicar uma alteração, o serviço acrescenta ao journal um snapshot
criptografado da coleção afetada, sincroniza o arquivo e só então grava o
snapshot atual. Equipamento e movimentação são registrados na mesma entrada
para que a recuperação possa reaplicar ambos. No início do processo, os
últimos snapshots válidos são reaplicados. Uma cauda sem newline, decorrente de
interrupção durante append, é descartada antes de uma nova gravação. O journal
rotaciona ao ultrapassar 10 MiB e remove arquivos arquivados com mais de 180
dias.

O journal oferece recuperação após falha, não proteção contra adulteração
deliberada por alguém que também controle o diretório e a chave mestra. Para
prova de auditoria contra esse agente, seria necessário encadear hashes ou
assinar registros e guardar checkpoints fora do host.

## Senhas e autenticação

O requisito acadêmico pede SHA-256. O sistema gera salt aleatório de 256 bits
por credencial e calcula SHA-256 de `salt:senha`; a senha original nunca é
persistida. A comparação de hashes usa `timingSafeEqual` e a mensagem de falha
não distingue usuário inexistente de senha incorreta.

SHA-256 é rápido e, mesmo com salt, facilita ataques de força bruta offline.
Em produção, usar Argon2id (preferido quando disponível) ou bcrypt/scrypt com
custo calibrado, política de recuperação e mitigação de tentativas online.
O limite mínimo de 8 caracteres não substitui proteção contra senhas comuns,
limitação de tentativas ou autenticação multifator.

## Sessões, papéis e credenciais

Sessões são tokens aleatórios de 256 bits mantidos em memória. Cada uso válido
renova a atividade; após 30 minutos sem atividade, o token expira. Reiniciar o
processo invalida todas as sessões. Desativar uma conta revoga as sessões
abertas daquele usuário.

Administrador gerencia contas e parâmetros globais; operador cadastra
organizações e contratos; gestor de almoxarifado registra lotes e operações de
equipamento; auditor consulta dados. Os serviços autorizam cada operação, além
de a CLI mostrar apenas comandos compatíveis com o papel.

## Dados sensíveis em terminal e sistema operacional

A entrada de senha é ocultada em terminal interativo. Em entrada redirecionada,
o Node não oferece modo raw e a senha é solicitada normalmente. Os modos de
arquivo POSIX são restritivos, mas permissões do Windows dependem da ACL do
diretório. Armazenar dados em diretório de usuário dedicado e limitar acesso
pela ACL/conta do serviço.

O histórico salva comandos e não contém campos de senha, que são perguntados
separadamente. Não digite segredos nos argumentos dos comandos. Dados de
relatórios podem conter informação comercial; proteja a sessão e a saída do
terminal conforme a política da organização.

## Evolução

Os serviços dependem de interfaces de repositório locais e entidades simples,
permitindo trocar arquivos por banco relacional em uma etapa futura. A chave
mestra, migração de formato, concorrência entre processos, backups e restauração
de journal exigem projeto operacional adicional antes de uso em produção.