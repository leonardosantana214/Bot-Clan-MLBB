# Índice da documentação

Legenda de status: **Confirmado** (decisão da liderança) · **Proposta / Pendente** · **Verificado** (checado em fonte externa) · **Não verificado**.

## Produto
- [Requisitos consolidados](requirements/REQUIREMENTS.md)
- [Regras de negócio](product/BUSINESS_RULES.md)
- [Aprovações pendentes](product/APPROVALS_PENDING.md)

## Arquitetura
- [Visão do sistema (C4, eventos)](architecture/SYSTEM_OVERVIEW.md)
- [Fronteiras de módulos e contratos](architecture/MODULE_BOUNDARIES.md)
- [Sincronização Host ↔ Controller](architecture/SYNC_STRATEGY.md)

## Dados
- [Modelo de dados](database/DATA_MODEL.md)

## Integrações
- [Adaptador WhatsApp](api/WHATSAPP_ADAPTER.md)
- [Pesquisa de provedores MLBB](api/MLBB_PROVIDER_RESEARCH.md)

## Segurança
- [Modelo de ameaças](security/THREAT_MODEL.md)
- [Privacidade e retenção](security/PRIVACY_AND_RETENTION.md)

## Mobile
- [Viabilidade do Host Android](mobile/ANDROID_HOST_FEASIBILITY.md)

## Roadmap
- [Marcos e caminho crítico](roadmap/MILESTONES.md)
- [Registro de riscos](roadmap/RISK_REGISTER.md)
- [Pacotes de delegação](roadmap/DELEGATION.md)
- [Reconhecimento do ambiente](roadmap/ENVIRONMENT_AUDIT.md)

## Decisões (ADRs)
- [ADR-0001 Monólito modular hexagonal](decisions/ADR-0001-modular-monolith.md)
- [ADR-0002 Baileys apenas como experimento atrás de adaptador](decisions/ADR-0002-whatsapp-adapter.md)
- [ADR-0003 Host: PoC antes de decidir runtime](decisions/ADR-0003-host-runtime.md)
- [ADR-0004 Sync por outbox via Supabase](decisions/ADR-0004-sync-outbox.md)
- [ADR-0005 XP como ledger append-only](decisions/ADR-0005-xp-ledger.md)
- [ADR-0006 Escopo simplificado (decisão da liderança)](decisions/ADR-0006-simplified-scope.md)

## Operação e produto
- [Runbook](operations/RUNBOOK.md) · [Backup e restauração](operations/BACKUP_AND_RESTORE.md) · [Incidentes](operations/INCIDENT_RESPONSE.md) · [Monitoramento](operations/MONITORING.md) · [Distribuição](operations/DISTRIBUTION.md)
- [Controle de acesso](security/ACCESS_CONTROL.md) · [Catálogo de funcionalidades](product/FEATURE_CATALOG.md) · [PoC-1 Termux](mobile/POC1_TERMUX.md)

Ainda **não** criados por falta de conteúdo real: STAKEHOLDERS, USER_STORIES.
