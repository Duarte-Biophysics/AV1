# Cenários de falha e resposta

| Cenário | Resposta esperada | Cobertura |
| --- | --- | --- |
| Chave com tamanho inválido ou envelope adulterado | Rejeitar descriptografia sem retornar dados parciais | `infrastructure.test.ts` |
| Processo interrompido durante gravação de snapshot | Manter o arquivo original; reaplicar a última operação journalizada ao reiniciar | `repositorio-entidades.test.ts` |
| Processo interrompido no meio de uma linha do journal | Descartar a cauda parcial antes do próximo append | `infrastructure.test.ts` |
| Journal passa de 10 MiB | Arquivar o journal atual antes do próximo registro e continuar listando o histórico | `infrastructure.test.ts` |
| Arquivo de journal arquivado excede 180 dias | Remover na próxima gravação | `infrastructure.test.ts` |
| CNPJ duplicado ou dígitos verificadores inválidos | Rejeitar cadastro antes de persistir | `validadores.test.ts`, `jornada-dominio.test.ts` |
| Data do lote futura, inválida ou anterior à janela de 90 dias | Rejeitar criação do lote | `validadores.test.ts` |
| Credenciais incorretas | Retornar a mesma mensagem para login ausente e senha incorreta | `autenticacao.test.ts` |
| Sessão sem atividade por 30 minutos | Remover sessão e negar nova operação | `autenticacao.test.ts` |
| Auditor tenta alterar ou administrar configuração | Negar no serviço; consultas permanecem disponíveis | `jornada-dominio.test.ts`, `configuracao-global.test.ts` |
| Equipamento vai para desmonte antes da triagem | Rejeitar transição | `jornada-dominio.test.ts` |
| Estado físico cai duas ou mais categorias sem justificativa | Rejeitar movimentação | `jornada-dominio.test.ts` |
| Arquivo ausente | Repositórios de coleção começam vazios; configuração mestre ausente ativa provisionamento | `provisionamento.test.ts`, `repositorio-entidades.test.ts` |

Os testes de persistência simulam interrupção nos limites de journal/snapshot e
uma cauda incompleta. Não simulam desligamento físico de máquina, falha de
hardware, filesystem de rede, processo concorrente em múltiplos hosts nem perda
do arquivo mestre. Esses cenários requerem testes no ambiente operacional,
backups e armazenamento resiliente.