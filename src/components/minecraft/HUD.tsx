"use client";

import { HOTBAR, BLOCKS } from "@/lib/minecraft/blocks";
import type { EngineState } from "@/lib/minecraft/engine";
import { tileDataURL, tileForBlockSide } from "@/lib/minecraft/textures";
import { cn } from "@/lib/utils";

interface HUDProps {
  state: EngineState;
  showHelp: boolean;
  isTouch: boolean;
  onSelectSlot?: (slot: number) => void;
}

function BlockSwatch({ type, size = 30 }: { type: number; size?: number }) {
  const def = BLOCKS[type];
  const tile = tileForBlockSide(type);
  const url = tileDataURL(tile, 4);
  return (
    <div
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${url})`,
        backgroundSize: "100% 100%",
        imageRendering: "pixelated",
        borderRadius: 3,
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.35)",
        opacity: def && def.transparent && type !== 7 ? 0.85 : 1,
      }}
    />
  );
}

export function HUD({ state, showHelp, isTouch, onSelectSlot }: HUDProps) {
  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {state.underwater && (
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(rgba(20,60,140,0.45), rgba(20,80,170,0.55))", mixBlendMode: "multiply" }}
        />
      )}

      {/* Crosshair */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative h-6 w-6">
          <div className="absolute left-1/2 top-0 h-6 w-[2px] -translate-x-1/2 bg-white/80 mix-blend-difference" />
          <div className="absolute top-1/2 left-0 h-[2px] w-6 -translate-y-1/2 bg-white/80 mix-blend-difference" />
        </div>
      </div>

      {/* Top-left info panel */}
      <div className="absolute left-3 top-3 rounded-md bg-black/45 px-3 py-2 font-mono text-xs text-white backdrop-blur-sm">
        <div className="font-semibold tracking-wide text-emerald-300">VOXELVILE</div>
        <div className="mt-1 leading-relaxed">
          <div>FPS: <span className="text-yellow-300">{state.fps}</span></div>
          <div>XYZ: <span className="text-sky-300">{state.position.x.toFixed(1)} {state.position.y.toFixed(1)} {state.position.z.toFixed(1)}</span></div>
          <div>Chunks: <span className="text-sky-300">{state.loadedChunks}</span></div>
          <div>Mode: <span className={state.flying ? "text-purple-300" : "text-emerald-300"}>{state.flying ? "Flying" : state.underwater ? "Swimming" : "Walking"}</span></div>
          <div>Block: <span className="text-orange-300">{state.blockName}</span></div>
        </div>
      </div>

      {/* Pointer-lock prompt (desktop only) */}
      {!state.pointerLocked && !isTouch && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="pointer-events-none rounded-xl border border-white/15 bg-zinc-900/80 px-8 py-6 text-center text-white shadow-2xl">
            <div className="text-2xl font-bold tracking-tight">Click to Play</div>
            <p className="mt-2 text-sm text-zinc-300">Click the screen to capture your mouse and start mining.</p>
            <p className="mt-1 text-xs text-zinc-400">Press <kbd className="rounded bg-zinc-700 px-1.5 py-0.5">Esc</kbd> to release the mouse.</p>
          </div>
        </div>
      )}

      {/* Hotbar — tappable on touch */}
      <div
        className={cn(
          "absolute left-1/2 -translate-x-1/2",
          isTouch ? "bottom-3 pointer-events-auto" : "bottom-4",
        )}
      >
        <div className="flex gap-1 rounded-lg border border-white/10 bg-black/40 p-1.5 backdrop-blur-sm">
          {HOTBAR.map((type, i) => (
            <button
              key={type}
              type="button"
              onClick={() => onSelectSlot?.(i)}
              className={cn(
                "relative flex items-center justify-center rounded-md border-2 transition-colors",
                isTouch ? "h-11 w-11" : "h-12 w-12",
                i === state.selectedSlot
                  ? "border-white bg-white/15"
                  : "border-white/15 bg-white/5",
              )}
              style={{ touchAction: "manipulation" }}
            >
              <BlockSwatch type={type} size={isTouch ? 30 : 32} />
              <span className="absolute left-1 top-0.5 font-mono text-[10px] text-white/70">{i + 1}</span>
            </button>
          ))}
        </div>
        {state.blockName && (
          <div className="mt-1.5 text-center font-mono text-xs text-white/80">{state.blockName}</div>
        )}
      </div>

      {/* Help overlay (desktop only — mobile has its own controls) */}
      {showHelp && !isTouch && (
        <div className="absolute right-3 top-3 w-64 rounded-md border border-white/10 bg-black/55 p-4 font-mono text-xs text-white backdrop-blur-sm">
          <div className="mb-2 text-sm font-bold text-emerald-300">Controls</div>
          <ul className="space-y-1 text-zinc-200">
            <li><span className="text-yellow-300">WASD</span> — Move</li>
            <li><span className="text-yellow-300">Mouse</span> — Look around</li>
            <li><span className="text-yellow-300">Space</span> — Jump / Swim up</li>
            <li><span className="text-yellow-300">Shift</span> — Sprint / Swim down</li>
            <li><span className="text-yellow-300">Double-Space</span> — Toggle fly</li>
            <li><span className="text-yellow-300">Left Click</span> — Break block</li>
            <li><span className="text-yellow-300">Right Click</span> — Place block</li>
            <li><span className="text-yellow-300">1-9 / Scroll</span> — Select block</li>
            <li><span className="text-yellow-300">H</span> — Toggle this help</li>
            <li><span className="text-yellow-300">Esc</span> — Release mouse</li>
          </ul>
        </div>
      )}
    </div>
  );
}
