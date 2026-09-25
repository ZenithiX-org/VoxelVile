import { useCallback, useEffect, useRef, useState } from 'react';
import { Engine, type EngineStats, type Settings } from './game/engine';
import { Crosshair, DebugPanel, Hotbar, ScreenEffects, StatusLine } from './components/Hud';
import {
  InventoryPanel, LoadingScreen, PauseMenu, SettingsPanel, TitleScreen,
} from './components/Menus';
import { BLOCK } from './game/blocks';

type Mode = 'loading' | 'title' | 'playing' | 'paused' | 'inventory';

const DEFAULT_SETTINGS: Settings = {
  renderDistance: 6,
  fov: 75,
  sensitivity: 1,
  volume: 0.6,
  dayCycle: true,
  timeOfDay: 0.3,
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem('voxelcraft.settings');
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SETTINGS };
}

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const modeRef = useRef<Mode>('loading');

  const [mode, setModeState] = useState<Mode>('loading');
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<EngineStats | null>(null);
  const [slot, setSlot] = useState(0);
  const [hotbar, setHotbar] = useState<number[]>([
    BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.COBBLE, BLOCK.PLANKS,
    BLOCK.LOG, BLOCK.LEAVES, BLOCK.GLASS, BLOCK.GLOWSTONE,
  ]);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 900000) + 1000);
  const [touchDevice] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
  );
  const [webglError, setWebglError] = useState(false);

  const setMode = useCallback((m: Mode) => {
    modeRef.current = m;
    setModeState(m);
  }, []);

  // --- engine lifecycle -------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let engine: Engine;
    try {
      engine = new Engine(container, seed);
    } catch (err) {
      console.error(err);
      setWebglError(true);
      return;
    }
    engineRef.current = engine;
    engine.applySettings(loadSettings());
    engine.hotbar = [...hotbar];
    engine.cinematic = true;

    engine.onProgress = (p) => setProgress(p);
    engine.onReady = () => {
      if (modeRef.current === 'loading') setMode('title');
    };
    engine.onStats = (s) => setStats(s);
    engine.onSlotChange = (i) => {
      setSlot(i);
      setHotbar([...engine.hotbar]);
    };
    engine.onLockChange = (locked) => {
      if (locked) {
        engine.setPaused(false);
        engine.cinematic = false;
        setMode('playing');
      } else {
        engine.setPaused(true);
        if (modeRef.current === 'playing') setMode('paused');
      }
    };
    engine.start();

    const onResize = () => engine.onResize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- global UI keys ---------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const engine = engineRef.current;
      if (!engine) return;
      if (e.code === 'F3') {
        e.preventDefault();
        setShowDebug((d) => !d);
        return;
      }
      if (e.code === 'KeyE') {
        if (modeRef.current === 'playing') {
          setMode('inventory');
          engine.setPaused(true);
          engine.unlock();
        } else if (modeRef.current === 'inventory') {
          setMode('playing');
          engine.lock();
        }
        return;
      }
      if (e.code === 'Escape') {
        if (showSettings) {
          setShowSettings(false);
        } else if (modeRef.current === 'inventory') {
          setMode('paused');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setMode, showSettings]);

  useEffect(() => {
    const engine = engineRef.current;
    if (engine) engine.cinematic = mode === 'title';
  }, [mode]);

  // --- actions ----------------------------------------------------------------
  const play = () => {
    engineRef.current?.lock();
  };

  const changeSettings = (patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      engineRef.current?.applySettings(patch);
      try {
        localStorage.setItem('voxelcraft.settings', JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const openSettings = () => {
    const engine = engineRef.current;
    if (engine) setSettings({ ...engine.settings });
    setShowSettings(true);
  };

  const newWorld = () => {
    const engine = engineRef.current;
    if (!engine) return;
    const s = Math.floor(Math.random() * 900000) + 1000;
    setSeed(s);
    setProgress(0);
    setShowSettings(false);
    setMode('loading');
    engine.newWorld(s);
  };

  const selectSlot = (i: number) => {
    const engine = engineRef.current;
    if (engine) engine.selectedSlot = i;
    setSlot(i);
  };

  const pickBlockFromPalette = (id: number) => {
    const engine = engineRef.current;
    const next = [...hotbar];
    next[slot] = id;
    setHotbar(next);
    if (engine) engine.hotbar = next;
  };

  const hudVisible = mode === 'playing' || mode === 'paused' || mode === 'inventory';

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0b0d12]">
      <div ref={containerRef} className="absolute inset-0" />

      {hudVisible && (
        <>
          <ScreenEffects underwater={!!stats?.underwater} />
          <Crosshair hidden={mode !== 'playing'} />
          <Hotbar hotbar={hotbar} slot={slot} onSelect={selectSlot} />
          {showDebug ? <DebugPanel stats={stats} seed={seed} /> : <StatusLine stats={stats} />}
          {mode === 'playing' && (
            <div className="font-pixel pointer-events-none absolute bottom-2 right-3 text-[8px] text-white/35">
              F3 debug · E blocks · Esc menu
            </div>
          )}
        </>
      )}

      {webglError && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 p-6">
          <div className="mc-panel max-w-md px-8 py-7 text-center">
            <h2 className="font-pixel mb-4 text-[13px] text-red-300">WebGL unavailable</h2>
            <p className="text-[12px] leading-relaxed text-white/70">
              Voxelcraft needs hardware-accelerated WebGL. Try another browser or enable GPU
              acceleration, then reload the page.
            </p>
          </div>
        </div>
      )}

      {!webglError && mode === 'loading' && <LoadingScreen progress={progress} />}

      {mode === 'title' && !showSettings && (
        <TitleScreen onPlay={play} onNewWorld={newWorld} onSettings={openSettings} seed={seed} />
      )}

      {mode === 'paused' && !showSettings && (
        <PauseMenu
          onResume={play}
          onSettings={openSettings}
          onNewWorld={newWorld}
          onTitle={() => setMode('title')}
        />
      )}

      {mode === 'inventory' && (
        <InventoryPanel
          hotbar={hotbar}
          slot={slot}
          onPick={pickBlockFromPalette}
          onSelectSlot={selectSlot}
          onClose={() => {
            setMode('playing');
            engineRef.current?.lock();
          }}
        />
      )}

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onChange={changeSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {touchDevice && mode === 'title' && (
        <div className="font-pixel absolute bottom-3 left-1/2 z-50 -translate-x-1/2 rounded bg-black/70 px-3 py-2 text-[8px] text-amber-200">
          Keyboard + mouse required — play on a desktop browser
        </div>
      )}
    </div>
  );
}
