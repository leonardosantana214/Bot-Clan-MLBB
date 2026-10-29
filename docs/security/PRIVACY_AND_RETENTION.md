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

## Riscos conhecidos da auditoria — Proposta/Pendente

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
| #27 | Proposta/Pendente: descrição do achado não fornecida nesta tarefa nem localizada no worktree. Vincular o texto da auditoria e definir responsável/aceite antes de encerrar. |
| #28 | Proposta/Pendente: descrição do achado não fornecida nesta tarefa nem localizada no worktree. Vincular o texto da auditoria e definir responsável/aceite antes de encerrar. |
| #29 | Proposta/Pendente: descrição do achado não fornecida nesta tarefa nem localizada no worktree. Vincular o texto da auditoria e definir responsável/aceite antes de encerrar. |

Idempotência remota (#7): tombstones em memória sobrevivem à poda do histórico até o prazo máximo da sessão (48 horas por padrão). Reiniciar o Host invalida as sessões; uma nova sessão não oferece deduplicação entre sessões. Após falha de transporte, repetir a intenção na mesma sessão preserva a chave. Falhas parciais em handlers de mensagem (#14/#15) podem deixar efeitos já confirmados: a reentrega é permitida, e cada efeito persistente deve manter sua própria chave idempotente.
