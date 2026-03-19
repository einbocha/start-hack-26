'use client';
import { Canvas, ThreeEvent, useFrame, useLoader } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { Suspense, useEffect, useMemo, useReducer, useRef } from 'react';
import * as THREE from 'three';
import { MTLLoader, OBJLoader } from 'three-stdlib';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

import { AssetPanel } from './components/AssetPanel';
import { Hud } from './components/Hud';
import { gameReducer, createInitialState } from '../game/reducer';
import { Asset } from '../game/types';
import { visualFor, roadVisuals } from '../game/visuals';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(0,0,0,0.4)',
      titleColor: '#fff',
      bodyColor: '#fff',
    },
  },
  scales: {
    x: {
      grid: { color: 'rgba(255,255,255,0.1)' },
      ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 11 } },
      border: { color: 'rgba(255,255,255,0.2)' },
    },
    y: {
      grid: { color: 'rgba(255,255,255,0.1)' },
      ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 11 } },
      border: { color: 'rgba(255,255,255,0.2)' },
    },
  },
} as const;

function useObjWithMtl(opts: { obj: string; mtl: string; resourcePath: string }) {
  const materials = useLoader(MTLLoader, opts.mtl, (loader) => {
    loader.setResourcePath(opts.resourcePath);
  });

  const obj = useLoader(OBJLoader, opts.obj, (loader) => {
    materials.preload();
    loader.setMaterials(materials);
  });

  useEffect(() => {
    obj.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;

      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        const anyMat = mat as unknown as {
          map?: THREE.Texture | null;
          needsUpdate?: boolean;
          // common MTL/OBJ material knobs
          shininess?: number;
          specular?: THREE.Color;
          emissive?: THREE.Color;
        };
        if (anyMat.map) anyMat.map.colorSpace = THREE.SRGBColorSpace;
        // MTLLoader often creates MeshPhongMaterial which can blow out under strong lights.
        if (typeof anyMat.shininess === 'number') anyMat.shininess = Math.min(anyMat.shininess, 18);
        if (anyMat.specular instanceof THREE.Color) anyMat.specular.multiplyScalar(0.2);
        if (anyMat.emissive instanceof THREE.Color) anyMat.emissive.multiplyScalar(0.6);
        if (anyMat.needsUpdate !== undefined) anyMat.needsUpdate = true;
      }
    });
  }, [obj]);

  return obj;
}

function createOutlineClone(root: THREE.Object3D, material: THREE.Material) {
  const outlineRoot = root.clone(true);
  // Ensure the outline object itself never blocks pointer events.
  (outlineRoot as unknown as { raycast?: () => void }).raycast = () => {};
  outlineRoot.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.material = material;
    child.castShadow = false;
    child.receiveShadow = false;
    // Ensure outline never blocks pointer events.
    child.raycast = () => {};
    child.renderOrder = 999;
    child.frustumCulled = false;
  });
  return outlineRoot;
}

function SelectableBuilding({
  id,
  base,
  selected,
  locked,
  assetType,
  showInvestableOutline,
  uiMode,
  position,
  rotY,
  onToggle,
  outlineMaterial,
  selectedOutlineMaterial,
}: {
  id: string;
  base: THREE.Object3D;
  selected: boolean;
  locked: boolean;
  assetType: 'stock' | 'etf';
  showInvestableOutline: boolean;
  uiMode: 'city' | 'stocks';
  position: [number, number, number];
  rotY: number;
  onToggle: (id: string) => void;
  outlineMaterial: THREE.Material;
  selectedOutlineMaterial: THREE.Material;
}) {
  const cloneWithUniqueMaterials = (src: THREE.Object3D) => {
    const c = src.clone(true);
    c.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (Array.isArray(child.material)) {
        child.material = child.material.map((m) => m.clone());
      } else {
        child.material = child.material.clone();
      }
    });
    return c;
  };

  // Stable clones so we don't regenerate meshes every render.
  const model = useMemo(() => cloneWithUniqueMaterials(base), [base]);
  const lockedModel = useMemo(() => {
    const m = cloneWithUniqueMaterials(base);
    m.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        const anyMat = mat as unknown as {
          transparent?: boolean;
          opacity?: number;
          color?: THREE.Color;
          emissive?: THREE.Color;
          needsUpdate?: boolean;
        };
        anyMat.transparent = true;
        anyMat.opacity = 0.28;
        if (anyMat.color) anyMat.color = anyMat.color.clone().multiplyScalar(0.55);
        if (anyMat.emissive) anyMat.emissive = anyMat.emissive.clone().multiplyScalar(0.2);
        if (anyMat.needsUpdate !== undefined) anyMat.needsUpdate = true;
      }
    });
    return m;
  }, [base]);
  const investableOutline = useMemo(() => createOutlineClone(base, outlineMaterial), [base, outlineMaterial]);
  const selectedOutline = useMemo(
    () => createOutlineClone(base, selectedOutlineMaterial),
    [base, selectedOutlineMaterial],
  );

  // Stronger visual cue for investable buildings (esp. the first unlocked one).
  const markerColor = assetType === 'stock' ? '#ffe08a' : '#b4dcff';
  const markerOpacity = locked ? 0.14 : assetType === 'stock' ? 0.8 : 0.55;

  return (
    <group
      position={position}
      rotation={[0, rotY, 0]}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        if (uiMode !== 'city') return;
        if (locked) return;
        e.stopPropagation();
        onToggle(id);
      }}
    >
      {/* Ground marker + outlines are only shown in City mode */}
      {uiMode === 'city' && (
        <group position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh>
            <ringGeometry args={[0.46, 0.62, 40]} />
            <meshBasicMaterial
              color={markerColor}
              transparent
              opacity={markerOpacity}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          {assetType === 'stock' && !locked && (
            <mesh>
              <circleGeometry args={[0.38, 40]} />
              <meshBasicMaterial
                color={markerColor}
                transparent
                opacity={0.12}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
          )}
        </group>
      )}

      {uiMode === 'city' && !locked && showInvestableOutline && !selected && (
        <primitive object={investableOutline} scale={1.05} />
      )}
      {uiMode === 'city' && !locked && selected && <primitive object={selectedOutline} scale={1.03} />}
      <primitive object={locked ? lockedModel : model} />
    </group>
  );
}

function TickerBubble({
  symbol,
  locked,
  selected,
  position,
  onSelect,
}: {
  symbol: string;
  locked: boolean;
  selected: boolean;
  position: [number, number, number];
  onSelect: () => void;
}) {
  return (
    <Html position={position} center distanceFactor={10} style={{ pointerEvents: locked ? 'none' : 'auto' }}>
      <div
        onPointerDown={(e) => {
          if (locked) return;
          e.stopPropagation();
          onSelect();
        }}
        style={{
          width: 76,
          height: 76,
          borderRadius: 999,
          background: locked ? 'rgba(20,24,31,0.55)' : 'rgba(255,255,255,0.16)',
          border: locked
            ? '1px solid rgba(255,255,255,0.12)'
            : selected
              ? '1px solid rgba(125,211,252,0.85)'
              : '1px solid rgba(255,255,255,0.40)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: locked ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.96)',
          fontWeight: 950,
          letterSpacing: '0.10em',
          fontSize: 13,
          lineHeight: '1',
          textAlign: 'center',
          boxShadow: locked ? 'none' : '0 12px 34px rgba(0,0,0,0.28)',
          cursor: locked ? 'default' : 'pointer',
          userSelect: 'none',
        }}
      >
        {symbol}
      </div>
    </Html>
  );
}

function CollapseIntoGround({
  uiMode,
  position,
  rotation,
  children,
  sink = 0.45,
  lastInches = 0.12,
}: {
  uiMode: 'city' | 'stocks';
  position: [number, number, number];
  rotation?: [number, number, number];
  children: React.ReactNode;
  sink?: number;
  lastInches?: number;
}) {
  const sRef = useRef(1);
  const gRef = useRef<THREE.Group | null>(null);

  useFrame((_s, dt) => {
    const target = uiMode === 'city' ? 1 : 0;
    sRef.current = THREE.MathUtils.damp(sRef.current, target, 8, dt);
    const s = sRef.current;
    if (!gRef.current) return;
    const xz = s >= lastInches ? 1 : THREE.MathUtils.clamp(s / lastInches, 0, 1);
    gRef.current.scale.set(xz, s, xz);
    gRef.current.position.y = -sink * (1 - s);
    gRef.current.visible = s > 0.001;
  });

  return (
    <group ref={gRef} position={position} rotation={rotation}>
      {children}
    </group>
  );
}

function City({
  assets,
  uiMode,
  selectedId,
  onToggleBuilding,
}: {
  assets: Asset[];
  uiMode: 'city' | 'stocks';
  selectedId: string | null;
  onToggleBuilding: (id: string) => void;
}) {
  const roadStraight = useObjWithMtl(roadVisuals.straight);
  const roadCross = useObjWithMtl(roadVisuals.cross);

  // Load all visual “archetypes” once. (No hooks in loops.)
  const modelHospital = useObjWithMtl(visualFor('Hospital'));
  const modelFactory = useObjWithMtl(visualFor('Factory'));
  const modelRetailShop = useObjWithMtl(visualFor('RetailShop'));
  const modelSkyscraper = useObjWithMtl(visualFor('Skyscraper'));
  const modelPostBuilding = useObjWithMtl(visualFor('PostBuilding'));
  const modelBank = useObjWithMtl(visualFor('Bank'));
  const modelArcade = useObjWithMtl(visualFor('Arcade'));
  const modelOffice = useObjWithMtl(visualFor('Office'));
  const modelETF = useObjWithMtl(visualFor('ETF'));

  // Extra “NPC” skyline variety (no gameplay).
  const npcA = useObjWithMtl({ obj: '/commercial/building-c.obj', mtl: '/commercial/building-c.mtl', resourcePath: '/commercial/' });
  const npcB = useObjWithMtl({ obj: '/commercial/building-l.obj', mtl: '/commercial/building-l.mtl', resourcePath: '/commercial/' });
  const npcC = useObjWithMtl({ obj: '/industrial/building-q.obj', mtl: '/industrial/building-q.mtl', resourcePath: '/industrial/' });

  const baseFor = (a: Asset) => {
    switch (a.buildingVisualType) {
      case 'Hospital':
        return modelHospital;
      case 'Factory':
        return modelFactory;
      case 'RetailShop':
        return modelRetailShop;
      case 'Skyscraper':
        return modelSkyscraper;
      case 'PostBuilding':
        return modelPostBuilding;
      case 'Bank':
        return modelBank;
      case 'Arcade':
        return modelArcade;
      case 'Office':
        return modelOffice;
      case 'ETF':
        return modelETF;
    }
  };

  const businessFor = (a: Asset) => {
    switch (a.buildingVisualType) {
      case 'Hospital':
        return 'City Hospital';
      case 'Factory':
        return 'Factory Works';
      case 'RetailShop':
        return 'Tech Shop';
      case 'Skyscraper':
        return 'HQ Tower';
      case 'PostBuilding':
        return 'Post Office';
      case 'Bank':
        return 'City Bank';
      case 'Arcade':
        return 'Arcade & Cinema';
      case 'Office':
        return 'Office Plaza';
      case 'ETF':
        return 'Index Hub';
    }
  };

  const npcBases = useMemo(() => [npcA, npcB, npcC, modelSkyscraper, modelFactory, modelRetailShop], [npcA, npcB, npcC, modelSkyscraper, modelFactory, modelRetailShop]);

  const rng01 = (seed: number) => {
    // Simple deterministic PRNG (mulberry32-like) local to placement.
    let t = (seed + 0x6D2B79F5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const placements = useMemo(() => {
    const grid = 14;
    const cell = 1;
    const roadEvery = 4;

    const items: Array<
      | { kind: 'asset'; placementId: string; assetId: string; x: number; z: number; rotY: number }
      | { kind: 'npc'; placementId: string; npcIndex: number; x: number; z: number; rotY: number }
      | { kind: 'roadStraight'; x: number; z: number; rotY: number }
      | { kind: 'roadCross'; x: number; z: number }
    > = [];

    const half = (grid - 1) / 2;
    const placeable = assets;
    const buildableCells: Array<{ gx: number; gz: number }> = [];

    for (let gx = 0; gx < grid; gx++) {
      for (let gz = 0; gz < grid; gz++) {
        const onRoadX = gx % roadEvery === 0;
        const onRoadZ = gz % roadEvery === 0;
        if (onRoadX || onRoadZ) continue; // roads handled in full grid pass below
        buildableCells.push({ gx, gz });
      }
    }

    // Shuffle buildable cells deterministically and place assets across the map.
    const shuffled = [...buildableCells];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const r = rng01(26 + i * 997);
      const j = Math.floor(r * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const used = new Set<string>();
    const assetCount = Math.min(placeable.length, shuffled.length);
    for (let i = 0; i < assetCount; i++) {
      const { gx, gz } = shuffled[i];
      const x = (gx - half) * cell;
      const z = (gz - half) * cell;
      const rotY = ((gx + gz) % 4) * (Math.PI / 2);
      const a = placeable[i];
      items.push({ kind: 'asset', placementId: `asset-${gx}-${gz}`, assetId: a.id, x, z, rotY });
      used.add(`${gx}-${gz}`);
    }

    // Fill remaining lots with NPC buildings (no gameplay).
    for (const { gx, gz } of buildableCells) {
      if (used.has(`${gx}-${gz}`)) continue;
      const x = (gx - half) * cell;
      const z = (gz - half) * cell;
      const rotY = ((gx * 31 + gz * 17) % 4) * (Math.PI / 2);
      const npcIndex = Math.floor(rng01(1337 + gx * 1000 + gz * 7) * 1000) % 6;
      items.push({ kind: 'npc', placementId: `npc-${gx}-${gz}`, npcIndex, x, z, rotY });
    }

    for (let gx = 0; gx < grid; gx++) {
      for (let gz = 0; gz < grid; gz++) {
        const x = (gx - half) * cell;
        const z = (gz - half) * cell;
        const onRoadX = gx % roadEvery === 0;
        const onRoadZ = gz % roadEvery === 0;

        if (onRoadX && onRoadZ) {
          items.push({ kind: 'roadCross', x, z });
          continue;
        }
        if (onRoadX || onRoadZ) {
          const rotY = onRoadX ? roadVisuals.straight.xAxisRotY : roadVisuals.straight.zAxisRotY;
          items.push({ kind: 'roadStraight', x, z, rotY });
          continue;
        }
      }
    }

    return { items };
  }, [assets]);

  const outlineMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.BackSide,
        transparent: false,
        depthWrite: false,
        // Keep depth testing ON so the outline doesn't paint over the whole object.
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
        toneMapped: false,
      }),
    [],
  );

  const selectedOutlineMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: 0x7dd3fc,
        side: THREE.BackSide,
        transparent: false,
        depthWrite: false,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
        toneMapped: false,
      }),
    [],
  );

  return (
    <>
      {/* 3D city meshes: each object collapses individually */}
      {placements.items.map((p, idx) => {
        if (p.kind === 'roadCross') {
          return (
            <CollapseIntoGround key={`roadCross-${idx}`} uiMode={uiMode} position={[p.x, 0, p.z]}>
              <primitive object={roadCross.clone(true)} />
            </CollapseIntoGround>
          );
        }
        if (p.kind === 'roadStraight') {
          return (
            <CollapseIntoGround
              key={`roadStraight-${idx}`}
              uiMode={uiMode}
              position={[p.x, 0, p.z]}
              rotation={[0, p.rotY, 0]}
            >
              <primitive
                object={roadStraight.clone(true)}
              />
            </CollapseIntoGround>
          );
        }
        if (p.kind === 'npc') {
          const base = npcBases[p.npcIndex % npcBases.length];
          return (
            <CollapseIntoGround
              key={p.placementId}
              uiMode={uiMode}
              position={[p.x, 0, p.z]}
              rotation={[0, p.rotY, 0]}
            >
              <primitive object={base.clone(true)} />
            </CollapseIntoGround>
          );
        }
        const a = assets.find((x) => x.id === p.assetId);
        if (!a) return null;
        const base = baseFor(a);
        return (
          <CollapseIntoGround
            key={p.placementId}
            uiMode={uiMode}
            position={[p.x, 0, p.z]}
            rotation={[0, p.rotY, 0]}
          >
            <SelectableBuilding
              id={p.assetId}
              base={base}
              selected={selectedId === p.assetId}
              locked={!a.unlocked}
              assetType={a.type}
              showInvestableOutline={a.type === 'stock' && a.unlocked}
              uiMode={uiMode}
              position={[0, 0, 0]}
              rotY={0}
              onToggle={onToggleBuilding}
              outlineMaterial={outlineMat}
              selectedOutlineMaterial={selectedOutlineMat}
            />
          </CollapseIntoGround>
        );
      })}

      {/* Stock-mode overlay: ticker bubbles do NOT shrink with the city */}
      {uiMode === 'stocks' &&
        placements.items.map((p) => {
          if (p.kind !== 'asset') return null;
          const a = assets.find((x) => x.id === p.assetId);
          if (!a) return null;
          return (
            <TickerBubble
              key={`bubble-${p.placementId}`}
              symbol={a.symbol}
              locked={!a.unlocked}
              selected={selectedId === a.id}
              position={[p.x, 0.95, p.z]}
              onSelect={() => onToggleBuilding(a.id)}
            />
          );
        })}
    </>
  );
}

export default function Home() {
  const [state, dispatch] = useReducer(gameReducer, undefined, () =>
    createInitialState({ startingCash: 10_000, seed: 26, year: 2026 }),
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      e.preventDefault();
      dispatch({ type: 'TOGGLE_UI_MODE' });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const selectedAsset = state.selectedAssetId ? state.assets[state.selectedAssetId] : null;
  const panelOpen = selectedAsset !== null;

  const allAssets = useMemo(() => Object.values(state.assets), [state.assets]);

  const chartData = useMemo(() => {
    const h = selectedAsset?.priceHistory ?? state.netWorthHistory;
    return {
      labels: h.map((p) => String(p.year)),
      datasets: [
        {
          data: h.map((p) => p.price),
          label: selectedAsset ? selectedAsset.displayName : 'Net worth',
          borderColor: 'rgba(255, 255, 255, 0.85)',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: 'rgba(255, 255, 255, 0.9)',
          fill: true,
          backgroundColor: 'rgba(255, 255, 255, 0.08)',
          tension: 0.35,
        },
      ],
    };
  }, [selectedAsset, state.netWorthHistory]);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <Canvas
        shadows
        camera={{ position: [3, 2, 3], fov: 60 }}
        onPointerMissed={() => {
          dispatch({ type: 'SELECT_ASSET', assetId: null });
        }}
      >
        <color attach="background" args={['#1a2535']} />
        <ambientLight intensity={0.32} />
        <hemisphereLight args={['#d8ecff', '#1b2a3a', 0.45]} />
        <directionalLight
          position={[6, 10, 6]}
          intensity={2.35}
          color={'#fff6e8'}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.00015}
        >
          <orthographicCamera attach="shadow-camera" args={[-10, 10, 10, -10, 0.1, 60]} />
        </directionalLight>
        <Suspense fallback={null}>
          <City
            assets={allAssets}
            uiMode={state.uiMode}
            selectedId={state.selectedAssetId}
            onToggleBuilding={(id) =>
              dispatch({ type: 'SELECT_ASSET', assetId: state.selectedAssetId === id ? null : id })
            }
          />
        </Suspense>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
          <planeGeometry args={[80, 80]} />
          <shadowMaterial transparent opacity={0.25} />
        </mesh>
        <OrbitControls />
      </Canvas>

      <Hud
        state={state}
        onNextYear={() => dispatch({ type: 'ADVANCE_YEAR' })}
        onToggleMode={() => dispatch({ type: 'TOGGLE_UI_MODE' })}
      />

      {panelOpen && selectedAsset && (
        <AssetPanel
          asset={selectedAsset}
          cash={state.player.cash}
          onClose={() => dispatch({ type: 'SELECT_ASSET', assetId: null })}
          onBuy={(qty) => dispatch({ type: 'BUY', assetId: selectedAsset.id, qty })}
          onSell={(qty) => dispatch({ type: 'SELL', assetId: selectedAsset.id, qty })}
        />
      )}

      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: '100%',
          height: '220px',
          background: 'rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderTop: '1px solid rgba(255, 255, 255, 0.2)',
          padding: '16px 24px 0',
          pointerEvents: 'none',
        }}
      >
        <Line data={chartData} options={chartOptions} />
      </div>
    </div>
  );
}
