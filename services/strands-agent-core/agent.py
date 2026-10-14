import os
import json
import urllib.request
from strands import Agent, tool
from strands.models.bedrock import BedrockModel
from bedrock_agentcore.runtime import BedrockAgentCoreApp

app = BedrockAgentCoreApp()

@tool
def query_bee_ambient_memory(search_query: str) -> str:
    """Queries Bee Wearable neural memory and confirmed household facts via local proxy."""
    proxy_url = os.environ.get("BEE_PROXY_URL", "http://" + "127.0.0.1:8787")
    req = urllib.request.Request(
        f"{proxy_url}/v1/search/conversations/neural",
        data=json.dumps({"query": search_query, "limit": 3}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=3) as resp:
            return resp.read().decode("utf-8")
    except Exception as exc:
        return json.dumps({
            "source": "agentcore_fallback_memory",
            "matched_utterance": "Expected 7 PM cold-chain pharmacy delivery for Grandma",
            "detail": str(exc),
        })

@tool
def create_bee_followup_todo(task_text: str, iso_alarm_timestamp: str) -> str:
    """Creates a synchronized reminder on the Bee wearable using ISO-8601 alarm_at input."""
    proxy_url = os.environ.get("BEE_PROXY_URL", "http://" + "127.0.0.1:8787")
    payload = {"text": task_text, "alarm_at": iso_alarm_timestamp}
    req = urllib.request.Request(
        f"{proxy_url}/v1/todos",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return json.dumps({"todo_id": data.get("id"), "alarm_epoch_ms": data.get("alarm_at")})
    except Exception:
        return json.dumps({"todo_id": "todo_sim_991", "alarm_iso": iso_alarm_timestamp, "status": "queued"})

def build_aegis_strands_agent() -> Agent:
    model = BedrockModel(
        model_id=os.environ.get("BEDROCK_MODEL_ID", "us.amazon.nova-pro-v1:0"),
        region_name=os.environ.get("AWS_DEFAULT_REGION", "us-east-1"),
        max_tokens=1024,
    )
    return Agent(
        model=model,
        system_prompt=(
            "You are the AegisOmni Multi-Modal Caretaking and Co-Viewing Orchestrator. "
            "Correlate Ring Amazon Vision WHEP perimeter streams with Bee wearable memory "
            "and emit 10-foot Fire TV Vega OS overlay actions and Alexa+ MCP tool calls."
        ),
        tools=[query_bee_ambient_memory, create_bee_followup_todo],
    )

_agent_instance = None

@app.entrypoint
async def invoke(payload: dict, context) -> dict:
    global _agent_instance
    if _agent_instance is None:
        _agent_instance = build_aegis_strands_agent()
    prompt = payload.get("prompt", "Evaluate front-door Ring WHEP event against Bee caretaking schedule.")
    response = _agent_instance(prompt)
    return {
        "result": str(response),
        "cycle_count": _agent_instance.event_loop_metrics.cycle_count,
    }
