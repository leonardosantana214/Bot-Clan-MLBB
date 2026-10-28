# Reconhecimento do ambiente (2026-10-28)

| Item | Resultado |
|---|---|
| Diretório | Vazio; sem repositório (criado nesta sessão com `git init -b main`) |
| SO | Windows 11 Pro |
| git | 2.44.0 (usuário global configurado) |
| Node / npm / pnpm | 22.19.0 / 10.9.0 / 9.12.1 |
| Python | 3.12.8 |
| Java | 24.0.2 |
| Android | `adb` 1.0.41 no SDK; `ANDROID_HOME` aponta para `C:\Path\To\Android\Sdk` (**valor placeholder, incorreto**); nenhum aparelho conectado |
| gh | 2.101.0 (autenticação não verificada) |
| Agentes CLI | `codex` 0.163.0, `gemini`, `opencode` presentes; integração não testada |
| EAS CLI | ausente |
| iOS | Sem macOS: builds iOS exigirão serviço de nuvem (EAS) ou Mac — **a validar** |

Limitações: sem aparelho Android real conectado, nenhuma validação do Host foi possível.

Ação sugerida: corrigir `ANDROID_HOME` para o SDK real em `C:\Users\Usuário\AppData\Local\Android\Sdk`.
