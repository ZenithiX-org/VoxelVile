// Procedural pixelated texture atlas for the Minecraft clone.
import * as THREE from "three";

export const TILE_SIZE = 16;
export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 8;
const ATLAS_PX = ATLAS_COLS * TILE_SIZE;

export const TileIndex = {
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  STONE: 3,
  COBBLE: 4,
  WOOD_TOP: 5,
  WOOD_SIDE: 6,
  PLANKS: 7,
  LEAVES: 8,
  SAND: 9,
  WATER: 10,
  GLASS: 11,
  BRICK: 12,
  SNOW: 13,
  BEDROCK: 14,
} as const;

export function tileForBlock(blockType: number, face: number): number {
  switch (blockType) {
    case 1: return face === 3 ? TileIndex.GRASS_TOP : face === 2 ? TileIndex.DIRT : TileIndex.GRASS_SIDE;
    case 2: return TileIndex.DIRT;
    case 3: return TileIndex.STONE;
    case 11: return TileIndex.COBBLE;
    case 4: return face === 2 || face === 3 ? TileIndex.WOOD_TOP : TileIndex.WOOD_SIDE;
    case 10: return TileIndex.PLANKS;
    case 5: return TileIndex.LEAVES;
    case 6: return TileIndex.SAND;
    case 7: return TileIndex.WATER;
    case 8: return TileIndex.GLASS;
    case 9: return TileIndex.BRICK;
    case 12: return TileIndex.SNOW;
    default: return TileIndex.STONE;
  }
}

function hash2(x: number, y: number, seed: number): number {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (seed | 0) * 1274126177;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function shift(hex: number, amt: number): [number, number, number] {
  return [
    clamp(((hex >> 16) & 0xff) + amt, 0, 255),
    clamp(((hex >> 8) & 0xff) + amt, 0, 255),
    clamp((hex & 0xff) + amt, 0, 255),
  ];
}

type RGBA = [number, number, number, number];

function px(c: [number, number, number], a = 255): RGBA {
  return [c[0], c[1], c[2], a];
}

function drawTile(data: Uint8ClampedArray, col: number, row: number, fn: (x: number, y: number) => RGBA) {
  const ox = col * TILE_SIZE;
  const oy = row * TILE_SIZE;
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const [r, g, b, a] = fn(x, y);
      const idx = ((oy + y) * ATLAS_PX + (ox + x)) * 4;
      data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = a;
    }
  }
}

function grassTop() {
  const base = 0x6ab04c;
  return (x: number, y: number): RGBA => {
    const n = (hash2(x, y, 11) - 0.5) * 36;
    const n2 = hash2(x, y, 12) > 0.92 ? -28 : 0;
    return px(shift(base, n + n2));
  };
}
function grassSide() {
  const dirtBase = 0x8b5a2b;
  const grassBase = 0x6ab04c;
  return (x: number, y: number): RGBA => {
    if (y < 3) { const n = (hash2(x, y, 21) - 0.5) * 30; return px(shift(grassBase, n)); }
    if (y === 3 || y === 4) {
      if (hash2(x, y, 22) > 0.45) { const n = (hash2(x, y, 23) - 0.5) * 30; return px(shift(grassBase, n)); }
    }
    const n = (hash2(x, y, 24) - 0.5) * 24;
    const speck = hash2(x, y, 25) > 0.93 ? -22 : 0;
    return px(shift(dirtBase, n + speck));
  };
}
function dirtTile() {
  const base = 0x8b5a2b;
  return (x: number, y: number): RGBA => {
    const n = (hash2(x, y, 31) - 0.5) * 26;
    const speck = hash2(x, y, 32) > 0.92 ? -26 : 0;
    return px(shift(base, n + speck));
  };
}
function stoneTile() {
  const base = 0x8a8a8a;
  return (x: number, y: number): RGBA => {
    const n = (hash2(x, y, 41) - 0.5) * 22;
    const crack = hash2(x, y, 42) > 0.955 ? -34 : 0;
    return px(shift(base, n + crack));
  };
}
function cobbleTile() {
  const base = 0x7d7d7d, dark = 0x5c5c5c, light = 0x9a9a9a;
  return (x: number, y: number): RGBA => {
    const cx = Math.floor(x / 4), cy = Math.floor(y / 4);
    const jx = (hash2(cx, cy, 51) - 0.5) * 2, jy = (hash2(cx, cy, 52) - 0.5) * 2;
    const lx = x - cx * 4 + jx, ly = y - cy * 4 + jy;
    if (lx < 0.8 || ly < 0.8 || lx > 3.2 || ly > 3.2) return px(shift(dark, (hash2(x, y, 53) - 0.5) * 16));
    const r = hash2(cx, cy, 54);
    const cellBase = r > 0.5 ? light : base;
    const n = (hash2(x, y, 55) - 0.5) * 18;
    return px(shift(cellBase, n));
  };
}
function woodTopTile() {
  const base = 0xb08c4f, ring = 0x7a5a2e;
  const cx = 7.5, cy = 7.5;
  return (x: number, y: number): RGBA => {
    const dx = x - cx, dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    const ringN = Math.sin(d * 1.7) * 0.5 + 0.5;
    const n = (hash2(x, y, 61) - 0.5) * 14;
    const c = ringN > 0.62 ? ring : base;
    return px(shift(c, n));
  };
}
function woodSideTile() {
  const base = 0x6e5230, streak = 0x5a4226;
  return (x: number, y: number): RGBA => {
    const s = hash2(x, 0, 71) > 0.6 ? -16 : 0;
    const n = (hash2(x, y, 72) - 0.5) * 12;
    const c = s < 0 ? streak : base;
    return px(shift(c, n + s));
  };
}
function planksTile() {
  const base = 0xb8893f, dark = 0x8a6428;
  return (x: number, y: number): RGBA => {
    const row = Math.floor(y / 4);
    const seamY = y % 4 === 0;
    const offset = (row % 2) * 8;
    const seamX = (x + offset) % 8 === 0;
    const n = (hash2(x, y, 81) - 0.5) * 12;
    if (seamY || seamX) return px(shift(dark, n));
    return px(shift(base, n));
  };
}
function leavesTile() {
  const base = 0x4a8f3a, dark = 0x356b2a, light = 0x62a84a;
  return (x: number, y: number): RGBA => {
    const r = hash2(x, y, 91);
    let c = base;
    if (r > 0.78) c = light; else if (r < 0.22) c = dark;
    const n = (hash2(x, y, 92) - 0.5) * 10;
    return px(shift(c, n));
  };
}
function sandTile() {
  const base = 0xe6d7a8;
  return (x: number, y: number): RGBA => {
    const n = (hash2(x, y, 101) - 0.5) * 16;
    const speck = hash2(x, y, 102) > 0.94 ? -18 : 0;
    return px(shift(base, n + speck));
  };
}
function waterTile() {
  const base = 0x3a78e0;
  return (x: number, y: number): RGBA => {
    const n = (hash2(x, y, 111) - 0.5) * 14;
    const wave = Math.sin((x + y) * 0.8) * 8;
    return px(shift(base, n + wave), 205);
  };
}
function glassTile() {
  const frame = 0xbfe6ef;
  return (x: number, y: number): RGBA => {
    if (x === 0 || y === 0 || x === 15 || y === 15) {
      const n = (hash2(x, y, 121) - 0.5) * 16;
      return px(shift(frame, n), 235);
    }
    if (x === 1 && y === 1) return px(shift(0xffffff, 0), 120);
    return px(shift(0xdff3fa, 0), 38);
  };
}
function brickTile() {
  const mortar = 0xcfc4b3, brick = 0x9e4a3a, brickDark = 0x7e3a2c;
  return (x: number, y: number): RGBA => {
    const row = Math.floor(y / 4);
    const offset = (row % 2) * 4;
    const inMortarY = y % 4 === 0;
    const inMortarX = (x + offset) % 8 === 0;
    const n = (hash2(x, y, 131) - 0.5) * 14;
    if (inMortarY || inMortarX) return px(shift(mortar, n));
    const r = hash2(x, y, 132);
    const c = r > 0.85 ? brickDark : brick;
    return px(shift(c, n));
  };
}
function snowTile() {
  const base = 0xf4f6f8;
  return (x: number, y: number): RGBA => {
    const n = (hash2(x, y, 141) - 0.5) * 10;
    const speck = hash2(x, y, 142) > 0.95 ? -14 : 0;
    return px(shift(base, n + speck));
  };
}
function bedrockTile() {
  const base = 0x4a4a4a, dark = 0x2c2c2c, light = 0x6a6a6a;
  return (x: number, y: number): RGBA => {
    const r = hash2(x, y, 151);
    const c = r > 0.7 ? light : r < 0.3 ? dark : base;
    const n = (hash2(x, y, 152) - 0.5) * 14;
    return px(shift(c, n));
  };
}

let cachedAtlas: THREE.Texture | null = null;

export function getAtlasTexture(): THREE.Texture {
  if (cachedAtlas) return cachedAtlas;
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_PX;
  canvas.height = ATLAS_PX;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(ATLAS_PX, ATLAS_PX);
  const data = img.data;

  const tiles: { idx: number; fn: (x: number, y: number) => RGBA }[] = [
    { idx: TileIndex.GRASS_TOP, fn: grassTop() },
    { idx: TileIndex.GRASS_SIDE, fn: grassSide() },
    { idx: TileIndex.DIRT, fn: dirtTile() },
    { idx: TileIndex.STONE, fn: stoneTile() },
    { idx: TileIndex.COBBLE, fn: cobbleTile() },
    { idx: TileIndex.WOOD_TOP, fn: woodTopTile() },
    { idx: TileIndex.WOOD_SIDE, fn: woodSideTile() },
    { idx: TileIndex.PLANKS, fn: planksTile() },
    { idx: TileIndex.LEAVES, fn: leavesTile() },
    { idx: TileIndex.SAND, fn: sandTile() },
    { idx: TileIndex.WATER, fn: waterTile() },
    { idx: TileIndex.GLASS, fn: glassTile() },
    { idx: TileIndex.BRICK, fn: brickTile() },
    { idx: TileIndex.SNOW, fn: snowTile() },
    { idx: TileIndex.BEDROCK, fn: bedrockTile() },
  ];

  for (const t of tiles) {
    const col = t.idx % ATLAS_COLS;
    const row = Math.floor(t.idx / ATLAS_COLS);
    drawTile(data, col, row, t.fn);
  }

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) {
      data[i] = 255; data[i + 1] = 0; data[i + 2] = 255; data[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  cachedAtlas = tex;
  return tex;
}

export function tileUV(tileIndex: number): { u0: number; v0: number; u1: number; v1: number } {
  const col = tileIndex % ATLAS_COLS;
  const row = Math.floor(tileIndex / ATLAS_COLS);
  const inset = 0.5 / ATLAS_PX;
  const u0 = col / ATLAS_COLS + inset;
  const u1 = (col + 1) / ATLAS_COLS - inset;
  const v1 = 1 - row / ATLAS_ROWS - inset;
  const v0 = 1 - (row + 1) / ATLAS_ROWS + inset;
  return { u0, v0, u1, v1 };
}

const tileDataURLCache = new Map<number, string>();
export function tileDataURL(tileIndex: number, scale = 1): string {
  const key = tileIndex * 100 + scale;
  const cached = tileDataURLCache.get(key);
  if (cached) return cached;
  const size = TILE_SIZE * scale;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const atlasTex = getAtlasTexture();
  const atlasCanvas = (atlasTex as THREE.CanvasTexture).image as HTMLCanvasElement;
  const col = tileIndex % ATLAS_COLS;
  const row = Math.floor(tileIndex / ATLAS_COLS);
  ctx.drawImage(atlasCanvas, col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE, 0, 0, size, size);
  const url = canvas.toDataURL();
  tileDataURLCache.set(key, url);
  return url;
}

export function tileForBlockSide(blockType: number): number {
  return tileForBlock(blockType, 5);
}
