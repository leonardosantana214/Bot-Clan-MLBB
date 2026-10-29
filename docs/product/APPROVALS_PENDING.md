# Aprovações pendentes da liderança

Nenhum agente pode aprovar regras em nome da liderança. A tabela inicial é histórica; as decisões posteriores abaixo prevalecem. Os novos itens continuam **Proposta / Pendente**, mesmo quando há implementação.

| # | Decisão | Proposta atual | Impacto |
|---|---|---|---|
| A1 | Pesos do Membro Estrela | Atividade 30, Partidas 20, Rising 25, Comunidade 15, Fair Play 10 | Modelo de pontuação |
| A2 | Elegibilidade ao sorteio | ≥ 50/100 pontos | Sorteios |
| A3 | Relação mérito × sorteio | Dois resultados independentes | Regras e relatórios |
| A4 | Desempate | Atividade > Rising > Fair Play > Partidas com membros > procedimento público prévio | Fechamento mensal |
| A5 | Metas de atividade publicadas antes do mês | Definir valores | Pontuação de atividade |
| A6 | Prêmios reais em sorteios | Verificar exigências legais antes de automatizar | Módulo de sorteios |
| A7 | Política de retenção de dados e de ex-membros | Ver PRIVACY_AND_RETENTION | LGPD |
| A8 | Texto de consentimento / transparência do monitoramento | A redigir com a liderança | Cadastro |
| A9 | Número dedicado para o bot e aceite do risco de banimento | Número exclusivo | Operação |
| A10 | Papéis e quem pode o quê | Política v1 em ACCESS_CONTROL; aceite operacional pendente | RBAC |
| A11 | Licença do repositório e visibilidade (público/privado) | Privado até decisão | Publicação |
| A12 | Fórmula de níveis e limites de XP | Valores iniciais configuráveis | Gamificação |
| A13 | Aparelho reserva dedicado ao Host | Confirmar modelo/Android | Host |

## Atualização — decisões da liderança (2026-10-28)
| # | Resultado |
|---|---|
| A1/A2 | Pesos mantidos como proposta; ≥ 50/100 = elegível ao sorteio |
| A3 | Sorteio realmente aleatório (seed registrada), sem mérito automático |
| A4 | Desempate decidido pelos ADMs na hora; ordem proposta serve de sugestão |
| A5 | **Metas de atividade:** valores ainda por definir (dependem de fonte de dados — pontos do clã foram removidos do escopo) |
| A6 | Sorteios e prêmios são assunto da administração; sistema só registra |
| **Novo** | Quem venceu um mês não pode vencer o mês seguinte (a confirmar) |
| A9 | Número dedicado: liderança será avisada |
| A10 | Login simples no Controller; sem papéis por enquanto (detalhes pendentes) |
| A11 | Repositório público aprovado |
| A12 | XP vem do MLBB — **inviável por API** (ver MLBB_PROVIDER_RESEARCH); XP por mensagem vem desativado e é configurável |
| A13 | Aparelho antigo e desconhecido; compatibilidade Android ampla; modelo a confirmar |

## Pendências da auditoria — Proposta/Pendente

Não considerar estes itens corrigidos ou aprovados por este patch. A liderança deve registrar responsável, decisão e evidência de validação. Detalhes em [Privacidade e retenção](../security/PRIVACY_AND_RETENTION.md).

| Achado | Aprovação necessária |
|---|---|
| #3/#4 | Migração futura para ID interno aleatório; exportações permanecem pseudonimizadas. |
| #9 | TLS/túnel confiável para operação remota; HTTP continua pendente. |
| #10 | Validação operacional das permissões e ACLs da sessão. |
| #11 | Prazos e execução agendada de retenção, com responsável. |
| #12/#13 | Política de backup, criptografia, rotação, consistência e teste de restauração. |
| #18 | Regras, prêmios e procedimento verificável do sorteio. Aprovação administrativa não implica envio ao CHAT. |
| #26 | Modelo de autoridade: qualquer pessoa que escreve no ADM pode executar comandos administrativos. |
| #27 | Aprovar outbox durável para notificações antes da agregação e distinguir confirmação local de recibo WhatsApp. |
| #28 | Rever a exigência de presença left em todos os grupos visíveis, inclusive ADM; membros que nunca estiveram no ADM podem nunca ter revisão de saída. |
| #29 | Definir limites/backpressure da entrada e prazo máximo de encerramento, com timeout/cancelamento de envio. |

## Aprovações do líder — atualização final

| Item | Estado e proposta a aprovar | Situação técnica / decisão adotada nesta documentação |
|---|---|---|
| Curva de níveis | **Proposta / Pendente:** `ceil(200*level^2.5)` como XP acumulado mínimo do nível | Já é padrão configurável no core; nível zero inicia em zero. Implementação não implica aprovação. |
| Tom do conselheiro | **Proposta / Pendente:** revisar frases e limites do tom | Persona conselheiro desligada por padrão; estilo neutro. Opt-in por AEROBOT_PERSONA=conselheiro; textos locais, sem IA. |
| Vencedor anterior | **Proposta / Pendente:** vencedor anterior não ganha no mês seguinte | Há exclusões no serviço de Membro Estrela; confirmar abrangência entre mérito, sorteio e meses sem fechamento antes da operação. |
| Scout | **Proposta / Pendente:** acompanhar candidatos/jogadores manualmente | Cadastro, critérios e notas pela liderança já implementados; sem coleta automática de estatísticas pessoais do MLBB. Confirmar finalidade, acesso e retenção. |
| XP por mensagem | **Proposta / Pendente:** decidir se habilitar, valores e antiflood | Desligado por padrão; depende de política global e módulo do grupo. Alterar política exige reinício. Não equivale a XP oficial do MLBB. |
| Brincadeiras | **Proposta / Pendente:** texto, quiz e figurinhas | Não anunciar como implementadas. Música fora do escopo. |
| Migração Zod 4 | **Proposta / Pendente:** planejar compatibilidade, atualizar schemas e testar contratos | Manifests atuais usam Zod ^3.24.2; não foi feita migração nesta tarefa de documentação. |

Decisão documental: preservar os padrões seguros existentes e distinguir código disponível de regra aprovada. O repositório já é público conforme A11; a proposta inicial de mantê-lo privado está superada. Senha e demais segredos ficam fora dele. Os achados #27–#29 continuam abertos; sugestões de correção estão em [Privacidade e retenção](../security/PRIVACY_AND_RETENTION.md).
