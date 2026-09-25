// Voxel world: chunk storage, terrain generation, meshing and raycasting.
import * as THREE from 'three';
import { BLOCK, BLOCKS, isCross, isOpaque, isSolid, ATLAS_COLS, TILE_PX, ATLAS_PX } from './blocks';
import { Perlin, hash2 } from './noise';

export const CX = 16;
export const CZ = 16;
export const WORLD_H = 96;
export const SEA_LEVEL = 33;

const PW = CX + 2; // padded width
const PH = WORLD_H + 2;

export const chunkKey = (cx: number, cz: number) => cx * 4194304 + cz;

export class Chunk {
  blocks = new Uint8Array(CX * WORLD_H * CZ);
  height = new Uint8Array(CX * CZ); // first y with open sky
  topY = 0; // highest non-air block, lets the mesher skip empty sky
  generated = false;
  dirty = true;
  mesh: THREE.Mesh | null = null;
  waterMesh: THREE.Mesh | null = null;
  edited = false;
  constructor(public cx: number, public cz: number) {}

  idx(x: number, y: number, z: number) {
    return (y * CZ + z) * CX + x;
  }
  get(x: number, y: number, z: number) {
    if (y < 0 || y >= WORLD_H) return 0;
    return this.blocks[(y * CZ + z) * CX + x];
  }
  set(x: number, y: number, z: number, id: number) {
    this.blocks[(y * CZ + z) * CX + x] = id;
  }
  recalcColumn(x: number, z: number) {
    let h = 0;
    for (let y = WORLD_H - 1; y >= 0; y--) {
      const b = this.blocks[(y * CZ + z) * CX + x];
      if (b !== 0 && isOpaque(b)) {
        h = y + 1;
        break;
      }
    }
    this.height[z * CX + x] = h;
  }
  recalcHeights() {
    for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) this.recalcColumn(x, z);
    let top = 0;
    outer: for (let y = WORLD_H - 1; y >= 0; y--) {
      const base = y * CZ * CX;
      for (let i = 0; i < CX * CZ; i++) {
        if (this.blocks[base + i] !== 0) {
          top = y;
          break outer;
        }
      }
    }
    this.topY = top;
  }
}

export interface RaycastHit {
  x: number; y: number; z: number;
  nx: number; ny: number; nz: number;
  block: number;
  distance: number;
}

// face data, flattened for speed: +X, -X, +Y, -Y, +Z, -Z
const FN = new Int8Array([1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1]);
const FB = new Int8Array([1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0]);
const FU = new Int8Array([0, 0, -1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, -1, 0, 0]);
const FV = new Int8Array([0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0]);
const FS = new Float32Array([0.74, 0.74, 1.0, 0.5, 0.88, 0.88]);

// per block-id lookup tables (much faster than object property access in the mesher)
const MAXID = 256;
const OPAQUE = new Uint8Array(MAXID);
const RENDER = new Uint8Array(MAXID); // 0 = cube, 1 = cross, 2 = liquid
const TTOP = new Uint8Array(MAXID);
const TSIDE = new Uint8Array(MAXID);
const TBOTTOM = new Uint8Array(MAXID);
const EMITS = new Uint8Array(MAXID);
for (let i = 0; i < MAXID; i++) {
  const b = BLOCKS[i];
  if (!b) continue;
  OPAQUE[i] = b.opaque ? 1 : 0;
  RENDER[i] = b.render === 'cross' ? 1 : b.render === 'liquid' ? 2 : 0;
  TTOP[i] = b.top;
  TSIDE[i] = b.side;
  TBOTTOM[i] = b.bottom;
  EMITS[i] = b.light ? 1 : 0;
}

const AO_LEVELS = [0.42, 0.62, 0.81, 1.0];
const INSET = 0.5 / ATLAS_PX;
const TILE_UV = TILE_PX / ATLAS_PX;
const CAP = 120000; // max vertices per chunk mesh
const WCAP = 24000;

export class World {
  chunks = new Map<number, Chunk>();
  edits = new Map<number, Map<number, number>>();
  private terrain: Perlin;
  private hills: Perlin;
  private mountain: Perlin;
  private temp: Perlin;
  private cave: Perlin;
  private cave2: Perlin;
  private ore: Perlin;
  private padded = new Uint8Array(PW * PH * PW);
  private padH = new Int16Array(PW * PW);
  // reusable meshing scratch buffers
  private sPos = new Float32Array(CAP * 3);
  private sNor = new Float32Array(CAP * 3);
  private sUv = new Float32Array(CAP * 2);
  private sCol = new Float32Array(CAP * 3);
  private sIdx = new Uint32Array(CAP * 2);
  private wPos = new Float32Array(WCAP * 3);
  private wNor = new Float32Array(WCAP * 3);
  private wUv = new Float32Array(WCAP * 2);
  private wCol = new Float32Array(WCAP * 3);
  private wIdx = new Uint32Array(WCAP * 2);

  constructor(public seed: number) {
    this.terrain = new Perlin(seed);
    this.hills = new Perlin(seed + 1337);
    this.mountain = new Perlin(seed + 7717);
    this.temp = new Perlin(seed + 4242);
    this.cave = new Perlin(seed + 909);
    this.cave2 = new Perlin(seed + 5150);
    this.ore = new Perlin(seed + 60613);
  }

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cz));
  }

  // ---- terrain ---------------------------------------------------------------
  heightAt(x: number, z: number): number {
    // large scale land / ocean shaping
    const continent = this.terrain.fbm2(x * 0.0018, z * 0.0018, 4) * 2.7;
    const hills = this.hills.fbm2(x * 0.011, z * 0.011, 4) * 2.7;
    const m = this.mountain.fbm2(x * 0.0013, z * 0.0013, 3) * 2.7;
    const mm = Math.max(0, Math.min(1, (m - 0.25) / 0.75));
    let h = SEA_LEVEL + 2 + continent * 15 + hills * 5.5;
    h += mm * mm * 42;
    h += this.hills.noise2(x * 0.07, z * 0.07) * 1.1;
    return Math.max(2, Math.min(WORLD_H - 12, Math.round(h)));
  }

  private tempAt(x: number, z: number) {
    return this.temp.fbm2(x * 0.0016, z * 0.0016, 2);
  }

  generateChunk(cx: number, cz: number): Chunk {
    const existing = this.getChunk(cx, cz);
    if (existing && existing.generated) return existing;
    const chunk = existing ?? new Chunk(cx, cz);
    const ox = cx * CX;
    const oz = cz * CZ;
    const blocks = chunk.blocks;

    for (let z = 0; z < CZ; z++) {
      for (let x = 0; x < CX; x++) {
        const wx = ox + x;
        const wz = oz + z;
        const h = this.heightAt(wx, wz);
        const t = this.tempAt(wx, wz);
        const desert = t > 0.22 && h < SEA_LEVEL + 12;
        const snowy = h > 56 || t < -0.42;
        for (let y = 0; y <= Math.max(h, SEA_LEVEL); y++) {
          let id = 0;
          if (y === 0) id = BLOCK.BEDROCK;
          else if (y <= 2 && hash2(wx, wz * 31 + y, 77) < 0.55) id = BLOCK.BEDROCK;
          else if (y < h - 4) id = BLOCK.STONE;
          else if (y < h) id = desert ? BLOCK.SAND : BLOCK.DIRT;
          else if (y === h) {
            if (h <= SEA_LEVEL + 1) id = BLOCK.SAND;
            else if (desert) id = BLOCK.SAND;
            else if (snowy) id = BLOCK.SNOW;
            else id = BLOCK.GRASS;
          } else if (y <= SEA_LEVEL) id = BLOCK.WATER;

          // caves
          if (id === BLOCK.STONE || ((id === BLOCK.DIRT || id === BLOCK.SAND) && y < h - 1)) {
            if (y > 1 && y < h - 1) {
              const c1 = this.cave.noise3(wx * 0.045, y * 0.07, wz * 0.045);
              if (Math.abs(c1) < 0.055) {
                const c2 = this.cave2.noise3(wx * 0.045, y * 0.07, wz * 0.045);
                if (Math.abs(c2) < 0.075) id = 0;
              }
            }
          }
          // ores (single noise lookup, sliced into bands)
          if (id === BLOCK.STONE && y < h - 1) {
            const n = this.ore.noise3(wx * 0.19, y * 0.19, wz * 0.19);
            if (n > 0.64) id = y < 52 ? BLOCK.COAL_ORE : BLOCK.STONE;
            else if (n < -0.66) id = y < 36 ? BLOCK.IRON_ORE : BLOCK.GRAVEL;
            else if (n > 0.52 && y > 4 && y < 24) id = BLOCK.GRAVEL;
            else if (y < 16 && n > 0.44 && n < 0.47) id = BLOCK.GOLD_ORE;
          }
          if (id) blocks[(y * CZ + z) * CX + x] = id;
        }

        // surface decoration
        if (h > SEA_LEVEL + 1 && blocks[(h * CZ + z) * CX + x] === BLOCK.GRASS) {
          const r = hash2(wx, wz, 991);
          if (r < 0.1) blocks[((h + 1) * CZ + z) * CX + x] = BLOCK.TALL_GRASS;
          else if (r < 0.108) blocks[((h + 1) * CZ + z) * CX + x] = BLOCK.ROSE;
          else if (r < 0.116) blocks[((h + 1) * CZ + z) * CX + x] = BLOCK.DANDELION;
          else if (r < 0.1175) blocks[((h + 1) * CZ + z) * CX + x] = BLOCK.PUMPKIN;
        }
      }
    }

    // trees (may originate in neighbouring columns and spill into this chunk)
    for (let z = -3; z < CZ + 3; z++) {
      for (let x = -3; x < CX + 3; x++) {
        const wx = ox + x;
        const wz = oz + z;
        const r = hash2(wx, wz, 3301);
        if (r > 0.008) continue;
        // forests are patchy: dense woodland here, lone trees on the plains
        const forest = this.temp.fbm2(wx * 0.0042 + 500, wz * 0.0042 - 200, 2) * 2.7;
        const density = 0.0007 + Math.max(0, forest) * 0.0075;
        if (r > density) continue;
        const h = this.heightAt(wx, wz);
        if (h <= SEA_LEVEL + 1 || h > 56) continue;
        const t = this.tempAt(wx, wz);
        if (t > 0.22) continue; // no trees in deserts
        const trunk = 4 + Math.floor(hash2(wx, wz, 55) * 3);
        const top = h + trunk;
        // canopy
        for (let dy = -2; dy <= 1; dy++) {
          const ly = top + dy;
          const rad = dy <= -1 ? 2 : dy === 0 ? 2 : 1;
          for (let dz = -rad; dz <= rad; dz++)
            for (let dx = -rad; dx <= rad; dx++) {
              if (Math.abs(dx) === rad && Math.abs(dz) === rad && (dy >= 0 || hash2(wx + dx, wz + dz, ly) < 0.5))
                continue;
              const bx = x + dx;
              const bz = z + dz;
              if (bx < 0 || bx >= CX || bz < 0 || bz >= CZ || ly < 0 || ly >= WORLD_H) continue;
              const i = (ly * CZ + bz) * CX + bx;
              if (blocks[i] === 0) blocks[i] = BLOCK.LEAVES;
            }
        }
        for (let y = h; y < top; y++) {
          if (x < 0 || x >= CX || z < 0 || z >= CZ || y >= WORLD_H) continue;
          blocks[(y * CZ + z) * CX + x] = BLOCK.LOG;
        }
      }
    }

    // re-apply player edits
    const edits = this.edits.get(chunkKey(cx, cz));
    if (edits) {
      for (const [i, id] of edits) blocks[i] = id;
      chunk.edited = true;
    }

    chunk.generated = true;
    chunk.dirty = true;
    chunk.recalcHeights();
    this.chunks.set(chunkKey(cx, cz), chunk);
    return chunk;
  }

  // ---- block access ----------------------------------------------------------
  getBlock(x: number, y: number, z: number): number {
    if (y < 0 || y >= WORLD_H) return 0;
    const cx = x >> 4;
    const cz = z >> 4;
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c || !c.generated) return 0;
    return c.blocks[(y * CZ + (z - cz * CZ)) * CX + (x - cx * CX)];
  }

  isSolidAt(x: number, y: number, z: number): boolean {
    return isSolid(this.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)));
  }

  getSkyHeight(x: number, z: number): number {
    const cx = x >> 4;
    const cz = z >> 4;
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c) return 0;
    return c.height[(z - cz * CZ) * CX + (x - cx * CX)];
  }

  setBlock(x: number, y: number, z: number, id: number): boolean {
    if (y < 0 || y >= WORLD_H) return false;
    const cx = x >> 4;
    const cz = z >> 4;
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c || !c.generated) return false;
    const lx = x - cx * CX;
    const lz = z - cz * CZ;
    const i = (y * CZ + lz) * CX + lx;
    if (c.blocks[i] === id) return false;
    c.blocks[i] = id;
    c.dirty = true;
    c.edited = true;
    if (id !== 0 && y > c.topY) c.topY = y;
    c.recalcColumn(lx, lz);
    let e = this.edits.get(chunkKey(cx, cz));
    if (!e) {
      e = new Map();
      this.edits.set(chunkKey(cx, cz), e);
    }
    e.set(i, id);
    // dirty neighbours when touching a chunk border
    const mark = (ncx: number, ncz: number) => {
      const n = this.chunks.get(chunkKey(ncx, ncz));
      if (n) n.dirty = true;
    };
    if (lx === 0) mark(cx - 1, cz);
    if (lx === CX - 1) mark(cx + 1, cz);
    if (lz === 0) mark(cx, cz - 1);
    if (lz === CZ - 1) mark(cx, cz + 1);
    if (lx === 0 && lz === 0) mark(cx - 1, cz - 1);
    if (lx === 0 && lz === CZ - 1) mark(cx - 1, cz + 1);
    if (lx === CX - 1 && lz === 0) mark(cx + 1, cz - 1);
    if (lx === CX - 1 && lz === CZ - 1) mark(cx + 1, cz + 1);
    return true;
  }

  // ---- meshing ---------------------------------------------------------------
  private fillPadded(cx: number, cz: number) {
    const pad = this.padded;
    pad.fill(0);
    const padH = this.padH;
    padH.fill(0);
    const ox = cx * CX;
    const oz = cz * CZ;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.getChunk(cx + dx, cz + dz);
        if (!c || !c.generated) continue;
        const cox = (cx + dx) * CX;
        const coz = (cz + dz) * CZ;
        const x0 = Math.max(cox, ox - 1);
        const x1 = Math.min(cox + CX - 1, ox + CX);
        const z0 = Math.max(coz, oz - 1);
        const z1 = Math.min(coz + CZ - 1, oz + CZ);
        if (x0 > x1 || z0 > z1) continue;
        const len = x1 - x0 + 1;
        for (let y = 0; y < WORLD_H; y++) {
          for (let wz = z0; wz <= z1; wz++) {
            const src = (y * CZ + (wz - coz)) * CX + (x0 - cox);
            const dst = ((y + 1) * PW + (wz - oz + 1)) * PW + (x0 - ox + 1);
            pad.set(c.blocks.subarray(src, src + len), dst);
          }
        }
        for (let wz = z0; wz <= z1; wz++) {
          for (let wx = x0; wx <= x1; wx++) {
            padH[(wz - oz + 1) * PW + (wx - ox + 1)] = c.height[(wz - coz) * CX + (wx - cox)];
          }
        }
      }
    }
  }

  /** Build opaque + water geometry for a chunk. Neighbours must be generated. */
  buildGeometry(chunk: Chunk): { solid: THREE.BufferGeometry | null; water: THREE.BufferGeometry | null } {
    this.fillPadded(chunk.cx, chunk.cz);
    const pad = this.padded;
    const padH = this.padH;
    const SP = this.sPos, SN = this.sNor, SU = this.sUv, SC = this.sCol, SI = this.sIdx;
    const WP = this.wPos, WN = this.wNor, WU = this.wUv, WC = this.wCol, WI = this.wIdx;
    let vc = 0, ic = 0, wvc = 0, wic = 0;

    const DX = 1;
    const DZ = PW;
    const DY = PW * PW;

    /** emit one quad; w = 1 writes into the water buffers */
    const quad = (
      w: number,
      px: number, py: number, pz: number,
      ux: number, uy: number, uz: number,
      vx: number, vy: number, vz: number,
      nx: number, ny: number, nz: number,
      tile: number, c0: number, c1: number, c2: number, c3: number,
    ) => {
      const P = w ? WP : SP, N = w ? WN : SN, U = w ? WU : SU, C = w ? WC : SC, I = w ? WI : SI;
      let base = w ? wvc : vc;
      let ii = w ? wic : ic;
      if (base + 4 > (w ? WCAP : CAP)) return;
      const tx = (tile % ATLAS_COLS) * TILE_UV;
      const ty = 1 - ((tile / ATLAS_COLS | 0) + 1) * TILE_UV;
      const u0 = tx + INSET, u1 = tx + TILE_UV - INSET;
      const v0 = ty + INSET, v1 = ty + TILE_UV - INSET;
      const p = base * 3, q = base * 2;
      // corner 0 (0,0)
      P[p] = px; P[p + 1] = py; P[p + 2] = pz;
      // corner 1 (u)
      P[p + 3] = px + ux; P[p + 4] = py + uy; P[p + 5] = pz + uz;
      // corner 2 (u+v)
      P[p + 6] = px + ux + vx; P[p + 7] = py + uy + vy; P[p + 8] = pz + uz + vz;
      // corner 3 (v)
      P[p + 9] = px + vx; P[p + 10] = py + vy; P[p + 11] = pz + vz;
      for (let k = 0; k < 4; k++) {
        N[p + k * 3] = nx; N[p + k * 3 + 1] = ny; N[p + k * 3 + 2] = nz;
      }
      C[p] = c0; C[p + 1] = c0; C[p + 2] = c0;
      C[p + 3] = c1; C[p + 4] = c1; C[p + 5] = c1;
      C[p + 6] = c2; C[p + 7] = c2; C[p + 8] = c2;
      C[p + 9] = c3; C[p + 10] = c3; C[p + 11] = c3;
      U[q] = u0; U[q + 1] = v0;
      U[q + 2] = u1; U[q + 3] = v0;
      U[q + 4] = u1; U[q + 5] = v1;
      U[q + 6] = u0; U[q + 7] = v1;
      if (c0 + c2 > c1 + c3) {
        I[ii] = base; I[ii + 1] = base + 1; I[ii + 2] = base + 2;
        I[ii + 3] = base; I[ii + 4] = base + 2; I[ii + 5] = base + 3;
      } else {
        I[ii] = base + 1; I[ii + 1] = base + 2; I[ii + 2] = base + 3;
        I[ii + 3] = base + 1; I[ii + 4] = base + 3; I[ii + 5] = base;
      }
      base += 4; ii += 6;
      if (w) { wvc = base; wic = ii; } else { vc = base; ic = ii; }
    };

    const topY = Math.min(WORLD_H - 1, chunk.topY);

    for (let y = 0; y <= topY; y++) {
      for (let z = 0; z < CZ; z++) {
        const row = ((y + 1) * PW + (z + 1)) * PW + 1;
        for (let x = 0; x < CX; x++) {
          const id = pad[row + x];
          if (id === 0) continue;
          const kind = RENDER[id];

          if (kind === 1) {
            // cross-shaped plant: two intersecting quads, drawn from both sides
            const dp = padH[(z + 1) * PW + (x + 1)] - y - 1;
            const lit = dp <= 0 ? 1 : Math.max(0.3, 1 - dp * 0.05 - Math.max(0, dp - 6) * 0.05);
            const t = TSIDE[id];
            quad(0, x + 0.15, y, z + 0.15, 0.7, 0, 0.7, 0, 1, 0, -0.7, 0, 0.7, t, lit, lit, lit, lit);
            quad(0, x + 0.85, y, z + 0.85, -0.7, 0, -0.7, 0, 1, 0, 0.7, 0, -0.7, t, lit, lit, lit, lit);
            quad(0, x + 0.15, y, z + 0.85, 0.7, 0, -0.7, 0, 1, 0, 0.7, 0, 0.7, t, lit, lit, lit, lit);
            quad(0, x + 0.85, y, z + 0.15, -0.7, 0, 0.7, 0, 1, 0, -0.7, 0, -0.7, t, lit, lit, lit, lit);
            continue;
          }

          for (let f = 0; f < 6; f++) {
            const f3 = f * 3;
            const fnx = FN[f3], fny = FN[f3 + 1], fnz = FN[f3 + 2];
            const nx = x + fnx, ny = y + fny, nz = z + fnz;
            if (ny < 0) continue;
            const nbase = ((ny + 1) * PW + (nz + 1)) * PW + (nx + 1);
            const nb = pad[nbase] | 0;
            if (OPAQUE[nb]) continue;
            if (nb === id && !OPAQUE[id]) continue;
            if (kind === 2 && RENDER[nb] === 2) continue;

            const ux = FU[f3], uy = FU[f3 + 1], uz = FU[f3 + 2];
            const vx = FV[f3], vy = FV[f3 + 1], vz = FV[f3 + 2];
            const shade = FS[f];

            // sky light of the exposed cell
            const d = padH[(nz + 1) * PW + (nx + 1)] - ny;
            const lit = EMITS[id] || d <= 0
              ? 1
              : Math.max(0.3, 1 - d * 0.05 - Math.max(0, d - 6) * 0.05);

            let a0 = 1, a1 = 1, a2 = 1, a3 = 1;
            if (kind !== 2) {
              const du = ux * DX + uy * DY + uz * DZ;
              const dv = vx * DX + vy * DY + vz * DZ;
              const sum = OPAQUE[pad[nbase - du] | 0];
              const sup = OPAQUE[pad[nbase + du] | 0];
              const svm = OPAQUE[pad[nbase - dv] | 0];
              const svp = OPAQUE[pad[nbase + dv] | 0];
              const cmm = OPAQUE[pad[nbase - du - dv] | 0];
              const cpm = OPAQUE[pad[nbase + du - dv] | 0];
              const cpp = OPAQUE[pad[nbase + du + dv] | 0];
              const cmp = OPAQUE[pad[nbase - du + dv] | 0];
              a0 = sum && svm ? AO_LEVELS[0] : AO_LEVELS[3 - (sum + svm + cmm)];
              a1 = sup && svm ? AO_LEVELS[0] : AO_LEVELS[3 - (sup + svm + cpm)];
              a2 = sup && svp ? AO_LEVELS[0] : AO_LEVELS[3 - (sup + svp + cpp)];
              a3 = sum && svp ? AO_LEVELS[0] : AO_LEVELS[3 - (sum + svp + cmp)];
            }

            const l = shade * lit;
            const tile = fny === 1 ? TTOP[id] : fny === -1 ? TBOTTOM[id] : TSIDE[id];
            const drop = kind === 2 ? (fny === 1 ? 0.12 : 0) : 0;
            const vs = kind === 2 && fny === 0 && vy === 1 ? 0.88 : 1;
            quad(
              kind === 2 ? 1 : 0,
              x + FB[f3] , y + FB[f3 + 1] - drop, z + FB[f3 + 2],
              ux, uy, uz,
              vx * vs, vy * vs, vz * vs,
              fnx, fny, fnz,
              tile, l * a0, l * a1, l * a2, l * a3,
            );
          }
        }
      }
    }

    const make = (
      P: Float32Array, N: Float32Array, U: Float32Array, C: Float32Array, I: Uint32Array,
      nv: number, ni: number,
    ) => {
      if (!ni) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(P.slice(0, nv * 3), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(N.slice(0, nv * 3), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(U.slice(0, nv * 2), 2));
      g.setAttribute('color', new THREE.BufferAttribute(C.slice(0, nv * 3), 3));
      g.setIndex(new THREE.BufferAttribute(I.slice(0, ni), 1));
      g.computeBoundingSphere();
      return g;
    };
    return {
      solid: make(SP, SN, SU, SC, SI, vc, ic),
      water: make(WP, WN, WU, WC, WI, wvc, wic),
    };
  }


  // ---- raycast ---------------------------------------------------------------
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist = 6, liquids = false): RaycastHit | null {
    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);
    const stepX = Math.sign(dir.x) || 1;
    const stepY = Math.sign(dir.y) || 1;
    const stepZ = Math.sign(dir.z) || 1;
    const tDeltaX = Math.abs(1 / (dir.x || 1e-9));
    const tDeltaY = Math.abs(1 / (dir.y || 1e-9));
    const tDeltaZ = Math.abs(1 / (dir.z || 1e-9));
    const distToX = stepX > 0 ? x + 1 - origin.x : origin.x - x;
    const distToY = stepY > 0 ? y + 1 - origin.y : origin.y - y;
    const distToZ = stepZ > 0 ? z + 1 - origin.z : origin.z - z;
    let tMaxX = tDeltaX * distToX;
    let tMaxY = tDeltaY * distToY;
    let tMaxZ = tDeltaZ * distToZ;
    let nx = 0, ny = 0, nz = 0;
    let t = 0;
    while (t <= maxDist) {
      const b = this.getBlock(x, y, z);
      if (b !== 0 && (liquids || BLOCKS[b].render !== 'liquid')) {
        return { x, y, z, nx, ny, nz, block: b, distance: t };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX;
        t = tMaxX;
        tMaxX += tDeltaX;
        nx = -stepX; ny = 0; nz = 0;
      } else if (tMaxY < tMaxZ) {
        y += stepY;
        t = tMaxY;
        tMaxY += tDeltaY;
        nx = 0; ny = -stepY; nz = 0;
      } else {
        z += stepZ;
        t = tMaxZ;
        tMaxZ += tDeltaZ;
        nx = 0; ny = 0; nz = -stepZ;
      }
    }
    return null;
  }

  /** Highest ground level for a column, ignoring trees and plants. */
  surfaceY(x: number, z: number): number {
    for (let y = WORLD_H - 1; y > 0; y--) {
      const b = this.getBlock(x, y, z);
      if (b === BLOCK.LOG || b === BLOCK.LEAVES) continue;
      if (b !== 0 && isSolid(b)) return y + 1;
    }
    return SEA_LEVEL + 1;
  }

  /** True when a player-sized box fits at (x, y, z). */
  isFree(x: number, y: number, z: number): boolean {
    return !isSolid(this.getBlock(x, y, z)) && !isSolid(this.getBlock(x, y + 1, z));
  }
}

export { isCross };
