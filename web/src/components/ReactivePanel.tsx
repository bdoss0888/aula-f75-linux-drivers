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

export interface ThemePreset {
  name: string;
  desc: string;
  base: string;
  strike: string;
  style: ReactiveStyle;
  rainbow?: boolean;
  isCustom?: boolean;
}

const STORAGE_ACTIVE_KEY = 'aula.f75.active_reactive_config';
const STORAGE_PRESETS_KEY = 'aula.f75.custom_reactive_presets';

const CURATED_PRESETS: ThemePreset[] = [
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
  const [config, setConfig] = useState<ReactiveConfig>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_ACTIVE_KEY);
        if (saved) return JSON.parse(saved);
      } catch { /* use default */ }
    }
    return DEFAULT_REACTIVE_CONFIG;
  });

  const [customPresets, setCustomPresets] = useState<ThemePreset[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_PRESETS_KEY);
        if (saved) return JSON.parse(saved);
      } catch { /* use empty */ }
    }
    return [];
  });

  const [newPresetName, setNewPresetName] = useState('');
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [running, setRunning] = useState(false);
  const [lastKeyPressed, setLastKeyPressed] = useState<string | null>(null);
  const [fps] = useState(30);

  const engineRef = useRef<ReactiveEngine>(new ReactiveEngine(config));
  const runningRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const sandboxInputRef = useRef<HTMLInputElement>(null);

  // Keep engine config synchronized and persist active config
  useEffect(() => {
    engineRef.current.updateConfig(config);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_ACTIVE_KEY, JSON.stringify(config));
      } catch { /* ignore */ }
    }
  }, [config]);

  // Persist custom presets
  const saveCustomPresetsToStorage = (presets: ThemePreset[]) => {
    setCustomPresets(presets);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_PRESETS_KEY, JSON.stringify(presets));
      } catch { /* ignore */ }
    }
  };

  const handleSaveNewPreset = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newPresetName.trim();
    if (!name) return;

    const newPreset: ThemePreset = {
      name,
      desc: `Custom: Base ${config.baseColorHex} → Strike ${config.strikeColorHex}`,
      base: config.baseColorHex,
      strike: config.strikeColorHex,
      style: config.style,
      rainbow: config.rainbowStrike,
      isCustom: true,
    };

    const updated = [newPreset, ...customPresets.filter(p => p.name !== name)];
    saveCustomPresetsToStorage(updated);
    setNewPresetName('');
    setIsSavingPreset(false);
    log(`Saved custom preset: "${name}"`);
  };

  const handleDeletePreset = (nameToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customPresets.filter(p => p.name !== nameToDelete);
    saveCustomPresetsToStorage(updated);
    log(`Deleted custom preset: "${nameToDelete}"`);
  };

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

    // Blur active buttons so pressing Space doesn't re-trigger clicks
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    const useWireless = isWirelessDevice(device);
    log(`Starting Reactive Engine (${useWireless ? '2.4GHz wireless' : 'USB-C Direct Stream'})`);

    if (!useWireless) {
      await enableDirectMode(device, log);
    }

    runningRef.current = true;
    setRunning(true);

    // Auto-focus sandbox input for immediate natural typing
    setTimeout(() => {
      sandboxInputRef.current?.focus();
    }, 50);

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

  // Global keydown capture with Space safety
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent Spacebar from clicking currently focused buttons
      if (e.code === 'Space' && document.activeElement instanceof HTMLButtonElement) {
        e.preventDefault();
        document.activeElement.blur();
        sandboxInputRef.current?.focus();
      }

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

      {/* Theme Presets & Custom Presets */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Presets & Custom Profiles
          </h3>
          <button
            onClick={() => setIsSavingPreset(!isSavingPreset)}
            className="text-xs text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1 cursor-pointer transition-colors"
          >
            <span>💾</span> {isSavingPreset ? 'Cancel' : 'Save Current as Preset'}
          </button>
        </div>

        {/* Save Preset Inline Form */}
        {isSavingPreset && (
          <form onSubmit={handleSaveNewPreset} className="mb-4 p-3 bg-zinc-950 border border-cyan-800/80 rounded-lg flex items-center gap-2">
            <input
              type="text"
              placeholder="Enter preset name (e.g. My Warm Office)..."
              value={newPresetName}
              onChange={e => setNewPresetName(e.target.value)}
              autoFocus
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
            />
            <button
              type="submit"
              disabled={!newPresetName.trim()}
              className="px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-800 text-white text-xs font-medium cursor-pointer disabled:cursor-not-allowed transition-colors"
            >
              Save Preset
            </button>
          </form>
        )}

        {/* Presets Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
          {/* Custom Presets first */}
          {customPresets.map((p, i) => (
            <button
              key={`custom-${i}`}
              onClick={() => applyPreset(p)}
              className="flex items-center justify-between p-2.5 rounded-lg border border-cyan-800/60 hover:border-cyan-600 bg-cyan-950/20 hover:bg-cyan-900/30 transition-all text-left cursor-pointer group"
            >
              <div className="flex items-center gap-3 truncate">
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
                  <div className="text-xs font-medium text-cyan-200 group-hover:text-white truncate flex items-center gap-1.5">
                    <span>{p.name}</span>
                    <span className="text-[0.6rem] bg-cyan-900/60 text-cyan-300 px-1 py-0.2 rounded">Custom</span>
                  </div>
                  <div className="text-[0.65rem] text-zinc-400 truncate">{p.desc}</div>
                </div>
              </div>
              <button
                onClick={(e) => handleDeletePreset(p.name, e)}
                title="Delete preset"
                className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-rose-400 transition-opacity ml-2"
              >
                ✕
              </button>
            </button>
          ))}

          {/* Curated Presets */}
          {CURATED_PRESETS.map((p, i) => (
            <button
              key={`curated-${i}`}
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

      {/* Color Tuning & Dynamics */}
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
              ref={sandboxInputRef}
              type="text"
              placeholder={running ? "Type freely here (Space bar & all keys active)..." : "Start reactive mode first, then type here..."}
              disabled={!running}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
            />
            <span className="text-[0.65rem] text-zinc-500">
              *All settings auto-save instantly. Space bar will now type naturally without stopping the engine!
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
