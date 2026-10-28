# Pesquisa de provedores MLBB

Status: pesquisa inicial (busca web de 2026-10-28). Nada aqui foi testado contra endpoints reais.

## Achados
- **Rone Arena / api-mobilelegends**: API comunitária **não oficial** (docs OpenAPI em `arena.rone.dev/api/docs`; SDK Python `rone-arena`; repositório `ridwaanhall/api-mobilelegends`, último push reportado em abr/2026 por agregador). Grupos: academy, heroes, user, addon. Fonte: [PyPI rone-arena](https://pypi.org/project/rone-arena/), [GitHub](https://github.com/ridwaanhall/api-mobilelegends).
- **MLBBDex**: busca **não retornou** nada confirmável. Tratar como inexistente até localizar fonte.
- Nenhuma API oficial da MOONTON identificada nesta busca.

## A verificar antes de qualquer feature
Autenticação, rate limits, licença/termos, dados de jogador (como obtém? exige login?), histórico de partidas disponível, estabilidade, latência, política sobre scraping.

## Decisão provisória
Interface `MLBBProvider` com capacidades declaradas (`heroes`, `builds`, `playerProfile`, `matchHistory`); cada resposta traz `source`, `collectedAt`, `period`, `reliability`, `completeness`. Etapa 5 só começa depois de um spike que teste os endpoints. Para jogadores: **dados manuais auditados e cadastro ID/Server** são o fallback; sem estatísticas inventadas.
