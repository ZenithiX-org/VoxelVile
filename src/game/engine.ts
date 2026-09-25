// Main voxel game engine: rendering, chunk streaming, player physics, interaction.
import * as THREE from 'three';
import { World, CX, CZ, WORLD_H, SEA_LEVEL, chunkKey, Chunk } from './world';
import {
  ATLAS_COLS, ATLAS_PX, BLOCK, BLOCKS, TILE_PX, getAtlasCanvas, isSolid,
} from './blocks';
import { sfx } from './audio';

const TILE_UV = TILE_PX / ATLAS_PX;
const PLAYER_HALF = 0.3;
const PLAYER_HEIGHT = 1.8;
const EYE = 1.62;
const GRAVITY = 30;
const JUMP_V = 8.8;

export interface EngineStats {
  fps: number;
  x: number; y: number; z: number;
  chunks: number;
  tris: number;
  target: string;
  biome: string;
  flying: boolean;
  onGround: boolean;
  time: number;
  underwater: boolean;
}

export interface Settings {
  renderDistance: number;
  fov: number;
  sensitivity: number;
  volume: number;
  dayCycle: boolean;
  timeOfDay: number;
}

function blockGeometry(id: number): THREE.BufferGeometry {
  const def = BLOCKS[id];
  const g = new THREE.BoxGeometry(1, 1, 1);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const faces = [def.side, def.side, def.top, def.bottom, def.side, def.side];
  for (let f = 0; f < 6; f++) {
    const t = faces[f];
    const tx = (t % ATLAS_COLS) * TILE_UV;
    const ty = 1 - (Math.floor(t / ATLAS_COLS) + 1) * TILE_UV;
    for (let i = 0; i < 4; i++) {
      const vi = f * 4 + i;
      uv.setXY(vi, tx + uv.getX(vi) * TILE_UV, ty + uv.getY(vi) * TILE_UV);
    }
  }
  uv.needsUpdate = true;
  return g;
}

function cloudTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 128;
    const y = Math.random() * 128;
    const w = 8 + Math.random() * 26;
    const h = 6 + Math.random() * 16;
    for (let j = 0; j < 4; j++) {
      ctx.fillRect(
        ((x + Math.random() * w) | 0) % 128,
        ((y + Math.random() * h) | 0) % 128,
        4 + ((Math.random() * w) | 0),
        4 + ((Math.random() * h) | 0),
      );
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 5);
  return tex;
}

export class Engine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  world: World;
  seed: number;

  private chunkGroup = new THREE.Group();
  private terrainMat: THREE.MeshLambertMaterial;
  private waterMat: THREE.MeshLambertMaterial;
  private atlasTex: THREE.CanvasTexture;
  private skyGroup = new THREE.Group();
  private skyMat!: THREE.ShaderMaterial;
  private sunMesh!: THREE.Mesh;
  private moonMesh!: THREE.Mesh;
  private stars!: THREE.Points;
  private clouds!: THREE.Mesh;
  private sunLight: THREE.DirectionalLight;
  private ambLight: THREE.AmbientLight;
  private hemi: THREE.HemisphereLight;
  private highlight: THREE.LineSegments;
  private particles: THREE.InstancedMesh;
  private pData: { pos: THREE.Vector3; vel: THREE.Vector3; life: number; max: number }[] = [];
  private handScene = new THREE.Scene();
  private handCam: THREE.PerspectiveCamera;
  private handMesh: THREE.Mesh;
  private handBlock = -1;
  private swing = 0;

  // player
  pos = new THREE.Vector3(8, 70, 8);
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  onGround = false;
  flying = true;
  sprinting = false;
  inWater = false;
  private bob = 0;
  private stepDist = 0;
  private lastJumpTap = 0;

  // input
  private keys = new Set<string>();
  private mouseDown = [false, false, false];
  private breakTimer = 0;
  private placeTimer = 0;

  // state
  hotbar: number[] = [
    BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.COBBLE, BLOCK.PLANKS,
    BLOCK.LOG, BLOCK.LEAVES, BLOCK.GLASS, BLOCK.GLOWSTONE,
  ];
  selectedSlot = 0;
  settings: Settings = {
    renderDistance: 6, fov: 75, sensitivity: 1, volume: 0.6, dayCycle: true, timeOfDay: 0.32,
  };
  running = false;
  locked = false;
  paused = true;
  ready = false;
  /** slow camera pan used behind the title screen */
  cinematic = false;

  onStats?: (s: EngineStats) => void;
  onProgress?: (p: number) => void;
  onReady?: () => void;
  onLockChange?: (locked: boolean) => void;
  onSlotChange?: (slot: number) => void;

  private raf = 0;
  private lastTime = 0;
  private acc = 0;
  private statTimer = 0;
  private frames = 0;
  private fpsTimer = 0;
  private fps = 0;
  private offsets: { dx: number; dz: number }[] = [];
  private offsetsFor = -1;
  private spawned = false;
  private targetHit: ReturnType<World['raycast']> = null;
  private disposed = false;
  private tmpSize = new THREE.Vector2();

  constructor(private container: HTMLElement, seed: number) {
    this.seed = seed;
    this.world = new World(seed);

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = true;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';

    this.camera = new THREE.PerspectiveCamera(
      this.settings.fov, container.clientWidth / container.clientHeight, 0.08, 1200,
    );
    this.scene.add(this.chunkGroup);

    // texture atlas
    this.atlasTex = new THREE.CanvasTexture(getAtlasCanvas());
    this.atlasTex.magFilter = THREE.NearestFilter;
    this.atlasTex.minFilter = THREE.NearestFilter;
    this.atlasTex.generateMipmaps = false;
    this.atlasTex.colorSpace = THREE.SRGBColorSpace;
    this.atlasTex.anisotropy = 1;

    this.terrainMat = new THREE.MeshLambertMaterial({
      map: this.atlasTex, vertexColors: true, alphaTest: 0.5,
    });
    this.waterMat = new THREE.MeshLambertMaterial({
      map: this.atlasTex, vertexColors: true, transparent: true, opacity: 0.76,
      depthWrite: false, side: THREE.DoubleSide,
    });

    // lights
    // three.js divides diffuse by PI, so intensities are pre-multiplied by PI
    this.ambLight = new THREE.AmbientLight(0xffffff, 0.7 * Math.PI);
    this.sunLight = new THREE.DirectionalLight(0xfff2d0, 0.26 * Math.PI);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x5b4632, 0.12 * Math.PI);
    this.scene.add(this.ambLight, this.sunLight, this.hemi);
    this.scene.fog = new THREE.Fog(0xbfd8ff, 40, 120);

    this.buildSky();

    // selection highlight
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002));
    this.highlight = new THREE.LineSegments(
      edges, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthTest: true }),
    );
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    // particles
    const pg = new THREE.BoxGeometry(0.14, 0.14, 0.14);
    this.particles = new THREE.InstancedMesh(
      pg, new THREE.MeshLambertMaterial({ vertexColors: false }), 160,
    );
    this.particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particles.count = 160;
    this.particles.frustumCulled = false;
    const cols = new Float32Array(160 * 3).fill(1);
    this.particles.instanceColor = new THREE.InstancedBufferAttribute(cols, 3);
    for (let i = 0; i < 160; i++) {
      this.pData.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, max: 1 });
    }
    this.scene.add(this.particles);

    // held item
    this.handCam = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.handCam.position.set(0, 0, 0);
    const handLight = new THREE.AmbientLight(0xffffff, 0.72 * Math.PI);
    const handDir = new THREE.DirectionalLight(0xffffff, 0.3 * Math.PI);
    handDir.position.set(-0.6, 1, 1);
    this.handScene.add(handLight, handDir);
    this.handMesh = new THREE.Mesh(blockGeometry(BLOCK.GRASS), new THREE.MeshLambertMaterial({
      map: this.atlasTex, alphaTest: 0.5,
    }));
    this.handScene.add(this.handMesh);

    this.bindEvents();
    this.onResize();
  }

  // ---------------------------------------------------------------- sky
  private buildSky() {
    const geo = new THREE.SphereGeometry(500, 24, 16);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x4d8cf0) },
        bottomColor: { value: new THREE.Color(0xc9e3ff) },
        offset: { value: 0.12 },
      },
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vWorld = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 topColor; uniform vec3 bottomColor; uniform float offset;
        varying vec3 vWorld;
        void main() {
          float h = clamp((vWorld.y + offset) * 1.5, 0.0, 1.0);
          vec3 c = mix(bottomColor, topColor, pow(h, 0.65));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const dome = new THREE.Mesh(geo, this.skyMat);
    dome.renderOrder = -1000;
    this.skyGroup.add(dome);

    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff4c0, fog: false, depthWrite: false });
    this.sunMesh = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), sunMat);
    this.sunMesh.renderOrder = -999;
    this.skyGroup.add(this.sunMesh);

    const moonMat = new THREE.MeshBasicMaterial({ color: 0xdfe7f5, fog: false, depthWrite: false });
    this.moonMesh = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), moonMat);
    this.moonMesh.renderOrder = -999;
    this.skyGroup.add(this.moonMesh);

    // stars
    const starCount = 500;
    const sp = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random(), Math.random() * 2 - 1)
        .normalize().multiplyScalar(450);
      sp[i * 3] = v.x; sp[i * 3 + 1] = v.y; sp[i * 3 + 2] = v.z;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({
      color: 0xffffff, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false,
    }));
    this.stars.renderOrder = -998;
    this.skyGroup.add(this.stars);
    this.skyGroup.renderOrder = -1000;
    this.scene.add(this.skyGroup);

    this.clouds = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      new THREE.MeshLambertMaterial({
        map: cloudTexture(), transparent: true, opacity: 0.75, alphaTest: 0.35,
        depthWrite: false, side: THREE.DoubleSide, fog: true,
      }),
    );
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.position.y = 120;
    this.scene.add(this.clouds);
  }

  // ---------------------------------------------------------------- events
  private keyDown = (e: KeyboardEvent) => {
    if (e.code === 'Tab') e.preventDefault();
    if (!this.locked) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    if (e.code === 'Space') {
      const now = performance.now();
      if (now - this.lastJumpTap < 300) {
        this.flying = !this.flying;
        this.vel.y = 0;
        sfx.click();
      }
      this.lastJumpTap = now;
    }
    if (e.code === 'KeyF') {
      this.flying = !this.flying;
      this.vel.y = 0;
      sfx.click();
    }
    if (e.code === 'KeyR') {
      this.respawn();
      sfx.click();
    }
    if (e.code.startsWith('Digit')) {
      const n = parseInt(e.code.slice(5), 10);
      if (n >= 1 && n <= 9) {
        this.selectedSlot = n - 1;
        this.onSlotChange?.(this.selectedSlot);
      }
    }
  };
  private keyUp = (e: KeyboardEvent) => this.keys.delete(e.code);

  private mouseMove = (e: MouseEvent) => {
    if (!this.locked) return;
    const s = 0.0022 * this.settings.sensitivity;
    this.yaw -= e.movementX * s;
    this.pitch -= e.movementY * s;
    const lim = Math.PI / 2 - 0.001;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  };

  private mouseDownH = (e: MouseEvent) => {
    if (!this.locked) return;
    e.preventDefault();
    this.mouseDown[e.button] = true;
    if (e.button === 0) {
      this.breakBlock();
      this.breakTimer = 0.28;
    } else if (e.button === 2) {
      this.placeBlock();
      this.placeTimer = 0.28;
    } else if (e.button === 1) {
      this.pickBlock();
    }
  };
  private mouseUpH = (e: MouseEvent) => {
    this.mouseDown[e.button] = false;
  };
  private wheel = (e: WheelEvent) => {
    if (!this.locked) return;
    e.preventDefault();
    const dir = Math.sign(e.deltaY);
    this.selectedSlot = (this.selectedSlot + dir + 9) % 9;
    this.onSlotChange?.(this.selectedSlot);
  };
  private lockChange = () => {
    this.locked = document.pointerLockElement === this.renderer.domElement;
    if (!this.locked) this.keys.clear();
    this.onLockChange?.(this.locked);
  };
  private resizeH = () => this.onResize();
  private contextMenu = (e: Event) => e.preventDefault();

  private bindEvents() {
    const el = this.renderer.domElement;
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    document.addEventListener('mousemove', this.mouseMove);
    el.addEventListener('mousedown', this.mouseDownH);
    window.addEventListener('mouseup', this.mouseUpH);
    el.addEventListener('wheel', this.wheel, { passive: false });
    el.addEventListener('contextmenu', this.contextMenu);
    document.addEventListener('pointerlockchange', this.lockChange);
    window.addEventListener('resize', this.resizeH);
  }

  private unbindEvents() {
    const el = this.renderer.domElement;
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    document.removeEventListener('mousemove', this.mouseMove);
    el.removeEventListener('mousedown', this.mouseDownH);
    window.removeEventListener('mouseup', this.mouseUpH);
    el.removeEventListener('wheel', this.wheel);
    el.removeEventListener('contextmenu', this.contextMenu);
    document.removeEventListener('pointerlockchange', this.lockChange);
    window.removeEventListener('resize', this.resizeH);
  }

  onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.handCam.aspect = w / h;
    this.handCam.updateProjectionMatrix();
  }

  lock() {
    this.renderer.domElement.requestPointerLock();
    sfx.resume();
  }
  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // ---------------------------------------------------------------- chunks
  private computeOffsets(rd: number) {
    if (this.offsetsFor === rd) return;
    const arr: { dx: number; dz: number }[] = [];
    for (let dz = -rd; dz <= rd; dz++)
      for (let dx = -rd; dx <= rd; dx++) {
        if (dx * dx + dz * dz <= rd * rd + rd) arr.push({ dx, dz });
      }
    arr.sort((a, b) => a.dx * a.dx + a.dz * a.dz - (b.dx * b.dx + b.dz * b.dz));
    this.offsets = arr;
    this.offsetsFor = rd;
  }

  private meshChunk(c: Chunk) {
    const { solid, water } = this.world.buildGeometry(c);
    if (c.mesh) {
      this.chunkGroup.remove(c.mesh);
      c.mesh.geometry.dispose();
      c.mesh = null;
    }
    if (c.waterMesh) {
      this.chunkGroup.remove(c.waterMesh);
      c.waterMesh.geometry.dispose();
      c.waterMesh = null;
    }
    if (solid) {
      const m = new THREE.Mesh(solid, this.terrainMat);
      m.position.set(c.cx * CX, 0, c.cz * CZ);
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      this.chunkGroup.add(m);
      c.mesh = m;
    }
    if (water) {
      const m = new THREE.Mesh(water, this.waterMat);
      m.position.set(c.cx * CX, 0, c.cz * CZ);
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      m.renderOrder = 5;
      this.chunkGroup.add(m);
      c.waterMesh = m;
    }
    c.dirty = false;
  }

  private neighborsReady(cx: number, cz: number) {
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.world.getChunk(cx + dx, cz + dz);
        if (!c || !c.generated) return false;
      }
    return true;
  }

  private updateChunks(budgetMs: number) {
    const rd = this.settings.renderDistance;
    this.computeOffsets(rd);
    const pcx = Math.floor(this.pos.x / CX);
    const pcz = Math.floor(this.pos.z / CZ);
    const t0 = performance.now();
    let readyCount = 0;
    const loadRing = Math.min(rd, 3);
    let ringTotal = 0;
    let ringReady = 0;

    for (const { dx, dz } of this.offsets) {
      const cx = pcx + dx;
      const cz = pcz + dz;
      const inRing = dx * dx + dz * dz <= loadRing * loadRing;
      if (inRing) ringTotal++;
      let c = this.world.getChunk(cx, cz);
      const timeLeft = performance.now() - t0 < budgetMs;
      if (!c || !c.generated) {
        if (timeLeft) c = this.world.generateChunk(cx, cz);
        else continue;
      }
      if (c.dirty) {
        if (this.neighborsReady(cx, cz)) {
          if (timeLeft) this.meshChunk(c);
          else continue;
        } else if (timeLeft) {
          // generate the missing neighbours so this chunk can be meshed soon
          for (let nz = -1; nz <= 1 && performance.now() - t0 < budgetMs; nz++)
            for (let nx = -1; nx <= 1 && performance.now() - t0 < budgetMs; nx++) {
              const n = this.world.getChunk(cx + nx, cz + nz);
              if (!n || !n.generated) this.world.generateChunk(cx + nx, cz + nz);
            }
          if (this.neighborsReady(cx, cz) && performance.now() - t0 < budgetMs) this.meshChunk(c);
        }
      }
      if (!c.dirty) {
        readyCount++;
        if (inRing) ringReady++;
      }
    }

    // unload distant chunks
    const maxD = rd + 2;
    for (const [key, c] of this.world.chunks) {
      if (Math.abs(c.cx - pcx) > maxD || Math.abs(c.cz - pcz) > maxD) {
        if (c.mesh) {
          this.chunkGroup.remove(c.mesh);
          c.mesh.geometry.dispose();
          c.mesh = null;
        }
        if (c.waterMesh) {
          this.chunkGroup.remove(c.waterMesh);
          c.waterMesh.geometry.dispose();
          c.waterMesh = null;
        }
        if (Math.abs(c.cx - pcx) > maxD + 4 || Math.abs(c.cz - pcz) > maxD + 4) {
          this.world.chunks.delete(key);
        } else {
          c.dirty = true;
        }
      }
    }

    if (!this.ready) {
      const p = ringTotal ? ringReady / ringTotal : 0;
      this.onProgress?.(Math.min(1, p));
      if (p >= 0.999) {
        this.ready = true;
        this.spawnPlayer();
        this.onReady?.();
      }
    }
    return readyCount;
  }

  private spawnPlayer() {
    if (this.spawned) return;
    // look for dry land close to the origin (inside the pre-loaded chunk ring)
    let best = { x: 8, z: 8, h: this.world.heightAt(8, 8) };
    outer: for (let r = 0; r <= 40; r += 4) {
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2;
        const x = Math.round(8 + Math.cos(ang) * r);
        const z = Math.round(8 + Math.sin(ang) * r);
        const h = this.world.heightAt(x, z);
        if (h > best.h) best = { x, z, h };
        if (h > SEA_LEVEL + 3 && h < 60 && this.world.isFree(x, this.world.surfaceY(x, z), z)) {
          best = { x, z, h };
          break outer;
        }
      }
    }
    const y = this.world.surfaceY(best.x, best.z);
    this.pos.set(best.x + 0.5, y + 0.1, best.z + 0.5);
    this.vel.set(0, 0, 0);
    this.flying = false;
    this.spawned = true;
  }

  respawn() {
    this.spawned = false;
    this.spawnPlayer();
  }

  // ---------------------------------------------------------------- interaction
  private lookDir(out = new THREE.Vector3()) {
    return out.set(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    ).normalize();
  }

  private eyePos(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + EYE, this.pos.z);
  }

  private materialOf(id: number): Parameters<typeof sfx.dig>[0] {
    switch (id) {
      case BLOCK.STONE: case BLOCK.COBBLE: case BLOCK.BRICK: case BLOCK.COAL_ORE:
      case BLOCK.IRON_ORE: case BLOCK.GOLD_ORE: case BLOCK.OBSIDIAN: case BLOCK.BEDROCK:
        return 'stone';
      case BLOCK.LOG: case BLOCK.PLANKS: case BLOCK.PUMPKIN: return 'wood';
      case BLOCK.SAND: case BLOCK.GRAVEL: return 'sand';
      case BLOCK.GLASS: return 'glass';
      case BLOCK.LEAVES: case BLOCK.TALL_GRASS: case BLOCK.ROSE: case BLOCK.DANDELION: return 'plant';
      case BLOCK.WOOL_WHITE: case BLOCK.WOOL_RED: case BLOCK.WOOL_BLUE:
      case BLOCK.WOOL_YELLOW: case BLOCK.WOOL_BLACK: return 'wool';
      default: return 'dirt';
    }
  }

  breakBlock() {
    const hit = this.targetHit;
    if (!hit) return;
    const id = hit.block;
    this.world.setBlock(hit.x, hit.y, hit.z, 0);
    // break block above if it was a plant resting on it
    const above = this.world.getBlock(hit.x, hit.y + 1, hit.z);
    if (BLOCKS[above]?.render === 'cross') this.world.setBlock(hit.x, hit.y + 1, hit.z, 0);
    this.spawnParticles(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, BLOCKS[id].color, 14);
    sfx.dig(this.materialOf(id));
    this.swing = 1;
  }

  placeBlock() {
    const hit = this.targetHit;
    if (!hit) return;
    const x = hit.x + hit.nx;
    const y = hit.y + hit.ny;
    const z = hit.z + hit.nz;
    if (y < 0 || y >= WORLD_H) return;
    const id = this.hotbar[this.selectedSlot];
    if (!id) return;
    const existing = this.world.getBlock(x, y, z);
    if (existing !== 0 && BLOCKS[existing]?.render !== 'liquid' && BLOCKS[existing]?.render !== 'cross') return;
    // don't place inside the player
    if (BLOCKS[id].solid) {
      const px = this.pos.x, py = this.pos.y, pz = this.pos.z;
      const overlap =
        x + 1 > px - PLAYER_HALF && x < px + PLAYER_HALF &&
        z + 1 > pz - PLAYER_HALF && z < pz + PLAYER_HALF &&
        y + 1 > py && y < py + PLAYER_HEIGHT;
      if (overlap) return;
    }
    if (this.world.setBlock(x, y, z, id)) {
      sfx.place();
      this.swing = 1;
    }
  }

  pickBlock() {
    const hit = this.targetHit;
    if (!hit) return;
    this.hotbar[this.selectedSlot] = hit.block;
    this.onSlotChange?.(this.selectedSlot);
    sfx.click();
  }

  private spawnParticles(x: number, y: number, z: number, color: string, count: number) {
    const c = new THREE.Color(color);
    let spawned = 0;
    for (let i = 0; i < this.pData.length && spawned < count; i++) {
      const p = this.pData[i];
      if (p.life > 0) continue;
      p.pos.set(x + (Math.random() - 0.5) * 0.8, y + (Math.random() - 0.5) * 0.8, z + (Math.random() - 0.5) * 0.8);
      p.vel.set((Math.random() - 0.5) * 3.4, Math.random() * 3.6 + 1, (Math.random() - 0.5) * 3.4);
      p.max = 0.55 + Math.random() * 0.5;
      p.life = p.max;
      const jitter = 0.82 + Math.random() * 0.36;
      this.particles.setColorAt(i, c.clone().multiplyScalar(jitter));
      spawned++;
    }
    if (this.particles.instanceColor) this.particles.instanceColor.needsUpdate = true;
  }

  private updateParticles(dt: number) {
    const m = new THREE.Matrix4();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    let any = false;
    for (let i = 0; i < this.pData.length; i++) {
      const p = this.pData[i];
      if (p.life <= 0) {
        this.particles.setMatrixAt(i, zero);
        continue;
      }
      any = true;
      p.life -= dt;
      p.vel.y -= 16 * dt;
      p.pos.addScaledVector(p.vel, dt);
      if (this.world.isSolidAt(p.pos.x, p.pos.y - 0.05, p.pos.z) && p.vel.y < 0) {
        p.pos.y = Math.floor(p.pos.y) + 1.02;
        p.vel.y *= -0.28;
        p.vel.x *= 0.6;
        p.vel.z *= 0.6;
      }
      const s = Math.max(0.01, Math.min(1, p.life / p.max * 1.6));
      m.makeScale(s, s, s);
      m.setPosition(p.pos.x, p.pos.y, p.pos.z);
      this.particles.setMatrixAt(i, m);
    }
    this.particles.instanceMatrix.needsUpdate = true;
    this.particles.visible = any;
  }

  // ---------------------------------------------------------------- physics
  private collidesAt(x: number, y: number, z: number): boolean {
    const x0 = Math.floor(x - PLAYER_HALF), x1 = Math.floor(x + PLAYER_HALF);
    const y0 = Math.floor(y + 0.001), y1 = Math.floor(y + PLAYER_HEIGHT - 0.001);
    const z0 = Math.floor(z - PLAYER_HALF), z1 = Math.floor(z + PLAYER_HALF);
    for (let yy = y0; yy <= y1; yy++)
      for (let zz = z0; zz <= z1; zz++)
        for (let xx = x0; xx <= x1; xx++) {
          if (isSolid(this.world.getBlock(xx, yy, zz))) return true;
        }
    return false;
  }

  private step(dt: number) {
    const keys = this.keys;
    const forward = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const strafe = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    this.sprinting = keys.has('ControlLeft') || keys.has('ControlRight');

    const headBlock = this.world.getBlock(
      Math.floor(this.pos.x), Math.floor(this.pos.y + EYE), Math.floor(this.pos.z),
    );
    const feetBlock = this.world.getBlock(
      Math.floor(this.pos.x), Math.floor(this.pos.y + 0.2), Math.floor(this.pos.z),
    );
    const wasInWater = this.inWater;
    this.inWater = feetBlock === BLOCK.WATER || headBlock === BLOCK.WATER;
    if (this.inWater && !wasInWater && Math.abs(this.vel.y) > 4) sfx.splash();

    let speed = this.flying ? (this.sprinting ? 22 : 11) : this.sprinting ? 6.6 : 4.4;
    if (this.inWater && !this.flying) speed *= 0.55;
    if (keys.has('ShiftLeft') && !this.flying && this.onGround) speed *= 0.35;

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let wishX = (-sin * forward) + (cos * strafe);
    let wishZ = (-cos * forward) + (-sin * strafe);
    const len = Math.hypot(wishX, wishZ);
    if (len > 0) {
      wishX = (wishX / len) * speed;
      wishZ = (wishZ / len) * speed;
    }

    if (this.flying) {
      const up = (keys.has('Space') ? 1 : 0) - (keys.has('ShiftLeft') ? 1 : 0);
      this.vel.y += (up * speed - this.vel.y) * Math.min(1, dt * 12);
      this.vel.x += (wishX - this.vel.x) * Math.min(1, dt * 12);
      this.vel.z += (wishZ - this.vel.z) * Math.min(1, dt * 12);
    } else {
      const accel = this.onGround ? 14 : 5;
      this.vel.x += (wishX - this.vel.x) * Math.min(1, dt * accel);
      this.vel.z += (wishZ - this.vel.z) * Math.min(1, dt * accel);
      if (this.inWater) {
        this.vel.y -= GRAVITY * 0.28 * dt;
        this.vel.y = Math.max(this.vel.y, -4.5);
        if (keys.has('Space')) this.vel.y = Math.min(this.vel.y + 26 * dt, 4.2);
      } else {
        this.vel.y -= GRAVITY * dt;
        if (keys.has('Space') && this.onGround) {
          this.vel.y = JUMP_V;
          this.onGround = false;
        }
      }
      this.vel.y = Math.max(this.vel.y, -55);
    }

    // integrate with axis-separated collision
    const eps = 1e-3;
    // X
    const nx = this.pos.x + this.vel.x * dt;
    if (this.collidesAt(nx, this.pos.y, this.pos.z)) {
      if (this.vel.x > 0) this.pos.x = Math.floor(nx + PLAYER_HALF) - PLAYER_HALF - eps;
      else if (this.vel.x < 0) this.pos.x = Math.floor(nx - PLAYER_HALF) + 1 + PLAYER_HALF + eps;
      this.vel.x = 0;
    } else this.pos.x = nx;
    // Z
    const nz = this.pos.z + this.vel.z * dt;
    if (this.collidesAt(this.pos.x, this.pos.y, nz)) {
      if (this.vel.z > 0) this.pos.z = Math.floor(nz + PLAYER_HALF) - PLAYER_HALF - eps;
      else if (this.vel.z < 0) this.pos.z = Math.floor(nz - PLAYER_HALF) + 1 + PLAYER_HALF + eps;
      this.vel.z = 0;
    } else this.pos.z = nz;
    // Y
    const ny = this.pos.y + this.vel.y * dt;
    if (this.collidesAt(this.pos.x, ny, this.pos.z)) {
      if (this.vel.y <= 0) {
        this.pos.y = Math.floor(ny) + 1 + eps;
        if (!this.onGround && this.vel.y < -8) sfx.step();
        this.onGround = true;
      } else {
        this.pos.y = Math.ceil(ny + PLAYER_HEIGHT) - PLAYER_HEIGHT - eps;
      }
      this.vel.y = 0;
    } else {
      this.pos.y = ny;
      this.onGround = false;
    }
    if (this.pos.y < -20) {
      this.respawn();
    }

    // footsteps + view bob
    const hspeed = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hspeed > 0.5) {
      this.stepDist += hspeed * dt;
      this.bob += dt * hspeed * 1.6;
      if (this.stepDist > 2.2) {
        this.stepDist = 0;
        sfx.step();
      }
    } else {
      this.bob += dt * 0.5;
    }
  }

  // ---------------------------------------------------------------- frame
  private updateSky(dt: number) {
    if (this.settings.dayCycle && !this.paused) {
      this.settings.timeOfDay = (this.settings.timeOfDay + dt / 420) % 1;
    }
    const t = this.settings.timeOfDay;
    const elev = (t - 0.25) * Math.PI * 2;
    const sy = Math.sin(elev);
    const horiz = Math.cos(elev);
    const dir = new THREE.Vector3(horiz * 0.85, sy, horiz * 0.5).normalize();

    const dayF = THREE.MathUtils.clamp(sy * 2.2 + 0.25, 0, 1);
    const dusk = Math.exp(-Math.pow(sy * 3.6, 2)) * (sy > -0.25 ? 1 : 0);

    const top = new THREE.Color(0x04070f).lerp(new THREE.Color(0x4b8bf0), dayF);
    const bot = new THREE.Color(0x0b1225).lerp(new THREE.Color(0xc7e2ff), dayF);
    top.lerp(new THREE.Color(0x35325e), dusk * 0.55);
    bot.lerp(new THREE.Color(0xff9c4f), dusk * 0.8);
    this.skyMat.uniforms.topColor.value.copy(top);
    this.skyMat.uniforms.bottomColor.value.copy(bot);

    const fogColor = bot.clone().lerp(top, 0.25);
    (this.scene.fog as THREE.Fog).color.copy(fogColor);
    const far = this.settings.renderDistance * CX;
    (this.scene.fog as THREE.Fog).near = far * 0.55;
    (this.scene.fog as THREE.Fog).far = far * 0.98;

    this.sunLight.position.copy(dir).multiplyScalar(100);
    this.sunLight.intensity = (0.02 + Math.max(0, sy) * 0.26) * Math.PI;
    this.sunLight.color.setHSL(0.09 + 0.02 * dayF, 0.45 * (1 - dayF) + 0.06, 0.6 + 0.32 * dayF);
    this.ambLight.intensity = (0.18 + dayF * 0.54) * Math.PI;
    this.hemi.intensity = (0.05 + dayF * 0.09) * Math.PI;

    const camPos = this.camera.position;
    this.skyGroup.position.copy(camPos);
    this.sunMesh.position.copy(dir).multiplyScalar(420).add(camPos);
    this.sunMesh.lookAt(camPos);
    this.moonMesh.position.copy(dir).multiplyScalar(-420).add(camPos);
    this.moonMesh.lookAt(camPos);
    (this.stars.material as THREE.PointsMaterial).opacity = THREE.MathUtils.clamp(1 - dayF * 2.2, 0, 0.9);
    this.stars.rotation.y = t * Math.PI * 2;

    this.clouds.position.set(camPos.x, 120, camPos.z);
    const cm = this.clouds.material as THREE.MeshLambertMaterial;
    if (cm.map) {
      cm.map.offset.x = (performance.now() / 1000) * 0.0032;
      cm.map.offset.y = (performance.now() / 1000) * 0.0011;
    }
    cm.color.setScalar(0.35 + dayF * 0.65);
  }

  private updateHand(dt: number) {
    const id = this.hotbar[this.selectedSlot];
    if (id !== this.handBlock) {
      this.handBlock = id;
      this.handMesh.geometry.dispose();
      this.handMesh.geometry = blockGeometry(id || BLOCK.GRASS);
      this.handMesh.visible = !!id;
    }
    if (this.swing > 0) this.swing = Math.max(0, this.swing - dt * 4.5);
    const s = Math.sin((1 - this.swing) * Math.PI);
    const bobX = Math.sin(this.bob * 2) * 0.012;
    const bobY = Math.abs(Math.cos(this.bob * 2)) * 0.014;
    this.handMesh.position.set(0.42 + bobX - s * 0.06, -0.38 + bobY - s * 0.16, -0.7 + s * 0.12);
    this.handMesh.rotation.set(
      -0.22 + s * 0.9, -0.55 + s * 0.35, 0.18 - s * 0.35,
    );
    this.handMesh.scale.setScalar(0.34);
  }

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dtRaw = this.lastTime ? (now - this.lastTime) / 1000 : 0.016;
    this.lastTime = now;
    const dt = Math.min(dtRaw, 0.1);

    // keep the drawing buffer in sync with the container (handles late layout)
    const cw = this.container.clientWidth;
    const ch = this.container.clientHeight;
    if (cw && ch) {
      const size = this.renderer.getSize(this.tmpSize);
      if (Math.abs(size.x - cw) > 1 || Math.abs(size.y - ch) > 1) this.onResize();
    }

    this.frames++;
    this.fpsTimer += dtRaw;
    if (this.fpsTimer >= 0.5) {
      this.fps = this.frames / this.fpsTimer;
      this.frames = 0;
      this.fpsTimer = 0;
    }

    this.updateChunks(this.ready ? 7 : 14);

    if (this.cinematic && this.ready) {
      this.yaw += dt * 0.05;
      this.pitch += (-0.12 - this.pitch) * Math.min(1, dt);
    }

    if (this.ready && !this.paused) {
      this.acc += dt;
      let steps = 0;
      const fixed = 1 / 120;
      while (this.acc >= fixed && steps < 14) {
        this.step(fixed);
        this.acc -= fixed;
        steps++;
      }
      // continuous break / place
      if (this.mouseDown[0]) {
        this.breakTimer -= dt;
        if (this.breakTimer <= 0) {
          this.breakBlock();
          this.breakTimer = 0.22;
        }
      }
      if (this.mouseDown[2]) {
        this.placeTimer -= dt;
        if (this.placeTimer <= 0) {
          this.placeBlock();
          this.placeTimer = 0.22;
        }
      }
    }

    // camera
    const bobAmt = this.onGround && !this.flying ? Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 5) : 0;
    const bobY = Math.sin(this.bob * 4) * 0.045 * bobAmt;
    const bobX = Math.cos(this.bob * 2) * 0.035 * bobAmt;
    this.camera.position.set(this.pos.x + bobX, this.pos.y + EYE + bobY, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, Math.sin(this.bob * 2) * 0.006 * bobAmt, 'YXZ');
    const targetFov = this.settings.fov * (this.sprinting && !this.flying ? 1.08 : 1) * (this.flying && this.sprinting ? 1.12 : 1);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 8);
      this.camera.updateProjectionMatrix();
    }

    // target block
    this.targetHit = this.world.raycast(this.eyePos(), this.lookDir(), 6);
    if (this.targetHit && this.ready) {
      this.highlight.visible = true;
      this.highlight.position.set(this.targetHit.x + 0.5, this.targetHit.y + 0.5, this.targetHit.z + 0.5);
    } else {
      this.highlight.visible = false;
    }

    this.updateParticles(dt);
    this.updateSky(dt);
    this.updateHand(dt);

    // underwater tint
    const camBlock = this.world.getBlock(
      Math.floor(this.camera.position.x), Math.floor(this.camera.position.y), Math.floor(this.camera.position.z),
    );
    const underwater = camBlock === BLOCK.WATER;
    if (underwater) {
      (this.scene.fog as THREE.Fog).color.setHex(0x1b4a8a);
      (this.scene.fog as THREE.Fog).near = 0.1;
      (this.scene.fog as THREE.Fog).far = 18;
    }

    this.renderer.autoClear = true;
    this.renderer.render(this.scene, this.camera);
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.render(this.handScene, this.handCam);
    this.renderer.autoClear = true;

    // stats
    this.statTimer += dt;
    if (this.statTimer > 0.2 && this.onStats) {
      this.statTimer = 0;
      const tgt = this.targetHit ? BLOCKS[this.targetHit.block]?.name ?? '-' : '-';
      this.onStats({
        fps: Math.round(this.fps),
        x: this.pos.x, y: this.pos.y, z: this.pos.z,
        chunks: this.chunkGroup.children.length,
        tris: this.renderer.info.render.triangles,
        target: tgt,
        biome: this.biomeAt(),
        flying: this.flying,
        onGround: this.onGround,
        time: this.settings.timeOfDay,
        underwater,
      });
    }
  };

  private biomeAt(): string {
    const x = Math.floor(this.pos.x), z = Math.floor(this.pos.z);
    const h = this.world.heightAt(x, z);
    if (h <= SEA_LEVEL) return 'Ocean';
    if (h > 56) return 'Mountains';
    const b = this.world.getBlock(x, Math.max(0, Math.floor(this.pos.y) - 1), z);
    if (b === BLOCK.SAND) return 'Desert';
    if (b === BLOCK.SNOW) return 'Snowy Peaks';
    return 'Plains';
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (p) this.keys.clear();
  }

  applySettings(s: Partial<Settings>) {
    Object.assign(this.settings, s);
    if (s.fov !== undefined) {
      this.camera.fov = s.fov;
      this.camera.updateProjectionMatrix();
    }
    if (s.volume !== undefined) sfx.setVolume(s.volume);
    if (s.renderDistance !== undefined) this.offsetsFor = -1;
  }

  newWorld(seed: number) {
    for (const [, c] of this.world.chunks) {
      if (c.mesh) {
        this.chunkGroup.remove(c.mesh);
        c.mesh.geometry.dispose();
      }
      if (c.waterMesh) {
        this.chunkGroup.remove(c.waterMesh);
        c.waterMesh.geometry.dispose();
      }
    }
    this.seed = seed;
    this.world = new World(seed);
    this.ready = false;
    this.spawned = false;
    this.pos.set(8, 80, 8);
    this.vel.set(0, 0, 0);
    this.onProgress?.(0);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.unbindEvents();
    for (const [, c] of this.world.chunks) {
      c.mesh?.geometry.dispose();
      c.waterMesh?.geometry.dispose();
    }
    this.terrainMat.dispose();
    this.waterMat.dispose();
    this.atlasTex.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}

export { chunkKey };
