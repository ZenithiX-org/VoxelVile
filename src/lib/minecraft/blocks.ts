// Block type definitions for the Minecraft clone.

export const BlockType = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  WOOD: 4,
  LEAVES: 5,
  SAND: 6,
  WATER: 7,
  GLASS: 8,
  BRICK: 9,
  PLANKS: 10,
  COBBLE: 11,
  SNOW: 12,
} as const;

export interface BlockDef {
  name: string;
  top: number;
  bottom: number;
  side: number;
  solid: boolean;
  transparent: boolean;
}

function uniform(name: string, color: number, opts?: Partial<BlockDef>): BlockDef {
  return { name, top: color, bottom: color, side: color, solid: true, transparent: false, ...opts };
}

export const BLOCKS: Record<number, BlockDef> = {
  [BlockType.AIR]: { name: "Air", top: 0, bottom: 0, side: 0, solid: false, transparent: true },
  [BlockType.GRASS]: { name: "Grass", top: 0x6ab04c, bottom: 0x7a5230, side: 0x8b6238, solid: true, transparent: false },
  [BlockType.DIRT]: uniform("Dirt", 0x8b5a2b),
  [BlockType.STONE]: uniform("Stone", 0x8a8a8a),
  [BlockType.WOOD]: { name: "Wood", top: 0xb08c4f, bottom: 0xb08c4f, side: 0x6e5230, solid: true, transparent: false },
  [BlockType.LEAVES]: { name: "Leaves", top: 0x4a8f3a, bottom: 0x4a8f3a, side: 0x4a8f3a, solid: true, transparent: true },
  [BlockType.SAND]: uniform("Sand", 0xe6d7a8),
  [BlockType.WATER]: { name: "Water", top: 0x3a78e0, bottom: 0x2f63c4, side: 0x356fce, solid: false, transparent: true },
  [BlockType.GLASS]: uniform("Glass", 0xcfeaf2, { transparent: true }),
  [BlockType.BRICK]: uniform("Brick", 0x9e4a3a),
  [BlockType.PLANKS]: uniform("Planks", 0xb8893f),
  [BlockType.COBBLE]: uniform("Cobblestone", 0x777777),
  [BlockType.SNOW]: uniform("Snow", 0xf4f6f8),
};

export function isSolid(type: number): boolean {
  const def = BLOCKS[type];
  return !!def && def.solid;
}

export function isTransparent(type: number): boolean {
  const def = BLOCKS[type];
  return !def || def.transparent;
}

export const HOTBAR: number[] = [
  BlockType.GRASS,
  BlockType.DIRT,
  BlockType.STONE,
  BlockType.COBBLE,
  BlockType.WOOD,
  BlockType.PLANKS,
  BlockType.LEAVES,
  BlockType.SAND,
  BlockType.GLASS,
];
