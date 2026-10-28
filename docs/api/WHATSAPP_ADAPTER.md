# Adaptador WhatsApp

## Opções
| Opção | Prós | Contras | Status |
|---|---|---|---|
| Baileys (não oficial, WhatsApp Web multi-device) | Flexível, TypeScript, grupos | Sem suporte da Meta; risco de banimento; quebras de protocolo | Experimental |
| WhatsApp Business Cloud API (oficial) | Suportada | Modelo de negócio/templates; **não verificado** se suporta grupos comuns/comunidades como o caso exige | Investigar |

Fonte consultada: comparativo de terceiros ([checkleaked](https://whatsapp.checkleaked.cc/blog/best-open-source-whatsapp-libraries)) confirma natureza não oficial e risco de ban. **Licença, versão atual e manutenção do Baileys: não verificadas** — conferir no repositório oficial antes do ADR final.

## Interface (esboço)
```ts
interface WhatsAppAdapter {
  connect(): Promise<void>; disconnect(): Promise<void>;
  onMessage(h: (m: InboundMessage) => void): void;
  onMembershipChange(h: (e: MembershipChange) => void): void;
  onConnectionState(h: (s: ConnectionState) => void): void;
  send(out: OutboundMessage): Promise<SendReceipt>;
  listGroups(): Promise<GroupInfo[]>; // só grupos onde a conta está presente
}
```

## Requisitos
Número dedicado e autorizado (A9) · reconexão com backoff e limite · fila de envio com rate limit · sem envio em massa não solicitado · modo manutenção · logs sem segredos · sessão só no armazenamento local do Host · **sem recursos de evasão de detecção**.

## Testes
Fake adapter em memória para toda a suíte; teste de integração com número de teste apenas manual e autorizado.
