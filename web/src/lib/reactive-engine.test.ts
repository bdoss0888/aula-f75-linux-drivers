import { describe, it, expect } from 'vitest';
import { ReactiveEngine, DEFAULT_REACTIVE_CONFIG, getKeyByCode, getKeyByIndex } from './reactive-engine';

describe('ReactiveEngine', () => {
  it('maps standard keys to valid coordinates', () => {
    const esc = getKeyByCode('Escape');
    expect(esc).toBeDefined();
    expect(esc?.index).toBe(0);

    const a = getKeyByCode('KeyA');
    expect(a).toBeDefined();
    expect(a?.index).toBe(9);

    const space = getKeyByCode('Space');
    expect(space).toBeDefined();
    expect(space?.index).toBe(35);
  });

  it('renders solid baseline colors when idle', () => {
    const engine = new ReactiveEngine({
      ...DEFAULT_REACTIVE_CONFIG,
      baseColorHex: '#00ff00', // Pure Green
      baseBrightness: 1.0,
    });

    const frame = engine.renderFrame();
    expect(frame.size).toBeGreaterThan(70);

    // Key 'A' (index 9) should be pure green [0, 255, 0]
    const keyA = frame.get(9);
    expect(keyA).toEqual([0, 255, 0]);
  });

  it('blends strike color on keypress', () => {
    const engine = new ReactiveEngine({
      ...DEFAULT_REACTIVE_CONFIG,
      baseColorHex: '#000000',
      baseBrightness: 1.0,
      strikeColorHex: '#ff0000', // Pure Red
      strikeBrightness: 1.0,
      style: 'single_flare',
      decayDurationMs: 500,
    });

    const now = performance.now();
    engine.registerKeypress('KeyA'); // index 9

    const frame = engine.renderFrame(now + 10);
    const keyA = frame.get(9);
    expect(keyA).toBeDefined();
    expect(keyA![0]).toBeGreaterThan(200); // High red value
  });

  it('radiates perimeter splash to neighbor keys', () => {
    const engine = new ReactiveEngine({
      ...DEFAULT_REACTIVE_CONFIG,
      baseColorHex: '#000000',
      strikeColorHex: '#ffffff',
      style: 'perimeter_splash',
      splashRadius: 2.0,
      decayDurationMs: 400,
    });

    const now = performance.now();
    engine.registerKeypress('KeyA'); // index 9

    // Check after 50ms: neighbor key 'S' (index 15) should receive splash energy
    const frame = engine.renderFrame(now + 50);
    const keyS = frame.get(15);
    expect(keyS).toBeDefined();
    expect(keyS![0]).toBeGreaterThan(0);
  });
});
