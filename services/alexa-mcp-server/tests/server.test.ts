import { describe, it, expect } from "vitest";
import request from "supertest";
import { createExpressApp } from "../src/server.js";

describe("Alexa+ Streamable HTTP MCP Server (2025-11-25 / 2026-07-28)", () => {
  const app = createExpressApp();
  const alexaOrigin = "https://" + "alexa.amazon.com";
  const badOrigin = "https://" + "malicious.example.com";

  it("reports healthy Streamable HTTP compliance on GET /health", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.transport).toBe("StreamableHTTP");
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
});
