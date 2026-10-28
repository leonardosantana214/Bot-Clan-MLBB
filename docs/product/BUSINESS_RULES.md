# Regras de negócio

Cada regra tem status. **P** = Proposta / Pendente (ver [APPROVALS_PENDING](APPROVALS_PENDING.md)).

## Identidade
- BR-01: Uma pessoa = um Aero ID; vários identificadores WhatsApp podem apontar para ele (ex.: troca de número), com revisão de ADM.
- BR-02: Estados: pendente, ativo, inativo, saiu, suspenso, excluído. Transições sensíveis exigem confirmação e auditoria.
- BR-03: Evento de saída de um grupo não equivale a saída da comunidade; só registrar "saiu" com evidência em todos os grupos visíveis, e ainda assim com revisão.

## Atividade e XP
- BR-04: Mensagem contabilizada ≠ XP concedido.
- BR-05: XP só via lançamento append-only (ver ADR-0005); saldo é derivado.
- BR-06: Antiflood: intervalo mínimo entre ganhos, teto diário, repetição ignorada, mensagens do bot excluídas, deduplicação por ID. Valores configuráveis (A12).
- BR-07: Nível = função determinística do XP total.

## Membro Estrela (P)
- BR-08: 100 pontos: Atividade 30, Partidas 20, Rising 25, Comunidade 15, Fair Play 10.
- BR-09: Metas publicadas antes do período; lançamentos manuais exigem justificativa e evidência.
- BR-10: Mérito (maior pontuação) e sorteio (entre elegíveis ≥ 50) são resultados distintos.
- BR-11: Fechamento mensal é imutável; correções geram novo lançamento com revisão e contestação registradas.

## Sorteios (P)
- BR-12: Uma entrada por pessoa elegível, sem pesos ocultos.
- BR-13: Seed/procedimento registrado e reproduzível a partir da lista congelada de elegíveis; resultado aprovado por ADM antes da publicação.

## Rising
- BR-14: Uma partida (match_id interno) pontua uma única vez.
- BR-15: Resultado exige evidência e validação por um ADM diferente de quem registrou, quando houver mais de um ADM.

## MLBB
- BR-16: Win rate só sobre partidas verificáveis do período; indicadores cumulativos exigem snapshots e diferença.
- BR-17: Dado sem fonte/data/completude não é exibido como fato.

## Relatórios e privacidade
- BR-18: Relatórios administrativos nunca vão ao grupo CHAT.
- BR-19: Não persistir conteúdo de mensagens para contagem.
