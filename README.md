# A3RO B4STA — AeroBot Ecosystem

Plataforma modular de gestão da comunidade brasileira de Mobile Legends: Bang Bang **A3RO B4STA**: cadastro, atividade, XP, rankings, Membro Estrela, Rising Open, sorteios, moderação, relatórios e aplicativos móveis.

> **Estado:** Etapa 0 — Discovery & Architecture. Não há código de produção ainda. Tudo o que está marcado como **Proposta / Pendente** depende de aprovação da liderança.

## Componentes planejados

| Componente | Plataforma | Papel |
|---|---|---|
| AeroBot Host | Android | Executa/supervisiona o motor do bot e a sessão WhatsApp |
| AeroBot Controller | Android + iOS | Painel de administração e analytics |
| Bot Engine | TypeScript/Node | Motor de comandos independente de interface |
| Camada de sync | Supabase (proposta) | Fila autenticada Controller ↔ Host |

## Navegação

Comece em [`docs/INDEX.md`](docs/INDEX.md).

## Princípios

1. Provar o risco maior (Host Android) antes de investir em interface.
2. Domínio puro: sem WhatsApp, React Native ou provedores externos importados.
3. Dados reais nunca entram no Git (ver [`docs/security/PRIVACY_AND_RETENTION.md`](docs/security/PRIVACY_AND_RETENTION.md)).
4. Sem IA na v1; sem promessas de disponibilidade de 100%.
5. Regras de negócio pendentes não são decididas por agentes ([`docs/product/APPROVALS_PENDING.md`](docs/product/APPROVALS_PENDING.md)).
