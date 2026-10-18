/** Runtime-neutral controller; native adapters bind FocusManager, TVFocusGuideView and Shaka. */
export type RemoteKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Enter' | 'Escape';
export type PipPhase = 'idle' | 'gathering' | 'connecting' | 'visible' | 'error';
export interface BroadcastEvent { at: number; description: string }
export interface PlayerPort {
  currentTime(): number;
  load(uri: string): Promise<void>;
  configure(config: object): void;
  pause(): void;
  play(): Promise<void>;
}
export interface FocusPort { focus(id: string): void; trap(enabled: boolean): void }
export interface AegisVegaAppState {
  activeStreamTitle: string; playbackTimestampSec: number; playback: 'paused' | 'playing' | 'loading' | 'error';
  pipOverlayActive: boolean; pipPhase: PipPhase; focusedElementId: string;
  ringWhepEndpoint: string | null; beeMemoryNote: string | null; aiCatchUpSummary: string | null;
  interruption: number | null; error: string | null;
}
export function createInitialVegaAppState(): AegisVegaAppState {
  return { activeStreamTitle: 'Live Sports / Fitness', playbackTimestampSec: 0, playback: 'paused',
    pipOverlayActive: false, pipPhase: 'idle', focusedElementId: 'shaka-player-controls',
    ringWhepEndpoint: null, beeMemoryNote: null, aiCatchUpSummary: null, interruption: null, error: null };
}
export function generateCatchUp(start: number, end: number, events: readonly BroadcastEvent[]) {
  if (![start, end].every(Number.isFinite) || start < 0 || end < start) throw new Error('Invalid playback interval');
  const missed = events.filter(event => event.at > start && event.at <= end);
  return { startSeconds: start, endSeconds: end, durationSeconds: end - start,
    summary: missed.length ? missed.map(event => event.description).join(' ') : 'No annotated play in this interval.',
    source: 'annotated-timeline' as const };
}
export class VegaAppController {
  private state = createInitialVegaAppState();
  private listeners = new Set<(state: AegisVegaAppState) => void>();
  private previousFocus = 'shaka-player-controls';
  private generation = 0;
  constructor(private player: PlayerPort, private focus: FocusPort, private events: readonly BroadcastEvent[] = []) {}
  snapshot() { return { ...this.state }; }
  subscribe(listener: (state: AegisVegaAppState) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private publish() { for (const listener of this.listeners) listener(this.snapshot()); }
  async load(uri: string, drmServers: Record<string, string> = {}) {
    if (this.state.pipOverlayActive) this.dismiss();
    this.state.playback = 'loading'; this.publish();
    try { this.player.configure({ drm: { servers: drmServers } }); await this.player.load(uri); this.state.playback = 'paused'; this.state.error = null; }
    catch (error) { this.state.playback = 'error'; this.state.error = String(error); }
    this.publish();
  }
  tick() {
    const time = this.player.currentTime();
    if (!Number.isFinite(time) || time < 0) throw new Error('Invalid player media time');
    this.state.playbackTimestampSec = time; this.publish();
  }
  async present(endpoint: string, note: string, negotiate: () => Promise<void>) {
    this.tick();
    if (!this.state.pipOverlayActive) { this.previousFocus = this.state.focusedElementId; this.state.interruption = this.state.playbackTimestampSec; }
    const generation = ++this.generation;
    Object.assign(this.state, { pipOverlayActive: true, pipPhase: 'gathering', ringWhepEndpoint: endpoint,
      beeMemoryNote: note, focusedElementId: 'pip-resolve', aiCatchUpSummary: null, error: null });
    this.focus.trap(true); this.focus.focus('pip-resolve'); this.publish();
    try { await negotiate(); if (generation === this.generation) this.state.pipPhase = 'visible'; }
    catch (error) { if (generation === this.generation) { this.state.pipPhase = 'error'; this.state.error = String(error); } }
    this.publish();
  }
  iceComplete() { if (this.state.pipPhase !== 'gathering') throw new Error('Unexpected ICE transition'); this.state.pipPhase = 'connecting'; this.publish(); }
  dismiss() {
    if (!this.state.pipOverlayActive) return;
    ++this.generation; this.tick();
    const start = this.state.interruption;
    this.state.aiCatchUpSummary = start !== null && this.state.playbackTimestampSec >= start
      ? generateCatchUp(start, this.state.playbackTimestampSec, this.events).summary : 'Timeline changed; catch-up unavailable.';
    Object.assign(this.state, { pipOverlayActive: false, pipPhase: 'idle', interruption: null, focusedElementId: this.previousFocus });
    this.focus.trap(false); this.focus.focus(this.previousFocus); this.publish();
  }
  timelineChanged() { this.state.interruption = null; }
  async key(key: RemoteKey) {
    if (key === 'Escape') { this.dismiss(); return; }
    if (key === 'Enter') {
      if (this.state.pipOverlayActive) { this.dismiss(); return; }
      if (this.state.playback === 'playing') { this.player.pause(); this.state.playback = 'paused'; }
      else { await this.player.play(); this.state.playback = 'playing'; }
    } else {
      const targets = this.state.pipOverlayActive ? ['pip-resolve', 'pip-dismiss'] : ['shaka-player-controls', 'scenario-controls'];
      const direction = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1;
      const index = targets.indexOf(this.state.focusedElementId);
      this.state.focusedElementId = targets[(index + direction + targets.length) % targets.length];
      this.focus.focus(this.state.focusedElementId);
    }
    this.publish();
  }
}

/** Inject React.createElement and native Vega components from the SDK-enabled application. */
export function App({ state, controller, native }: {
  state: AegisVegaAppState; controller: VegaAppController;
  native: { createElement: (component: unknown, props: object | null, ...children: unknown[]) => unknown;
    View: unknown; Text: unknown; Pressable: unknown; TVFocusGuideView: unknown; VideoSurface: unknown };
}) {
  const h = native.createElement;
  return h(native.View, { accessibilityLabel: 'AegisOmni living room' },
    h(native.VideoSurface, { nativeID: 'shaka-player-controls', focusable: true }),
    h(native.Text, null, state.activeStreamTitle),
    state.pipOverlayActive ? h(native.TVFocusGuideView, { trapFocusUp: true, trapFocusDown: true, trapFocusLeft: true, trapFocusRight: true, autoFocus: true },
      h(native.Text, { accessibilityLiveRegion: 'polite' }, state.beeMemoryNote),
      h(native.Pressable, { nativeID: 'pip-resolve', onPress: () => controller.dismiss() }, h(native.Text, null, 'Resolve & catch up')),
      h(native.Pressable, { nativeID: 'pip-dismiss', onPress: () => controller.dismiss() }, h(native.Text, null, 'Return to broadcast')))
      : h(native.Text, { accessibilityLiveRegion: 'polite' }, state.aiCatchUpSummary));
}
