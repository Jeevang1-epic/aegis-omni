# AegisOmni — Official Hackathon Friction Logs & Product Feedback

## Part 1: Structured Friction Log Entries (+10% Bonus Criteria)

### Entry 1: Amazon Devices Builder Tools MCP Server Node v26 SQLite3 Crash
- **Task Attempted:** Initialize `@amazon-devices/amazon-devices-buildertools-mcp` inside Kiro IDE and VS Code.
- **Steps Taken:** Installed Node.js v26, ran `npx -y @amazon-devices/amazon-devices-buildertools-mcp@latest init-context --force` and `check-status`.
- **Expected vs. Actual Result:** Expected MCP server to register Vega OS tools; actually crashed on startup with native `SQLite3` binding incompatibility on Node v26.
- **Severity Rating:** High (Blocker)
- **Workaround Used:** Pinned repository to Node.js v24 LTS via `.nvmrc` (`echo "24" > .nvmrc`).
- **Actionable Suggestion:** Migrate ADBT local telemetry/cache from native `node-sqlite3` C++ bindings to Node's built-in `node:sqlite` module and add an `engines` pre-flight check.

### Entry 2: Ring (Amazon Vision) WebRTC WHEP Audio Transceiver Rejection
- **Task Attempted:** Negotiate WebRTC WHEP live camera stream against `/v1/devices/{deviceId}/media/streaming/whep/sessions`.
- **Steps Taken:** Created `RTCPeerConnection`, attached both `video` and `audio` transceivers, and POSTed SDP offer.
- **Expected vs. Actual Result:** Expected `201 Created` SDP answer; actual endpoint rejected SDP offers containing `m=audio` or non-`recvonly` media sections.
- **Severity Rating:** Medium (Major)
- **Workaround Used:** Implemented `assertValidRingWhepSdpOffer` and `negotiateRingWhepSession` enforcing video-only `a=recvonly` transceivers before signaling.
- **Actionable Suggestion:** Return structured RFC 7807 Problem Details JSON (`400 Bad Request: Audio transceiver unsupported on Ring WHEP endpoint`) and ship an official `@ring/whep-client` npm package.

### Entry 3: Bee Wearable CLI `/v1/todos` Timestamp Serialization Asymmetry
- **Task Attempted:** Create and read back a caretaking reminder via Bee Proxy `/v1/todos`.
- **Steps Taken:** Issued `POST /v1/todos` with `alarm_at` and parsed the JSON response in TypeScript.
- **Expected vs. Actual Result:** Expected symmetric ISO-8601 strings; actually `POST /v1/todos` requires an ISO-8601 string (`"2026-10-14T13:30:00.000Z"`) while responses return `alarm_at` as epoch milliseconds (`number`).
- **Severity Rating:** Low (Minor)
- **Workaround Used:** Built `BeeTodoWriteSchema` and `BeeTodoResponseSchema` Zod transformers in `react-native-vega-mcp-bridge`.
- **Actionable Suggestion:** Return both `alarm_at` (epoch ms) and `alarm_at_iso` (ISO-8601 string) in `/v1/todos` response objects.

### Entry 4: Bee Direct HTTPS API Private CA Rejection
- **Task Attempted:** Call Bee `/v1/facts` directly from Node.js `fetch()` without running `bee proxy`.
- **Steps Taken:** Sent HTTPS GET request with Bearer token to Bee cloud endpoint.
- **Expected vs. Actual Result:** Expected TLS handshake to succeed; failed with `UNABLE_TO_VERIFY_LEAF_SIGNATURE` due to Bee's private CA.
- **Severity Rating:** Medium (Major)
- **Workaround Used:** Routed traffic through local `bee proxy --port 8787` with automatic fallback in `correlateBeeAmbientMemory`.
- **Actionable Suggestion:** Publish an official `@beeai/sdk` npm client that automatically configures the custom CA certificate bundle.

### Entry 5: Vega Virtual Device (VVD) Windows/WSL2 Host Limitation
- **Task Attempted:** Install and boot Vega Virtual Device natively on Windows 11 / WSL2.
- **Steps Taken:** Inspected Vega SDK installer targets during local setup.
- **Expected vs. Actual Result:** Expected native Windows or WSL2 simulator support; Vega Virtual Device currently requires macOS (Apple Silicon/Intel) or native Ubuntu Linux x86_64.
- **Severity Rating:** Medium (Major)
- **Workaround Used:** Built a cross-platform 10-foot Vega TV & Alexa+ WebRTC Simulator (`http://localhost:8080`) paired with React Native for Vega (`apps/vega-firetv-client`).
- **Actionable Suggestion:** Provide a Dockerized or WSLg-compatible Vega Virtual Device container image for Windows developers.
