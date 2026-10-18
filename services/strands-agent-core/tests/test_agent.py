"""Offline tool contracts: SDK modules are stubs; these tests do not validate cloud integration."""
import importlib.util
import json
import os
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

strands = types.ModuleType('strands')
strands.tool = lambda fn: fn
strands.Agent = MagicMock()
models = types.ModuleType('strands.models.bedrock')
models.BedrockModel = MagicMock()
runtime = types.ModuleType('bedrock_agentcore.runtime')
runtime.BedrockAgentCoreApp = lambda: types.SimpleNamespace(entrypoint=lambda fn: fn)
modules = {'strands': strands, 'strands.models': types.ModuleType('strands.models'),
    'strands.models.bedrock': models, 'bedrock_agentcore': types.ModuleType('bedrock_agentcore'),
    'bedrock_agentcore.runtime': runtime}
spec = importlib.util.spec_from_file_location('aegis_agent', Path(__file__).resolve().parents[1] / 'agent.py')
agent = importlib.util.module_from_spec(spec)
with patch.dict(sys.modules, modules):
    spec.loader.exec_module(agent)


class AgentContracts(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {'AEGIS_MODE': 'simulator'})
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def test_alarm_units_and_provenance(self):
        todo = json.loads(agent.create_bee_followup_todo('Check parcel', '2026-10-18T20:00:00+05:30'))
        self.assertEqual(todo['alarm_at'], 1792333800000)
        self.assertFalse(todo['persisted'])
        self.assertEqual(todo['status'], 'simulated')

    def test_rejects_naive_alarm(self):
        with self.assertRaises(ValueError):
            agent.create_bee_followup_todo('Task', '2026-10-18T20:00:00')

    def test_exact_catchup_window(self):
        result = json.loads(agent.synthesize_firetv_sports_catchup(10.5, 20.75,
            json.dumps([{'at': 10.5, 'description': 'Seen'}, {'at': 20, 'description': 'Goal'}, {'at': 21, 'description': 'Future'}])))
        self.assertEqual(result['duration_seconds'], 10.25)
        self.assertEqual(result['summary'], 'Goal')

    def test_invalid_window(self):
        with self.assertRaises(ValueError):
            agent.synthesize_firetv_sports_catchup(float('nan'), 20, '[]')

    def test_no_invented_camera_verification(self):
        result = json.loads(agent.verify_ring_whep_perimeter_event('front', 'A parcel'))
        self.assertEqual(result['source'], 'simulator')
        self.assertFalse(result['physical_action'])
        self.assertIn('unverified', result['assessment'])

    def test_live_failure_is_not_a_queued_success(self):
        with patch.dict(os.environ, {'AEGIS_MODE': 'live'}), patch.object(agent, 'proxy_request', side_effect=TimeoutError('timeout')):
            result = json.loads(agent.create_bee_followup_todo('Task', '2026-10-18T14:30:00Z'))
        self.assertEqual(result['status'], 'unavailable')
        self.assertFalse(result['persisted'])

    def test_invocations_do_not_share_agent_conversation(self):
        with patch.object(agent, 'build_aegis_strands_agent', side_effect=lambda: lambda prompt: 'Response') as factory:
            agent.invoke({'prompt': 'First household'})
            agent.invoke({'prompt': 'Second household'})
            self.assertEqual(factory.call_count, 2)

    def test_empty_prompt_is_rejected(self):
        with self.assertRaises(ValueError):
            agent.invoke({'prompt': ''})


if __name__ == '__main__':
    unittest.main()
