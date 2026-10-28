# Catálogo de funcionalidades

| Área | Comandos / recurso | Onde | Estado |
|---|---|---|---|
| Básico | /ping /ajuda /registrar /perfil /xp | grupo comum | implementado, testado com fakes |
| Ranking | /rank /top | grupo comum | implementado |
| MLBB | /heroi /meta /counter | grupo comum | implementado (API não oficial, cache 5 min) |
| Membro Estrela | /estrela /historicoestrela | grupo comum | implementado |
| Membro Estrela ADM | /pontuar /fecharestrela /sortearestrela /aprovarsorteio /desempatar | grupo ADM | implementado; regra "vencedor anterior não repete" aguarda confirmação |
| Moderação assistida | /minhasadvertencias (membro); /advertir /advertencias (ADM) | CHAT / ADM | implementado; sem punição automática |
| Boas-vindas | mensagem no CHAT | CHAT | implementado, desligado por padrão |
| Backup | /backup /statusbackup | grupo ADM | implementado |
| Export | CSV para Power BI/Excel | pacote | implementado (sem comando) |
| Controller | login, visão geral, grupos, ranking | app | só protótipo com dados de demonstração |
