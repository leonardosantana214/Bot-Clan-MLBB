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
| #27 | **Proposta/Pendente — notificações:** o evento é marcado como reivindicado no armazenamento antes de ficar em um buffer de agregação em memória. Reiniciar antes de entrar na fila persistida perde a notificação; o claim pode impedir reprocessá-la, embora o fato continue no ledger de origem. Com autoConfirm padrão, resolver sendMessage leva a "confirmed": **confirmado não é recibo de entrega/leitura do WhatsApp**. Correção sugerida: outbox durável/transacional desde o evento, agregação recuperável após reinício e estados separados para aceitação local, envio e recibo remoto; só afirmar recibo quando houver integração de ACK verificada. |
| #28 | **Proposta/Pendente — revisão de saída pode nunca abrir:** leftEverywhere exige presença left em todos os grupos visíveis; a configuração padrão inclui CHAT e ADM. Um membro que nunca esteve no ADM não terá left nesse grupo. Só uma saída observada do ADM gera essa evidência para o ADM, bloqueando a revisão mesmo após sair do CHAT. Correção sugerida: distinguir ausência, desconhecimento e saída; considerar os grupos pertinentes ao histórico do membro e reconciliar snapshots, com revisão humana e sem exclusão automática. Testar membro que nunca entrou no ADM e eventos perdidos. |
| #29 | **Proposta/Pendente — filas/encerramento:** a cadeia pending da entrada no Host não tem limite/backpressure; close aguarda seu esvaziamento sem prazo. Um sendMessage que nunca resolve pode bloquear processamento e shutdown (inclusive a espera por envio em andamento no adapter). A fila de saída tem limite próprio, mas isso não limita a entrada nem o tempo de encerramento. Correção sugerida: fila de entrada limitada com política explícita de sobrecarga, métricas, timeout e cancelamento real de envios, deadline de drenagem e fechamento seguro/recuperável dos bancos. Testar sobrecarga e promessa de envio que nunca resolve. |

Idempotência remota (#7): tombstones em memória sobrevivem à poda do histórico até o prazo máximo da sessão (48 horas por padrão). Reiniciar o Host invalida as sessões; uma nova sessão não oferece deduplicação entre sessões. Após falha de transporte, repetir a intenção na mesma sessão preserva a chave. Falhas parciais em handlers de mensagem (#14/#15) podem deixar efeitos já confirmados: a reentrega é permitida, e cada efeito persistente deve manter sua própria chave idempotente.

### Base da verificação dos achados #27–#29

Conferidos em `main` (`ee951bd`): `packages/community/src/{notifications,config,membership}.ts`, `packages/whatsapp-baileys/src/{compose,index,run}.ts` e testes sintéticos de comunidade. A formulação recebida para #28 dizia que só o grupo ADM gera presença left. **Não foi possível confirmar essa exclusividade:** o código aceita eventos de saída de CHAT e ADM. O problema confirmado é exigir left também no ADM, mesmo para quem nunca participou dele. Mantemos o risco aberto, sem afirmar correção nem validação com WhatsApp real.

As correções acima são sugestões **Proposta/Pendente**, não implementações desta atualização. Aprovar responsável, política e evidências antes de encerrar os achados. Senhas, hashes, QR e sessões ficam fora deste repositório público. Nenhuma funcionalidade foi validada em aparelho real ou WhatsApp real.
