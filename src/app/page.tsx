"use client";

import dynamic from "next/dynamic";

const MinecraftGame = dynamic(() => import("@/components/minecraft/MinecraftGame"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-screen items-center justify-center bg-zinc-900 text-white">
      <div className="text-center">
        <div className="text-2xl font-bold tracking-tight">Loading VoxelVile…</div>
        <div className="mt-3 font-mono text-sm text-zinc-400">Preparing renderer</div>
      </div>
    </div>
  ),
});

export default function Home() {
  return <MinecraftGame />;
}
