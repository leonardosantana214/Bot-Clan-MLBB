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

## Resultado do spike de documentação (2026-10-28)
Fonte: README e `HOSTED_API_TERMS.md` do repositório [ridwaanhall/api-mobilelegends](https://github.com/ridwaanhall/api-mobilelegends). **Leitura de documentação apenas — nenhum endpoint foi chamado.**

| Item | Achado |
|---|---|
| Licença do código | BSD-3-Clause; exige crédito à Moonton e ao autor |
| Dados | Heróis e analytics de heróis; esports (MPL ID/PH/MY/KH); academy; endpoints de usuário |
| Histórico de partidas / dados de clã | **Não documentados** |
| Autenticação | Endpoints de usuário exigem **código de verificação enviado à conta do jogo** (expira em 5 min) e JWT |
| Rate limit | Não especificado; pode haver 503 "High traffic" (use cache) |
| Termos do serviço hospedado | Sem garantia/uptime; proibido usar endpoints autenticados em contas que não são suas; proibido tráfego que degrade o serviço; uso comercial exige falar com o mantenedor; atribuição solicitada |
| Estado | Não oficial, sem vínculo com a Moonton |

## Consequências para o projeto
1. **Dados públicos de heróis/meta** (`/heroi`, `/build`, `/counter`, `/meta`): viáveis via essa API, com cache e atribuição.
2. **Estatísticas de jogadores (WR, KDA, histórico):** só seriam possíveis com login do próprio jogador (código de verificação). Isso conflita com a regra de **nunca pedir código de autenticação em grupo** e com a minimização de dados. **Decisão: não implementar estatísticas pessoais automáticas.** Perfil MLBB = ID + Server + nickname informados pelo membro (e conferidos por ADM).
3. Pontos do clã e Rising: sem fonte; continuam manuais (já fora do escopo inicial).
4. Dependência de serviço de terceiros sem SLA: toda chamada atrás de `MLBBProvider`, com cache em disco e degradação elegante.
5. Pergunta de licenciamento (`hello@rone.dev`) só se houver uso comercial; o projeto é comunitário e sem fins lucrativos.

Próximo passo técnico: `MLBBProvider` somente-heróis com fixtures; teste real, se feito, com poucas chamadas e cache.
