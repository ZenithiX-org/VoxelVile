"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameEngine, type EngineState } from "@/lib/minecraft/engine";
import { HUD } from "./HUD";
import { MobileControls } from "./MobileControls";
import { SaveLoadPanel } from "./SaveLoadPanel";
import type { SaveSlot } from "@/lib/minecraft/storage";
import { Menu, HelpCircle } from "lucide-react";

const INITIAL_STATE: EngineState = {
  fps: 0,
  position: { x: 0, y: 0, z: 0 },
  selectedSlot: 0,
  flying: false,
  pointerLocked: false,
  loadedChunks: 0,
  blockName: "Grass",
  underwater: false,
};

function detectTouch(): boolean {
  if (typeof window === "undefined") return false;
  const hasTouch =
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia("(pointer: coarse)").matches;
  // Also show mobile controls on narrow viewports (phones / small windows).
  const isNarrow = window.innerWidth < 820;
  return hasTouch || isNarrow;
}

export default function MinecraftGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const [state, setState] = useState<EngineState>(INITIAL_STATE);
  const [showHelp, setShowHelp] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [isTouch] = useState(detectTouch);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new GameEngine(canvas);
    engineRef.current = engine;
    setEngine(engine);
    engine.setStateCallback((s) => {
      setState(s);
      setLoaded(true);
    });
    engine.start();

    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyH") setShowHelp((v) => !v);
    };
    window.addEventListener("keydown", onKey);

    // Touch look: drag on the canvas to rotate the camera (mobile only).
    let lookPointerId: number | null = null;
    let lastLookX = 0;
    let lastLookY = 0;

    const onPointerDown = (e: PointerEvent) => {
      // Only handle touch/pen for look (mouse uses pointer lock).
      if (e.pointerType === "mouse") return;
      if (lookPointerId !== null) return;
      lookPointerId = e.pointerId;
      lastLookX = e.clientX;
      lastLookY = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== lookPointerId) return;
      const dx = e.clientX - lastLookX;
      const dy = e.clientY - lastLookY;
      lastLookX = e.clientX;
      lastLookY = e.clientY;
      engine.addLook(dx, dy);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== lookPointerId) return;
      lookPointerId = null;
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    return () => {
      window.removeEventListener("keydown", onKey);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleSelectSlot = useCallback((slot: number) => {
    engineRef.current?.setSelectedSlot(slot);
  }, []);

  const handleNewWorld = useCallback(() => {
    engineRef.current?.regenerateWorld();
    setPanelOpen(false);
  }, []);

  const handleLoad = useCallback((_slot: SaveSlot) => {
    // Panel stays open so the user sees the "Loaded" message, then can close.
  }, []);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-black">
      <div className="relative flex-1">
        <canvas ref={canvasRef} className="block h-full w-full touch-none" />

        <HUD
          state={state}
          showHelp={showHelp}
          isTouch={isTouch}
          onSelectSlot={handleSelectSlot}
        />

        {/* Mobile touch controls */}
        {isTouch && loaded && engine && (
          <MobileControls engine={engine} flying={state.flying} />
        )}

        {/* Top-right buttons */}
        <div className="absolute right-3 top-3 z-20 flex gap-2">
          {showHelp && !isTouch && (
            <div className="hidden" />
          )}
          <button
            type="button"
            onClick={() => setShowHelp((v) => !v)}
            className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/65"
            aria-label="Toggle help"
          >
            <HelpCircle className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="pointer-events-auto flex h-10 items-center gap-1.5 rounded-lg border border-white/15 bg-black/45 px-3 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/65"
          >
            <Menu className="h-5 w-5" />
            <span className="hidden sm:inline">World</span>
          </button>
        </div>

        {/* Save / Load panel */}
        {engine && (
          <SaveLoadPanel
            engine={engine}
            open={panelOpen}
            onClose={() => setPanelOpen(false)}
            onLoad={handleLoad}
            onNewWorld={handleNewWorld}
          />
        )}

        {/* Loading veil */}
        {!loaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900 text-white">
            <div className="text-2xl font-bold tracking-tight">Generating world…</div>
            <div className="mt-4 h-1.5 w-56 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-emerald-400" />
            </div>
          </div>
        )}

        {/* Bottom-right credit */}
        <div className="pointer-events-none absolute bottom-2 right-3 font-mono text-[10px] text-white/40">
          Built with Three.js · Next.js
        </div>
      </div>
    </div>
  );
}
