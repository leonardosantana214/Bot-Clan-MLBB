# Privacidade e retenção (LGPD)

Status: **Proposta / Pendente** — validar com a liderança e, se necessário, assessoria jurídica. Este documento não é parecer jurídico.

## Dados tratados
Identificador WhatsApp (número), nome de exibição, ID/Server MLBB, nickname, rotas/heróis, métricas de atividade, pontuações, advertências, consentimentos; data de nascimento parcial só com consentimento.

## Princípios
- Finalidade: gestão da comunidade. Minimização: contar atividade sem guardar texto de mensagens.
- Transparência: membros são informados sobre o monitoramento no cadastro/regras (texto a aprovar — A8).
- Consentimento registrado com versão do texto; revogável.
- Direitos: consulta do próprio perfil, correção, desvinculação do MLBB, exclusão mediante solicitação legítima.

## Retenção proposta (valores a aprovar — A7)
| Dado | Retenção |
|---|---|
| Contagens de atividade agregadas | 12 meses, depois agregado anônimo |
| Perfil de ex-membro | 90 dias após "saiu", depois anonimização/arquivo |
| Lançamentos de pontuação fechados | Mantidos (anonimizáveis) para histórico |
| Audit log | 24 meses |
| Logs técnicos | 30 dias, sem PII |
| Backups | Rotação de 30 dias, criptografados |

## Repositório
Nenhum dado real, número, sessão, print pessoal ou backup no Git; fixtures sintéticas apenas.

## Riscos conhecidos da auditoria

As exportações são **pseudonimizadas**, não anônimas. Hashes determinísticos não impedem correlação ou tentativa de identificação; nomes, datas e atributos também podem identificar pessoas. O tratamento continua sujeito à política de privacidade.

| Achado | Risco e decisão pendente |
|---|---|
| #3/#4 | O cadastro ainda deriva o ID interno da identidade da plataforma. Migrar para ID interno aleatório exige migração de relacionamentos, ledger e históricos; Proposta/Pendente, fora desta correção. A sanitização de nomes de exibição não substitui essa migração. |
| #9 | HTTP sem TLS não protege senha, sessão e dados em trânsito. Definir implantação com TLS ou túnel confiável; aceite explícito antes de uso fora de loopback. |
| #10 | Validar permissões/ACLs da pasta de sessão no ambiente de produção, inclusive arquivos existentes e credenciais WhatsApp. Nenhuma alteração de permissões nesta correção. |
| #11 | Retenção não tem execução agendada. Aprovar prazos, responsável, agendamento e evidência de execução antes de anunciar descarte automático. |
| #12/#13 | Backup requer política aprovada de criptografia, guarda separada da chave, cobertura dos bancos e credenciais, consistência entre bancos, rotação e teste de restauração. As cópias separadas atuais não constituem snapshot atômico conjunto. |
| #18 | Sorteio exige validação administrativa das regras, prêmios, exclusão do vencedor anterior e procedimento de verificação. Registro de seed não é aprovação jurídica nem prova de divulgação no CHAT. |
| #26 | Autoridade dos comandos ADM equivale a quem consegue escrever no grupo ADM; falta identidade administrativa individual com papéis. Revisar participantes e aprovar esse modelo antes da operação. |
| #27 | **Corrigido (testado com fakes)** — claim e agregado limitado são persistidos na mesma transação SQLite (também no contrato em memória). Reinício recupera a janela; falha de gravação reverte o claim. `accepted` significa **aceito pelo adapter**, sem comprovar entrega/leitura. `autoConfirm` permanece como opção legada sem confirmar automaticamente; confirmação explícita exige ACK real. Falha ambígua/crash após envio pode duplicar mensagem; não há exactly-once remoto. Claims órfãos anteriores à correção não são reconstruídos. |
| #28 | **Corrigido (testado com fakes)** — considera presença em qualquer grupo roteado CHAT ou ADM e exige saída dos grupos com participação observada; grupo nunca observado não bloqueia revisão. Presença atual no ADM bloqueia revisão após saída do CHAT. Abre apenas caso para decisão humana, sem mudar status. Snapshot incompleto/evento perdido não comprova saída: requer reconciliação humana; não há inferência automática de exclusão. |
| #29 | **Corrigido (testado com fakes)** — fila de entrada limitada a 200 aguardando + 1 ativo, descartando o mais antigo e expondo `droppedInboundCount`; timeout de envio de 30 s, drenagem de 5 s e desconexão de 5 s. O executável limita shutdown total a 10 s. Bancos não são fechados sob handler ativo: fechamento é adiado até ele terminar, ou o processo encerra pelo prazo. Timeout limita espera, mas não garante cancelamento de I/O já aceito nem ausência de duplicatas; o socket é fechado na desconexão. Sobrecarga pode perder eventos: monitorar contador e revisar presença manualmente. |

Idempotência remota (#7): tombstones em memória sobrevivem à poda do histórico até o prazo máximo da sessão (48 horas por padrão). Reiniciar o Host invalida as sessões; uma nova sessão não oferece deduplicação entre sessões. Após falha de transporte, repetir a intenção na mesma sessão preserva a chave. Falhas parciais em handlers de mensagem (#14/#15) podem deixar efeitos já confirmados: a reentrega é permitida, e cada efeito persistente deve manter sua própria chave idempotente.

### Base da verificação dos achados #27–#29

Testes sintéticos cobrem recuperação do agregado após recriar o serviço, rollback transacional do claim, idempotência, membro só no CHAT, presença no ADM, status preservado, sobrecarga, envio que nunca resolve e prazo de encerramento/desconexão. Não houve teste com aparelho ou WhatsApp real. Confirmação remota/ACK, cancelamento efetivo de transporte, reconciliação de eventos perdidos e política de retenção permanecem pendentes conforme descrito acima.

Senhas, hashes, QR e sessões ficam fora deste repositório público. Os demais riscos continuam Proposta/Pendente; estas correções não aprovam prazos de retenção nem implantação remota.
