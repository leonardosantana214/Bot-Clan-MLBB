# Requisitos consolidados

Origem: Master Prompt ORCA. Coluna **Status**: C = confirmado como intenção do projeto; P = proposta/pendente de aprovação.

## Requisitos funcionais

| ID | Requisito | Etapa | Status |
|---|---|---|---|
| RF-01 | Cadastro único (Aero ID) vinculado ao identificador confiável do WhatsApp, não ao nome visível | 1 | C |
| RF-02 | Vínculo ID+Server MLBB, com desvinculação; sem pedir senha/código de autenticação | 1/5 | C |
| RF-03 | Registro de rotas por grupo via identificador estável (GroupRouteRegistry) | 1 | C |
| RF-04 | Registro de entradas/saídas, sem apagar perfil nem presumir saída da comunidade por um evento | 2 | C |
| RF-05 | Contagem de atividade com deduplicação por ID de mensagem; não armazenar conteúdo | 2 | C |
| RF-06 | XP com antiflood, teto diário e ledger auditável; nível determinístico e configurável | 2 | C |
| RF-07 | Rankings por período e por grupo | 2 | C |
| RF-08 | Comandos via registro modular com validação, autorização, rota, limite, auditoria | 1 | C |
| RF-09 | Papéis: Líder, Administrador, Moderador, Membro, Bot Host; autoridade validada no backend | 2 | C |
| RF-10 | Moderação assistida (antiflood, antilink, advertências), sem punição automática indiscriminada | 2 | C |
| RF-11 | Membro Estrela (100 pts) e sorteio de elegíveis como processos separados | 2 | **P** |
| RF-12 | Rising Open: inscrições, escalação, resultados com evidência e validação por ADM; sem pontuar partida duas vezes | 5 | C |
| RF-13 | Campanhas e sorteios verificáveis; 1 entrada por pessoa se essa for a política | 6 | P |
| RF-14 | Relatórios (dia/semana/mês/jogador/grupo/Rising) com exportação CSV/XLSX/PDF/PNG/JSON; admin ≠ público | 4 | C |
| RF-15 | Notificações agregadas, idempotentes, com estados registrado/enfileirado/enviado/confirmado/falha | 3 | C |
| RF-16 | Controller: ações como solicitações; "concluído" só após confirmação do Host | 3 | C |
| RF-17 | Estatísticas MLBB somente quando a fonte permitir; cada dado com fonte, data, intervalo, confiabilidade | 5 | C |
| RF-18 | Mídia (figurinhas, memes) com limites; sem download irrestrito de streaming | 6 | C |
| RF-19 | Modo de manutenção e pausa de respostas automáticas | 1 | C |

## Requisitos não funcionais

| ID | Requisito |
|---|---|
| RNF-01 | TypeScript em todo o código; validação de entrada nas bordas |
| RNF-02 | Domínio sem imports de WhatsApp/RN/provedores |
| RNF-03 | Fuso padrão America/Sao_Paulo; timestamps persistidos em UTC |
| RNF-04 | Segredos fora do Git; sessão WhatsApp não vai ao banco compartilhado |
| RNF-05 | LGPD: minimização, consentimento, retenção, exclusão, desvinculação |
| RNF-06 | Operação offline-first no Host com sincronização idempotente |
| RNF-07 | Funcionar integralmente sem IA/LLM |
| RNF-08 | Sem promessa de 100% de disponibilidade; falhas do Android não mascaradas |
| RNF-09 | Testes automatizados com mocks/fixtures; sem contas reais |
| RNF-10 | Controller acessível, tema escuro, responsivo |

## Conflitos e lacunas identificados

1. **Monólito vs. sync-api:** o prompt pede monólito mas também Supabase como serviço compartilhado. Resolução proposta: o motor é um único processo; Supabase é apenas fila/estado de leitura (ADR-0004).
2. **"Controller sem acessar credenciais" vs. gestão de integrações:** o Controller configura integrações via Host; segredos nunca trafegam ao Controller.
3. **Membro Estrela:** pesos, mínimo de 50 pts e sorteio ligado à elegibilidade não aprovados. Premiação real pode exigir análise jurídica (ver pendências).
4. **Verificação de posse da conta MLBB:** não existe fluxo oficial confirmado; fica como *Não verificado* até pesquisa.
5. **Saída da comunidade:** o bot só vê grupos onde está presente; saída "geral" é inferência, não fato.
6. **Rising:** nenhuma fonte automática confirmada; dados manuais auditados são o padrão.
7. **Aniversário (data parcial):** exige consentimento explícito.
8. **Itens do catálogo** como `/loja`, `/moedas`, `/inventario` implicam economia virtual não definida; adiados.
