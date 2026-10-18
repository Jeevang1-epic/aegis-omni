import { describe, it, expect } from "vitest";
import request from "supertest";
import { createExpressApp } from "../src/server.js";

describe("AegisOmni Multi-Device Control Plane (Alexa+ MCP, Ring WHEP, Bee Proxy, Vega Simulator)", () => {
  const app = createExpressApp();
  const alexaOrigin = "https://" + "alexa.amazon.com";
  const badOrigin = "https://" + "malicious.example.com";

  it("serves the interactive 10-foot Fire TV Vega OS and Alexa+ simulator UI on GET /", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("FIRE TV VEGA OS");
    expect(res.text).toContain("TVFocusGuideView");
  });

  it("reports healthy Streamable HTTP and multi-device integrations on GET /health", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.transport).toBe("StreamableHTTP");
    expect(res.body.integrations).toContain("ring-whep");
  });

  it("blocks unauthorized Origin headers to prevent DNS rebinding", async () => {
    const res = await request(app)
      .post("/mcp")
      .set("Origin", badOrigin)
      .set("Accept", "application/json, text/event-stream")
      .send({ jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(res.status).toBe(403);
  });

  it("enforces dual Accept header (application/json and text/event-stream)", async () => {
    const res = await request(app)
      .post("/mcp")
      .set("Origin", alexaOrigin)
      .set("Accept", "application/json")
      .send({ jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(res.status).toBe(406);
  });

  it("returns 202 Accepted with empty body on JSON-RPC notifications", async () => {
    const res = await request(app)
      .post("/mcp")
      .set("Origin", alexaOrigin)
      .set("Accept", "application/json, text/event-stream")
      .send({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(res.status).toBe(202);
    expect(res.text).toBe("");
  });

  it("negotiates valid video-only recvonly Ring WHEP session on POST /api/ring/whep", async () => {
    const validSdp = "v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=recvonly\r\n";
    const res = await request(app)
      .post("/api/ring/whep")
      .send({ deviceId: "ring-front-door-01", sdpOffer: validSdp, caretakingMode: "cold_chain_delivery" });
    expect(res.status).toBe(201);
    expect(res.body.sdpValidated).toBe(true);
    expect(res.body.whepEndpoint).toContain("/v1/devices/ring-front-door-01/media/streaming/whep/sessions");
  });

  it("rejects Ring WHEP SDP offers that include unsupported m=audio transceivers", async () => {
    const invalidSdp = "v=0\r\nm=video 9\r\nm=audio 9\r\na=recvonly\r\n";
    const res = await request(app)
      .post("/api/ring/whep")
      .send({ deviceId: "ring-front-door-01", sdpOffer: invalidSdp });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/m=audio/);
  });

  it("correlates Bee wearable memory and normalizes alarm_at timestamps on POST /api/bee/correlate", async () => {
    const res = await request(app)
      .post("/api/bee/correlate")
      .send({ query: "insulin delivery", limit: 3 });
    expect(res.status).toBe(200);
    expect(res.body.todoItem.alarmAtIso).toBe("2026-10-14T13:30:00.000Z");
    expect(res.body.todoItem.alarmAtEpochMs).toBe(1791984600000);
  });
});

const validOffer = 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=recvonly\r\n';
function mcp(app: ReturnType<typeof createExpressApp>, body: object) {
  return request(app).post('/mcp').set('Origin', 'https://alexa.amazon.com')
    .set('Accept', 'application/json, text/event-stream').set('MCP-Protocol-Version', '2025-11-25').send(body);
}

describe('MCP transport contracts', () => {
  it('initializes with the supported protocol and returns real SDK tools', async () => {
    const app = createExpressApp();
    const initialized = await mcp(app, { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } } });
    expect(initialized.status).toBe(200);
    expect(initialized.body.result.protocolVersion).toBe('2025-11-25');
    const listed = await mcp(app, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(listed.body.result.tools.map((tool: { name: string }) => tool.name)).toEqual(expect.arrayContaining(['query_household_care_status', 'create_caretaking_followup_todo', 'generate_live_broadcast_catchup', 'dispatch_perimeter_resolution']));
  });
  it('executes a JSON-RPC reminder tool and shares state with REST', async () => {
    const app = createExpressApp();
    const result = await mcp(app, { jsonrpc: '2.0', id: 'todo', method: 'tools/call', params: { name: 'create_caretaking_followup_todo', arguments: { text: 'Check parcel', alarm_at: '2026-10-18T20:00:00+05:30' } } });
    expect(result.status).toBe(200);
    const todo = JSON.parse(result.body.result.content[0].text);
    expect(todo.alarmAtIso).toBe('2026-10-18T14:30:00.000Z');
    expect(typeof todo.alarm_at).toBe('number');
    const listed = await request(app).get('/v1/todos');
    expect(listed.body.todos[0].id).toBe(todo.id);
  });
  it.each([
    { jsonrpc: '1.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: null, method: 'tools/list' },
    { jsonrpc: '2.0', method: 'tools/call' },
    [{ jsonrpc: '2.0', id: 1, method: 'tools/list' }],
  ])('rejects malformed RPC instead of accepting it as a notification', async body => {
    expect((await mcp(createExpressApp(), body)).status).toBe(400);
  });
  it('rejects hostile Host even without Origin', async () => {
    const result = await request(createExpressApp()).get('/health').set('Host', 'evil.example');
    expect(result.status).toBe(403);
  });
  it('rejects q=0 accept values and unsupported protocol claims', async () => {
    const app = createExpressApp();
    const invalidAccept = await request(app).post('/mcp').set('Accept', 'application/json, text/event-stream;q=0').send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(invalidAccept.status).toBe(406);
    const modern = await mcp(app, { jsonrpc: '2.0', id: 1, method: 'tools/list' }).set('MCP-Protocol-Version', '2026-07-28');
    expect(modern.status).toBe(400);
  });
  it('returns MCP tool errors for unknown tools and bad arguments', async () => {
    const app = createExpressApp();
    const unknown = await mcp(app, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'nonexistent', arguments: {} } });
    expect(unknown.body.result?.isError ?? Boolean(unknown.body.error)).toBe(true);
    const invalid = await mcp(app, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'create_caretaking_followup_todo', arguments: { text: 'test', alarm_at: 123 } } });
    expect(invalid.body.result?.isError ?? Boolean(invalid.body.error)).toBe(true);
  });
  it('does not expose a fake GET MCP stream or leak errors on malformed JSON', async () => {
    expect((await request(createExpressApp()).get('/mcp')).status).toBe(405);
    const malformed = await request(createExpressApp()).post('/api/scenarios/trigger').set('Content-Type', 'application/json').send('{bad');
    expect(malformed.status).toBe(400);
  });
});

describe('Multi-device workflows', () => {
  it('lists all three camera scenarios and reports all integrations honestly', async () => {
    const app = createExpressApp();
    const result = await request(app).get('/api/scenarios');
    expect(result.body.scenarios).toHaveLength(3);
    expect(new Set(result.body.scenarios.map((scenario: { cameraId: string }) => scenario.cameraId)).size).toBe(3);
    const health = await request(app).get('/health');
    expect(health.body.integrations).toEqual(['ring-whep', 'bee-proxy', 'vega-os-focus', 'aws-strands']);
    expect(health.body.mode).toBe('simulator');
  });
  it.each(['cold_chain_delivery', 'elder_care', 'accessibility_relay'])('completes %s via shared MCP and REST services', async scenarioId => {
    const app = createExpressApp();
    const triggered = await request(app).post('/api/scenarios/trigger').send({ scenarioId });
    expect(triggered.status).toBe(201);
    expect(triggered.body.bee.source).toBe('bee-deterministic-sandbox');
    expect(triggered.body.bee.matches.length).toBeGreaterThan(0);
    const connected = await request(app).post('/api/ring/whep').send({ deviceId: triggered.body.event.cameraId, sdpOffer: validOffer, caretakingMode: scenarioId, iceGatheringState: 'complete' });
    expect(connected.status).toBe(201);
    expect(connected.body.source).toBe('simulator');
    const resolved = await request(app).post('/api/mcp/execute-action').send({ name: 'dispatch_perimeter_resolution', arguments: { eventId: triggered.body.event.id, actionType: 'acknowledge' } });
    expect(resolved.body.result.event.status).toBe('resolved');
    expect(resolved.body.result.physicalActionExecuted).toBe(false);
    const status = await mcp(app, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'query_household_care_status', arguments: {} } });
    expect(JSON.parse(status.body.result.content[0].text).events[0].status).toBe('resolved');
  });
  it('rejects invalid scenarios, actions and unknown event IDs', async () => {
    const app = createExpressApp();
    expect((await request(app).post('/api/scenarios/trigger').send({ scenarioId: 'intruder' })).status).toBe(400);
    expect((await request(app).post('/api/mcp/execute-action').send({ name: 'unlock_door' })).status).toBe(400);
    expect((await request(app).post('/api/mcp/execute-action').send({ name: 'dispatch_perimeter_resolution', arguments: { eventId: 'unknown', actionType: 'acknowledge' } })).status).toBe(400);
  });
  it('isolates app instances and supports independent camera events', async () => {
    const app = createExpressApp();
    await request(app).post('/api/scenarios/trigger').send({ scenarioId: 'elder_care' });
    await request(app).post('/api/scenarios/trigger').send({ scenarioId: 'cold_chain_delivery' });
    const status = await request(app).post('/api/mcp/execute-action').send({ name: 'query_household_care_status' });
    expect(status.body.result.events).toHaveLength(2);
    const fresh = await request(createExpressApp()).post('/api/mcp/execute-action').send({ name: 'query_household_care_status' });
    expect(fresh.body.result.events).toEqual([]);
  });
  it('rejects incomplete ICE, SDP substring spoofing and conflicting directions', async () => {
    const app = createExpressApp();
    for (const body of [{ deviceId: 'x', sdpOffer: validOffer, iceGatheringState: 'gathering' }, { deviceId: 'x', sdpOffer: 'v=0\r\ns=m=video a=recvonly\r\n' }, { deviceId: 'x', sdpOffer: validOffer + 'a=sendrecv\r\n' }]) {
      expect((await request(app).post('/api/ring/whep').send(body)).status).toBe(400);
    }
  });
  it('returns normalized nullable todos and filtered finite SSE snapshots', async () => {
    const app = createExpressApp();
    const todo = await request(app).post('/v1/todos').send({ text: 'Visual check-in', alarm_at: null });
    expect(todo.status).toBe(201); expect(todo.body.alarm_at).toBeNull();
    const stream = await request(app).get('/v1/stream?types=todo-created');
    expect(stream.headers['content-type']).toContain('text/event-stream');
    expect(stream.text).toContain('event: todo-created');
    expect(stream.text).toContain('Visual check-in');
    expect(stream.text).not.toContain('event: new-utterance');
    const facts = await request(app).get('/v1/facts');
    expect(facts.body.facts).toHaveLength(3);
  });
  it('rejects bad Bee input without silently matching unrelated notes', async () => {
    const app = createExpressApp();
    for (const alarm of [123, 'tomorrow', '2026-10-18T12:00:00']) expect((await request(app).post('/v1/todos').send({ text: 'Task', alarm_at: alarm })).status).toBe(400);
    expect((await request(app).post('/api/bee/correlate').send({ query: '' })).status).toBe(400);
    const noMatch = await request(app).post('/api/bee/correlate').send({ query: 'astronomy' });
    expect(noMatch.body.matches).toEqual([]);
  });
  it('summarizes only events inside exact fractional playback bounds', async () => {
    const app = createExpressApp();
    const result = await request(app).post('/api/mcp/execute-action').send({ name: 'generate_live_broadcast_catchup', arguments: { startSeconds: 10.5, endSeconds: 30.75, events: [{ at: 10.5, description: 'Already seen' }, { at: 30.75, description: 'Timeout' }, { at: 20, description: 'Three pointer' }, { at: 31, description: 'Future play' }] } });
    expect(result.body.result.durationSeconds).toBe(20.25);
    expect(result.body.result.summary).toBe('Three pointer Timeout');
    expect(result.body.result.modelInvoked).toBe(false);
    const invalid = await request(app).post('/api/mcp/execute-action').send({ name: 'generate_live_broadcast_catchup', arguments: { startSeconds: 5, endSeconds: 1 } });
    expect(invalid.status).toBe(400);
  });
  it('serves the UI script and style with no embedded external runtime', async () => {
    const app = createExpressApp();
    expect((await request(app).get('/simulator.js')).text).toContain("fetch('/mcp'");
    expect((await request(app).get('/styles.css')).text).toContain(':focus-visible');
  });
});
