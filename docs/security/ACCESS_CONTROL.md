# Controle de acesso — estado atual

Referência: `packages/control-protocol/src/{password,sessions,http-server,server}.ts`, `packages/whatsapp-baileys/src/{run,control-host,compose}.ts` e `apps/controller/src/services/remote.ts` em `main` (`ee951bd`).

## Controller e Host

O Controller está integrado ao protocolo HTTP real. Há **uma senha administrativa**, sem contas individuais nem RBAC. Configure `AEROBOT_ADMIN_PASSWORD` no ambiente privado do Host; use somente o marcador `<sua-senha>` na documentação e substitua por uma senha privada com no mínimo 10 caracteres. O repositório é público: senha, hash e material de sessão ficam fora dele. A senha simples é derivada por scrypt em memória ao iniciar; `AEROBOT_ADMIN_PASSWORD_HASH` permanece como alternativa e tem prioridade.

A API só inicia com `AEROBOT_CONTROL_PORT` e senha/hash. O bind padrão é `127.0.0.1`; `0.0.0.0` exige opção explícita e expõe HTTP sem TLS na LAN. As origens CORS são explícitas, mas CORS não substitui autenticação nem criptografia. Operação remota depende de TLS/túnel confiável.

Há bloqueio progressivo de login, com espera exponencial limitada a 15 minutos (base 30 segundos, limiar de cinco tentativas no throttle). O transporte usa o IP real do peer como chave, sem confiar em um campo enviado pelo cliente. Sessões usam tokens opacos; o servidor guarda seus hashes em memória. Padrões: 12 horas por sessão, até três renovações, máximo absoluto de 48 horas. Reiniciar o Host invalida as sessões. No Controller, token fica em memória; senha não é persistida. O modo demonstração local é um mock separado.

## QR e pareamento

Gerar pareamento e consultar uma resposta que contenha QR exige sessão autenticada e peer em loopback por padrão. O Host verifica o IP da conexão, não Origin ou X-Forwarded-For. A exceção explícita `AEROBOT_CONTROL_TRUST_NETWORK=1` só deve ser usada após configurar TLS/túnel confiável: ela declara confiança e não cria TLS. Sem QR, o estado da conexão continua disponível a uma sessão autenticada.

QR é credencial temporária, mantida em memória e removida/expirada; não deve aparecer em logs, repositório ou capturas compartilhadas. No modo serviço, o terminal não exibe QR. Desconectar exige confirmação; papéis CHAT/ADM são persistidos e só entram em vigor após reinício. Variáveis de ambiente prevalecem sobre os papéis salvos.

## WhatsApp — política v1

A autoridade é **quem consegue escrever no grupo ADM**, não um cargo individual consultado no WhatsApp. A rota definida por `AEROBOT_ADMIN_GROUP` ou pelo papel ADM salvo permite os comandos administrativos; sem ADM configurado, eles ficam bloqueados. CHAT e ADM devem ser distintos. É responsabilidade da liderança revisar quem participa e pode escrever no ADM e aprovar o aceite operacional dessa política (#26).

Membros podem consultar os próprios dados pelos comandos previstos; a administração com senha tem consultas ampliadas no Controller. Exportações são pseudonimizadas, não anônimas. Não há evidência de validação em aparelho real ou WhatsApp real. Consulte [privacidade e riscos](PRIVACY_AND_RETENTION.md).
