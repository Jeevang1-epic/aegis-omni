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
