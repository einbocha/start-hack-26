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
          polygonOffset?: boolean;
          polygonOffsetFactor?: number;
          polygonOffsetUnits?: number;
        };
        if (anyMat.map) {
          anyMat.map.colorSpace = THREE.SRGBColorSpace;
          anyMat.map.flipY = true;
        
          anyMat.map.generateMipmaps = false;
          anyMat.map.minFilter = THREE.NearestFilter;
          anyMat.map.magFilter = THREE.NearestFilter;
        
          anyMat.map.wrapS = THREE.ClampToEdgeWrapping;
          anyMat.map.wrapT = THREE.ClampToEdgeWrapping;
        
          anyMat.map.needsUpdate = true;
        }
        // MTLLoader often creates MeshPhongMaterial which can blow out under strong lights.
        if (typeof anyMat.shininess === 'number') anyMat.shininess = Math.min(anyMat.shininess, 18);
        if (anyMat.specular instanceof THREE.Color) anyMat.specular.multiplyScalar(0.2);
        if (anyMat.emissive instanceof THREE.Color) anyMat.emissive.multiplyScalar(0.6);
        // Help against z-fighting when meshes are coplanar (roads, ground, outlines).
        anyMat.polygonOffset = true;
        anyMat.polygonOffsetFactor = 2;
        anyMat.polygonOffsetUnits = 2;
        if (anyMat.needsUpdate !== undefined) anyMat.needsUpdate = true;
      }
    });
  }, [obj]);

  return obj;
}

type MapHouse = {
  id: string;
  type: string;
  position: [number, number, number];
  rotation: [number, number, number, number]; // quaternion x,y,z,w
  scale: [number, number, number];
  locked: boolean;
  price: number;
};

type MapJson = {
  scene: string;
  unit: string;
  houses: MapHouse[];
};

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

function normalizeTypeName(type: string) {
  // "building-d (2)" -> "building-d"
  return type.replace(/\s*\(\d+\)\s*$/, '');
}

function specForMapType(type: string): { obj: string; mtl: string; resourcePath: string } | null {
  const base = normalizeTypeName(type);
  if (base.startsWith('road-')) {
    return { obj: `/roads/${base}.obj`, mtl: `/roads/${base}.mtl`, resourcePath: '/roads/' };
  }
  if (base.startsWith('building-type-')) {
    // Suburban pack uses building-type-* naming.
    return { obj: `/suburban/${base}.obj`, mtl: `/suburban/${base}.mtl`, resourcePath: '/suburban/' };
  }

  // Mapper for commercial vs industrial buildings:
  //  - JSON uses building-x.* for industrial and comm-building-x.* for commercial
  //  - Commercial assets on disk are still named building-x.* in /commercial
  if (base.startsWith('comm-building-')) {
    const name = base.replace(/^comm-/, ''); // comm-building-a -> building-a
    return { obj: `/commercial/${name}.obj`, mtl: `/commercial/${name}.mtl`, resourcePath: '/commercial/' };
  }

   // Certain building families only exist in commercial (e.g. skyscrapers).
   if (base.startsWith('building-skyscraper-')) {
     return {
       obj: `/commercial/${base}.obj`,
       mtl: `/commercial/${base}.mtl`,
       resourcePath: '/commercial/',
     };
   }

  if (base.startsWith('building-') || base.startsWith('detail-') || base.startsWith('chimney-')) {
    // Default: treat as industrial pack naming.
    return { obj: `/industrial/${base}.obj`, mtl: `/industrial/${base}.mtl`, resourcePath: '/industrial/' };
  }
  return null;
}

function CollapseIntoGround({
  uiMode,
  position,
  quaternion,
  children,
  sink = 0.45,
  lastInches = 0.12,
}: {
  uiMode: 'city' | 'stocks';
  position: [number, number, number];
  quaternion?: THREE.Quaternion;
  children: React.ReactNode;
  sink?: number;
  lastInches?: number;
}) {
  const sRef = useRef(1);
  const gRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    if (gRef.current && quaternion) {
      gRef.current.quaternion.copy(quaternion);
    }
  }, [quaternion]);

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
    <group ref={gRef} position={position}>
      {children}
    </group>
  );
}

function ModelBatch({
  spec,
  placements,
  render,
}: {
  spec: { obj: string; mtl: string; resourcePath: string };
  placements: Array<{ key: string; position: [number, number, number]; quat: THREE.Quaternion; meta: unknown }>;
  render: (base: THREE.Object3D, p: { key: string; position: [number, number, number]; quat: THREE.Quaternion; meta: unknown }) => React.ReactNode;
}) {
  const base = useObjWithMtl(spec);
  return (
    <>
      {placements.map((p) => (
        <group key={p.key}>{render(base, p)}</group>
      ))}
    </>
  );
}

function City({
  assets,
  uiMode,
  selectedId,
  onToggleBuilding,
  map,
}: {
  assets: Asset[];
  uiMode: 'city' | 'stocks';
  selectedId: string | null;
  onToggleBuilding: (id: string) => void;
  map: MapJson | null;
}) {
  const buildingSpots = useMemo(() => {
    if (!map) return null;
    const buildings = map.houses.filter((h) => normalizeTypeName(h.type).startsWith('building-'));
    const roads = map.houses.filter((h) => normalizeTypeName(h.type).startsWith('road-'));
    return { buildings, roads };
  }, [map]);

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

  const assigned = useMemo(() => {
    if (!buildingSpots) return null;
    const seed = 26;
    const rng = (n: number) => {
      let t = (seed + n * 997 + 0x6D2B79F5) >>> 0;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const shuffled = [...buildingSpots.buildings];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng(i) * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const assetList = [...assets];
    const map = new Map<string, Asset>();
    const count = Math.min(assetList.length, shuffled.length);
    for (let i = 0; i < count; i++) map.set(shuffled[i].id, assetList[i]);
    return map;
  }, [assets, buildingSpots]);

  const batches = useMemo(() => {
    if (!map || !assigned) return null;
    const groups = new Map<
      string,
      {
        spec: { obj: string; mtl: string; resourcePath: string };
        list: Array<{ key: string; position: [number, number, number]; quat: THREE.Quaternion; meta: unknown }>;
      }
    >();
    const flipY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

    for (const h of map.houses) {
      const spec = specForMapType(h.type);
      if (!spec) continue;
      // Unity -> Three.js:
      // position: (x, y, z)  -> (x, y, -z)
      // quaternion: (x, y, z, w) -> (-x, -y, z, w), then rotateY(π) to fix facing
      const uq = h.rotation;
      const quat = new THREE.Quaternion(-uq[0], -uq[1], uq[2], uq[3]).normalize();
      quat.premultiply(flipY);
      const key = `${spec.resourcePath}|${spec.obj}`;
      if (!groups.has(key)) groups.set(key, { spec, list: [] });
      groups.get(key)!.list.push({
        key: h.id,
        position: [h.position[0], h.position[1], -h.position[2]],
        quat,
        meta: { house: h, asset: assigned.get(h.id) ?? null },
      });
    }
    return Array.from(groups.values());
  }, [map, assigned]);

  if (!map || !assigned || !batches) return null;

  return (
    <>
      {batches.map((b) => (
        <ModelBatch
          key={`${b.spec.resourcePath}${b.spec.obj}`}
          spec={b.spec}
          placements={b.list}
          render={(base, p) => {
            const meta = p.meta as { house: MapHouse; asset: Asset | null };
            const isRoad = normalizeTypeName(meta.house.type).startsWith('road-');
            const asset = meta.asset;

            if (isRoad || !asset) {
              return (
                <CollapseIntoGround uiMode={uiMode} position={p.position} quaternion={p.quat}>
                  <primitive object={base.clone(true)} />
                </CollapseIntoGround>
              );
            }

            return (
              <CollapseIntoGround uiMode={uiMode} position={p.position} quaternion={p.quat}>
                <SelectableBuilding
                  id={asset.id}
                  base={base}
                  selected={selectedId === asset.id}
                  locked={!asset.unlocked}
                  assetType={asset.type}
                  showInvestableOutline={asset.type === 'stock' && asset.unlocked}
                  uiMode={uiMode}
                  position={[0, 0, 0]}
                  rotY={0}
                  onToggle={onToggleBuilding}
                  outlineMaterial={outlineMat}
                  selectedOutlineMaterial={selectedOutlineMat}
                />
              </CollapseIntoGround>
            );
          }}
        />
      ))}

      {uiMode === 'stocks' &&
        Array.from(assigned.entries()).map(([houseId, asset]) => {
          const h = map.houses.find((x) => x.id === houseId);
          if (!h) return null;
          return (
            <TickerBubble
              key={`bubble-${houseId}`}
              symbol={asset.symbol}
              locked={!asset.unlocked}
              selected={selectedId === asset.id}
              // Match Unity -> Three position flip used for meshes: (x, y, z) -> (x, y, -z)
              position={[h.position[0], h.position[1] + 0.95, -h.position[2]]}
              onSelect={() => onToggleBuilding(asset.id)}
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

  const [map, setMap] = useReducer((_: MapJson | null, next: MapJson | null) => next, null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      e.preventDefault();
      dispatch({ type: 'TOGGLE_UI_MODE' });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/map.json')
      .then((r) => r.json())
      .then((j: MapJson) => {
        if (cancelled) return;
        setMap(j);
      })
      .catch(() => {
        if (!cancelled) setMap(null);
      });
    return () => {
      cancelled = true;
    };
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
            map={map}
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
        onSellAll={(assetId, qty) => dispatch({ type: 'SELL', assetId, qty })}
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
