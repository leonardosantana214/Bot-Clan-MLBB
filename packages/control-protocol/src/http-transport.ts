import type { ControlTransport } from './transport.js';

export class ControlTransportError extends Error {
  constructor(readonly code: 'timeout' | 'network' | 'http' | 'invalid_json', readonly status?: number) {
    super('Falha de transporte do Controller.'); this.name = 'ControlTransportError';
  }
}

/** Browser-safe: never imports the Node server entry point. */
export class HttpTransport implements ControlTransport {
  private readonly url: string;
  constructor(address: string, private readonly timeoutMs = 10_000) {
    const url = new URL(address);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error('Endereço do Host inválido.');
    this.url = `${url.origin}/control`;
  }
  async send(message: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(message), signal: controller.signal, credentials: 'omit', redirect: 'error', cache: 'no-store' });
      if (!response.ok) throw new ControlTransportError('http', response.status);
      try { return await response.json() as unknown; } catch { throw new ControlTransportError(controller.signal.aborted ? 'timeout' : 'invalid_json'); }
    } catch (error) {
      if (error instanceof ControlTransportError) throw error;
      throw new ControlTransportError(controller.signal.aborted ? 'timeout' : 'network');
    } finally { clearTimeout(timer); }
  }
}
