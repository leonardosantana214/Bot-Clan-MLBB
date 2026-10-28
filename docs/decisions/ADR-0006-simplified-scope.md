# ADR-0006 — Escopo simplificado (decisão da liderança, 2026-10-28)

Status: **Confirmado** (palavras do responsável do projeto). Substitui, onde houver conflito, os documentos anteriores.

## Decisões
1. **Simples e enxuto.** Bot de WhatsApp para um clã de MLBB. Sem arquitetura excessiva; manter a separação domínio/adaptadores, mas sem camadas extras.
2. **100% mobile, dois APKs:** *AeroBot Host* (roda o bot) e *AeroBot Controller* (administração). Sem contas de login/perfis.
3. **Compatibilidade Android ampla** (aparelho antigo). Não será exigido Android 15+. O limite de 6 h de `dataSync` só afeta apps com `targetSdk` 35+; APK distribuído fora da Play pode usar `targetSdk` menor. Revisitar no futuro.
4. **Repositório público** é aceitável (sem dados reais, sessões ou tokens).
5. **Sorteios/prêmios:** assunto da administração; o sistema só registra elegibilidade e resultado.
6. **Membro Estrela:** ≥ 50/100 pontos = elegível ao sorteio; sorteio realmente aleatório (seed registrada). **Novo:** quem venceu o mês anterior não pode vencer o mês seguinte. Desempate decidido pelos ADMs na hora (a ordem Atividade > Rising > Fair Play > Partidas com membros serve de sugestão).
7. **Gamificação/XP vem do MLBB** (pontos do clã dentro do jogo). Depende de existir fonte de dados — ver riscos.
8. **IA e a API de banco própria** continuam fora de escopo.

## Consequências / pontos em aberto
- **Controller sem login = qualquer pessoa com o APK controla o bot.** Proposta mínima: pareamento por **chave secreta** gerada no Host (QR/código) que o Controller guarda no aparelho; revogável pelo Host; ações destrutivas pedem confirmação. Sem contas, sem RBAC. **Proposta / Pendente** — confirmar com a liderança.
- **Pontos do clã no MLBB:** não há evidência de API que exponha pontos de clã. Plano: spike no provedor; fallback = ADM lança pontos manualmente (com ledger) ou a partir de prints. Não prometer automação.
- Se o Controller não tem conta, o canal Controller↔Host pode ser simplificado (ver SYNC_STRATEGY; Supabase pode ser desnecessário se usarmos relay simples). Decidir após PoC.

## Atualização (2026-10-28, segunda rodada)
- **Login:** a liderança escolheu **login simples** no Controller (substitui a ideia de "sem login"). Desenho mínimo proposto: uma senha de administração definida no Host e verificada por ele; sem contas individuais nem papéis por enquanto. **Proposta / Pendente** os detalhes.
- **Pontos do clã do MLBB:** removidos do escopo inicial. Nenhuma pontuação de clã automática; se necessário, lançamento manual pelos ADMs no futuro.
- **Repositório:** público, aprovado para publicação.
- **iOS sem pagar US$ 99/ano:** o Host é só Android. Para o Controller no iPhone as opções sem taxa são: (a) versão **web/PWA** instalável pela tela inicial do Safari; (b) sideload com Apple ID gratuito (app expira a cada 7 dias, exige reinstalar via AltStore/Sideloadly). Distribuição estável e via TestFlight exige a conta paga. **Não verificado** nesta sessão: confirmar condições atuais da Apple.
