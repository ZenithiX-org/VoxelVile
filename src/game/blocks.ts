// Block definitions + procedurally generated pixel-art texture atlas.
import { mulberry32 } from './noise';

export const TILE_PX = 32; // pixels per atlas tile
export const ATLAS_COLS = 8;
export const ATLAS_PX = TILE_PX * ATLAS_COLS;
const R = 16; // logical pixel-art resolution of a tile
const S = TILE_PX / R;

class TilePainter {
  rnd: () => number;
  constructor(private ctx: CanvasRenderingContext2D, private ox: number, private oy: number, seed: number) {
    this.rnd = mulberry32(seed);
  }
  px(x: number, y: number, c: string) {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(this.ox + x * S, this.oy + y * S, S, S);
  }
  clearPx(x: number, y: number) {
    this.ctx.clearRect(this.ox + x * S, this.oy + y * S, S, S);
  }
  fill(c: string) {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(this.ox, this.oy, TILE_PX, TILE_PX);
  }
  noise(colors: string[]) {
    for (let y = 0; y < R; y++)
      for (let x = 0; x < R; x++) this.px(x, y, colors[(this.rnd() * colors.length) | 0]);
  }
  pick(colors: string[]) {
    return colors[(this.rnd() * colors.length) | 0];
  }
  blobs(count: number, colors: string[], minR = 1, maxR = 3) {
    for (let i = 0; i < count; i++) {
      const cx = (this.rnd() * R) | 0;
      const cy = (this.rnd() * R) | 0;
      const rad = minR + this.rnd() * (maxR - minR);
      const c = this.pick(colors);
      for (let y = -Math.ceil(rad); y <= Math.ceil(rad); y++)
        for (let x = -Math.ceil(rad); x <= Math.ceil(rad); x++) {
          if (x * x + y * y > rad * rad) continue;
          this.px((cx + x + R) % R, (cy + y + R) % R, c);
        }
    }
  }
}

type Painter = (p: TilePainter) => void;

const GRASS_G = ['#6aa841', '#75b348', '#5f9a3a', '#7cbb4d', '#569033'];
const DIRT_C = ['#8a6141', '#7c5738', '#96694a', '#6f4d31', '#8f6444'];
const STONE_C = ['#8f8f8f', '#868686', '#9a9a9a', '#7d7d7d', '#939393'];
const SAND_C = ['#e3d6a4', '#dbcd96', '#ece0b2', '#d4c58c'];
const SNOW_C = ['#f4f8fd', '#eaf1fa', '#ffffff', '#e2ebf6'];

// --- individual tile painters -------------------------------------------------
const tiles: Painter[] = [];
const T: Record<string, number> = {};
function tile(name: string, painter: Painter) {
  T[name] = tiles.length;
  tiles.push(painter);
}

tile('grass_top', (p) => {
  p.noise(GRASS_G);
  p.blobs(10, ['#588f34', '#81c153'], 0.8, 1.8);
});
tile('grass_side', (p) => {
  p.noise(DIRT_C);
  for (let x = 0; x < R; x++) {
    const h = 3 + ((p.rnd() * 3) | 0);
    for (let y = 0; y < h; y++) p.px(x, y, p.pick(GRASS_G));
  }
});
tile('dirt', (p) => {
  p.noise(DIRT_C);
  p.blobs(6, ['#6f4d31', '#9c7051'], 0.8, 1.6);
});
tile('stone', (p) => {
  p.noise(STONE_C);
  p.blobs(7, ['#7a7a7a', '#a0a0a0'], 1, 2.2);
});
tile('cobble', (p) => {
  p.fill('#6d6d6d');
  const cells = [
    [0, 0, 7, 5], [8, 0, 7, 7], [0, 6, 4, 4], [5, 6, 5, 4], [11, 8, 4, 3],
    [0, 11, 6, 4], [7, 11, 8, 4], [11, 3, 4, 4],
  ];
  for (const [x, y, w, h] of cells) {
    const base = p.pick(['#9a9a9a', '#8d8d8d', '#a5a5a5']);
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        if (x + i >= R || y + j >= R) continue;
        const edge = i === 0 || j === 0 || i === w - 1 || j === h - 1;
        p.px(x + i, y + j, edge ? '#6f6f6f' : p.rnd() < 0.25 ? '#848484' : base);
      }
  }
});
tile('sand', (p) => {
  p.noise(SAND_C);
  p.blobs(5, ['#cfbf85', '#f0e6bd'], 0.8, 1.5);
});
tile('water', (p) => {
  p.noise(['#3a6fd8', '#3f76e0', '#3568cc', '#4a82e8']);
  for (let i = 0; i < 5; i++) {
    const y = (p.rnd() * R) | 0;
    const x0 = (p.rnd() * R) | 0;
    for (let x = 0; x < 6; x++) p.px((x0 + x) % R, y, '#5f93f0');
  }
});
tile('log_side', (p) => {
  for (let x = 0; x < R; x++) {
    const c = p.pick(['#6b4b2a', '#5d4124', '#775430', '#523920']);
    for (let y = 0; y < R; y++) p.px(x, y, p.rnd() < 0.2 ? '#4a3320' : c);
  }
});
tile('log_top', (p) => {
  p.noise(['#b08a52', '#a37e49', '#bb955c']);
  for (let y = 0; y < R; y++)
    for (let x = 0; x < R; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (Math.abs((d % 3) - 1.5) < 0.6) p.px(x, y, '#7d5c33');
      if (d > 7.2) p.px(x, y, '#5d4124');
    }
});
tile('leaves', (p) => {
  for (let y = 0; y < R; y++)
    for (let x = 0; x < R; x++) {
      if (p.rnd() < 0.14) {
        p.clearPx(x, y);
        continue;
      }
      p.px(x, y, p.pick(['#3f7f2c', '#478f31', '#356e25', '#52a03a', '#2c5f1f']));
    }
});
tile('planks', (p) => {
  p.noise(['#b4854c', '#a87c45', '#bd8f56', '#9f7340']);
  for (let y = 0; y < R; y++) {
    if (y % 4 === 3) for (let x = 0; x < R; x++) p.px(x, y, '#7d5a32');
  }
  for (let i = 0; i < 4; i++) {
    const x = (p.rnd() * R) | 0;
    const y = (p.rnd() * R) | 0;
    p.px(x, y, '#8a642f');
  }
});
tile('brick', (p) => {
  p.fill('#b0aba4');
  for (let row = 0; row < 4; row++) {
    const off = row % 2 === 0 ? 0 : 4;
    for (let b = -1; b < 3; b++) {
      const x0 = b * 8 + off;
      for (let j = 0; j < 3; j++)
        for (let i = 0; i < 7; i++) {
          const x = x0 + i;
          const y = row * 4 + j;
          if (x < 0 || x >= R) continue;
          p.px(x, y, p.pick(['#a04b38', '#95452f', '#ab5541', '#8c3f2c']));
        }
    }
  }
});
tile('glass', (p) => {
  for (let y = 0; y < R; y++)
    for (let x = 0; x < R; x++) {
      const border = x === 0 || y === 0 || x === R - 1 || y === R - 1;
      const inner = x === 1 || y === 1 || x === R - 2 || y === R - 2;
      if (border) p.px(x, y, '#d6ecf5');
      else if (inner) p.px(x, y, 'rgba(210,240,250,0.55)');
      else p.clearPx(x, y);
    }
  for (let i = 0; i < 6; i++) p.px(3 + i, 3 + i, 'rgba(255,255,255,0.75)');
  for (let i = 0; i < 3; i++) p.px(6 + i, 3 + i, 'rgba(255,255,255,0.5)');
});
tile('snow_top', (p) => {
  p.noise(SNOW_C);
  p.blobs(4, ['#dde8f5'], 0.8, 1.4);
});
tile('snow_side', (p) => {
  p.noise(DIRT_C);
  for (let x = 0; x < R; x++) {
    const h = 4 + ((p.rnd() * 2) | 0);
    for (let y = 0; y < h; y++) p.px(x, y, p.pick(SNOW_C));
  }
});
tile('glowstone', (p) => {
  p.noise(['#a9762f', '#b8853a', '#9c6c29']);
  p.blobs(14, ['#ffe27a', '#ffd451', '#fff3b8'], 0.8, 1.6);
});
tile('bedrock', (p) => {
  p.noise(['#4a4a4a', '#3d3d3d', '#565656', '#333333']);
  p.blobs(9, ['#2b2b2b', '#616161'], 1, 2.4);
});
tile('gravel', (p) => {
  p.noise(['#87827d', '#767068', '#948e86', '#6a645d']);
  p.blobs(10, ['#5f5952', '#a09a92'], 0.8, 1.7);
});
tile('coal_ore', (p) => {
  p.noise(STONE_C);
  p.blobs(5, ['#232323', '#111111'], 1.1, 2);
});
tile('iron_ore', (p) => {
  p.noise(STONE_C);
  p.blobs(5, ['#d0a07a', '#b98860'], 1, 1.8);
});
tile('gold_ore', (p) => {
  p.noise(STONE_C);
  p.blobs(5, ['#f2cf4a', '#d9ae2e'], 1, 1.7);
});
tile('obsidian', (p) => {
  p.noise(['#17121f', '#1d1729', '#241c33', '#100c18']);
  p.blobs(6, ['#3a2d52'], 0.6, 1.2);
});
tile('tall_grass', (p) => {
  for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) p.clearPx(x, y);
  for (let b = 0; b < 7; b++) {
    const x = 1 + ((p.rnd() * 14) | 0);
    const h = 6 + ((p.rnd() * 8) | 0);
    const c = p.pick(['#4f9130', '#5da53a', '#438025']);
    for (let y = 0; y < h; y++) {
      const xx = x + (y > h - 3 ? (p.rnd() < 0.5 ? 1 : -1) : 0);
      if (xx >= 0 && xx < R) p.px(xx, R - 1 - y, c);
    }
  }
});
function flower(stemTop: number, petals: string[], center: string): Painter {
  return (p) => {
    for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) p.clearPx(x, y);
    for (let y = stemTop; y < R; y++) p.px(7, y, '#3f7a28');
    p.px(6, stemTop + 3, '#4f9130');
    p.px(9, stemTop + 5, '#4f9130');
    const shape = [
      [6, 0], [7, 0], [8, 0], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1],
      [5, 2], [6, 2], [8, 2], [9, 2], [6, 3], [7, 3], [8, 3],
    ];
    for (const [x, y] of shape) p.px(x, stemTop - 4 + y, p.pick(petals));
    p.px(7, stemTop - 2, center);
  };
}
tile('rose', flower(8, ['#d6392f', '#e84a3c', '#bc2b23'], '#f5d24a'));
tile('dandelion', flower(8, ['#f2cd3a', '#ffe15c', '#dbb52a'], '#fff3b0'));
function wool(colors: string[]): Painter {
  return (p) => {
    p.noise(colors);
    for (let i = 0; i < 26; i++) {
      const x = (p.rnd() * R) | 0;
      const y = (p.rnd() * R) | 0;
      p.px(x, y, p.pick(colors));
      p.px((x + 1) % R, y, p.pick(colors));
    }
  };
}
tile('wool_white', wool(['#e9ecef', '#dfe3e8', '#f4f6f8']));
tile('wool_red', wool(['#b93b32', '#a8332b', '#c9453b']));
tile('wool_blue', wool(['#3559a8', '#2d4d96', '#4267bb']));
tile('wool_yellow', wool(['#e0bb35', '#d0ac2c', '#eec947']));
tile('wool_black', wool(['#25262b', '#1d1e22', '#2e3036']));
tile('pumpkin_side', (p) => {
  p.noise(['#d97b21', '#c96f1c', '#e5862b']);
  for (let x = 0; x < R; x += 4) for (let y = 0; y < R; y++) p.px(x, y, '#a9591a');
  const face = [
    [4, 5], [5, 5], [5, 6], [4, 6], [10, 5], [11, 5], [10, 6], [11, 6],
    [4, 10], [5, 11], [6, 11], [7, 11], [8, 11], [9, 11], [10, 11], [11, 10],
    [5, 9], [10, 9], [7, 10], [8, 10],
  ];
  for (const [x, y] of face) p.px(x, y, '#3a2410');
});
tile('pumpkin_top', (p) => {
  p.noise(['#d97b21', '#c96f1c']);
  p.blobs(3, ['#6f4a18'], 1, 2);
});

export const TILES = T;

let atlasCanvas: HTMLCanvasElement | null = null;
export function getAtlasCanvas(): HTMLCanvasElement {
  if (atlasCanvas) return atlasCanvas;
  const c = document.createElement('canvas');
  c.width = ATLAS_PX;
  c.height = ATLAS_PX;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  tiles.forEach((painter, i) => {
    const ox = (i % ATLAS_COLS) * TILE_PX;
    const oy = Math.floor(i / ATLAS_COLS) * TILE_PX;
    painter(new TilePainter(ctx, ox, oy, 9871 + i * 7919));
  });
  atlasCanvas = c;
  return c;
}

// --- blocks -------------------------------------------------------------------
export const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  COBBLE: 4,
  SAND: 5,
  WATER: 6,
  LOG: 7,
  LEAVES: 8,
  PLANKS: 9,
  BRICK: 10,
  GLASS: 11,
  SNOW: 12,
  GLOWSTONE: 13,
  BEDROCK: 14,
  GRAVEL: 15,
  COAL_ORE: 16,
  IRON_ORE: 17,
  GOLD_ORE: 18,
  OBSIDIAN: 19,
  TALL_GRASS: 20,
  ROSE: 21,
  DANDELION: 22,
  WOOL_WHITE: 23,
  WOOL_RED: 24,
  WOOL_BLUE: 25,
  WOOL_YELLOW: 26,
  WOOL_BLACK: 27,
  PUMPKIN: 28,
} as const;

export type BlockId = number;

export interface BlockDef {
  id: number;
  name: string;
  top: number;
  side: number;
  bottom: number;
  /** blocks movement */
  solid: boolean;
  /** hides neighbouring faces */
  opaque: boolean;
  render: 'cube' | 'cross' | 'liquid';
  /** average colour, used for particles and UI */
  color: string;
  light?: number;
}

function def(
  id: number,
  name: string,
  tilesSpec: number | [number, number] | [number, number, number],
  extra: Partial<BlockDef> = {},
): BlockDef {
  let top: number, side: number, bottom: number;
  if (typeof tilesSpec === 'number') top = side = bottom = tilesSpec;
  else if (tilesSpec.length === 2) {
    top = tilesSpec[0];
    side = tilesSpec[1];
    bottom = tilesSpec[1];
  } else {
    top = tilesSpec[0];
    side = tilesSpec[1];
    bottom = tilesSpec[2];
  }
  return {
    id, name, top, side, bottom,
    solid: true, opaque: true, render: 'cube', color: '#888888',
    ...extra,
  };
}

export const BLOCKS: BlockDef[] = [];
function reg(b: BlockDef) {
  BLOCKS[b.id] = b;
}

reg(def(BLOCK.AIR, 'Air', 0, { solid: false, opaque: false, color: 'transparent' }));
reg(def(BLOCK.GRASS, 'Grass Block', [T.grass_top, T.grass_side, T.dirt], { color: '#6aa841' }));
reg(def(BLOCK.DIRT, 'Dirt', T.dirt, { color: '#8a6141' }));
reg(def(BLOCK.STONE, 'Stone', T.stone, { color: '#8f8f8f' }));
reg(def(BLOCK.COBBLE, 'Cobblestone', T.cobble, { color: '#7d7d7d' }));
reg(def(BLOCK.SAND, 'Sand', T.sand, { color: '#e3d6a4' }));
reg(def(BLOCK.WATER, 'Water', T.water, {
  solid: false, opaque: false, render: 'liquid', color: '#3a6fd8',
}));
reg(def(BLOCK.LOG, 'Oak Log', [T.log_top, T.log_side], { color: '#6b4b2a' }));
reg(def(BLOCK.LEAVES, 'Leaves', T.leaves, { opaque: false, color: '#3f7f2c' }));
reg(def(BLOCK.PLANKS, 'Oak Planks', T.planks, { color: '#b4854c' }));
reg(def(BLOCK.BRICK, 'Bricks', T.brick, { color: '#a04b38' }));
reg(def(BLOCK.GLASS, 'Glass', T.glass, { opaque: false, color: '#cfe9f5' }));
reg(def(BLOCK.SNOW, 'Snow Block', [T.snow_top, T.snow_side, T.dirt], { color: '#f4f8fd' }));
reg(def(BLOCK.GLOWSTONE, 'Glowstone', T.glowstone, { color: '#ffd451', light: 1 }));
reg(def(BLOCK.BEDROCK, 'Bedrock', T.bedrock, { color: '#3d3d3d' }));
reg(def(BLOCK.GRAVEL, 'Gravel', T.gravel, { color: '#87827d' }));
reg(def(BLOCK.COAL_ORE, 'Coal Ore', T.coal_ore, { color: '#5a5a5a' }));
reg(def(BLOCK.IRON_ORE, 'Iron Ore', T.iron_ore, { color: '#b98860' }));
reg(def(BLOCK.GOLD_ORE, 'Gold Ore', T.gold_ore, { color: '#d9ae2e' }));
reg(def(BLOCK.OBSIDIAN, 'Obsidian', T.obsidian, { color: '#1d1729' }));
reg(def(BLOCK.TALL_GRASS, 'Tall Grass', T.tall_grass, {
  solid: false, opaque: false, render: 'cross', color: '#4f9130',
}));
reg(def(BLOCK.ROSE, 'Rose', T.rose, {
  solid: false, opaque: false, render: 'cross', color: '#d6392f',
}));
reg(def(BLOCK.DANDELION, 'Dandelion', T.dandelion, {
  solid: false, opaque: false, render: 'cross', color: '#f2cd3a',
}));
reg(def(BLOCK.WOOL_WHITE, 'White Wool', T.wool_white, { color: '#e9ecef' }));
reg(def(BLOCK.WOOL_RED, 'Red Wool', T.wool_red, { color: '#b93b32' }));
reg(def(BLOCK.WOOL_BLUE, 'Blue Wool', T.wool_blue, { color: '#3559a8' }));
reg(def(BLOCK.WOOL_YELLOW, 'Yellow Wool', T.wool_yellow, { color: '#e0bb35' }));
reg(def(BLOCK.WOOL_BLACK, 'Black Wool', T.wool_black, { color: '#25262b' }));
reg(def(BLOCK.PUMPKIN, 'Pumpkin', [T.pumpkin_top, T.pumpkin_side], { color: '#d97b21' }));

export const isOpaque = (id: number) => BLOCKS[id]?.opaque ?? false;
export const isSolid = (id: number) => BLOCKS[id]?.solid ?? false;
export const isLiquid = (id: number) => BLOCKS[id]?.render === 'liquid';
export const isCross = (id: number) => BLOCKS[id]?.render === 'cross';

/** Blocks available in the creative inventory, in display order. */
export const PALETTE: number[] = [
  BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.COBBLE, BLOCK.SAND, BLOCK.GRAVEL,
  BLOCK.LOG, BLOCK.PLANKS, BLOCK.LEAVES, BLOCK.BRICK, BLOCK.GLASS, BLOCK.SNOW,
  BLOCK.GLOWSTONE, BLOCK.OBSIDIAN, BLOCK.COAL_ORE, BLOCK.IRON_ORE, BLOCK.GOLD_ORE, BLOCK.BEDROCK,
  BLOCK.WOOL_WHITE, BLOCK.WOOL_RED, BLOCK.WOOL_BLUE, BLOCK.WOOL_YELLOW, BLOCK.WOOL_BLACK, BLOCK.PUMPKIN,
  BLOCK.TALL_GRASS, BLOCK.ROSE, BLOCK.DANDELION, BLOCK.WATER,
];

// --- UI icons -----------------------------------------------------------------
function tintedTile(tileIndex: number, darken: number): HTMLCanvasElement {
  const atlas = getAtlasCanvas();
  const c = document.createElement('canvas');
  c.width = TILE_PX;
  c.height = TILE_PX;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const sx = (tileIndex % ATLAS_COLS) * TILE_PX;
  const sy = Math.floor(tileIndex / ATLAS_COLS) * TILE_PX;
  ctx.drawImage(atlas, sx, sy, TILE_PX, TILE_PX, 0, 0, TILE_PX, TILE_PX);
  if (darken > 0) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(0,0,0,${darken})`;
    ctx.fillRect(0, 0, TILE_PX, TILE_PX);
    ctx.globalCompositeOperation = 'source-over';
  }
  return c;
}

const iconCache = new Map<number, string>();
/** Isometric cube icon for the hotbar / inventory. */
export function blockIcon(id: number, size = 64): string {
  const cached = iconCache.get(id);
  if (cached) return cached;
  const b = BLOCKS[id];
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  if (!b) return '';

  if (b.render === 'cross') {
    ctx.drawImage(tintedTile(b.side, 0), size * 0.08, size * 0.08, size * 0.84, size * 0.84);
  } else {
    const w = size * 0.84;
    const hw = w / 2;
    const qh = w / 4;
    const cx = size / 2;
    const y0 = size * 0.06;
    const Lx = cx - hw, Ly = y0 + qh;
    const Tx = cx, Ty = y0;
    const Bx = cx, By = y0 + 2 * qh;
    const Rx = cx + hw, Ry = y0 + qh;
    const fh = w * 0.5;
    const top = tintedTile(b.top, 0);
    const left = tintedTile(b.side, 0.22);
    const right = tintedTile(b.side, 0.4);
    // top face
    ctx.setTransform((Tx - Lx) / TILE_PX, (Ty - Ly) / TILE_PX, (Bx - Lx) / TILE_PX, (By - Ly) / TILE_PX, Lx, Ly);
    ctx.drawImage(top, 0, 0);
    // left face
    ctx.setTransform((Bx - Lx) / TILE_PX, (By - Ly) / TILE_PX, 0, fh / TILE_PX, Lx, Ly);
    ctx.drawImage(left, 0, 0);
    // right face
    ctx.setTransform((Rx - Bx) / TILE_PX, (Ry - By) / TILE_PX, 0, fh / TILE_PX, Bx, By);
    ctx.drawImage(right, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  const url = c.toDataURL();
  iconCache.set(id, url);
  return url;
}
