# Friction Log and Product Feedback

Prepared for the Amazon Developer Hackathon. Updated 18 October 2026.

## Evidence and submission integrity

This log separates locally verified behavior, vendor documentation, and user-reported issues that still need reproduction. No device, Kiro, ADBT, or cloud session was available for this implementation. Browser simulator checks and local automated tests are reproducible; they do not establish native-device behavior. A judging bonus is determined by the organizer, not guaranteed by this document.

Record exact SDK/CLI versions, OS, architecture, commands and sanitized errors when reproducing a vendor issue. Never attach tokens or household recordings. Entries 1 and 4 retain the reported symptoms as investigation targets, not confirmed vendor defects.

## 1. ADBT MCP / Node 26 native SQLite binding startup failure

- **Task Attempted:** Start Amazon Devices Builder Tools MCP under Node 26 and expose Vega development tools.
- **Steps Taken:** Reported setup used the ADBT package in an MCP-capable IDE. To reproduce on a disposable development environment: record `node --version`, `npm --version`, OS/architecture and the exact ADBT version; configure the official ADBT MCP launch command in the IDE; capture startup stderr; repeat with the same package version under Node 24. Do not substitute an unverified CLI subcommand.
- **Expected vs. Actual Result:** Expected the tool catalog to load. The supplied report describes a native SQLite3 binding load crash on Node 26. **Not reproduced here:** the available runtime is Node 24.12.0. Native ABI mismatch is a hypothesis until the actual stack trace and binary architecture are collected.
- **Severity Rating:** Critical if reproducible: blocks tool discovery.
- **Workaround Used:** Existing `.nvmrc` pins Node 24; root `engines` and deterministic npm lock now reinforce that baseline. Local npm builds pass. This does not independently prove Node 24 fixes the reported ADBT crash.
- **Actionable Suggestion:** Publish tested Node/OS/architecture combinations, perform an ABI compatibility preflight before loading SQLite, and offer an actionable unsupported-runtime error. Evaluate a portable storage backend against required SQLite features.

## 2. Ring WHEP audio-profile mismatch and late track listener

- **Task Attempted:** Negotiate a receive-only camera stream and display the first incoming track in PiP.
- **Steps Taken:** In the local simulator, POST `/api/ring/whep` with a valid `v=0`, `m=video`, `a=recvonly` offer, then repeat with `m=audio`. On a separately authorized Ring integration, register `ontrack` and ICE listeners **before** `createOffer`, add transceivers supported by that camera, call `setLocalDescription`, wait for ICE complete, and POST the final local SDP. Compare against attaching a track listener after negotiation has begun; record whether an event has already fired.
- **Expected vs. Actual Result:** Simulator returns 201 for its video-only profile and 400 for audio or conflicting direction; integration tests verify this. The supplied report describes endpoint rejection and missed rendering with a late listener. **Live behavior unverified.** Audio availability is device/profile-dependent; the simulator's restriction must not be presented as a universal Ring limitation. A late `ontrack` handler can miss a local event; it is distinct from HTTP SDP rejection.
- **Severity Rating:** Important: stream negotiation or display can fail.
- **Workaround Used:** Local strict video-only recvonly validation; companion bridge gates POST on ICE complete. Production adapter guidance registers listeners before offer generation and retains session Location for DELETE cleanup.
- **Actionable Suggestion:** Provide a capability-driven sample with clear codec/audio constraints, ICE timeout handling, track lifecycle logs and structured SDP rejection details.

## 3. Bee `/v1/todos` alarm serialization asymmetry

- **Task Attempted:** Create a household follow-up and read its reminder time consistently.
- **Steps Taken:** Start the local app; POST `/v1/todos` with `{"text":"Check parcel","alarm_at":"2026-10-18T20:00:00+05:30"}`; inspect `alarm_at` and `alarmAtIso`; list `/v1/todos`. Repeat against an authenticated `bee proxy` in a controlled integration environment to validate the upstream contract.
- **Expected vs. Actual Result:** A consumer expecting an ISO string on both sides will misparse the response. Bee documentation specifies ISO-8601 input and epoch-millisecond output. Local tests reproduce normalization, offsets, null alarms and invalid input rejection; live proxy interoperability has not been exercised here.
- **Severity Rating:** Important: wrong units can schedule a reminder at the wrong time.
- **Workaround Used:** `BeeTodoInputSchema` validates timezone-aware writes; `BeeContextService` normalizes read values and provides canonical `alarmAtIso`. Simulator timestamps are labeled and not presented as real wearable activity.
- **Actionable Suggestion:** Publish distinct generated request/response types with units in field descriptions and a timezone-offset round-trip example. Consider an additional ISO response field without breaking epoch consumers.

## 4. Bee direct HTTPS certificate-chain rejection

- **Task Attempted:** Read `/v1/facts` using Node HTTPS without the CLI proxy.
- **Steps Taken:** On the affected machine, record Node/CLI versions and the **official configured** API host. Attempt an authenticated GET using the normal trusted CA store; capture the sanitized error cause. Compare OS certificate chain/trust configuration and corporate proxy settings. Run `bee login`, then `bee proxy --port 8787`, and compare a loopback request through the documented proxy. Do not disable TLS verification.
- **Expected vs. Actual Result:** Expected a validated TLS handshake. The supplied report names `UNABLE_TO_VERIFY_LEAF_SIGNATURE`; **not reproduced here**. A private CA, incomplete server chain, or local interception are possible causes; no private-CA root cause has been confirmed. The repository does not ship a certificate bypass.
- **Severity Rating:** Critical for an affected live integration.
- **Workaround Used:** Proxy-capable service adapter uses a configured Bee proxy; simulator mode supports offline development. Live failures are surfaced as errors, never relabeled as successful fixture calls.
- **Actionable Suggestion:** Publish certificate-chain diagnostics and supported trust-store configuration. If an additional CA is actually required, distribute and document its provenance and rotation; do not suggest `NODE_TLS_REJECT_UNAUTHORIZED=0`.

## 5. Vega SDK / VVD Windows and WSL host limitation

- **Task Attempted:** Validate a native Vega application on this Windows development host.
- **Steps Taken:** Compare the host with the official Vega Developer Tools system requirements; inspect the schema-1 manifest and build the runtime-neutral TypeScript controller. Run `npm run start:mcp` and verify focus/catch-up in the browser. Native packaging and VVD launch must be repeated on a supported host with the matching SDK.
- **Expected vs. Actual Result:** Windows/WSL native tooling was desired. Official documentation says Windows and WSL are not supported/tested and requires native macOS or Ubuntu. This Windows implementation validates the browser simulator and TypeScript, **not a native VVD binary**. Current docs recommend Apple Silicon macOS or Ubuntu x86_64; do not describe all supported macOS hosts as x86_64.
- **Severity Rating:** Important: blocks native QA on the current host.
- **Workaround Used:** Cross-platform browser control center with real local MCP requests; injected native focus/player ports in `apps/vega-firetv-client`. The requested Vega 2.x loader remains pinned; Vega 4.x requires a runtime migration.
- **Actionable Suggestion:** Offer a hosted VVD test target, documented remote-device workflow, and a Windows-compatible protocol/focus conformance harness.

## Product feedback by tool

| Tool / SDK | What helps this workflow | Concrete product feedback | Evidence status |
| --- | --- | --- | --- |
| Amazon Devices Builder Tools MCP | Centralized device setup and discovery | Runtime preflight, versioned CLI examples, downloadable diagnostics without credentials | Reported issue; not run here |
| Vega OS SDK | Explicit manifest/runtime and TV focus primitives | Publish focus restoration examples for PiP, supported-host matrix and a Vega 2-to-4 packaging checklist | Docs reviewed; adapter built; native untested |
| Alexa+ Streamable HTTP MCP | Typed SDK tool schemas, JSON-RPC and standard HTTP | Add an Origin/Host/Accept validation matrix and transport-version migration examples | Local SDK transport and browser inspector tested; Alexa host untested |
| Ring Amazon Vision WHEP | Standard SDP offer/answer and session lifecycle | Capability-driven audio/video profiles, complete ICE sample, typed cleanup errors | Simulator and bridge tested; live cameras untested |
| Bee CLI & Proxy | Loopback API and recognizable SSE event payloads | Separate write/read timestamp types; reconnect/reconciliation guide; certificate diagnostic checklist | Simulator tested, docs reviewed; live proxy untested |
| AWS Strands Agents SDK | Decorated tools and BedrockModel composition | Reference examples for request-isolated household context, multimodal evidence provenance and failed tool responses | Source compiled; dependency-stub tests; no cloud invocation |
| Amazon Bedrock AgentCore | Explicit runtime entrypoint and deployment boundary | Local contract harness, least-privilege starter policy, model/region readiness checks | Entrypoint implemented; deployment untested |
| Kiro IDE | Potential MCP-driven development workflow | Portable version-pinned MCP configuration diagnostics and clear tool permission previews | Design feedback only; Kiro was not used in this session |

## Prioritized feature requests

| Priority | Request | Acceptance criterion |
| --- | --- | --- |
| Critical | ADBT runtime/native dependency preflight | Unsupported Node/architecture exits with supported alternatives before loading native bindings |
| Critical | Bee TLS diagnostics | Documented chain/trust-store troubleshooting resolves failures without disabling verification |
| Important | Ring capability-aware WHEP helper | Sample negotiates supported profile, waits for ICE, receives tracks and deletes session on teardown |
| Important | Vega remote-device conformance harness | Windows developers can submit focus/playback tests to a supported remote target |
| Important | Bee request/response schema package | Generated types distinguish ISO writes, nullable fields and epoch-ms reads |
| Important | MCP migration matrix | SDK examples clearly separate supported legacy transport from 2026 stateless envelopes |
| Important | AgentCore request-isolation starter | Multi-household tests demonstrate no conversation or tool-state leakage |
| Nice-to-have | Kiro protocol inspection panel | Headers, notification 202s and tool errors can be exported with automatic secret redaction |
| Nice-to-have | Replay annotation interface | SDK sample maps licensed media timestamps to evidence-grounded catch-up summaries |

## Primary references

- [Vega installation and supported hosts](https://developer.amazon.com/docs/vega/0.24/install-vega-sdk)
- [Vega manifest](https://www.developer.amazon.com/docs/vega/0.24/app-manifest)
- [Ring development guide](https://developer.amazon.com/docs/ring/develop.html)
- [Bee API contracts](https://docs.bee.computer/docs/api) and [SSE payloads](https://docs.bee.computer/docs/realtime)
- [Strands with AgentCore](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/using-any-agent-framework.html)
- [Nova multimodal request schema](https://docs.aws.amazon.com/nova/latest/userguide/complete-request-schema.html)
