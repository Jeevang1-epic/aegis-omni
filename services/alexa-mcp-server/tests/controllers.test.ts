import { describe, it, expect, vi } from 'vitest';
import { VegaAppController, generateCatchUp } from '../../../apps/vega-firetv-client/src/App.js';
import { BeeContextService } from '../src/beeContextService.js';
function setup() {
  let time = 10;
  const player = { currentTime: () => time, load: vi.fn(async () => {}), configure: vi.fn(), pause: vi.fn(), play: vi.fn(async () => {}) };
  const focus = { focus: vi.fn(), trap: vi.fn() };
  return { player, focus, controller: new VegaAppController(player, focus, [{ at: 20, description: 'Three pointer' }]), setTime: (value: number) => { time = value; } };
}
describe('Vega controller contracts', () => {
  it('loads licensed Shaka configuration through the player port', async () => {
    const { player, controller } = setup();
    await controller.load('https://example.test/manifest.mpd', { 'com.widevine.alpha': 'https://license.test' });
    expect(player.configure).toHaveBeenCalledWith({ drm: { servers: { 'com.widevine.alpha': 'https://license.test' } } });
    expect(controller.snapshot().playback).toBe('paused');
    await controller.key('Enter'); expect(player.play).toHaveBeenCalled();
    await controller.key('Enter'); expect(player.pause).toHaveBeenCalled();
  });
  it('traps all arrow directions and restores player focus with exact catch-up', async () => {
    const { controller, focus, setTime } = setup();
    await controller.present('https://example.test/whep', 'Expected parcel', async () => { controller.iceComplete(); });
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] as const) { await controller.key(key); expect(controller.snapshot().focusedElementId).toMatch(/^pip-/); }
    setTime(25.25); await controller.key('Escape');
    expect(controller.snapshot().aiCatchUpSummary).toBe('Three pointer');
    expect(focus.focus).toHaveBeenLastCalledWith('shaka-player-controls');
    expect(focus.trap).toHaveBeenLastCalledWith(false);
  });
  it('ignores late negotiation completions after dismissal', async () => {
    const { controller } = setup();
    let finish!: () => void;
    const pending = controller.present('https://example.test', 'note', () => new Promise<void>(resolve => { finish = resolve; }));
    controller.dismiss(); finish(); await pending;
    expect(controller.snapshot().pipPhase).toBe('idle');
    expect(controller.snapshot().pipOverlayActive).toBe(false);
  });
  it('restores focus on failure and invalidates bookmarks on a seek', async () => {
    const { controller } = setup();
    await controller.present('https://example.test', 'note', async () => { throw new Error('ICE timeout'); });
    expect(controller.snapshot().pipPhase).toBe('error');
    controller.timelineChanged(); controller.dismiss();
    expect(controller.snapshot().aiCatchUpSummary).toContain('unavailable');
    expect(() => controller.iceComplete()).toThrow();
  });
  it('publishes detached snapshots and supports unsubscribe', async () => {
    const { controller } = setup();
    const listener = vi.fn(); const unsubscribe = controller.subscribe(listener);
    controller.tick(); const copy = controller.snapshot(); copy.pipPhase = 'error';
    expect(controller.snapshot().pipPhase).toBe('idle');
    unsubscribe(); controller.tick(); expect(listener).toHaveBeenCalledTimes(1);
  });
  it('handles paused media and rejects invalid catch-up ranges', () => {
    expect(generateCatchUp(10, 10, []).durationSeconds).toBe(0);
    expect(() => generateCatchUp(10, 9, [])).toThrow();
    expect(() => generateCatchUp(NaN, 10, [])).toThrow();
  });
});
describe('Bee proxy boundaries', () => {
  it('preserves live provenance and normalizes only actual proxy response data', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: 7, text: 'Parcel', alarm_at: 1792333800000, completed: false }), { status: 200 }));
    const bee = new BeeContextService({ mode: 'proxy', fetcher });
    const result = await bee.createTodo({ text: 'Parcel', alarm_at: '2026-10-18T14:30:00Z' });
    expect(result.source).toBe('bee-proxy-live'); expect(result.id).toBe('7');
    expect(result.alarmAtIso).toBe('2026-10-18T14:30:00.000Z');
  });
  it('surfaces proxy failure instead of fabricating success', async () => {
    const bee = new BeeContextService({ mode: 'proxy', fetcher: vi.fn(async () => new Response('{}', { status: 503 })) });
    await expect(bee.facts()).rejects.toThrow(/503/);
    expect(bee.listTodos()).toEqual([]);
  });
});
