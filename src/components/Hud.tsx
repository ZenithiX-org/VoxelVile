import { memo } from 'react';
import { BLOCKS, blockIcon } from '../game/blocks';
import type { EngineStats } from '../game/engine';

export function Crosshair({ hidden }: { hidden?: boolean }) {
  if (hidden) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
      <div className="relative h-6 w-6 opacity-90 mix-blend-difference">
        <div className="absolute left-1/2 top-0 h-6 w-[2px] -translate-x-1/2 bg-white" />
        <div className="absolute top-1/2 left-0 h-[2px] w-6 -translate-y-1/2 bg-white" />
      </div>
    </div>
  );
}

export const Hotbar = memo(function Hotbar({
  hotbar,
  slot,
  onSelect,
}: {
  hotbar: number[];
  slot: number;
  onSelect: (i: number) => void;
}) {
  const current = BLOCKS[hotbar[slot]];
  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
      <div className="font-pixel text-shadow-mc h-4 text-[10px] text-white/90">
        {current ? current.name : ''}
      </div>
      <div className="pointer-events-auto flex gap-[3px] border-2 border-black bg-black/45 p-[3px] shadow-[inset_2px_2px_0_rgba(255,255,255,0.12)]">
        {hotbar.map((id, i) => (
          <button
            key={i}
            onClick={() => onSelect(i)}
            className={`mc-slot relative flex h-12 w-12 items-center justify-center transition-transform ${
              i === slot ? 'outline outline-[3px] outline-white/95' : 'hover:brightness-125'
            }`}
            title={BLOCKS[id]?.name}
          >
            {id ? (
              <img src={blockIcon(id)} alt="" className="pixelated h-9 w-9" draggable={false} />
            ) : null}
            <span className="font-pixel absolute -top-[1px] left-[2px] text-[7px] text-white/45">
              {i + 1}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
});

export function DebugPanel({ stats, seed }: { stats: EngineStats | null; seed: number }) {
  if (!stats) return null;
  const rows: [string, string][] = [
    ['fps', `${stats.fps}`],
    ['xyz', `${stats.x.toFixed(2)} / ${stats.y.toFixed(2)} / ${stats.z.toFixed(2)}`],
    ['block', `${Math.floor(stats.x)} ${Math.floor(stats.y)} ${Math.floor(stats.z)}`],
    ['chunk', `${Math.floor(stats.x / 16)} ${Math.floor(stats.z / 16)}  (${stats.chunks} meshes)`],
    ['tris', stats.tris.toLocaleString()],
    ['biome', stats.biome],
    ['looking at', stats.target],
    ['mode', stats.flying ? 'flying' : stats.onGround ? 'walking' : 'falling'],
    ['time', `${String(Math.floor(stats.time * 24)).padStart(2, '0')}:${String(Math.floor((stats.time * 24 % 1) * 60)).padStart(2, '0')}`],
    ['seed', `${seed}`],
  ];
  return (
    <div className="pointer-events-none absolute left-2 top-2 max-w-[340px] space-y-[2px] text-[11px] leading-tight">
      {rows.map(([k, v]) => (
        <div key={k} className="inline-block rounded-[2px] bg-black/55 px-1.5 py-[1px] text-emerald-200">
          <span className="text-white/55">{k}:</span> {v}
          <br />
        </div>
      ))}
    </div>
  );
}

export function StatusLine({ stats }: { stats: EngineStats | null }) {
  if (!stats) return null;
  return (
    <div className="pointer-events-none absolute right-2 top-2 flex flex-col items-end gap-1">
      <div className="font-pixel text-shadow-mc rounded-[2px] bg-black/40 px-2 py-1 text-[10px] text-white/85">
        {stats.fps} FPS
      </div>
      <div className="font-pixel text-shadow-mc rounded-[2px] bg-black/40 px-2 py-1 text-[10px] text-white/70">
        {Math.floor(stats.x)}, {Math.floor(stats.y)}, {Math.floor(stats.z)}
      </div>
      {stats.flying && (
        <div className="font-pixel text-shadow-mc rounded-[2px] bg-sky-500/30 px-2 py-1 text-[10px] text-sky-100">
          FLYING
        </div>
      )}
    </div>
  );
}

export function ScreenEffects({ underwater }: { underwater: boolean }) {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: underwater ? 1 : 0,
          background:
            'radial-gradient(ellipse at center, rgba(28,90,170,0.35) 0%, rgba(12,48,110,0.75) 100%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ boxShadow: 'inset 0 0 180px rgba(0,0,0,0.55)' }}
      />
    </>
  );
}
