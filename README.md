# AegisOmni

**Autonomous Multi-Modal Living Room, Perimeter & Ambient Memory OS across Fire TV (Vega OS / Fire OS), Alexa+ (Streamable HTTP MCP), Ring (Amazon Vision WebRTC WHEP), and Bee (Wearable AI).**

## 1. What AegisOmni Solves
Smart-home devices operate in isolated silos: perimeter cameras trigger noisy phone alerts while you are watching live sports on Fire TV, and voice assistants lack personal context from your wearable memory. **AegisOmni** unifies all four ecosystems through an **AWS Strands Agents SDK** orchestrator on **Amazon Bedrock (`us.amazon.nova-pro-v1:0`)**:
- **Ring (Amazon Vision WHEP):** Streams live `recvonly` H.264 video into a 10-foot Picture-in-Picture (PiP) overlay on Fire TV.
- **Bee (Wearable AI Proxy):** Correlates front-door arrivals against spoken daily notes (`/v1/search/conversations/neural` & `/v1/todos`).
- **Alexa+ (Streamable HTTP MCP):** Executes multi-service caretaking actions over a `2025-11-25` & `2026-07-28` compliant `/mcp` server.
- **Fire TV (Vega OS):** Locks and restores D-pad spatial focus via `TVFocusGuideView` and generates an **AI Instant Replay Catch-Up** of live broadcast action missed while handling the front door.

## 2. Companion Open-Source SDK (Open Source Mini-Challenge)
- Standalone Package Repository: `react-native-vega-mcp-bridge` (Apache-2.0 License)

## 3. Quick Start & Automated Verification

    npm install
    npm test
    npm run build
    npm run start:mcp

Then open `http://localhost:8080` in your browser to interact with the **10-Foot Fire TV Vega OS, Ring WHEP, Bee Memory & Alexa+ MCP Simulator** using your keyboard arrow keys (D-Pad) or mouse!

## License
Apache-2.0
