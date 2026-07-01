"use client";

import { useCallback, useRef, useState } from "react";
import type { GameEngine } from "@/lib/minecraft/engine";

interface MobileControlsProps {
  engine: GameEngine;
  flying: boolean;
}

// Inline SVG icons.
const Icon = {
  Jump: () => (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  ),
  Break: () => (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 4l6 6-8 8H6v-6z" />
      <path d="M11 7l6 6" />
    </svg>
  ),
  Place: () => (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M12 9v6M9 12h6" />
    </svg>
  ),
  Fly: () => (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12c4-3 8-3 12 0 2 1.5 4 1.5 6 0" />
      <path d="M3 17c4-2 8-2 12 0" />
    </svg>
  ),
};

type BtnColor = "green" | "blue" | "red" | "purple";

const COLOR_ACTIVE: Record<BtnColor, string> = {
  green: "linear-gradient(180deg, rgba(34,197,94,0.9), rgba(22,163,74,0.9))",
  blue: "linear-gradient(180deg, rgba(59,130,246,0.9), rgba(37,99,235,0.9))",
  red: "linear-gradient(180deg, rgba(239,68,68,0.9), rgba(220,38,38,0.9))",
  purple: "linear-gradient(180deg, rgba(168,85,247,0.9), rgba(147,51,234,0.9))",
};

// A hold-able action button with label, supporting press-and-hold.
function ActionButton({
  icon,
  label,
  color,
  size = 56,
  active: forcedActive,
  onDown,
  onUp,
  onTap,
}: {
  icon: React.ReactNode;
  label: string;
  color: BtnColor;
  size?: number;
  active?: boolean;
  onDown?: () => void;
  onUp?: () => void;
  onTap?: () => void;
}) {
  const [held, setHeld] = useState(false);
  const pointerId = useRef<number | null>(null);
  const active = held || forcedActive;

  const handleDown = (e: React.PointerEvent) => {
    e.preventDefault();
    if (pointerId.current !== null) return;
    pointerId.current = e.pointerId;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setHeld(true);
    onDown?.();
    onTap?.();
  };

  const handleUp = (e: React.PointerEvent) => {
    if (pointerId.current !== e.pointerId) return;
    pointerId.current = null;
    setHeld(false);
    onUp?.();
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        aria-label={label}
        onPointerDown={handleDown}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onContextMenu={(e) => e.preventDefault()}
        className="pointer-events-auto flex touch-none select-none items-center justify-center rounded-full border text-white transition-transform duration-100 active:scale-90"
        style={{
          width: size,
          height: size,
          background: active
            ? COLOR_ACTIVE[color]
            : "rgba(15,17,22,0.55)",
          borderColor: active
            ? "rgba(255,255,255,0.7)"
            : "rgba(255,255,255,0.18)",
          borderWidth: 1.5,
          boxShadow: active
            ? `0 0 16px ${color === "green" ? "rgba(34,197,94,0.4)" : color === "blue" ? "rgba(59,130,246,0.4)" : color === "red" ? "rgba(239,68,68,0.4)" : "rgba(168,85,247,0.4)"}, 0 2px 8px rgba(0,0,0,0.4)`
            : "0 2px 8px rgba(0,0,0,0.4)",
          backdropFilter: "blur(8px)",
        }}
      >
        {icon}
      </button>
      <span className="pointer-events-none font-mono text-[9px] font-medium uppercase tracking-wide text-white/55">
        {label}
      </span>
    </div>
  );
}

// Floating joystick: appears where the user first touches within the left zone,
// and tracks finger movement. Resets when released.
function Joystick({ engine }: { engine: GameEngine }) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const pointerId = useRef<number | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const [active, setActive] = useState(false);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const MAX_R = 52;

  const handleDown = (e: React.PointerEvent) => {
    e.preventDefault();
    if (pointerId.current !== null) return;
    pointerId.current = e.pointerId;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const rect = zoneRef.current!.getBoundingClientRect();
    // Clamp the origin to within the zone so the joystick stays on-screen.
    const ox = Math.min(Math.max(e.clientX, rect.left + MAX_R), rect.right - MAX_R);
    const oy = Math.min(Math.max(e.clientY, rect.top + MAX_R), rect.bottom - MAX_R);
    originRef.current = { x: ox, y: oy };
    setOrigin({ x: ox, y: oy });
    setKnob({ x: 0, y: 0 });
    setActive(true);
  };

  const handleMove = (e: React.PointerEvent) => {
    if (pointerId.current !== e.pointerId || !originRef.current) return;
    let dx = e.clientX - originRef.current.x;
    let dy = e.clientY - originRef.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > MAX_R) {
      dx = (dx / dist) * MAX_R;
      dy = (dy / dist) * MAX_R;
    }
    setKnob({ x: dx, y: dy });
    engine.setMoveVector(dx / MAX_R, dy / MAX_R);
  };

  const handleUp = (e: React.PointerEvent) => {
    if (pointerId.current !== e.pointerId) return;
    pointerId.current = null;
    originRef.current = null;
    setActive(false);
    setKnob({ x: 0, y: 0 });
    engine.setMoveVector(0, 0);
  };

  return (
    <div
      ref={zoneRef}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      onContextMenu={(e) => e.preventDefault()}
      className="pointer-events-auto absolute inset-0 touch-none"
    >
      {/* Floating joystick visual — only visible while active */}
      {active && (
        <>
          {/* Outer ring */}
          <div
            className="pointer-events-none absolute rounded-full"
            style={{
              left: origin.x - MAX_R - 12,
              top: origin.y - MAX_R - 12,
              width: (MAX_R + 12) * 2,
              height: (MAX_R + 12) * 2,
              background: "radial-gradient(circle, rgba(15,17,22,0.45) 60%, rgba(15,17,22,0.2) 100%)",
              border: "1.5px solid rgba(255,255,255,0.15)",
              backdropFilter: "blur(6px)",
            }}
          >
            {/* Cardinal direction marks */}
            <span className="absolute left-1/2 top-1 -translate-x-1/2 text-[9px] text-white/30">▲</span>
            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] text-white/30">▼</span>
            <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[9px] text-white/30">◀</span>
            <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-white/30">▶</span>
          </div>
          {/* Knob */}
          <div
            className="pointer-events-none absolute rounded-full"
            style={{
              left: origin.x - 26,
              top: origin.y - 26,
              width: 52,
              height: 52,
              transform: `translate(${knob.x}px, ${knob.y}px)`,
              background: "rgba(255,255,255,0.28)",
              border: "1.5px solid rgba(255,255,255,0.7)",
              boxShadow: "0 3px 10px rgba(0,0,0,0.5)",
            }}
          />
        </>
      )}
      {/* Hint when idle */}
      {!active && (
        <div className="pointer-events-none absolute bottom-3 left-3 flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-black/20 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-0.5 text-white/35">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="3.5" />
            </svg>
            <span className="font-mono text-[8px] uppercase tracking-wider">move</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function MobileControls({ engine, flying }: MobileControlsProps) {
  const toggleFly = useCallback(() => {
    engine.toggleFly();
  }, [engine]);

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {/* Movement zone — left half of the lower screen (floating joystick) */}
      <div className="pointer-events-none absolute bottom-0 left-0 top-1/3 w-1/2">
        <Joystick engine={engine} />
      </div>

      {/* Action buttons — bottom right, cluster layout */}
      <div className="absolute bottom-24 right-4 flex flex-col items-end gap-3">
        {/* Row 1: Fly toggle */}
        <ActionButton
          icon={<Icon.Fly />}
          label={flying ? "Fly" : "Fly"}
          color="purple"
          size={52}
          active={flying}
          onTap={toggleFly}
        />
        {/* Row 2: Jump */}
        <ActionButton
          icon={<Icon.Jump />}
          label="Jump"
          color="green"
          size={58}
          onDown={() => engine.setVirtualKey("Space", true)}
          onUp={() => engine.setVirtualKey("Space", false)}
        />
        {/* Row 3: Place + Break side by side */}
        <div className="flex gap-3">
          <ActionButton
            icon={<Icon.Place />}
            label="Place"
            color="blue"
            size={58}
            onDown={() => engine.setPlacing(true)}
            onUp={() => engine.setPlacing(false)}
          />
          <ActionButton
            icon={<Icon.Break />}
            label="Mine"
            color="red"
            size={58}
            onDown={() => engine.setBreaking(true)}
            onUp={() => engine.setBreaking(false)}
          />
        </div>
      </div>

      {/* Fly status pill */}
      {flying && (
        <div
          className="pointer-events-none absolute bottom-52 right-4 flex items-center gap-1.5 rounded-full px-3 py-1.5"
          style={{
            background: "rgba(168,85,247,0.25)",
            border: "1px solid rgba(168,85,247,0.4)",
            backdropFilter: "blur(8px)",
          }}
        >
          <Icon.Fly />
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-purple-200">Flying</span>
        </div>
      )}
    </div>
  );
}
