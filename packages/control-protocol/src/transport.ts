/**
 * Pluggable transport. A real implementation (e.g. Supabase realtime/outbox, HTTPS) must:
 *  - carry JSON-serializable messages end-to-end over TLS (the protocol has no encryption of its own);
 *  - deliver `send(request)` to ControlServer.handle(request) and resolve with its response;
 *  - reject (throw) only on transport failure (timeout, offline); protocol errors arrive as `ok:false` responses;
 *  - never log message bodies (login carries the password, other requests carry the session token).
 */
export interface ControlTransport { send(message: unknown): Promise<unknown> }

/** The server-side entry point a transport adapter calls. */
export interface ControlMessageHandler { handle(message: unknown): Promise<unknown> }

/** Test transport: JSON round-trip (simulates the wire) straight into a handler. */
export class InMemoryTransport implements ControlTransport {
  /** Raw messages seen on the wire, for assertions. */
  readonly wire: string[] = [];
  constructor(private readonly handler: ControlMessageHandler) {}
  async send(message: unknown): Promise<unknown> {
    const raw = JSON.stringify(message);
    this.wire.push(raw);
    const res = await this.handler.handle(JSON.parse(raw) as unknown);
    return JSON.parse(JSON.stringify(res)) as unknown;
  }
}
