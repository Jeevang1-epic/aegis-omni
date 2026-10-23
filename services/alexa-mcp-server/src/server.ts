import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { Request, Response, NextFunction } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { negotiateRingWhepSession, SCENARIOS } from './ringWhepService.js';
import { BeeTodoInputSchema } from './beeContextService.js';
import { AegisServices, CatchUpSchema } from './workflowService.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ALLOWED_ORIGINS = new Set(['https://alexa.amazon.com', 'http://localhost:3000', 'http://localhost:8080', 'http://127.0.0.1:8080']);
const RpcSchema = z.object({ jsonrpc: z.literal('2.0'), id: z.union([z.string(), z.number().int().finite()]).optional(), method: z.string().min(1), params: z.record(z.unknown()).optional() }).strict();
function authority(value: string | undefined): string | null {
  if (!value || /[\s,/@?#\\]/.test(value)) return null;
  try { const url = new URL(`https://${value}`); return url.host.toLowerCase(); } catch { return null; }
}
export function isAllowedOrigin(origin: string, hosts: readonly string[]): boolean {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const url = new URL(origin);
    if (url.origin !== origin || url.username || url.password || !['http:', 'https:'].includes(url.protocol)) return false;
    return hosts.includes(url.host.toLowerCase()) || (url.protocol === 'https:' && url.hostname.endsWith('.vercel.app'));
  } catch { return false; }
}
export function createAegisMcpServer(services = new AegisServices()): McpServer {
  const server = new McpServer({ name: 'aegis-omni-alexa-mcp', version: '2.0.0' });
  const result = async (name: string, args: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(await services.execute(name, args)) }] });
  server.tool('query_household_care_status', 'Read simulated camera care events and household notes', {}, args => result('query_household_care_status', args));
  server.tool('create_caretaking_followup_todo', 'Create a Bee reminder using ISO-8601 alarm_at', BeeTodoInputSchema.shape, args => result('create_caretaking_followup_todo', args));
  server.tool('generate_live_broadcast_catchup', 'Summarize supplied broadcast annotations within an exact media-time interval', CatchUpSchema.shape, args => result('generate_live_broadcast_catchup', args));
  server.tool('dispatch_perimeter_resolution', 'Acknowledge a simulated care event; no physical access action', {
    eventId: z.string().min(1), actionType: z.enum(['acknowledge', 'announce_voice_directive', 'bookmark_tv_timestamp']),
  }, args => result('dispatch_perimeter_resolution', args));
  return server;
}
export function createExpressApp(services = new AegisServices()) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const host = authority(req.headers.host);
    // Trust proxy authority only inside the Vercel runtime, never on the local listener.
    const forwarded = process.env.VERCEL === '1' && typeof req.headers['x-forwarded-host'] === 'string'
      ? authority(req.headers['x-forwarded-host']) : null;
    const hosts = [host, forwarded].filter((value): value is string => value !== null);
    if (req.headers.origin && !isAllowedOrigin(req.headers.origin, hosts)) { res.status(403).json({ error: 'Forbidden Origin: DNS rebinding protection active' }); return; }
    if (!host || (process.env.VERCEL !== '1' && !['localhost', '127.0.0.1', '[::1]'].includes(req.hostname) && !new URL(`https://${host}`).hostname.endsWith('.vercel.app'))) { res.status(403).json({ error: 'Forbidden Host' }); return; }
    next();
  });
  app.use(express.json({ limit: '256kb' }));
  app.use(express.static(path.resolve(__dirname, '../public')));
  app.get('/health', (_req, res) => res.json({ service: 'aegis-omni-alexa-mcp', transport: 'StreamableHTTP', protocolVersions: ['2025-11-25'], integrations: ['ring-whep', 'bee-proxy', 'vega-os-focus', 'aws-strands'], mode: 'simulator', status: 'ok' }));
  const route = (handler: (req: Request, res: Response) => Promise<unknown> | unknown) => (req: Request, res: Response, next: NextFunction) => { Promise.resolve().then(() => handler(req, res)).catch(next); };
  app.post('/api/ring/whep', route((req, res) => res.status(201).json(negotiateRingWhepSession(req.body))));
  app.post('/api/bee/correlate', route(async (req, res) => res.json(await services.bee.correlate(req.body))));
  app.get(['/api/bee/facts', '/v1/facts'], route(async (_req, res) => res.json({ facts: await services.bee.facts(), source: services.bee.source })));
  app.get(['/api/bee/todos', '/v1/todos'], (_req, res) => res.json({ todos: services.bee.listTodos(), source: services.bee.source }));
  app.post(['/api/bee/todos', '/v1/todos'], route(async (req, res) => res.status(201).json(await services.bee.createTodo(req.body))));
  app.get(['/api/bee/stream', '/v1/stream'], (req, res) => {
    const types = typeof req.query.types === 'string' ? req.query.types.split(',') : [];
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Aegis-Source': 'simulator' });
    for (const event of services.bee.streamEvents()) if (!types.length || types.includes(event.type)) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
    res.end(); // Finite snapshot stream: clients explicitly refresh; never claim live wearable connectivity.
  });
  app.get('/api/scenarios', (_req, res) => res.json({ scenarios: SCENARIOS, source: 'simulator' }));
  app.post('/api/scenarios/trigger', route(async (req, res) => {
    const triggered = services.care.trigger(req.body);
    res.status(201).json({ ...triggered, bee: await services.bee.correlate({ query: triggered.scenario.query }) });
  }));
  app.post('/api/mcp/execute-action', route(async (req, res) => {
    const input = z.object({ name: z.string().min(1), arguments: z.record(z.unknown()).default({}) }).parse(req.body);
    res.json({ result: await services.execute(input.name, input.arguments) });
  }));
  app.post('/mcp', route(async (req, res) => {
    const accepted = (req.headers.accept ?? '').toLowerCase().split(',').filter(part => {
      const quality = part.match(/;\s*q=([^;]+)/); return !quality || (Number(quality[1]) > 0 && Number(quality[1]) <= 1);
    }).map(part => part.split(';')[0].trim());
    if (!accepted.includes('application/json') || !accepted.includes('text/event-stream')) { res.status(406).json({ error: 'Streamable HTTP requires Accept: application/json, text/event-stream' }); return; }
    const parsed = RpcSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid JSON-RPC request' } }); return; }
    if (req.headers['mcp-protocol-version'] && req.headers['mcp-protocol-version'] !== '2025-11-25') { res.status(400).json({ error: 'This SDK endpoint supports 2025-11-25; modern envelopes are available in the companion bridge' }); return; }
    if (parsed.data.id === undefined) {
      if (!parsed.data.method.startsWith('notifications/')) { res.status(400).json({ error: 'Expected notification method' }); return; }
      res.status(202).end(); return;
    }
    const server = createAegisMcpServer(services);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void server.close().catch(() => undefined); });
    await server.connect(transport);
    await transport.handleRequest(req, res, parsed.data);
  }));
  app.all('/mcp', (_req, res) => res.set('Allow', 'POST').status(405).end());
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) { res.end(); return; }
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
  });
  return app;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8080);
  createExpressApp().listen(port, '127.0.0.1', () => console.log(`AegisOmni simulator: http://localhost:${port}`));
}
