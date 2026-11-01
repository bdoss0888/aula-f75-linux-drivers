/**
 * AULA F75 — High-Performance Reactive Lighting Engine
 *
 * Combines a solid, continuous background backlight with instantaneous,
 * multi-style reactive keypress accent animations (perimeter splashes,
 * ripples, crosshairs, single-key flares, gravity drips).
 */

import keymapData from '../data/f75-keymap.json';
import { hexToRgb } from './protocol';

export type ReactiveStyle = 
  | 'perimeter_splash' 
  | 'single_flare' 
  | 'global_ripple' 
  | 'crosshair' 
  | 'rain_drip' 
  | 'sparkle_burst';

export interface ReactiveConfig {
  baseColorHex: string;       // Background solid color (e.g. #0077b6)
  baseBrightness: number;     // 0.0 - 1.0
  strikeColorHex: string;     // Keypress accent color (e.g. #ff0055)
  strikeBrightness: number;   // 0.0 - 1.0
  rainbowStrike: boolean;     // Cycle strike hue on every keypress
  style: ReactiveStyle;       // Animation effect
  splashRadius: number;       // Radius in key units (1.0 to 4.0)
  decayDurationMs: number;    // Milliseconds to return to base (100 - 1500)
}

export const DEFAULT_REACTIVE_CONFIG: ReactiveConfig = {
  baseColorHex: '#005f73',     // Elegant Deep Ocean Teal
  baseBrightness: 0.8,
  strikeColorHex: '#ee9b00',   // Vibrant Amber Gold
  strikeBrightness: 1.0,
  rainbowStrike: false,
  style: 'perimeter_splash',
  splashRadius: 2.2,
  decayDurationMs: 400,
};

export interface KeyCoordinate {
  index: number;
  name: string;
  label: string;
  x: number;  // Physical X in mm/coords
  y: number;  // Physical Y in mm/coords
  kx: number; // Normalized key column (~38 units per key)
  ky: number; // Normalized key row (~41 units per key)
}

// Build index & code lookup tables from f75-keymap.json
const KEYS_BY_INDEX = new Map<number, KeyCoordinate>();
const KEYS_BY_NAME = new Map<string, KeyCoordinate>();

const KEY_PITCH_X = 38.0;
const KEY_PITCH_Y = 41.0;

for (const k of keymapData.keys) {
  const coord: KeyCoordinate = {
    index: k.index,
    name: k.name,
    label: k.label,
    x: k.x,
    y: k.y,
    kx: k.x / KEY_PITCH_X,
    ky: k.y / KEY_PITCH_Y,
  };
  KEYS_BY_INDEX.set(k.index, coord);
  KEYS_BY_NAME.set(k.name.toLowerCase(), coord);
}

// Map standard browser KeyboardEvent.code to keymap name
const CODE_TO_NAME: Record<string, string> = {
  Escape: 'esc',
  F1: 'f1', F2: 'f2', F3: 'f3', F4: 'f4', F5: 'f5', F6: 'f6',
  F7: 'f7', F8: 'f8', F9: 'f9', F10: 'f10', F11: 'f11', F12: 'f12',
  Backquote: 'grave',
  Digit1: 'd1', Digit2: 'd2', Digit3: 'd3', Digit4: 'd4', Digit5: 'd5',
  Digit6: 'd6', Digit7: 'd7', Digit8: 'd8', Digit9: 'd9', Digit0: 'd0',
  Minus: 'minus', Equal: 'equals', Backspace: 'bksp', Delete: 'del',
  Tab: 'tab',
  KeyQ: 'q', KeyW: 'w', KeyE: 'e', KeyR: 'r', KeyT: 't', KeyY: 'y',
  KeyU: 'u', KeyI: 'i', KeyO: 'o', KeyP: 'p',
  BracketLeft: 'lbracket', BracketRight: 'rbracket', Backslash: 'backslash',
  PageUp: 'pgup', PageDown: 'pgdn', End: 'end',
  CapsLock: 'caps',
  KeyA: 'a', KeyS: 's', KeyD: 'd', KeyF: 'f', KeyG: 'g', KeyH: 'h',
  KeyJ: 'j', KeyK: 'k', KeyL: 'l', Semicolon: 'semicolon', Quote: 'apostrophe', Enter: 'enter',
  ShiftLeft: 'lshift', ShiftRight: 'rshift',
  KeyZ: 'z', KeyX: 'x', KeyC: 'c', KeyV: 'v', KeyB: 'b', KeyN: 'n', KeyM: 'm',
  Comma: 'comma', Period: 'period', Slash: 'slash',
  ControlLeft: 'lctrl', MetaLeft: 'lwin', AltLeft: 'lalt', Space: 'space',
  AltRight: 'ralt', ControlRight: 'lctrl',
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
};

export function getKeyByIndex(index: number): KeyCoordinate | undefined {
  return KEYS_BY_INDEX.get(index);
}

export function getKeyByCode(code: string): KeyCoordinate | undefined {
  const name = CODE_TO_NAME[code];
  return name ? KEYS_BY_NAME.get(name) : undefined;
}

export interface ActiveStrike {
  key: KeyCoordinate;
  timestamp: number;
  strikeRgb: [number, number, number];
}

function hsvToRgb(h: number, s = 1.0, v = 1.0): [number, number, number] {
  h = ((h % 1.0) + 1.0) % 1.0;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  let r = 0, g = 0, b = 0;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export class ReactiveEngine {
  private config: ReactiveConfig;
  private strikes: ActiveStrike[] = [];
  private rainbowCounter = 0;

  constructor(config: ReactiveConfig = DEFAULT_REACTIVE_CONFIG) {
    this.config = { ...config };
  }

  public updateConfig(newConfig: Partial<ReactiveConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): ReactiveConfig {
    return { ...this.config };
  }

  public registerKeypress(code: string): KeyCoordinate | null {
    const key = getKeyByCode(code);
    if (!key) return null;

    let strikeColor: [number, number, number];
    if (this.config.rainbowStrike) {
      strikeColor = hsvToRgb(this.rainbowCounter * 0.11, 1.0, 1.0);
      this.rainbowCounter = (this.rainbowCounter + 1) % 100;
    } else {
      strikeColor = hexToRgb(this.config.strikeColorHex);
    }

    this.strikes.push({
      key,
      timestamp: performance.now(),
      strikeRgb: strikeColor,
    });

    // Keep max 20 concurrent strikes to bound memory and CPU
    if (this.strikes.length > 20) {
      this.strikes.shift();
    }

    return key;
  }

  public registerStrikeByIndex(index: number): KeyCoordinate | null {
    const key = getKeyByIndex(index);
    if (!key) return null;

    let strikeColor: [number, number, number];
    if (this.config.rainbowStrike) {
      strikeColor = hsvToRgb(this.rainbowCounter * 0.11, 1.0, 1.0);
      this.rainbowCounter = (this.rainbowCounter + 1) % 100;
    } else {
      strikeColor = hexToRgb(this.config.strikeColorHex);
    }

    this.strikes.push({
      key,
      timestamp: performance.now(),
      strikeRgb: strikeColor,
    });

    if (this.strikes.length > 20) {
      this.strikes.shift();
    }

    return key;
  }

  /**
   * Generates a complete 122-LED RGB map for the current frame.
   */
  public renderFrame(now: number = performance.now()): Map<number, [number, number, number]> {
    const frame = new Map<number, [number, number, number]>();

    // Parse base color & scale with base brightness
    const [rawBaseR, rawBaseG, rawBaseB] = hexToRgb(this.config.baseColorHex);
    const baseR = Math.round(rawBaseR * this.config.baseBrightness);
    const baseG = Math.round(rawBaseG * this.config.baseBrightness);
    const baseB = Math.round(rawBaseB * this.config.baseBrightness);

    // Filter out expired strikes
    const duration = Math.max(50, this.config.decayDurationMs);
    this.strikes = this.strikes.filter(s => now - s.timestamp <= duration);

    // For every key on the board, compute blend
    for (const [idx, coord] of KEYS_BY_INDEX) {
      let finalR = baseR;
      let finalG = baseG;
      let finalB = baseB;

      for (const strike of this.strikes) {
        const elapsed = now - strike.timestamp;
        const progress = Math.min(1.0, Math.max(0.0, elapsed / duration)); // 0.0 -> 1.0
        const fade = Math.pow(1.0 - progress, 1.5); // Smooth organic decay

        const dx = coord.kx - strike.key.kx;
        const dy = coord.ky - strike.key.ky;
        const dist = Math.sqrt(dx * dx + dy * dy);

        let intensity = 0;

        switch (this.config.style) {
          case 'single_flare': {
            if (strike.key.index === idx) {
              intensity = fade;
            }
            break;
          }

          case 'perimeter_splash': {
            // Expands ring from 0 to (splashRadius + 0.5) over duration
            const currentRadius = progress * (this.config.splashRadius + 0.5);
            const distFromWave = Math.abs(dist - currentRadius);
            
            // Struck key itself stays strongly lit early on
            if (dist < 0.5) {
              intensity = fade;
            } else if (dist <= this.config.splashRadius + 0.5) {
              // Gaussian splash crest around the perimeter
              const waveFalloff = Math.exp(-Math.pow(distFromWave / 0.75, 2));
              intensity = waveFalloff * fade * 1.2;
            }
            break;
          }

          case 'global_ripple': {
            // Propagates across entire keyboard (up to 16 key units)
            const rippleSpeed = 14.0; // key units per second
            const currentRadius = (elapsed / 1000.0) * rippleSpeed;
            const distFromWave = Math.abs(dist - currentRadius);
            const waveFalloff = Math.exp(-Math.pow(distFromWave / 0.85, 2));
            intensity = waveFalloff * fade;
            break;
          }

          case 'crosshair': {
            // Beams along row and column
            const onRow = Math.abs(dy) < 0.5;
            const onCol = Math.abs(dx) < 0.6;
            if (onRow || onCol) {
              const beamDist = onRow ? Math.abs(dx) : Math.abs(dy);
              const beamReach = progress * (this.config.splashRadius * 2.5);
              if (beamDist <= beamReach + 0.8) {
                intensity = fade * (1.0 - Math.min(1.0, beamDist / 8.0));
              }
            }
            break;
          }

          case 'rain_drip': {
            // Falls downward towards higher ky
            if (Math.abs(dx) < 0.6 && dy >= -0.2) {
              const currentY = strike.key.ky + progress * 5.0;
              const yDist = Math.abs(coord.ky - currentY);
              if (yDist < 0.7) {
                intensity = fade * (1.0 - yDist / 0.7);
              }
            }
            break;
          }

          case 'sparkle_burst': {
            if (strike.key.index === idx) {
              intensity = fade;
            } else if (dist <= this.config.splashRadius + 1.0) {
              // Pseudo-random twinkle hash based on key index & time slice
              const timeSlice = Math.floor(now / 70);
              const hash = (idx * 31 + strike.key.index * 17 + timeSlice * 13) % 100;
              if (hash < 35) {
                intensity = fade * 0.9;
              }
            }
            break;
          }
        }

        // Apply strike brightness scaling
        intensity = Math.min(1.0, Math.max(0.0, intensity * this.config.strikeBrightness));

        if (intensity > 0.001) {
          const [sR, sG, sB] = strike.strikeRgb;
          // Smooth color blend: base -> strike
          finalR = Math.min(255, Math.round(finalR * (1 - intensity) + sR * intensity));
          finalG = Math.min(255, Math.round(finalG * (1 - intensity) + sG * intensity));
          finalB = Math.min(255, Math.round(finalB * (1 - intensity) + sB * intensity));
        }
      }

      frame.set(idx, [finalR, finalG, finalB]);
    }

    return frame;
  }
}
