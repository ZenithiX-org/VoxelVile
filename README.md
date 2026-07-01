# VoxelVile

A browser-based **3D voxel sandbox** (Minecraft clone) built with **Next.js 16**, **TypeScript**, **Three.js**, and **Tailwind CSS**.

![VoxelVile](public/logo.svg)

## Features

- **First-person 3D voxel world** with pointer-lock mouse look + WASD movement
- **Procedural terrain** using simplex noise — hills, water, beaches, snow peaks, and trees
- **Procedural pixelated textures** — a 128×128 texture atlas with 15 hand-coded 16×16 tiles
- **Block breaking & placing** via voxel raycasting (DDA), with a wireframe highlight
- **Player physics** — gravity, jumping, AABB collision, walk + fly modes (double-tap Space)
- **Water & swimming** — buoyancy, water drag, swim up/down, translucent water, underwater fog
- **Mobile touch controls** — floating joystick, labeled action buttons, touch-drag look
- **World saving & loading** — IndexedDB persistence with multiple named save slots
- **Hotbar** — 9 block types, selectable via number keys, scroll wheel, or tap (mobile)
- **Sky gradient**, distance fog, Lambert face shading, frustum culling, chunk streaming

## Controls

### Desktop
| Action | Key |
|--------|-----|
| Move | `WASD` |
| Look | Mouse (click to capture) |
| Jump / Swim up | `Space` |
| Sprint / Swim down | `Shift` |
| Toggle fly | Double-tap `Space` |
| Break block | Left click |
| Place block | Right click |
| Select block | `1`–`9` / scroll wheel |
| Toggle help | `H` |
| Release mouse | `Esc` |

### Mobile
- **Left side**: drag anywhere to move (floating joystick)
- **Right side**: Fly / Jump / Place / Mine buttons
- **Drag on screen**: look around
- **Tap hotbar**: select block
- **World button** (top-right): save / load / new world

## Getting Started (Local)

```bash
npm install
npm run dev
# Open http://localhost:3000
```

## Deploy to Netlify

This project includes a `netlify.toml` configured for hassle-free deployment.

### Steps
1. Push this project to a GitHub/GitLab/Bitbucket repo
2. In Netlify: **Add new site → Import an existing project**
3. Select your repo — Netlify auto-detects the `netlify.toml` settings
4. **Important** — verify these in the Netlify dashboard before deploying:
   - **Site configuration → Build & deploy → Build settings**
     - Build command: `npx next build`
     - **Publish directory: `.next`** ← must be exactly this (not empty, not `/`, not `.`)
   - **Site configuration → Environment variables**
     - `NODE_VERSION` = `20`
5. Click **Deploy**

### Troubleshooting: "Publish directory pointing to base directory"
If you get this error, it means the Netlify dashboard's Publish directory field is empty or set to the repo root, overriding the `netlify.toml`. Fix it:
1. Go to **Site configuration → Build & deploy → Build settings → Edit settings**
2. Set **Publish directory** to `.next`
3. Save and trigger a new deploy

### Why a plain `next build`?
The default `package.json` build script in some scaffolds includes Docker-only `cp` commands that fail on Netlify. This project's `netlify.toml` overrides the build command to run a clean `npx next build`, and the `@netlify/plugin-nextjs` plugin handles SSR, routing, and the `.next` output.

### Requirements
- Node.js 20 (pinned via `netlify.toml`)
- A WebGL-capable browser to view the app

## Project Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout + metadata
│   ├── page.tsx            # Entry point (dynamically imports the game)
│   └── globals.css         # Tailwind + theme variables
├── lib/
│   ├── minecraft/
│   │   ├── blocks.ts       # Block type definitions & properties
│   │   ├── textures.ts     # Procedural texture atlas generator
│   │   ├── world.ts        # Chunk system, terrain gen, mesh building
│   │   ├── engine.ts       # Three.js engine: physics, controls, raycasting
│   │   └── storage.ts      # IndexedDB save/load persistence
│   └── utils.ts            # cn() class merge helper
├── components/
│   ├── minecraft/
│   │   ├── MinecraftGame.tsx  # Main game wrapper component
│   │   ├── HUD.tsx            # Crosshair, hotbar, info panel, overlays
│   │   ├── MobileControls.tsx # Touch joystick + action buttons
│   │   └── SaveLoadPanel.tsx  # World manager dialog
│   └── ui/                    # shadcn/ui components (button, input, etc.)
└── hooks/
    └── use-toast.ts        # Toast hook
```

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript 5
- **3D Rendering**: Three.js
- **Terrain**: simplex-noise
- **Styling**: Tailwind CSS 4 + shadcn/ui
- **Icons**: Lucide React
- **Persistence**: IndexedDB

---

Built with ❤️ using Z.ai
