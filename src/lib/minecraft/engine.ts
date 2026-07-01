// The core game engine: Three.js scene, player physics, controls, raycasting,
// chunk streaming, mobile input API, and world serialization.
import * as THREE from "three";
import { CHUNK_HEIGHT, CHUNK_SIZE, SEA_LEVEL, World, type Chunk } from "./world";
import { BlockType, HOTBAR, isSolid } from "./blocks";
import { getAtlasTexture } from "./textures";
import type { PlayerState } from "./storage";

const PLAYER_HALF_WIDTH = 0.3;
const PLAYER_HEIGHT = 1.8;
const PLAYER_EYE = 1.62;
const GRAVITY = 28;
const JUMP_VELOCITY = 8.6;
const WALK_SPEED = 4.6;
const SPRINT_SPEED = 7.2;
const FLY_SPEED = 9;
const FLY_SPRINT_SPEED = 18;
const REACH = 6;
const RENDER_DISTANCE = 4;
const MAX_FPS_BUILD = 2;

const WATER_GRAVITY = 9;
const SWIM_UP_SPEED = 5.0;
const SWIM_DOWN_SPEED = 4.0;
const SWIM_SPEED = 3.6;
const WATER_SPRINT_SPEED = 5.4;

export interface EngineState {
  fps: number;
  position: { x: number; y: number; z: number };
  selectedSlot: number;
  flying: boolean;
  pointerLocked: boolean;
  loadedChunks: number;
  blockName: string;
  underwater: boolean;
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private world: World;

  private position = new THREE.Vector3(8, 40, 8);
  private velocity = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;
  private onGround = false;
  private flying = false;
  private sprinting = false;

  private keys = new Set<string>();
  private mouseLeftDown = false;
  private mouseRightDown = false;
  private breakCooldown = 0;
  private placeCooldown = 0;

  // Mobile / touch input
  private touchMove = new THREE.Vector2(0, 0); // joystick x,z in [-1,1]
  private touchBreaking = false;
  private touchPlacing = false;

  private selectedSlot = 0;
  private highlight: THREE.LineSegments;

  private chunkMeshes = new Map<string, { opaque: THREE.Mesh | null; transparent: THREE.Mesh | null }>();
  private buildQueue: Chunk[] = [];

  private lastTime = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private fps = 0;
  private rafId = 0;
  private running = false;
  private stateCallback?: (s: EngineState) => void;
  private stateAccum = 0;

  private boundResize: () => void;
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundKeyUp: (e: KeyboardEvent) => void;
  private boundMouseMove: (e: MouseEvent) => void;
  private boundMouseDown: (e: MouseEvent) => void;
  private boundMouseUp: (e: MouseEvent) => void;
  private boundWheel: (e: WheelEvent) => void;
  private boundClick: () => void;
  private boundPointerLockChange: () => void;
  private boundContextMenu: (e: Event) => void;
  private lastSpaceTime = 0;

  private opaqueMaterial: THREE.MeshLambertMaterial;
  private transparentMaterial: THREE.MeshLambertMaterial;
  private skyTexture: THREE.Texture;
  private fogColor: THREE.Color;
  private underwaterColor: THREE.Color;
  private underwater = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    const skyZenith = new THREE.Color(0x4a90d9);
    const skyHorizon = new THREE.Color(0xbfe3ff);
    this.skyTexture = makeSkyGradient(skyZenith, skyHorizon);
    this.scene.background = this.skyTexture;
    this.fogColor = skyHorizon.clone();
    this.scene.fog = new THREE.Fog(this.fogColor.getHex(), (RENDER_DISTANCE - 1.6) * CHUNK_SIZE, RENDER_DISTANCE * CHUNK_SIZE);
    this.underwaterColor = new THREE.Color(0x2f63c4);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.62));
    const sun = new THREE.DirectionalLight(0xfff4e0, 0.72);
    sun.position.set(0.5, 1.0, 0.35).normalize();
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x4a5a3a, 0.32));

    const atlas = getAtlasTexture();
    this.opaqueMaterial = new THREE.MeshLambertMaterial({ map: atlas });
    this.transparentMaterial = new THREE.MeshLambertMaterial({ map: atlas, transparent: true, depthWrite: false, side: THREE.DoubleSide });

    const boxGeo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    this.highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(boxGeo),
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 }),
    );
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    this.world = new World(1337);
    this.world.onChunkRemove = (chunk) => {
      const k = `${chunk.cx},${chunk.cz}`;
      const meshes = this.chunkMeshes.get(k);
      if (meshes) {
        if (meshes.opaque) { this.scene.remove(meshes.opaque); meshes.opaque.geometry.dispose(); }
        if (meshes.transparent) { this.scene.remove(meshes.transparent); meshes.transparent.geometry.dispose(); }
        this.chunkMeshes.delete(k);
      }
    };

    this.boundResize = () => this.onResize();
    this.boundKeyDown = (e) => this.onKeyDown(e);
    this.boundKeyUp = (e) => this.onKeyUp(e);
    this.boundMouseMove = (e) => this.onMouseMove(e);
    this.boundMouseDown = (e) => this.onMouseDown(e);
    this.boundMouseUp = (e) => this.onMouseUp(e);
    this.boundWheel = (e) => this.onWheel(e);
    this.boundClick = () => this.requestPointerLock();
    this.boundPointerLockChange = () => this.onPointerLockChange();
    this.boundContextMenu = (e) => e.preventDefault();
    this.addEventListeners();
  }

  setStateCallback(cb: (s: EngineState) => void) {
    this.stateCallback = cb;
  }

  private addEventListeners() {
    window.addEventListener("resize", this.boundResize);
    window.addEventListener("keydown", this.boundKeyDown);
    window.addEventListener("keyup", this.boundKeyUp);
    document.addEventListener("mousemove", this.boundMouseMove);
    this.canvas.addEventListener("mousedown", this.boundMouseDown);
    window.addEventListener("mouseup", this.boundMouseUp);
    window.addEventListener("wheel", this.boundWheel, { passive: false });
    this.canvas.addEventListener("click", this.boundClick);
    document.addEventListener("pointerlockchange", this.boundPointerLockChange);
    this.canvas.addEventListener("contextmenu", this.boundContextMenu);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.updateChunks();
    this.spawnPlayer();
    this.loop();
  }

  private spawnPlayer() {
    const tryAt = (x: number, z: number): number => {
      let y = CHUNK_HEIGHT - 1;
      while (y > 0) {
        const b = this.world.getBlock(x, y, z);
        if (b !== BlockType.AIR && b !== BlockType.WATER) return y;
        y--;
      }
      return -1;
    };
    let sx = 8, sz = 8;
    let groundY = tryAt(sx, sz);
    if (groundY < 0) {
      outer: for (let r = 2; r < 64; r += 2) {
        for (let a = 0; a < r * 8; a++) {
          const ang = (a / (r * 8)) * Math.PI * 2;
          sx = Math.round(8 + Math.cos(ang) * r);
          sz = Math.round(8 + Math.sin(ang) * r);
          groundY = tryAt(sx, sz);
          if (groundY >= 0) break outer;
        }
      }
    }
    if (groundY < 0) groundY = SEA_LEVEL;
    this.position.set(sx + 0.5, groundY + 1, sz + 0.5);
    this.velocity.set(0, 0, 0);
  }

  respawn() {
    this.spawnPlayer();
  }

  private loop = () => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);
    const now = performance.now();
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (dt > 0.1) dt = 0.1;
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsAccum = 0; this.fpsFrames = 0;
    }
    this.stateAccum += dt;
    if (this.stateAccum >= 0.2) {
      this.stateAccum = 0;
      this.reportState();
    }
  };

  private reportState() {
    this.stateCallback?.({
      fps: this.fps,
      position: { x: this.position.x, y: this.position.y, z: this.position.z },
      selectedSlot: this.selectedSlot,
      flying: this.flying,
      pointerLocked: document.pointerLockElement === this.canvas,
      loadedChunks: this.chunkMeshes.size,
      blockName: HOTBAR[this.selectedSlot] ? this.blockName(HOTBAR[this.selectedSlot]) : "",
      underwater: this.underwater,
    });
  }

  private blockName(type: number): string {
    const names: Record<number, string> = {
      [BlockType.GRASS]: "Grass", [BlockType.DIRT]: "Dirt", [BlockType.STONE]: "Stone",
      [BlockType.COBBLE]: "Cobblestone", [BlockType.WOOD]: "Wood", [BlockType.PLANKS]: "Planks",
      [BlockType.LEAVES]: "Leaves", [BlockType.SAND]: "Sand", [BlockType.GLASS]: "Glass",
    };
    return names[type] ?? "Block";
  }

  private update(dt: number) {
    this.handleInput(dt);
    this.applyPhysics(dt);
    this.updateCamera();
    this.updateUnderwater();
    this.updateChunks();
    this.processBuildQueue();
    this.updateHighlight();
    this.handleMouseActions(dt);
  }

  private updateUnderwater() {
    const submerged = this.isEyeInWater();
    if (submerged === this.underwater) return;
    this.underwater = submerged;
    const fog = this.scene.fog as THREE.Fog;
    if (submerged) {
      this.scene.background = this.underwaterColor;
      fog.color.copy(this.underwaterColor);
      fog.near = 0.1; fog.far = 16;
    } else {
      this.scene.background = this.skyTexture;
      fog.color.copy(this.fogColor);
      fog.near = (RENDER_DISTANCE - 1.6) * CHUNK_SIZE;
      fog.far = RENDER_DISTANCE * CHUNK_SIZE;
    }
  }

  private isInWater(): boolean {
    const px = this.position.x, py = this.position.y, pz = this.position.z;
    if (this.world.getBlock(Math.floor(px), Math.floor(py + 0.2), Math.floor(pz)) === BlockType.WATER) return true;
    if (this.world.getBlock(Math.floor(px), Math.floor(py + 0.9), Math.floor(pz)) === BlockType.WATER) return true;
    return false;
  }

  private isEyeInWater(): boolean {
    return this.world.getBlock(Math.floor(this.position.x), Math.floor(this.position.y + PLAYER_EYE), Math.floor(this.position.z)) === BlockType.WATER;
  }

  private handleInput(dt: number) {
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const move = new THREE.Vector3();
    // Keyboard input
    if (this.keys.has("KeyW")) move.add(forward);
    if (this.keys.has("KeyS")) move.sub(forward);
    if (this.keys.has("KeyD")) move.add(right);
    if (this.keys.has("KeyA")) move.sub(right);
    // Touch joystick input (overrides keyboard when active)
    if (this.touchMove.lengthSq() > 0.001) {
      move.set(0, 0, 0);
      move.addScaledVector(forward, -this.touchMove.y);
      move.addScaledVector(right, this.touchMove.x);
    }

    this.sprinting = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    if (move.lengthSq() > 0) move.normalize();

    const inWater = this.isInWater();

    if (this.flying) {
      const speed = this.sprinting ? FLY_SPRINT_SPEED : FLY_SPEED;
      this.velocity.x = move.x * speed;
      this.velocity.z = move.z * speed;
      let vy = 0;
      if (this.keys.has("Space") || this.touchMove.y < -0.3) vy += speed;
      if (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || this.touchMove.y > 0.3) vy -= speed;
      this.velocity.y = vy;
    } else if (inWater) {
      const speed = this.sprinting ? WATER_SPRINT_SPEED : SWIM_SPEED;
      this.velocity.x = move.x * speed;
      this.velocity.z = move.z * speed;
      const wantUp = this.keys.has("Space");
      const wantDown = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
      const swimming = wantUp || wantDown;
      if (wantUp) {
        this.velocity.y = this.onGround ? JUMP_VELOCITY : SWIM_UP_SPEED;
      } else if (wantDown) {
        this.velocity.y = -SWIM_DOWN_SPEED;
      } else {
        this.velocity.y -= WATER_GRAVITY * dt;
      }
      const drag = Math.exp(-3.0 * dt);
      this.velocity.x *= drag;
      this.velocity.z *= drag;
      if (!swimming) this.velocity.y *= drag;
    } else {
      const speed = this.sprinting ? SPRINT_SPEED : WALK_SPEED;
      this.velocity.x = move.x * speed;
      this.velocity.z = move.z * speed;
      this.velocity.y -= GRAVITY * dt;
      if ((this.keys.has("Space")) && this.onGround) {
        this.velocity.y = JUMP_VELOCITY;
        this.onGround = false;
      }
    }
  }

  private applyPhysics(dt: number) {
    if (this.flying) {
      this.moveAxis("x", this.velocity.x * dt);
      this.moveAxis("y", this.velocity.y * dt);
      this.moveAxis("z", this.velocity.z * dt);
      if (this.position.y < 1) this.position.y = 1;
      return;
    }
    this.onGround = false;
    this.moveAxis("x", this.velocity.x * dt);
    this.moveAxis("z", this.velocity.z * dt);
    this.moveAxis("y", this.velocity.y * dt);
    if (this.position.y < -10) this.spawnPlayer();
  }

  private moveAxis(axis: "x" | "y" | "z", amount: number) {
    if (amount === 0) return;
    this.position[axis] += amount;
    const minX = this.position.x - PLAYER_HALF_WIDTH;
    const maxX = this.position.x + PLAYER_HALF_WIDTH;
    const minY = this.position.y;
    const maxY = this.position.y + PLAYER_HEIGHT;
    const minZ = this.position.z - PLAYER_HALF_WIDTH;
    const maxZ = this.position.z + PLAYER_HALF_WIDTH;
    const bx0 = Math.floor(minX), bx1 = Math.floor(maxX);
    const by0 = Math.floor(minY), by1 = Math.floor(maxY);
    const bz0 = Math.floor(minZ), bz1 = Math.floor(maxZ);
    for (let bx = bx0; bx <= bx1; bx++) {
      for (let by = by0; by <= by1; by++) {
        for (let bz = bz0; bz <= bz1; bz++) {
          if (!isSolid(this.world.getBlock(bx, by, bz))) continue;
          if (axis === "x") {
            if (amount > 0) this.position.x = bx - PLAYER_HALF_WIDTH - 1e-4;
            else this.position.x = bx + 1 + PLAYER_HALF_WIDTH + 1e-4;
            this.velocity.x = 0;
          } else if (axis === "y") {
            if (amount > 0) { this.position.y = by - PLAYER_HEIGHT - 1e-4; this.velocity.y = 0; }
            else { this.position.y = by + 1; this.velocity.y = 0; this.onGround = true; }
          } else {
            if (amount > 0) this.position.z = bz - PLAYER_HALF_WIDTH - 1e-4;
            else this.position.z = bz + 1 + PLAYER_HALF_WIDTH + 1e-4;
            this.velocity.z = 0;
          }
          return;
        }
      }
    }
  }

  private updateCamera() {
    this.camera.position.set(this.position.x, this.position.y + PLAYER_EYE, this.position.z);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  private updateChunks() {
    const pcx = Math.floor(this.position.x / CHUNK_SIZE);
    const pcz = Math.floor(this.position.z / CHUNK_SIZE);
    for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
      for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
        const cx = pcx + dx, cz = pcz + dz;
        if (dx * dx + dz * dz > (RENDER_DISTANCE + 0.5) ** 2) continue;
        const chunk = this.world.ensureChunk(cx, cz);
        if (chunk.dirty && !this.buildQueue.includes(chunk)) this.buildQueue.push(chunk);
      }
    }
    const limit = RENDER_DISTANCE + 2;
    for (const chunk of this.world.allChunks()) {
      if (Math.abs(chunk.cx - pcx) > limit || Math.abs(chunk.cz - pcz) > limit) {
        this.world.removeChunk(chunk.cx, chunk.cz);
      }
    }
  }

  private processBuildQueue() {
    if (this.buildQueue.length === 0) {
      const dirty = this.world.getDirtyChunks();
      for (const c of dirty) this.buildQueue.push(c);
    }
    let built = 0;
    while (this.buildQueue.length > 0 && built < MAX_FPS_BUILD) {
      const chunk = this.buildQueue.shift()!;
      if (!chunk.dirty) continue;
      this.rebuildChunkMesh(chunk);
      chunk.dirty = false;
      built++;
    }
  }

  private rebuildChunkMesh(chunk: Chunk) {
    const { opaque, transparent } = this.world.buildMeshes(chunk);
    const k = `${chunk.cx},${chunk.cz}`;
    let meshes = this.chunkMeshes.get(k);
    if (!meshes) { meshes = { opaque: null, transparent: null }; this.chunkMeshes.set(k, meshes); }
    if (meshes.opaque) { this.scene.remove(meshes.opaque); meshes.opaque.geometry.dispose(); meshes.opaque = null; }
    if (opaque) { const mesh = new THREE.Mesh(opaque, this.opaqueMaterial); mesh.frustumCulled = true; this.scene.add(mesh); meshes.opaque = mesh; }
    if (meshes.transparent) { this.scene.remove(meshes.transparent); meshes.transparent.geometry.dispose(); meshes.transparent = null; }
    if (transparent) { const mesh = new THREE.Mesh(transparent, this.transparentMaterial); mesh.frustumCulled = true; mesh.renderOrder = 1; this.scene.add(mesh); meshes.transparent = mesh; }
  }

  private raycastVoxel(): { x: number; y: number; z: number; nx: number; ny: number; nz: number } | null {
    const origin = new THREE.Vector3(this.position.x, this.position.y + PLAYER_EYE, this.position.z);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    if (dir.lengthSq() === 0) return null;
    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    const stepX = Math.sign(dir.x), stepY = Math.sign(dir.y), stepZ = Math.sign(dir.z);
    const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;
    const distToBoundary = (o: number, s: number) => s > 0 ? Math.ceil(o) - o : s < 0 ? o - Math.floor(o) : Infinity;
    let tMaxX = dir.x !== 0 ? distToBoundary(origin.x, stepX) * tDeltaX : Infinity;
    let tMaxY = dir.y !== 0 ? distToBoundary(origin.y, stepY) * tDeltaY : Infinity;
    let tMaxZ = dir.z !== 0 ? distToBoundary(origin.z, stepZ) * tDeltaZ : Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    while (t <= REACH) {
      const block = this.world.getBlock(x, y, z);
      if (block !== BlockType.AIR && block !== BlockType.WATER) return { x, y, z, nx, ny, nz };
      if (tMaxX < tMaxY && tMaxX < tMaxZ) { x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0; }
      else if (tMaxY < tMaxZ) { y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0; }
      else { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ; }
    }
    return null;
  }

  private updateHighlight() {
    const hit = this.raycastVoxel();
    if (!hit) { this.highlight.visible = false; return; }
    this.highlight.visible = true;
    this.highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  }

  private handleMouseActions(dt: number) {
    this.breakCooldown -= dt;
    this.placeCooldown -= dt;
    const breaking = this.mouseLeftDown || this.touchBreaking;
    const placing = this.mouseRightDown || this.touchPlacing;
    if (breaking && this.breakCooldown <= 0) {
      const hit = this.raycastVoxel();
      if (hit) { this.world.setBlock(hit.x, hit.y, hit.z, BlockType.AIR); this.breakCooldown = 0.22; }
    }
    if (placing && this.placeCooldown <= 0) {
      const hit = this.raycastVoxel();
      if (hit) {
        const px = hit.x + hit.nx, py = hit.y + hit.ny, pz = hit.z + hit.nz;
        if (!this.intersectsPlayer(px, py, pz)) {
          const type = HOTBAR[this.selectedSlot];
          if (type !== undefined) { this.world.setBlock(px, py, pz, type); this.placeCooldown = 0.22; }
        }
      }
    }
  }

  private intersectsPlayer(bx: number, by: number, bz: number): boolean {
    const minX = this.position.x - PLAYER_HALF_WIDTH, maxX = this.position.x + PLAYER_HALF_WIDTH;
    const minY = this.position.y, maxY = this.position.y + PLAYER_HEIGHT;
    const minZ = this.position.z - PLAYER_HALF_WIDTH, maxZ = this.position.z + PLAYER_HALF_WIDTH;
    return bx + 1 > minX && bx < maxX && by + 1 > minY && by < maxY && bz + 1 > minZ && bz < maxZ;
  }

  private onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private onKeyDown(e: KeyboardEvent) {
    if (e.code.startsWith("Digit")) {
      const n = parseInt(e.code.slice(5), 10);
      if (n >= 1 && n <= HOTBAR.length) this.selectedSlot = n - 1;
    }
    if (e.code === "Space") {
      const now = performance.now();
      if (now - this.lastSpaceTime < 280) { this.flying = !this.flying; this.velocity.y = 0; }
      this.lastSpaceTime = now;
    }
    this.keys.add(e.code);
    if (e.code === "Space") e.preventDefault();
  }

  private onKeyUp(e: KeyboardEvent) {
    this.keys.delete(e.code);
  }

  private onMouseMove(e: MouseEvent) {
    if (!this.isPointerLocked()) return;
    const sens = 0.0022;
    this.yaw -= e.movementX * sens;
    this.pitch -= e.movementY * sens;
    const limit = Math.PI / 2 - 0.01;
    if (this.pitch > limit) this.pitch = limit;
    if (this.pitch < -limit) this.pitch = -limit;
  }

  private onMouseDown(e: MouseEvent) {
    if (!this.isPointerLocked()) return;
    if (e.button === 0) this.mouseLeftDown = true;
    if (e.button === 2) this.mouseRightDown = true;
  }

  private onMouseUp(e: MouseEvent) {
    if (e.button === 0) this.mouseLeftDown = false;
    if (e.button === 2) this.mouseRightDown = false;
  }

  private onWheel(e: WheelEvent) {
    if (!this.isPointerLocked()) return;
    e.preventDefault();
    const dir = e.deltaY > 0 ? 1 : -1;
    this.selectedSlot = (this.selectedSlot + dir + HOTBAR.length) % HOTBAR.length;
  }

  private requestPointerLock() {
    if (this.isPointerLocked()) return;
    try {
      const result = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (result && typeof result.catch === "function") result.catch(() => {});
    } catch { /* ignore */ }
  }

  private onPointerLockChange() {
    if (!this.isPointerLocked()) {
      this.keys.clear();
      this.mouseLeftDown = false;
      this.mouseRightDown = false;
    }
    this.reportState();
  }

  private isPointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  // ---- Public mobile / touch control API ----

  /** Set movement vector from joystick. x = strafe, y = forward(-)/backward(+). */
  setMoveVector(x: number, y: number) {
    this.touchMove.set(x, y);
  }

  /** Set a virtual key (e.g. "Space", "ShiftLeft") pressed/released state. */
  setVirtualKey(code: string, pressed: boolean) {
    if (pressed) this.keys.add(code);
    else this.keys.delete(code);
  }

  /** Toggle fly mode (for mobile fly button). */
  toggleFly() {
    this.flying = !this.flying;
    this.velocity.y = 0;
  }

  /** Apply look delta from touch drag (does not require pointer lock). */
  addLook(dx: number, dy: number) {
    const sens = 0.005;
    this.yaw -= dx * sens;
    this.pitch -= dy * sens;
    const limit = Math.PI / 2 - 0.01;
    if (this.pitch > limit) this.pitch = limit;
    if (this.pitch < -limit) this.pitch = -limit;
  }

  /** Set break-block button state. */
  setBreaking(pressed: boolean) {
    this.touchBreaking = pressed;
  }

  /** Set place-block button state. */
  setPlacing(pressed: boolean) {
    this.touchPlacing = pressed;
  }

  setSelectedSlot(slot: number) {
    if (slot >= 0 && slot < HOTBAR.length) this.selectedSlot = slot;
  }

  get flying() {
    return this.flying;
  }

  getWorld() {
    return this.world;
  }

  // ---- Save / Load serialization ----

  serialize(): { seed: number; player: PlayerState; chunks: { cx: number; cz: number; data: Uint8Array }[] } {
    return {
      seed: this.world.seed,
      player: {
        x: this.position.x,
        y: this.position.y,
        z: this.position.z,
        yaw: this.yaw,
        pitch: this.pitch,
        flying: this.flying,
        selectedSlot: this.selectedSlot,
      },
      chunks: this.world.exportChunks(),
    };
  }

  deserialize(data: { seed: number; player: PlayerState; chunks: { cx: number; cz: number; data: Uint8Array }[] }) {
    // Replace world contents with loaded chunks.
    this.world.importChunks(data.chunks);
    // Restore player state.
    this.position.set(data.player.x, data.player.y, data.player.z);
    this.velocity.set(0, 0, 0);
    this.yaw = data.player.yaw;
    this.pitch = data.player.pitch;
    this.flying = data.player.flying;
    this.selectedSlot = data.player.selectedSlot ?? 0;
    // Clear mesh cache so all chunks rebuild.
    for (const meshes of this.chunkMeshes.values()) {
      if (meshes.opaque) { this.scene.remove(meshes.opaque); meshes.opaque.geometry.dispose(); }
      if (meshes.transparent) { this.scene.remove(meshes.transparent); meshes.transparent.geometry.dispose(); }
    }
    this.chunkMeshes.clear();
    this.buildQueue = [];
    // Force immediate chunk stream around new position.
    this.updateChunks();
    this.reportState();
  }

  /** Generate a fresh world with a new (or specified) seed. */
  regenerateWorld(seed?: number) {
    // Clear all chunk meshes.
    for (const meshes of this.chunkMeshes.values()) {
      if (meshes.opaque) { this.scene.remove(meshes.opaque); meshes.opaque.geometry.dispose(); }
      if (meshes.transparent) { this.scene.remove(meshes.transparent); meshes.transparent.geometry.dispose(); }
    }
    this.chunkMeshes.clear();
    this.buildQueue = [];
    // Create a new world.
    const newSeed = seed ?? Math.floor(Math.random() * 1000000);
    this.world = new World(newSeed);
    this.world.onChunkRemove = (chunk) => {
      const k = `${chunk.cx},${chunk.cz}`;
      const meshes = this.chunkMeshes.get(k);
      if (meshes) {
        if (meshes.opaque) { this.scene.remove(meshes.opaque); meshes.opaque.geometry.dispose(); }
        if (meshes.transparent) { this.scene.remove(meshes.transparent); meshes.transparent.geometry.dispose(); }
        this.chunkMeshes.delete(k);
      }
    };
    // Reset player state.
    this.velocity.set(0, 0, 0);
    this.flying = false;
    this.underwater = false;
    this.updateUnderwater();
    this.updateChunks();
    this.spawnPlayer();
    this.reportState();
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener("resize", this.boundResize);
    window.removeEventListener("keydown", this.boundKeyDown);
    window.removeEventListener("keyup", this.boundKeyUp);
    document.removeEventListener("mousemove", this.boundMouseMove);
    this.canvas.removeEventListener("mousedown", this.boundMouseDown);
    window.removeEventListener("mouseup", this.boundMouseUp);
    window.removeEventListener("wheel", this.boundWheel);
    this.canvas.removeEventListener("click", this.boundClick);
    document.removeEventListener("pointerlockchange", this.boundPointerLockChange);
    this.canvas.removeEventListener("contextmenu", this.boundContextMenu);
    for (const m of this.chunkMeshes.values()) {
      m.opaque?.geometry.dispose();
      m.transparent?.geometry.dispose();
    }
    this.opaqueMaterial.dispose();
    this.transparentMaterial.dispose();
    this.highlight.geometry.dispose();
    this.skyTexture.dispose();
    this.renderer.dispose();
  }
}

function makeSkyGradient(zenith: THREE.Color, horizon: THREE.Color): THREE.Texture {
  const h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(2, h);
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    const k = t * t;
    const r = Math.round((zenith.r * (1 - k) + horizon.r * k) * 255);
    const g = Math.round((zenith.g * (1 - k) + horizon.g * k) * 255);
    const b = Math.round((zenith.b * (1 - k) + horizon.b * k) * 255);
    for (let x = 0; x < 2; x++) {
      const idx = (y * 2 + x) * 4;
      img.data[idx] = r; img.data[idx + 1] = g; img.data[idx + 2] = b; img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
