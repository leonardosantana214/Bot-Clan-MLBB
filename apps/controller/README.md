# AeroBot Controller (`@aerobot/controller`)

Painel administrativo mobile/web (Expo + React Native + `react-native-web`) para gerenciar o bot de WhatsApp do clã de Mobile Legends (**A3RO B4STA**).

> **Escopo atual:** Somente UI com dados 100% sintéticos (sem chamadas de rede, sem backend conectado e sem números de telefone reais).

## Funcionalidades

- **Login Administrativo (Mock):** Validação local através da interface `AuthProvider` (`src/services/auth.ts`), pronta para receber um provedor real futuramente. Credencial demo padrão: `aeroclan-admin`.
- **Visão Geral & Estado do Host:** Cards de membros, ativos hoje, mensagens e status do Host (`Online`, `Manutenção`, `Offline`), inspeção da fila e botões com modal de confirmação para **Pausar/Retomar respostas** e **Modo Manutenção**.
- **Grupos / Rotas:** Toggles individuais de módulos (`Boas-vindas`, `Sistema de XP`, `Comandos MLBB`, `Anti-Spam`, `Alertas de Scrim`).
- **Ranking de XP:** Leaderboard da temporada com nível, progresso de XP, função no MLBB e elo Mítico.
- **Exportações (Mock CSV) & Configurações:** Geração sintética instantânea de arquivos CSV com pré-visualização e ajustes de prefixo, XP por mensagem e segurança.
- **Simulador de Estados de UI:** Barra superior permite alternar entre `Dados Mock`, `Estado Vazio` e `Estado Erro` em tempo real.

## Como rodar com `pnpm`

Na raiz do monorepo:

```bash
# 1. Instalar dependências do workspace
pnpm install

# 2. Iniciar o servidor de desenvolvimento Expo (Web / Mobile)
pnpm --filter @aerobot/controller web

# Ou iniciar o menu interativo do Expo
pnpm --filter @aerobot/controller start
```

Para verificar a tipagem TypeScript:

```bash
pnpm --filter @aerobot/controller typecheck
```

## Como gerar o PWA (e instalar no iPhone / iOS)

1. Gere o bundle estático para Web/PWA:

```bash
pnpm --filter @aerobot/controller build:web
```

2. Os artefatos estáticos serão gerados em `apps/controller/dist` acompanhados do manifesto (`public/manifest.json`) configurado com `display: "standalone"` e tema escuro (`#090A0F`).
3. Sirva a pasta `dist` em qualquer servidor estático HTTPS (ex.: `npx serve apps/controller/dist` em rede local ou deploy estático).
4. **No iPhone (Safari):**
   - Abra a URL no **Safari**;
   - Toque no botão **Compartilhar** (ícone de quadrado com seta para cima);
   - Selecione **Adicionar à Tela de Início**;
   - O **AeroBot Controller** abrirá em tela cheia como aplicativo standalone.
