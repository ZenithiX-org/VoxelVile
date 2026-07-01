"use client";

import { useCallback, useEffect, useState } from "react";
import type { GameEngine } from "@/lib/minecraft/engine";
import {
  deleteSave,
  listSaves,
  newSaveId,
  saveWorld,
  type SaveSlot,
} from "@/lib/minecraft/storage";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Save, FolderOpen, Trash2, Plus, X, Globe, Download, Clock } from "lucide-react";

interface SaveLoadPanelProps {
  engine: GameEngine;
  open: boolean;
  onClose: () => void;
  onLoad: (slot: SaveSlot) => void;
  onNewWorld: () => void;
}

export function SaveLoadPanel({ engine, open, onClose, onLoad, onNewWorld }: SaveLoadPanelProps) {
  const [saves, setSaves] = useState<SaveSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: "ok" | "err" } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listSaves();
      setSaves(list);
    } catch (e) {
      setMessage({ text: `Failed to list saves: ${(e as Error).message}`, kind: "err" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setMessage(null);
      refresh();
    }
  }, [open, refresh]);

  const handleSave = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const data = engine.serialize();
      const name = saveName.trim() || `World ${new Date().toLocaleString()}`;
      const slot: SaveSlot = {
        id: newSaveId(),
        name,
        timestamp: Date.now(),
        seed: data.seed,
        player: data.player,
        chunks: data.chunks,
      };
      await saveWorld(slot);
      setMessage({ text: `Saved “${name}” · ${data.chunks.length} chunks`, kind: "ok" });
      setSaveName("");
      await refresh();
    } catch (e) {
      setMessage({ text: `Save failed: ${(e as Error).message}`, kind: "err" });
    } finally {
      setBusy(false);
    }
  }, [engine, saveName, refresh]);

  const handleLoad = useCallback(
    (slot: SaveSlot) => {
      setBusy(true);
      setMessage(null);
      try {
        engine.deserialize({ seed: slot.seed, player: slot.player, chunks: slot.chunks });
        setMessage({ text: `Loaded “${slot.name}”`, kind: "ok" });
        onLoad(slot);
      } catch (e) {
        setMessage({ text: `Load failed: ${(e as Error).message}`, kind: "err" });
      } finally {
        setBusy(false);
      }
    },
    [engine, onLoad],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        await deleteSave(id);
        await refresh();
        setMessage({ text: "Save deleted", kind: "ok" });
      } catch (e) {
        setMessage({ text: `Delete failed: ${(e as Error).message}`, kind: "err" });
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const handleNewWorld = useCallback(() => {
    onNewWorld();
    setMessage({ text: "New world generated", kind: "ok" });
  }, [onNewWorld]);

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center p-4"
      style={{ background: "rgba(8,10,16,0.7)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/90 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: "0 25px 60px -10px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.04)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: "linear-gradient(135deg, rgba(74,144,217,0.3), rgba(74,144,217,0.1))" }}
            >
              <FolderOpen className="h-4 w-4 text-sky-300" />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight text-white">Worlds</h2>
              <p className="text-[11px] leading-tight text-zinc-500">Save · load · explore new worlds</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Save current world */}
          <div className="mb-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
            <div className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-zinc-200">
              <Save className="h-3.5 w-3.5 text-emerald-400" />
              Save current world
            </div>
            <div className="flex gap-2">
              <Input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="World name…"
                className="h-9 border-white/10 bg-black/40 text-[13px] text-white placeholder:text-zinc-600"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !busy) handleSave();
                }}
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={busy}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3.5 text-[13px] font-semibold text-white transition-all disabled:opacity-50"
                style={{ background: "linear-gradient(180deg, #10b981, #059669)" }}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save
              </button>
            </div>
          </div>

          {/* New world */}
          <button
            type="button"
            onClick={handleNewWorld}
            disabled={busy}
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-purple-400/20 px-4 py-2.5 text-[13px] font-semibold text-purple-200 transition-all hover:border-purple-400/40 hover:bg-purple-500/10 disabled:opacity-50"
            style={{ background: "rgba(120,80,180,0.08)" }}
          >
            <Globe className="h-4 w-4" />
            Generate New World
          </button>

          {/* Saved worlds list */}
          <div className="mb-1.5 flex items-center justify-between px-0.5">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-zinc-200">
              <FolderOpen className="h-3.5 w-3.5 text-sky-400" />
              Saved Worlds
            </div>
            <span className="text-[11px] text-zinc-600">{saves.length} total</span>
          </div>

          <div
            className="overflow-hidden rounded-xl border border-white/[0.06] bg-black/20"
            style={{ maxHeight: "240px" }}
          >
            {loading ? (
              <div className="flex h-32 items-center justify-center text-zinc-600">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : saves.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center gap-2 text-zinc-600">
                <Plus className="h-7 w-7 opacity-30" />
                <p className="text-xs">No saved worlds yet</p>
              </div>
            ) : (
              <ScrollArea className="h-[240px]">
                <div className="divide-y divide-white/[0.04]">
                  {saves.map((slot) => (
                    <div
                      key={slot.id}
                      className="group flex items-center gap-3 p-3 transition-colors hover:bg-white/[0.03]"
                    >
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                        style={{ background: "linear-gradient(135deg, rgba(74,144,217,0.25), rgba(74,144,217,0.05))" }}
                      >
                        <Globe className="h-4 w-4 text-sky-300" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-white">{slot.name}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                          <span className="flex items-center gap-0.5">
                            <Clock className="h-3 w-3" />
                            {timeAgo(slot.timestamp)}
                          </span>
                          <span className="text-zinc-700">·</span>
                          <span>{slot.chunks.length} chunks</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleLoad(slot)}
                          disabled={busy}
                          className="flex h-8 items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/15 px-2.5 text-[12px] font-semibold text-sky-200 transition-all hover:bg-sky-500/25 disabled:opacity-50"
                        >
                          <Download className="h-3 w-3" />
                          Load
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(slot.id)}
                          disabled={busy}
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-red-500/20 bg-red-500/10 text-red-300 transition-all hover:bg-red-500/25 disabled:opacity-50"
                          aria-label="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>

        {/* Footer message */}
        {message && (
          <div className="border-t border-white/[0.06] px-5 py-3">
            <div
              className={`rounded-lg px-3 py-2 text-[12px] font-medium ${
                message.kind === "ok"
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-red-500/15 text-red-300"
              }`}
            >
              {message.text}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Compact relative time formatter.
function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}
