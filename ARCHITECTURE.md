# AegisOmni System Architecture

## 1. Executive Summary
AegisOmni unifies Fire TV (Vega OS / Fire OS), Alexa+ (Streamable HTTP MCP), Ring (Amazon Vision WebRTC WHEP), and Bee (Wearable AI Ambient Context) through an AWS Strands Agents SDK orchestrator running on Amazon Bedrock (us.amazon.nova-pro-v1:0).

## 2. Multi-Device Control Plane
1. Perimeter Sensing (Ring WHEP): Streams live recvonly video over /v1/devices/{deviceId}/media/streaming/whep/sessions.
2. Ambient Personal Context (Bee Proxy): Queries /v1/search/conversations/neural and /v1/todos to correlate perimeter arrivals with expected household deliveries or caretaking schedules.
3. Agentic Orchestration (Alexa+ MCP & AWS Strands): Exposes a compliant Streamable HTTP /mcp server (2025-11-25 and stateless 2026-07-28) with Origin validation, dual Accept verification, and 202 Accepted notification handling.
4. 10-Foot Spatial UI (Fire TV / Vega OS): Renders low-latency PiP overlays inside deterministic TVFocusGuideView focus containers and generates time-shifted AI sports/media catch-up cards.
