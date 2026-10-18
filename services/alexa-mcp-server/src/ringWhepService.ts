import { z } from 'zod';
export const CareModeSchema = z.enum(['cold_chain_delivery', 'elder_care', 'accessibility_relay']);
export const SCENARIOS = [
  { id: 'cold_chain_delivery', title: 'Cold-Chain Insulin Delivery', cameraId: 'front-door', query: 'insulin delivery', note: 'Pharmacy parcel expected at the front door; check the cooler indicator.', observation: 'Parcel and cooler visible', actionLabel: 'Confirm delivery check', followup: 'Check pharmacy cooler and record receipt' },
  { id: 'elder_care', title: 'Elder Caretaking Perimeter Check', cameraId: 'garden-path', query: 'garden walk', note: 'Grandma planned a garden walk; offer a check-in if she needs assistance.', observation: 'Person near garden path; wellbeing unverified', actionLabel: 'Acknowledge check-in', followup: 'Contact relative and confirm they are comfortable' },
  { id: 'accessibility_relay', title: 'Accessibility Visual Doorbell Relay', cameraId: 'side-door', query: 'visual doorbell', note: 'Use a visual doorbell notice and an optional spoken relay.', observation: 'Doorbell event at side entrance', actionLabel: 'Acknowledge visual relay', followup: 'Confirm the visual doorbell notice was received' },
] as const;
export const RingWhepSessionRequestSchema = z.object({ deviceId: z.string().trim().min(1).max(100), sdpOffer: z.string().max(100000), caretakingMode: z.enum(['elder_care', 'cold_chain_delivery', 'accessibility_relay', 'perimeter_watch']).default('elder_care'), iceGatheringState: z.literal('complete').default('complete') });
export type RingWhepSessionRequest = z.input<typeof RingWhepSessionRequestSchema>;
export function negotiateRingWhepSession(input: unknown) {
  const parsed = RingWhepSessionRequestSchema.parse(input);
  const lines = parsed.sdpOffer.split(/\r?\n/);
  if (lines[0] !== 'v=0' || !lines.some(line => /^m=video\s/.test(line))) throw new Error('SDP must start with v=0 and contain m=video');
  if (lines.some(line => /^m=audio\s/.test(line))) throw new Error('Video-only profile rejects m=audio');
  if (lines.filter(line => line.startsWith('m=')).length !== 1 || !lines.includes('a=recvonly') || lines.some(line => /^a=(sendrecv|sendonly|inactive)$/.test(line))) throw new Error('One video-only a=recvonly section required');
  return { whepEndpoint: `https://api.amazonvision.com/v1/devices/${encodeURIComponent(parsed.deviceId)}/media/streaming/whep/sessions`, deviceId: parsed.deviceId, caretakingMode: parsed.caretakingMode, sdpValidated: true, source: 'simulator', iceGatheringState: parsed.iceGatheringState,
    simulatedSdpAnswer: 'v=0\r\no=- 492819 2 IN IP4 127.0.0.1\r\ns=AegisSimulator\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=sendonly\r\na=rtpmap:96 H264/90000\r\n' };
}
export interface CareEvent { id: string; scenarioId: string; cameraId: string; observation: string; status: 'pending' | 'resolved'; createdAt: string }
export class CaretakingRegistry {
  private events = new Map<string, CareEvent>();
  private nextId = 1;
  constructor(private now = () => new Date()) {}
  trigger(input: unknown) {
    const { scenarioId } = z.object({ scenarioId: CareModeSchema }).parse(input);
    const scenario = SCENARIOS.find(item => item.id === scenarioId)!;
    if (this.events.size >= 100) {
      const resolved = [...this.events.values()].find(event => event.status === 'resolved');
      if (!resolved) throw new Error('Resolve pending events before creating more');
      this.events.delete(resolved.id);
    }
    const event: CareEvent = { id: `care-${this.nextId++}`, scenarioId, cameraId: scenario.cameraId, observation: scenario.observation, status: 'pending', createdAt: this.now().toISOString() };
    this.events.set(event.id, event);
    return { scenario, event: { ...event }, source: 'simulator' as const };
  }
  get(id: string) { const event = this.events.get(id); if (!event) throw new Error('Unknown caretaking event'); return { ...event }; }
  resolve(id: string) { const event = this.events.get(id); if (!event) throw new Error('Unknown caretaking event'); event.status = 'resolved'; return { ...event }; }
  list() { return [...this.events.values()].map(event => ({ ...event })); }
}
