# Scout ? escopo proposto ? liderança

Assumimos acompanhamento de candidatos/jogadores, com dados fornecidos pela liderança. Confirmar esse escopo com AERO. Não consulta nem coleta estatísticas pessoais automaticamente do MLBB. ID e servidor são informados manualmente; não são prova de identidade.

Contrato v1 validado com Zod; portas síncronas MemoryScout e SqliteScout. Tabelas próprias scout_candidates e scout_notes. Notas são anexadas com autor/data; triggers proíbem UPDATE/DELETE. Critérios de avaliação são chaves configuráveis, notas de 0 a 10. Status: observando, convidado, aprovado, recusado. Alterações pelo Controller exigem sessão administrativa e auditoria; aprovação/recusa exige confirmação.
