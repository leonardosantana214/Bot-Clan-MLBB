# Contribuindo

## Fluxo

- Branch por tarefa a partir de `main`: `feat/<escopo>`, `docs/<tema>`, `fix/<escopo>`.
- Um responsável por módulo; não edite arquivos de outro módulo sem coordenação (ver `docs/roadmap/DELEGATION.md`).
- Mudanças relevantes entram por PR com diff revisado e testes executados.
- Mudanças em regras de negócio exigem aprovação registrada em `docs/product/APPROVALS_PENDING.md`.

## Commits (Conventional Commits)

`tipo(escopo): descrição` — tipos: `feat`, `fix`, `docs`, `chore`, `test`, `refactor`, `ci`.
Exemplos: `docs: define system architecture`, `feat(identity): introduce member domain model`.

## Regras de dados

Nunca commitar números de WhatsApp, IDs reais de membros, sessões, tokens, backups ou logs. Use dados sintéticos.

## Handoff entre agentes

Ao concluir: resumo, arquivos alterados, testes realizados, decisões, riscos, pendências, próximos passos.
