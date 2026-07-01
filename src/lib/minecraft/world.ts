// World + chunk system: terrain generation, block storage, mesh building.
import { createNoise2D } from "simplex-noise";
import * as THREE from "three";
import { BlockType, BLOCKS, isTransparent } from "./blocks";
import { tileForBlock, tileUV } from "./textures";

export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 64;
export const SEA_LEVEL = 22;

interface Face {
  dir: [number, number, number];
  corners: [number, number, number][];
}

export const FACES: Face[] = [
  { dir: [-1, 0, 0], corners: [[0, 1, 0], [0, 0, 0], [0, 1, 1], [0, 0, 1]] },
  { dir: [1, 0, 0], corners: [[1, 1, 1], [1, 0, 1], [1, 1, 0], [1, 0, 0]] },
  { dir: [0, -1, 0], corners: [[1, 0, 1], [0, 0, 1], [1, 0, 0], [0, 0, 0]] },
  { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [0, 1, 0], [1, 1, 0]] },
  { dir: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [1, 1, 0], [0, 1, 0]] },
  { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]] },
];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Chunk {
  cx: number;
  cz: number;
  blocks: Uint8Array;
  opaqueMesh: THREE.Mesh | null;
  transparentMesh: THREE.Mesh | null;
  dirty: boolean;
}

function indexInChunk(x: number, y: number, z: number): number {
  return y * CHUNK_SIZE * CHUNK_SIZE + z * CHUNK_SIZE + x;
}

export class World {
  private chunks = new Map<string, Chunk>();
  private noise2D: (x: number, y: number) => number;
  private noise2DDetail: (x: number, y: number) => number;
  private noise2DTree: (x: number, y: number) => number;
  readonly seed: number;
  onChunkRemove?: (chunk: Chunk) => void;

  constructor(seed = 1337) {
    this.seed = seed;
    const rand = mulberry32(seed);
    this.noise2D = createNoise2D(rand);
    this.noise2DDetail = createNoise2D(mulberry32(seed + 1));
    this.noise2DTree = createNoise2D(mulberry32(seed + 2));
  }

  private key(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  private getHeightAt(x: number, z: number): number {
    let h = 0;
    h += this.noise2D(x * 0.012, z * 0.012) * 14;
    h += this.noise2DDetail(x * 0.04, z * 0.04) * 5;
    h += this.noise2DDetail(x * 0.09, z * 0.09) * 2;
    return Math.floor(SEA_LEVEL + h);
  }

  private generateChunk(chunk: Chunk) {
    const { cx, cz } = chunk;
    const blocks = chunk.blocks;
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const worldX = cx * CHUNK_SIZE + x;
        const worldZ = cz * CHUNK_SIZE + z;
        const height = this.getHeightAt(worldX, worldZ);
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          let type = BlockType.AIR;
          if (y < height - 4) type = BlockType.STONE;
          else if (y < height - 1) type = BlockType.DIRT;
          else if (y < height) {
            if (height <= SEA_LEVEL + 1) type = BlockType.SAND;
            else if (height > SEA_LEVEL + 16) type = BlockType.SNOW;
            else type = BlockType.GRASS;
          } else if (y < SEA_LEVEL) type = BlockType.WATER;
          blocks[indexInChunk(x, y, z)] = type;
        }
      }
    }
    for (let x = 2; x < CHUNK_SIZE - 2; x++) {
      for (let z = 2; z < CHUNK_SIZE - 2; z++) {
        const worldX = cx * CHUNK_SIZE + x;
        const worldZ = cz * CHUNK_SIZE + z;
        const t = this.noise2DTree(worldX * 0.8, worldZ * 0.8);
        if (t > 0.86) {
          const height = this.getHeightAt(worldX, worldZ);
          if (height > SEA_LEVEL + 1 && height < SEA_LEVEL + 16) {
            this.placeTree(chunk, x, height, z);
          }
        }
      }
    }
  }

  private placeTree(chunk: Chunk, x: number, baseY: number, z: number) {
    const trunkH = 4 + Math.floor(this.noise2DTree(x * 3.1, z * 3.1) * 2 + 2);
    for (let i = 0; i < trunkH; i++) {
      const y = baseY + i;
      if (y < CHUNK_HEIGHT) chunk.blocks[indexInChunk(x, y, z)] = BlockType.WOOD;
    }
    const topY = baseY + trunkH;
    for (let dy = -2; dy <= 1; dy++) {
      const ly = topY + dy;
      if (ly < 0 || ly >= CHUNK_HEIGHT) continue;
      const r = dy <= -1 ? 2 : 1;
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (dx === 0 && dz === 0 && dy < 1) continue;
          if (Math.abs(dx) === r && Math.abs(dz) === r && r === 2) continue;
          const lx = x + dx, lz = z + dz;
          if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) continue;
          const idx = indexInChunk(lx, ly, lz);
          if (chunk.blocks[idx] === BlockType.AIR) chunk.blocks[idx] = BlockType.LEAVES;
        }
      }
    }
  }

  ensureChunk(cx: number, cz: number): Chunk {
    const k = this.key(cx, cz);
    let chunk = this.chunks.get(k);
    if (!chunk) {
      chunk = { cx, cz, blocks: new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE), opaqueMesh: null, transparentMesh: null, dirty: true };
      this.generateChunk(chunk);
      this.chunks.set(k, chunk);
    }
    return chunk;
  }

  removeChunk(cx: number, cz: number) {
    const k = this.key(cx, cz);
    const chunk = this.chunks.get(k);
    if (chunk) { this.onChunkRemove?.(chunk); this.chunks.delete(k); }
  }

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(this.key(cx, cz));
  }

  getBlock(x: number, y: number, z: number): number {
    if (y < 0 || y >= CHUNK_HEIGHT) return BlockType.AIR;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.chunks.get(this.key(cx, cz));
    if (!chunk) return BlockType.AIR;
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    return chunk.blocks[indexInChunk(lx, y, lz)];
  }

  setBlock(x: number, y: number, z: number, type: number) {
    if (y < 0 || y >= CHUNK_HEIGHT) return;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.ensureChunk(cx, cz);
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    chunk.blocks[indexInChunk(lx, y, lz)] = type;
    chunk.dirty = true;
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.markDirty(cx, cz + 1);
  }

  private markDirty(cx: number, cz: number) {
    const chunk = this.chunks.get(this.key(cx, cz));
    if (chunk) chunk.dirty = true;
  }

  getDirtyChunks(): Chunk[] {
    const out: Chunk[] = [];
    for (const chunk of this.chunks.values()) if (chunk.dirty) out.push(chunk);
    return out;
  }

  allChunks(): Chunk[] {
    return Array.from(this.chunks.values());
  }

  // ---- Save / Load support ----
  exportChunks(): { cx: number; cz: number; data: Uint8Array }[] {
    const out: { cx: number; cz: number; data: Uint8Array }[] = [];
    for (const chunk of this.chunks.values()) {
      out.push({ cx: chunk.cx, cz: chunk.cz, data: new Uint8Array(chunk.blocks) });
    }
    return out;
  }

  // Replace all chunks with imported data (used when loading a save).
  importChunks(chunks: { cx: number; cz: number; data: Uint8Array }[]) {
    // Remove all existing chunks (fires onChunkRemove for mesh cleanup)
    const existing = this.allChunks();
    for (const c of existing) this.removeChunk(c.cx, c.cz);
    // Insert imported chunks
    for (const c of chunks) {
      const chunk: Chunk = {
        cx: c.cx,
        cz: c.cz,
        blocks: new Uint8Array(c.data),
        opaqueMesh: null,
        transparentMesh: null,
        dirty: true,
      };
      this.chunks.set(this.key(c.cx, c.cz), chunk);
    }
  }

  clear() {
    const existing = this.allChunks();
    for (const c of existing) this.removeChunk(c.cx, c.cz);
  }

  buildMeshes(chunk: Chunk): { opaque: THREE.BufferGeometry | null; transparent: THREE.BufferGeometry | null } {
    const oPos: number[] = [], oNorm: number[] = [], oUv: number[] = [], oIdx: number[] = [];
    const tPos: number[] = [], tNorm: number[] = [], tUv: number[] = [], tIdx: number[] = [];
    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;

    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const type = chunk.blocks[indexInChunk(x, y, z)];
          if (type === BlockType.AIR) continue;
          const def = BLOCKS[type];
          const cullTransparent = def ? def.transparent : true;
          const renderTransparent = type === BlockType.WATER || type === BlockType.GLASS;
          const wx = baseX + x, wy = y, wz = baseZ + z;

          for (let f = 0; f < 6; f++) {
            const face = FACES[f];
            const nx = wx + face.dir[0], ny = wy + face.dir[1], nz = wz + face.dir[2];
            const neighbor = this.getBlock(nx, ny, nz);
            const neighborTransparent = isTransparent(neighbor);
            if (!neighborTransparent) continue;
            if (neighborTransparent && neighbor === type && cullTransparent) continue;

            const pos = renderTransparent ? tPos : oPos;
            const norm = renderTransparent ? tNorm : oNorm;
            const uv = renderTransparent ? tUv : oUv;
            const idx = renderTransparent ? tIdx : oIdx;

            const startVertex = pos.length / 3;
            const tile = tileForBlock(type, f);
            const { u0, v0, u1, v1 } = tileUV(tile);
            const dirx = face.dir[0], diry = face.dir[1], dirz = face.dir[2];

            for (const c of face.corners) {
              pos.push(wx + c[0], wy + c[1], wz + c[2]);
              norm.push(dirx, diry, dirz);
              let lu: number, lv: number;
              if (f === 0 || f === 1) { lu = c[2]; lv = c[1]; }
              else if (f === 2 || f === 3) { lu = c[0]; lv = c[2]; }
              else { lu = c[0]; lv = c[1]; }
              uv.push(u0 + lu * (u1 - u0), v0 + lv * (v1 - v0));
            }
            idx.push(startVertex, startVertex + 1, startVertex + 2, startVertex + 2, startVertex + 1, startVertex + 3);
          }
        }
      }
    }

    const opaque = oPos.length > 0 ? makeGeometry(oPos, oNorm, oUv, oIdx) : null;
    const transparent = tPos.length > 0 ? makeGeometry(tPos, tNorm, tUv, tIdx) : null;
    return { opaque, transparent };
  }
}

function makeGeometry(positions: number[], normals: number[], uvs: number[], indices: number[]): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

export type { Chunk };
