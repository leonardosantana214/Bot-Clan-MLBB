# Monitoramento (proposta)

Sem painel externo na v1. Sinais disponíveis hoje: estado de conexão do adapter (stderr), `/ping`, `/statusbackup`, auditoria no SQLite. Durante a PoC-1 medir processo vivo, RAM, bateria e reconexões (ver `docs/mobile/POC1_TERMUX.md`). Alertas ao grupo ADM são agregados para evitar spam.
