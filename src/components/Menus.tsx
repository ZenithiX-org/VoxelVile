import { useState } from 'react';
import { BLOCKS, PALETTE, blockIcon } from '../game/blocks';
import type { Settings } from '../game/engine';

export const CONTROLS: [string, string][] = [
  ['Move', 'W A S D'],
  ['Look around', 'Mouse'],
  ['Break block', 'Left click'],
  ['Place block', 'Right click'],
  ['Pick block', 'Middle click'],
  ['Jump', 'Space'],
  ['Toggle flying', 'F  /  double-tap Space'],
  ['Fly up / down', 'Space / Left Shift'],
  ['Sprint', 'Left Ctrl'],
  ['Sneak (slow)', 'Left Shift'],
  ['Select block', '1 – 9  /  mouse wheel'],
  ['Block palette', 'E'],
  ['Debug overlay', 'F3'],
  ['Respawn', 'R'],
  ['Pause / release mouse', 'Esc'],
];

export function ControlsList({ compact }: { compact?: boolean }) {
  return (
    <div className={`grid gap-x-6 gap-y-1 ${compact ? 'grid-cols-1' : 'grid-cols-2'}`}>
      {CONTROLS.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-3 text-[11px]">
          <span className="text-white/60">{k}</span>
          <span className="font-pixel text-[9px] text-amber-200/90">{v}</span>
        </div>
      ))}
    </div>
  );
}

export function LoadingScreen({ progress }: { progress: number }) {
  return (
    <div className="dirt-bg absolute inset-0 z-50 flex flex-col items-center justify-center gap-6">
      <div className="absolute inset-0 bg-black/55" />
      <div className="relative flex flex-col items-center gap-5">
        <h1 className="font-pixel text-shadow-mc text-2xl text-emerald-300 sm:text-4xl">VOXELCRAFT</h1>
        <p className="font-pixel text-shadow-mc text-[10px] text-white/80">Generating terrain…</p>
        <div className="h-5 w-72 border-2 border-black bg-black/70 p-[3px]">
          <div
            className="h-full bg-gradient-to-b from-emerald-300 to-emerald-600 transition-[width] duration-200"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <p className="font-pixel text-[9px] text-white/50">{Math.round(progress * 100)}%</p>
      </div>
    </div>
  );
}

const SPLASHES = [
  'Infinite worlds!',
  'Now with ambient occlusion!',
  '100% procedural!',
  'Dig straight down!',
  'Blocks all the way down',
  'No blocks were harmed',
  'Punch trees, build houses',
  'Try the sunsets!',
];

export function TitleScreen({
  onPlay,
  onNewWorld,
  onSettings,
  seed,
}: {
  onPlay: () => void;
  onNewWorld: () => void;
  onSettings: () => void;
  seed: number;
}) {
  const [splash] = useState(() => SPLASHES[Math.floor(Math.random() * SPLASHES.length)]);
  return (
    <div className="fade-in absolute inset-0 z-40 flex items-center justify-center bg-black/45 backdrop-blur-[2px]">
      <div className="mc-panel pop-in w-[min(92vw,640px)] px-8 py-8">
        <div className="relative mb-8 text-center">
          <h1 className="font-pixel text-shadow-mc text-3xl text-emerald-300 sm:text-5xl">
            VOXELCRAFT
          </h1>
          <div className="splash font-pixel absolute -right-2 -bottom-6 text-[9px] text-yellow-300 sm:-right-6 sm:text-[11px]">
            {splash}
          </div>
        </div>
        <div className="mx-auto flex max-w-sm flex-col gap-3">
          <button className="mc-btn font-pixel h-12 text-[12px]" onClick={onPlay}>
            PLAY
          </button>
          <div className="flex gap-3">
            <button className="mc-btn font-pixel h-10 flex-1 text-[10px]" onClick={onNewWorld}>
              NEW WORLD
            </button>
            <button className="mc-btn font-pixel h-10 flex-1 text-[10px]" onClick={onSettings}>
              OPTIONS
            </button>
          </div>
        </div>
        <div className="mt-8 border-t border-white/10 pt-5">
          <ControlsList />
        </div>
        <p className="mt-5 text-center text-[10px] text-white/35">
          seed {seed} · click PLAY to lock the mouse · a tiny homage, not affiliated with Mojang
        </p>
      </div>
    </div>
  );
}

export function PauseMenu({
  onResume,
  onSettings,
  onNewWorld,
  onTitle,
}: {
  onResume: () => void;
  onSettings: () => void;
  onNewWorld: () => void;
  onTitle: () => void;
}) {
  return (
    <div className="fade-in absolute inset-0 z-40 flex items-center justify-center bg-black/55 backdrop-blur-[2px]">
      <div className="mc-panel pop-in w-[min(92vw,520px)] px-8 py-7">
        <h2 className="font-pixel text-shadow-mc mb-6 text-center text-lg text-white">Game Paused</h2>
        <div className="mx-auto flex max-w-sm flex-col gap-3">
          <button className="mc-btn font-pixel h-11 text-[11px]" onClick={onResume}>
            BACK TO GAME
          </button>
          <div className="flex gap-3">
            <button className="mc-btn font-pixel h-10 flex-1 text-[10px]" onClick={onSettings}>
              OPTIONS
            </button>
            <button className="mc-btn font-pixel h-10 flex-1 text-[10px]" onClick={onNewWorld}>
              NEW WORLD
            </button>
          </div>
          <button className="mc-btn font-pixel h-10 text-[10px]" onClick={onTitle}>
            MAIN MENU
          </button>
        </div>
        <div className="mt-7 border-t border-white/10 pt-5">
          <ControlsList />
        </div>
      </div>
    </div>
  );
}

function Slider({
  label, value, min, max, step, format, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number;
  format: (v: number) => string; onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-pixel text-[9px] text-white/75">{label}</span>
        <span className="font-pixel text-[9px] text-amber-200">{format(value)}</span>
      </div>
      <input
        type="range"
        className="w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  );
}

export function SettingsPanel({
  settings,
  onChange,
  onClose,
}: {
  settings: Settings;
  onChange: (s: Partial<Settings>) => void;
  onClose: () => void;
}) {
  return (
    <div className="fade-in absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
      <div className="mc-panel pop-in w-[min(92vw,480px)] px-7 py-6">
        <h2 className="font-pixel text-shadow-mc mb-6 text-center text-base text-white">Options</h2>
        <div className="space-y-4">
          <Slider
            label="Render distance" value={settings.renderDistance} min={3} max={12} step={1}
            format={(v) => `${v} chunks`} onChange={(v) => onChange({ renderDistance: v })}
          />
          <Slider
            label="Field of view" value={settings.fov} min={55} max={110} step={1}
            format={(v) => `${v}°`} onChange={(v) => onChange({ fov: v })}
          />
          <Slider
            label="Mouse sensitivity" value={settings.sensitivity} min={0.2} max={3} step={0.05}
            format={(v) => `${v.toFixed(2)}×`} onChange={(v) => onChange({ sensitivity: v })}
          />
          <Slider
            label="Volume" value={settings.volume} min={0} max={1} step={0.05}
            format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => onChange({ volume: v })}
          />
          <Slider
            label="Time of day" value={settings.timeOfDay} min={0} max={0.999} step={0.005}
            format={(v) => `${String(Math.floor(v * 24)).padStart(2, '0')}:00`}
            onChange={(v) => onChange({ timeOfDay: v })}
          />
          <button
            className="mc-btn font-pixel h-10 w-full text-[10px]"
            onClick={() => onChange({ dayCycle: !settings.dayCycle })}
          >
            DAY / NIGHT CYCLE: {settings.dayCycle ? 'ON' : 'OFF'}
          </button>
        </div>
        <button className="mc-btn font-pixel mt-6 h-11 w-full text-[11px]" onClick={onClose}>
          DONE
        </button>
      </div>
    </div>
  );
}

export function InventoryPanel({
  hotbar,
  slot,
  onPick,
  onSelectSlot,
  onClose,
}: {
  hotbar: number[];
  slot: number;
  onPick: (id: number) => void;
  onSelectSlot: (i: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="fade-in absolute inset-0 z-40 flex items-center justify-center bg-black/55">
      <div className="mc-panel pop-in w-[min(94vw,560px)] px-6 py-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-pixel text-shadow-mc text-[13px] text-white">Creative Blocks</h2>
          <span className="text-[10px] text-white/45">click a block to put it in slot {slot + 1}</span>
        </div>
        <div className="grid grid-cols-7 gap-[4px] sm:grid-cols-9">
          {PALETTE.map((id) => (
            <button
              key={id}
              onClick={() => onPick(id)}
              title={BLOCKS[id]?.name}
              className="mc-slot group flex aspect-square items-center justify-center hover:brightness-150"
            >
              <img
                src={blockIcon(id)}
                alt={BLOCKS[id]?.name}
                className="pixelated h-8 w-8 transition-transform group-hover:scale-110"
                draggable={false}
              />
            </button>
          ))}
        </div>
        <div className="mt-5 border-t border-white/10 pt-4">
          <div className="mb-2 text-[10px] text-white/45">Hotbar</div>
          <div className="flex gap-[3px]">
            {hotbar.map((id, i) => (
              <button
                key={i}
                onClick={() => onSelectSlot(i)}
                className={`mc-slot flex h-11 w-11 items-center justify-center ${
                  i === slot ? 'outline outline-[3px] outline-white/95' : ''
                }`}
              >
                {id ? <img src={blockIcon(id)} alt="" className="pixelated h-8 w-8" draggable={false} /> : null}
              </button>
            ))}
          </div>
        </div>
        <button className="mc-btn font-pixel mt-5 h-10 w-full text-[10px]" onClick={onClose}>
          BACK TO GAME  (E)
        </button>
      </div>
    </div>
  );
}
