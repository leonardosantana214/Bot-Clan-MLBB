import { createServer, type Server } from 'node:http';
import type { ControlMessageHandler } from './transport.js';

export interface HttpControlServerOptions { port: number; host?: '127.0.0.1' | '0.0.0.0'; origins?: readonly string[]; timeoutMs?: number }
export class HttpControlServer {
  private readonly server: Server;
  constructor(handler: ControlMessageHandler, private readonly options: HttpControlServerOptions) {
    const origins = new Set(options.origins ?? []);
    if (origins.has('*') || origins.has('null')) throw new Error('Configure origens explícitas.');
    this.server = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
      res.setHeader('Vary', 'Origin');
      const end = (status: number) => { res.statusCode = status; res.end('{}'); };
      if (req.url !== '/control') { end(404); return; }
      const origin = req.headers.origin;
      if (origin && !origins.has(origin)) { end(403); return; }
      if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
      if (req.method === 'OPTIONS' && origin && req.headers['access-control-request-method'] === 'POST') {
        res.setHeader('Access-Control-Allow-Methods', 'POST'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); end(204); return;
      }
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); end(405); return; }
      if (req.headers['content-type']?.split(';')[0]?.trim() !== 'application/json') { end(415); return; }
      const timer = setTimeout(() => { end(408); req.destroy(); }, options.timeoutMs ?? 10_000);
      res.once('close', () => clearTimeout(timer));
      const chunks: Buffer[] = []; let size = 0;
      req.on('error', () => { if (!res.writableEnded) end(400); });
      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 65536) { chunks.length = 0; if (!res.writableEnded) end(413); }
        else if (!res.writableEnded) chunks.push(chunk);
      });
      req.on('end', () => {
        if (res.writableEnded) return;
        let raw: unknown;
        try { raw = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; } catch { end(400); return; }
        // HTTP peer identity, rather than a rotating client supplied throttle key.
        if (typeof raw === 'object' && raw !== null) raw = { ...raw, origin: req.socket.remoteAddress ?? 'unknown' };
        void handler.handle(raw).then(result => { if (!res.writableEnded) res.end(JSON.stringify(result)); }, () => { if (!res.writableEnded) end(500); });
      });
    });
    this.server.requestTimeout = options.timeoutMs ?? 10_000;
    this.server.headersTimeout = options.timeoutMs ?? 10_000;
  }
  async listen(): Promise<string> {
    const host = this.options.host ?? '127.0.0.1';
    if (host !== '127.0.0.1' && host !== '0.0.0.0') throw new Error('Bind inválido.');
    if (host === '0.0.0.0') process.stderr.write('AVISO: HTTP sem TLS exposto na LAN. Apenas teste em rede confiável; em produção usar TLS/túnel.\n');
    await new Promise<void>((resolve, reject) => { this.server.once('error', reject); this.server.listen(this.options.port, host, () => { this.server.removeListener('error', reject); resolve(); }); });
    const address = this.server.address();
    if (!address || typeof address === 'string') throw new Error('Servidor indisponível.');
    return `http://${host}:${address.port}`;
  }
  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => { this.server.close(error => error ? reject(error) : resolve()); this.server.closeAllConnections(); });
  }
}
