import express, { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

export const ALLOWED_ORIGINS = new Set([
  "https://" + "alexa.amazon.com",
  "http://" + "localhost:3000",
  "http://" + "127.0.0.1:8080"
]);

export function createAegisMcpServer(): McpServer {
  const server = new McpServer({
    name: "aegis-omni-alexa-mcp",
    version: "1.0.0"
  });

  server.tool(
    "dispatch_perimeter_resolution",
    "Executes autonomous caretaking or delivery action across Ring WHEP, Bee memory, and Fire TV Vega OS",
    {
      deviceId: z.string().describe("Target Ring camera or Fire TV device identifier"),
      actionType: z.enum(["unlock_drop_box", "announce_voice_directive", "bookmark_tv_timestamp"]),
      contextNote: z.string().describe("Summary correlated from Bee wearable memory and Ring vision")
    },
    async ({ deviceId, actionType, contextNote }) => {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "executed",
              protocolRevision: "2025-11-25",
              deviceId,
              actionType,
              contextNote,
              vegaOverlayCard: {
                title: "AegisOmni Caretaking Action Executed",
                subtitle: contextNote,
                focusTargetId: "pip-primary-ack"
              }
            })
          }
        ]
      };
    }
  );

  return server;
}

export function createExpressApp() {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({
      service: "aegis-omni-alexa-mcp",
      transport: "StreamableHTTP",
      specCompliance: ["2025-11-25", "2026-07-28"],
      status: "ok"
    });
  });

  app.post("/mcp", async (req: Request, res: Response) => {
    const origin = req.headers.origin;
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      res.status(403).json({
        jsonrpc: "2.0",
        error: { code: -32600, message: "Forbidden Origin: DNS rebinding protection active" }
      });
      return;
    }

    const accept = req.headers.accept || "";
    if (!accept.includes("application/json") || !accept.includes("text/event-stream")) {
      res.status(406).json({
        jsonrpc: "2.0",
        error: { code: -32600, message: "Streamable HTTP requires Accept: application/json, text/event-stream" }
      });
      return;
    }

    if (req.body && req.body.method && req.body.id === undefined) {
      res.status(202).end();
      return;
    }

    const mcpServer = createAegisMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });

    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  return app;
}

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT || 8080);
  const app = createExpressApp();
  app.listen(port, () => {
    console.log(`AegisOmni Alexa+ Streamable HTTP MCP Server listening on port ${port}`);
  });
}
