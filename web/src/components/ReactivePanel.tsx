'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ReactiveEngine,
  ReactiveConfig,
  DEFAULT_REACTIVE_CONFIG,
  ReactiveStyle,
} from '@/lib/reactive-engine';
import { buildDirectFrame, sendDirectFrame, enableDirectMode, disableDirectMode, buildBlankFrame } from '@/lib/direct-mode';
import { isWirelessDevice, sendWirelessAnimationFrame, sendWirelessIdle } from '@/lib/wireless-mode';

interface ReactivePanelProps {
  device: HIDDevice | null;
  log: (msg: string) => void;
}

interface ThemePreset {
  name: string;
  desc: string;
  base: string;
  strike: string;
  style: ReactiveStyle;
  rainbow?: boolean;
}

const THEME_PRESETS: ThemePreset[] = [
  {
    name: 'Ocean Deep & Amber',
    desc: 'Solid oceanic teal with vivid golden amber splashes',
    base: '#005f73',
    strike: '#ee9b00',
    style: 'perimeter_splash',
  },
  {
    name: 'Cyberpunk Neon',
    desc: 'Deep purple grid with electric cyan laser splashes',
    base: '#240046',
    strike: '#00f5d4',
    style: 'perimeter_splash',
  },
  {
    name: 'Stealth Slate & Hot Coral',
    desc: 'Dark industrial graphite with striking hot pink strike reactions',
    base: '#1a1f29',
    strike: '#ff0055',
    style: 'perimeter_splash',
  },
  {
    name: 'Matrix Core',
    desc: 'Deep forest terminal with radioactive lime pulses',
    base: '#032b12',
    strike: '#39ff14',
    style: 'crosshair',
  },
  {
    name: 'Warm Candlelight',
    desc: 'Subtle amber room glow with gold starlight sparkle',
    base: '#261607',
    strike: '#ffbe0b',
    style: 'sparkle_burst',
  },
  {
    name: 'Obsidian Rainbow',
    desc: 'Solid stealth dark backlight; every keystroke strikes a new rainbow hue',
    base: '#111317',
    strike: '#ffffff',
    style: 'perimeter_splash',
    rainbow: true,
  },
];

export function ReactivePanel({ device, log }: ReactivePanelProps) {
  const [config, setConfig] = useState<ReactiveConfig>(DEFAULT_REACTIVE_CONFIG);
  const [running, setRunning] = useState(false);
  const [lastKeyPressed, setLastKeyPressed] = useState<string | null>(null);
  const [fps] = useState(30);

  const engineRef = useRef<ReactiveEngine>(new ReactiveEngine(DEFAULT_REACTIVE_CONFIG));
  const runningRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  // Synchronize engine config with React state
  useEffect(() => {
    engineRef.current.updateConfig(config);
  }, [config]);

  const stop = useCallback(async () => {
    runningRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setRunning(false);
    log('Reactive Engine stopped.');

    if (device?.opened) {
      try {
        if (isWirelessDevice(device)) {
          await sendWirelessIdle(device);
        } else {
          await sendDirectFrame(device, buildBlankFrame());
          await disableDirectMode(device, log);
        }
      } catch {
        /* best effort */
      }
    }
  }, [device, log]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  const start = useCallback(async () => {
    if (!device?.opened) {
      log('Cannot start: No keyboard connected! Click "Connect keyboard" above.');
      return;
    }

    if (runningRef.current) await stop();

    const useWireless = isWirelessDevice(device);
    log(`Starting Reactive Engine (${useWireless ? '2.4GHz wireless' : 'USB-C Direct Stream'})`);

    if (!useWireless) {
      await enableDirectMode(device, log);
    }

    runningRef.current = true;
    setRunning(true);

    const period = 1000 / fps;
    let lastFrame = 0;

    const loop = async (now: number) => {
      if (!runningRef.current) return;

      const elapsed = now - lastFrame;
      if (elapsed >= period) {
        const frameMap = engineRef.current.renderFrame(now);
        try {
          if (useWireless) {
            await sendWirelessAnimationFrame(device, frameMap);
          } else {
            const frame = buildDirectFrame(frameMap);
            await sendDirectFrame(device, frame);
          }
          lastFrame = performance.now();
        } catch (err) {
          log(`Reactive stream error: ${err instanceof Error ? err.message : String(err)}`);
          await stop();
          return;
        }
      }

      if (runningRef.current) {
        rafRef.current = requestAnimationFrame(loop);
      }
    };

    rafRef.current = requestAnimationFrame(loop);
  }, [device, fps, log, stop]);

  // Global keydown capture while active
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!runningRef.current) return;
      const keyCoord = engineRef.current.registerKeypress(e.code);
      if (keyCoord) {
        setLastKeyPressed(`${keyCoord.label} (${e.code})`);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const applyPreset = (preset: ThemePreset) => {
    setConfig(prev => ({
      ...prev,
      baseColorHex: preset.base,
      strikeColorHex: preset.strike,
      style: preset.style,
      rainbowStrike: !!preset.rainbow,
    }));
  };

  const STYLES: { id: ReactiveStyle; name: string; desc: string; icon: string }[] = [
    {
      id: 'perimeter_splash',
      name: 'Perimeter Splash',
      desc: 'Pressed key + surrounding neighbor radius rings outward smoothly',
      icon: '🌊',
    },
    {
      id: 'single_flare',
      name: 'Single Key Flare',
      desc: 'Instant crisp strike highlight on only the pressed key',
      icon: '⚡',
    },
    {
      id: 'global_ripple',
      name: 'Global Shockwave',
      desc: 'Expanding circular wave propagates across the entire keyboard deck',
      icon: '💥',
    },
    {
      id: 'crosshair',
      name: 'Crosshair Laser',
      desc: 'Dual-axis beams shoot horizontally and vertically from key',
      icon: '🎯',
    },
    {
      id: 'rain_drip',
      name: 'Neon Gravity Drip',
      desc: 'Energy droplet drips downward towards the bottom spacebar row',
      icon: '🌧️',
    },
    {
      id: 'sparkle_burst',
      name: 'Starlight Sparkle',
      desc: 'Surrounding keys twinkle with starry stardust particles',
      icon: '✨',
    },
  ];

  return (
    <div className="w-full max-w-[920px] flex flex-col gap-6">
      {/* Hero Header */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
            <span>⚡ Reactive Studio</span>
            {running && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/80 border border-emerald-800 px-2 py-0.5 rounded-full font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                STREAMING LIVE
              </span>
            )}
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Always-on solid background backlight combined with instantaneous keypress accent reactions & perimeter splashes.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {!running ? (
            <button
              onClick={start}
              disabled={!device?.opened}
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-medium text-sm transition-all shadow-lg shadow-emerald-950 flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              <span>▶</span> Start Reactive Mode
            </button>
          ) : (
            <button
              onClick={stop}
              className="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium text-sm transition-all shadow-lg shadow-rose-950 flex items-center gap-2 cursor-pointer"
            >
              <span>⏹</span> Stop Engine
            </button>
          )}
        </div>
      </div>

      {/* Theme Presets */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">
          1-Click Curated Presets
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
          {THEME_PRESETS.map((p, i) => (
            <button
              key={i}
              onClick={() => applyPreset(p)}
              className="flex items-center gap-3 p-2.5 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-zinc-950/60 hover:bg-zinc-800/50 transition-all text-left cursor-pointer group"
            >
              <div className="flex -space-x-1.5 shrink-0">
                <span
                  className="w-5 h-5 rounded-full border border-zinc-900"
                  style={{ backgroundColor: p.base }}
                  title="Base Backlight"
                />
                <span
                  className="w-5 h-5 rounded-full border border-zinc-900"
                  style={{
                    background: p.rainbow
                      ? 'linear-gradient(45deg, red, yellow, green, cyan, blue, magenta)'
                      : p.strike,
                  }}
                  title="Strike Accent"
                />
              </div>
              <div className="truncate">
                <div className="text-xs font-medium text-zinc-200 group-hover:text-white truncate">
                  {p.name}
                </div>
                <div className="text-[0.65rem] text-zinc-500 truncate">{p.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Color Tuning & Styles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Color Tuning */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Color Harmonies
          </h3>

          {/* Base Color */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-950 border border-zinc-800/80">
            <div>
              <div className="text-xs font-medium text-zinc-200">Solid Base Backlight</div>
              <div className="text-[0.7rem] text-zinc-500">Continuous idle glow</div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={config.baseColorHex}
                onChange={e => setConfig(prev => ({ ...prev, baseColorHex: e.target.value }))}
                className="w-8 h-8 rounded border border-zinc-700 cursor-pointer bg-transparent"
              />
              <span className="font-mono text-xs text-zinc-400 uppercase">{config.baseColorHex}</span>
            </div>
          </div>

          {/* Strike Color */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-950 border border-zinc-800/80">
            <div>
              <div className="text-xs font-medium text-zinc-200">Keypress Strike Accent</div>
              <div className="text-[0.7rem] text-zinc-500">Reaction & perimeter splash</div>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.rainbowStrike}
                  onChange={e => setConfig(prev => ({ ...prev, rainbowStrike: e.target.checked }))}
                  className="rounded border-zinc-700 bg-zinc-800 text-purple-600 focus:ring-0 cursor-pointer"
                />
                Rainbow
              </label>

              {!config.rainbowStrike && (
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={config.strikeColorHex}
                    onChange={e => setConfig(prev => ({ ...prev, strikeColorHex: e.target.value }))}
                    className="w-8 h-8 rounded border border-zinc-700 cursor-pointer bg-transparent"
                  />
                  <span className="font-mono text-xs text-zinc-400 uppercase">{config.strikeColorHex}</span>
                </div>
              )}
            </div>
          </div>

          {/* Brightness Sliders */}
          <div className="flex flex-col gap-3 pt-2">
            <div>
              <div className="flex justify-between text-xs text-zinc-400 mb-1">
                <span>Base Backlight Brightness</span>
                <span className="font-mono">{Math.round(config.baseBrightness * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={config.baseBrightness}
                onChange={e => setConfig(prev => ({ ...prev, baseBrightness: parseFloat(e.target.value) }))}
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs text-zinc-400 mb-1">
                <span>Strike Flash Brightness</span>
                <span className="font-mono">{Math.round(config.strikeBrightness * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="1"
                step="0.05"
                value={config.strikeBrightness}
                onChange={e => setConfig(prev => ({ ...prev, strikeBrightness: parseFloat(e.target.value) }))}
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
            </div>
          </div>
        </div>

        {/* Dynamics & Timing */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Dynamics & Timing
          </h3>

          <div>
            <div className="flex justify-between text-xs text-zinc-400 mb-1">
              <span>Perimeter Splash Radius</span>
              <span className="font-mono">{config.splashRadius.toFixed(1)} keys</span>
            </div>
            <input
              type="range"
              min="1.0"
              max="4.0"
              step="0.2"
              value={config.splashRadius}
              onChange={e => setConfig(prev => ({ ...prev, splashRadius: parseFloat(e.target.value) }))}
              className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
            <div className="flex justify-between text-[0.65rem] text-zinc-500 mt-1">
              <span>Tight (Immediate perimeter)</span>
              <span>Wide (Medium cluster)</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs text-zinc-400 mb-1">
              <span>Decay / Dissolve Duration</span>
              <span className="font-mono">{config.decayDurationMs} ms</span>
            </div>
            <input
              type="range"
              min="150"
              max="1200"
              step="25"
              value={config.decayDurationMs}
              onChange={e => setConfig(prev => ({ ...prev, decayDurationMs: parseInt(e.target.value) }))}
              className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
            <div className="flex justify-between text-[0.65rem] text-zinc-500 mt-1">
              <span>Crisp & Snappy (150ms)</span>
              <span>Lingering Glow (1200ms)</span>
            </div>
          </div>

          {/* Interactive Test Sandbox */}
          <div className="mt-2 pt-3 border-t border-zinc-800 flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-zinc-300">Live Typing Sandbox</span>
              {lastKeyPressed && (
                <span className="font-mono text-[0.65rem] text-cyan-400 bg-cyan-950/60 border border-cyan-800/80 px-1.5 py-0.5 rounded">
                  {lastKeyPressed}
                </span>
              )}
            </div>
            <input
              type="text"
              placeholder={running ? "Type here to watch the keyboard light up live..." : "Start reactive mode first, then type here..."}
              disabled={!running}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 disabled:opacity-50"
            />
            <span className="text-[0.65rem] text-zinc-500">
              *While Reactive Mode is running, any key pressed anywhere on the keyboard triggers live splash physics!
            </span>
          </div>
        </div>
      </div>

      {/* Effect Styles Grid */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">
          Strike Animation Style
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {STYLES.map(s => {
            const isSelected = config.style === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setConfig(prev => ({ ...prev, style: s.id }))}
                className={[
                  'flex items-start gap-3 p-3 rounded-lg border text-left transition-all cursor-pointer',
                  isSelected
                    ? 'bg-zinc-800/90 border-zinc-500 shadow-md ring-1 ring-zinc-500/30'
                    : 'bg-zinc-950/60 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/40',
                ].join(' ')}
              >
                <span className="text-2xl shrink-0 mt-0.5">{s.icon}</span>
                <div>
                  <div className={`text-xs font-medium ${isSelected ? 'text-white' : 'text-zinc-300'}`}>
                    {s.name}
                  </div>
                  <div className="text-[0.7rem] text-zinc-500 mt-0.5 leading-tight">{s.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
