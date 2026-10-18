# AegisOmni architecture

## Scope and runtime boundaries

The default deployment is one loopback Express process with in-memory demo state. A browser renders synthetic media and makes actual HTTP requests to that process. A separate runtime-neutral Vega controller can be wired into a supported native SDK. Python Strands/AgentCore is an optional cloud integration entrypoint; the browser does not invoke it.

```text
 Browser                            Local Node 24 process
 +-------------------------+       +----------------------------------+
 | Scenario controls       |------>| POST /api/scenarios/trigger       |
 | Synthetic broadcast    |       | CaretakingRegistry (per app)      |
 | Ring PiP + focus trap    |------>| POST /api/ring/whep (simulation)   |
 | Bee correlation banner  |       | BeeContextService (per app)        |
 | Real protocol inspector|------>| POST /mcp -> MCP SDK               |
 +------------+------------+       |   -> AegisServices.execute         |
              |                    | REST action facade -> same service|
              |                    +----------------------------------+
              v
  interruption media time -> (start, end] annotations -> catch-up

 Native adapter boundary                  Optional cloud boundary
 +----------------------------+           +----------------------------+
 | React.createElement        |           | BedrockAgentCoreApp        |
 | TVFocusGuideView/FocusManager|          | fresh Strands Agent/request|
 | Shaka load/configure       |           | Nova Pro + four tools      |
 | RTCPeerConnection lifecycle|           | explicit live/simulator mode|
 +----------------------------+           +----------------------------+
```

## Scenario/event pipeline

Each of the three scenarios has a stable ID, independent camera ID, user-facing note, observation and follow-up text. Triggering validates the ID and allocates a pending care event. The registry retains at most 100 events and evicts resolved entries first; it rejects new events when all capacity is pending. Returning snapshots prevents caller mutations from changing registry state.

```text
scenario choice -> pending event -> Bee query -> PiP display
                        |
                        +-- acknowledge -> resolved event
                        +-- follow-up -> session-local todo
```

The service has no physical action adapter. Resolution explicitly reports `physicalActionExecuted: false`. Camera observations are simulated prompts for a human check; no inference of identity, package temperature, wandering diagnosis or fall diagnosis is made.

## Transport contracts

The local server uses the installed MCP TypeScript SDK's Streamable HTTP transport with JSON responses and no session ID generator. It supports revision 2025-11-25. Each exchange gets its own MCP server/transport, closed when the HTTP response closes; application workflow state remains in injected services.

Before dispatch, Origin is checked against exact configured values and Host is restricted to loopback names. JSON bodies are bounded. MCP requests require positive-quality Accept entries for both JSON and event-stream, a valid JSON-RPC 2.0 envelope and a supported protocol header. Valid notification methods receive 202 with an empty body; malformed messages are rejected. GET/DELETE `/mcp` return 405 in this transport configuration.

SDK registrations and `/api/mcp/execute-action` dispatch to the same service functions. Validation lives at service boundaries so REST does not bypass tool input checks. The browser inspector records the actual request body and response status/body; Origin is supplied by the browser and displayed from the current origin.

The companion bridge supports modern envelope construction; that does not make this older server SDK a full 2026 implementation. Production deployment additionally needs authentication, account isolation, rate limiting, origin/host configuration and durable storage.

## Ring signaling boundary

The demo validates SDP line structure for one video-only receive-only section and returns a synthetic SDP answer with HTTP 201. It does not create a real peer, allocate a Ring cloud session, perform ICE, or render a camera stream. Its optional legacy request shape defaults ICE state to complete; the browser explicitly supplies complete. Production adapters must independently observe actual ICE completion.

A native integration should install track/ICE handlers before creating an offer, configure transceivers from camera capabilities, set local description, wait for ICE complete, POST the final SDP, apply the answer, retain the session Location, and DELETE it when closing. HTTP signaling success and actual peer connectivity must be tracked separately. The companion bridge implements reusable session-state primitives; this repository retains no nested checkout.

## Bee normalization and streaming

Simulator correlation searches fixture notes and explicitly returns no match when none is found. Sample reminder metadata is labeled as sample data. Created reminders are separate, bounded to 1000 per service instance, and are lost on restart.

Writes require a timezone-aware ISO alarm string or null. Reads use epoch milliseconds or null; creation also returns canonical ISO. Live proxy mode validates actual returned data, applies a three-second request timeout, disallows redirects, and surfaces failures without fixture substitution.

`/v1/stream` is a finite **simulated SSE snapshot** containing utterance, todo-created and conversation-summary events, with an optional type filter. It is not a permanent upstream connection. Production streaming needs the companion incremental parser, reconnect handling, a snapshot reconciliation policy, and user/account isolation. A live proxy cannot be reached from cloud loopback unless separately deployed there.

## Vega focus and playback

```text
idle -> gathering -> connecting -> visible
            |             |           |
            +-------------+--> error  |
            |                         |
            +------ dismiss ----------+--> idle + restored player focus
```

`VegaAppController` exposes snapshots/subscriptions and receives player/focus ports. Native composition is injected through React and Vega components, avoiding unverified SDK dependencies in the cross-platform build. `iceComplete` is required before a successful negotiation becomes visible. A generation counter prevents late async negotiation callbacks from reopening a dismissed overlay.

The focus adapter owns actual native refs. Arrow keys stay in the overlay action set; Escape clears the overlay and restores the prior focus target. The browser simulator explicitly returns to its media-player control. Content loading passes DRM configuration to the Shaka-compatible port, while actual MSE/EME setup and licensed playback remain host work.

Bookmarks use the media player's `currentTime`, not wall-clock time. Paused playback creates a zero-length window. Call `timelineChanged` after a seek, source change or discontinuity; invalidated or backwards intervals are unavailable. Catch-up selects annotations in `(startSeconds, endSeconds]`. The local generator reports whether any annotations exist and never fills gaps with invented sports events.

## Strands and AgentCore

The runtime builds a fresh Strands agent for every invocation, preventing process-global conversation sharing. The model is `us.amazon.nova-pro-v1:0`. Available tools query Bee notes, create explicit reminders, assess supplied camera observations/images and select exact sports annotations.

Simulator tools emit labeled non-persisted results. Live Bee calls preserve error status. Live image assessment uses Bedrock Converse with supported image format validation and a bounded base64 payload. Neither mode authorizes access or makes health diagnoses. Strands can summarize the evidence in its response; the browser demo does not claim that a model was invoked.

`AEGIS_MODE` controls tool behavior, not the model itself. Calling the AgentCore entrypoint requires authorized model access even with simulator tools. IAM, deployed proxy reachability, consent, data retention, observability and cloud load testing are deployment responsibilities.

## Verification and limitations

Vitest checks the real SDK/Express transport, all scenarios, input rejection, service isolation, SSE filtering, timestamps and Vega controller transitions. Python tests stub external dependencies to check tool contracts and per-request construction; they do not validate installed Strands/AgentCore compatibility. Browser QA exercises actual local HTTP and rendered focus behavior.

Both TypeScript workspaces compile under strict checking. Native Vega packaging, real Ring media, authenticated Bee/Alexa integration and AWS deployment remain unverified. See the README for commands, the API map, and commercial launch gates.
