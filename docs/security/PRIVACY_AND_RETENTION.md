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
