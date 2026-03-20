'use client';
import { Canvas, ThreeEvent, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { Fragment, Suspense, useEffect, useMemo, useReducer, useRef, useState } from 'react';
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
import { activeEventsForYear, normalizeEventCatalog } from '../game/events';
import { Asset, Market, Sector, VolatilityLabel } from '../game/types';
import { visualFor, roadVisuals } from '../game/visuals';
import { netWorth } from '../game/portfolio';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

const RUN_LENGTH_YEARS = 100;
const PUBLIC_BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/+$/, '');
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://jfzmcdhuptdsyekoijri.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SUPABASE_TABLE = process.env.NEXT_PUBLIC_SUPABASE_TABLE ?? 'Easy';
const runtimeBasePath = () => {
  if (PUBLIC_BASE_PATH) return PUBLIC_BASE_PATH;
  if (typeof window === 'undefined') return '';
  // GitHub Pages project sites live under "/<repo>/".
  if (window.location.hostname.endsWith('github.io')) {
    const first = window.location.pathname.split('/').filter(Boolean)[0];
    if (first) return `/${first}`;
  }
  return '';
};
const publicUrl = (path: string) => {
  // If base path is configured or inferred (e.g. GitHub Pages project site), use it.
  const base = runtimeBasePath();
  if (base) return `${base}${path}`;
  // Fallback to relative paths so assets still resolve under nested hosts.
  return path.replace(/^\/+/, '');
};

function difficultyToBucket(d: Difficulty): DifficultyBucket {
  return d === 'min' ? 'easy' : d === 'mid' ? 'medium' : 'hard';
}

function bucketToCode(b: DifficultyBucket): number {
  return b === 'easy' ? 0 : b === 'medium' ? 1 : 2;
}

async function supabaseFetch(path: string, init?: RequestInit) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    ...(init?.headers as Record<string, string> | undefined),
  };
  return fetch(`${SUPABASE_URL}${path}`, { ...init, headers });
}

async function fetchLeaderboardForBucket(bucket: DifficultyBucket): Promise<LeaderboardRow[]> {
  if (!SUPABASE_ANON_KEY) return [];
  const code = bucketToCode(bucket);
  // Primary: lowercase `difficulty` column.
  const byLower = await supabaseFetch(
    `/rest/v1/${encodeURIComponent(SUPABASE_TABLE)}?select=id,name,score,difficulty&difficulty=eq.${code}&order=score.desc&limit=10`,
  );
  if (byLower.ok) {
    const data: unknown = await byLower.json();
    if (Array.isArray(data)) return data as LeaderboardRow[];
  }

  // Fallback: quoted uppercase column name "Difficulty".
  const byUpper = await supabaseFetch(
    `/rest/v1/${encodeURIComponent(SUPABASE_TABLE)}?select=id,name,score,Difficulty&Difficulty=eq.${code}&order=score.desc&limit=10`,
  );
  if (byUpper.ok) {
    const data: unknown = await byUpper.json();
    if (!Array.isArray(data)) return [];
    const rows = data as Array<LeaderboardRow & { Difficulty?: number }>;
    return rows.map((r) => ({ ...r, difficulty: r.difficulty ?? r.Difficulty }));
  }

  // Fallback: some schemas use `diff` instead.
  const byDiff = await supabaseFetch(
    `/rest/v1/${encodeURIComponent(SUPABASE_TABLE)}?select=id,name,score,diff&diff=eq.${code}&order=score.desc&limit=10`,
  );
  if (!byDiff.ok) return [];
  const data: unknown = await byDiff.json();
  if (!Array.isArray(data)) return [];
  const rows = data as Array<LeaderboardRow & { diff?: number }>;
  return rows.map((r) => ({ ...r, difficulty: r.difficulty ?? r.diff }));
}

async function submitScore(params: { name: string; score: number; bucket: DifficultyBucket }) {
  if (!SUPABASE_ANON_KEY) throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const safeName = params.name.trim().slice(0, 24) || 'Player';
  const code = bucketToCode(params.bucket);
  // Primary: lowercase `difficulty`.
  const oneTable = await supabaseFetch(`/rest/v1/${encodeURIComponent(SUPABASE_TABLE)}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([{ name: safeName, score: Math.round(params.score), difficulty: code }]),
  });
  if (oneTable.ok) return;

  // Fallback: quoted uppercase "Difficulty".
  const byUpper = await supabaseFetch(`/rest/v1/${encodeURIComponent(SUPABASE_TABLE)}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([{ name: safeName, score: Math.round(params.score), Difficulty: code }]),
  });
  if (byUpper.ok) return;

  // Fallback: some schemas use `diff` instead.
  const byDiff = await supabaseFetch(`/rest/v1/${encodeURIComponent(SUPABASE_TABLE)}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([{ name: safeName, score: Math.round(params.score), diff: code }]),
  });
  if (byDiff.ok) return;

  const txt = await byDiff.text();
  throw new Error(txt || 'Failed to submit score');
}

// Cached edge geometries so selecting roads/countries doesn't repeatedly rebuild outlines.
const edgesGeometryCache = new WeakMap<THREE.BufferGeometry, THREE.EdgesGeometry>();
const roadOutlineLineMaterial = new THREE.LineBasicMaterial({
  color: 0xffc193,
  transparent: true,
  opacity: 0.95,    
  depthTest: true,
  depthWrite: false,
  toneMapped: false,
});
const roadInvisibleFillMaterial = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 0,
  depthTest: true,
  depthWrite: false,
  toneMapped: false,
});

function getEdgesGeometry(geometry: THREE.BufferGeometry): THREE.EdgesGeometry {
  const cached = edgesGeometryCache.get(geometry);
  if (cached) return cached;
  // Threshold controls how “aggressive” the outline is; keep low for thin, clean edges.
  const edges = new THREE.EdgesGeometry(geometry, 1);
  edgesGeometryCache.set(geometry, edges);
  return edges;
}

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

type Difficulty = 'min' | 'mid' | 'max';
type DifficultyBucket = 'easy' | 'medium' | 'hard';
type LeaderboardRow = {
  id: number | string;
  name: string;
  score: number;
  difficulty?: number;
  created_at?: string;
};

/**
 * When NEXT_PUBLIC_SCREENSHOT_LEADERBOARD=1, dummy rows are merged with live Supabase results (sorted by score).
 * The fetch always runs so the real leaderboard still works when this is off.
 */
const SCREENSHOT_DUMMY_LEADERBOARD = process.env.NEXT_PUBLIC_SCREENSHOT_LEADERBOARD === '1';

const DUMMY_LEADERBOARD_BY_BUCKET: Record<DifficultyBucket, LeaderboardRow[]> = {
  easy: [
    { id: 'shot-e-1', name: 'Benjamin', score: 184_320, difficulty: 0 },
    { id: 'shot-e-2', name: 'Nina', score: 162_890, difficulty: 0 },
    { id: 'shot-e-3', name: 'Julius', score: 148_200, difficulty: 0 },
    { id: 'shot-e-4', name: 'Yashar', score: 127_450, difficulty: 0 },
  ],
  medium: [
    { id: 'shot-m-1', name: 'Nina', score: 98_400, difficulty: 1 },
    { id: 'shot-m-2', name: 'Benjamin', score: 91_200, difficulty: 1 },
    { id: 'shot-m-3', name: 'Yashar', score: 85_100, difficulty: 1 },
    { id: 'shot-m-4', name: 'Julius', score: 72_850, difficulty: 1 },
  ],
  hard: [
    { id: 'shot-h-1', name: 'Yashar', score: 54_200, difficulty: 2 },
    { id: 'shot-h-2', name: 'Julius', score: 48_900, difficulty: 2 },
    { id: 'shot-h-3', name: 'Benjamin', score: 41_300, difficulty: 2 },
    { id: 'shot-h-4', name: 'Nina', score: 38_100, difficulty: 2 },
  ],
};

function mergeScreenshotDummyRows(bucket: DifficultyBucket, rows: LeaderboardRow[]): LeaderboardRow[] {
  if (!SCREENSHOT_DUMMY_LEADERBOARD) return rows;
  const seed = DUMMY_LEADERBOARD_BY_BUCKET[bucket];
  const merged = [...seed, ...rows];
  merged.sort((a, b) => b.score - a.score);
  return merged.slice(0, 10);
}

function useObjWithMtl(opts: { obj: string; mtl: string; resourcePath: string }) {
  const materials = useLoader(MTLLoader, opts.mtl, (loader) => {
    loader.setResourcePath(opts.resourcePath);
  });
  const roadFallbackMap = useLoader(THREE.TextureLoader, publicUrl('/industrial/Textures/colormap_finance.png'));

  const obj = useLoader(OBJLoader, opts.obj, (loader) => {
    materials.preload();
    loader.setMaterials(materials);
  });

  useEffect(() => {
    const isRoadPack = opts.resourcePath.includes('/roads/');
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
        // Road MTLs reference `Textures/colormap.png`, but that file is missing in the
        // current pack. On some hosts this causes inconsistent material fallback visuals.
        if (isRoadPack && !anyMat.map) {
          anyMat.map = roadFallbackMap;
        }
        if (anyMat.map) {
          anyMat.map.colorSpace = THREE.SRGBColorSpace;
          // Don't force flipY globally; some loaders/textures already come correctly oriented.
          // Leaving the default preserves consistent UV/texture mapping across assets.

          // Avoid shimmering/aliasing while orbiting/zooming:
          // Avoid black/incomplete-mipmaps behavior by not relying on mipmaps.
          anyMat.map.generateMipmaps = false;
          anyMat.map.minFilter = THREE.LinearFilter;
          anyMat.map.magFilter = THREE.LinearFilter;

          anyMat.map.anisotropy = Math.min(8, anyMat.map.anisotropy || 1);
          // Roads are atlas-like and look wrong with repeat on some hosts/GPU drivers.
          anyMat.map.wrapS = isRoadPack ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
          anyMat.map.wrapT = isRoadPack ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;

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
  }, [obj, opts.resourcePath, roadFallbackMap]);

  return obj;
}

type MapHouse = {
  id: string;
  type: string;
  companyName?: string;
  country?: string;
  sector?: string;
  position: [number, number, number];
  rotation: [number, number, number, number]; // quaternion x,y,z,w
  scale: [number, number, number];
  locked: boolean;
  price: number;
  // Some map exports may include grouping metadata; if missing we fall back to type-based grouping.
  attributeGroup?: string;
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
  interactionsEnabled,
  colormapTexture,
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
  assetType: 'stock' | 'etf' | 'property';
  showInvestableOutline: boolean;
  uiMode: 'city' | 'stocks';
  interactionsEnabled: boolean;
  // When provided, we override the material's map_Kd to enforce sector-based coloring.
  // When omitted, we keep whatever map_Kd came from the original MTL (e.g. private property).
  colormapTexture?: THREE.Texture;
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
        child.material = child.material.map((m) => {
          const cloned = m.clone();
          const anyMat = cloned as unknown as { map?: THREE.Texture | null };
          if (colormapTexture) {
            anyMat.map = colormapTexture;
            anyMat.map.needsUpdate = true;
          }
          return cloned;
        });
      } else {
        const cloned = child.material.clone();
        const anyMat = cloned as unknown as { map?: THREE.Texture | null };
        if (colormapTexture) {
          anyMat.map = colormapTexture;
          anyMat.map.needsUpdate = true;
        }
        child.material = cloned;
      }
    });
    return c;
  };

  // Stable clones so we don't regenerate meshes every render.
  const model = useMemo(() => cloneWithUniqueMaterials(base), [base, colormapTexture]);
  const lockedModel = useMemo(() => {
    const m = cloneWithUniqueMaterials(base);
    m.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        const anyMat = mat as unknown as {
          map?: THREE.Texture | null;
          transparent?: boolean;
          opacity?: number;
          color?: THREE.Color;
          emissive?: THREE.Color;
          needsUpdate?: boolean;
        };
        anyMat.transparent = true;
          // Keep locked buildings visibly "disabled" without crushing the texture tint.
          // (Let the map_Kd drive the actual coloring.)
        // Keep locked assets visibly faded while still readable.
        anyMat.opacity = 0.38;
        if (anyMat.map) anyMat.map.needsUpdate = true;
        if (anyMat.needsUpdate !== undefined) anyMat.needsUpdate = true;
      }
    });
    return m;
  }, [base, colormapTexture]);
  const investableOutline = useMemo(() => createOutlineClone(base, outlineMaterial), [base, outlineMaterial]);
  const selectedOutline = useMemo(
    () => createOutlineClone(base, selectedOutlineMaterial),
    [base, selectedOutlineMaterial],
  );

  return (
    <group
      position={position}
      rotation={[0, rotY, 0]}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        if (uiMode !== 'city') return;
        if (!interactionsEnabled) return;
        // Properties are selectable but not buyable.
        if (locked && assetType !== 'property') return;
        e.stopPropagation();
        onToggle(id);
      }}
    >
      {/* Ground markers removed; selection uses outlines only. */}

      {uiMode === 'city' && selected && <primitive object={selectedOutline} scale={1.03} />}
      <primitive object={locked && assetType !== 'property' ? lockedModel : model} />
    </group>
  );
}

function TickerBubble({
  symbol,
  locked,
  selected,
  position,
  onSelect,
  interactionsEnabled,
  size = 92,
  variant = 'stock',
}: {
  symbol: string;
  locked: boolean;
  selected: boolean;
  position: [number, number, number];
  onSelect: () => void;
  interactionsEnabled: boolean;
  size?: number;
  variant?: 'stock' | 'etf' | 'country-etf';
}) {
  const bg =
    variant === 'country-etf'
      ? 'rgba(255,193,133,0.14)' // very light orange
      : variant === 'etf'
        ? 'rgba(125,211,252,0.14)'
        : 'rgba(255,255,255,0.16)';
  const border =
    variant === 'country-etf'
      ? 'rgba(255,193,133,0.55)'
      : variant === 'etf'
        ? 'rgba(125,211,252,0.55)'
        : 'rgba(255,255,255,0.40)';
  const selectedBorder = variant === 'country-etf' ? 'rgba(255,193,133,0.95)' : 'rgba(125,211,252,0.85)';
  const fontSize = Math.round(size * 0.17);

  return (
    <Html
      position={position}
      center
      distanceFactor={10}
      // Keep stock/ETF bubbles below fixed severe-event overlays.
      zIndexRange={[200, 0]}
      style={{ pointerEvents: locked ? 'none' : 'auto' }}
    >
      <div
        onPointerDown={(e) => {
          if (!interactionsEnabled) return;
          if (locked) return;
          e.stopPropagation();
          onSelect();
        }}
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          background: locked ? 'rgba(20,24,31,0.55)' : bg,
          border: locked
            ? '1px solid rgba(255,255,255,0.12)'
            : selected
              ? `1px solid ${selectedBorder}`
              : `1px solid ${border}`,
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: locked ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.96)',
          fontWeight: 950,
          letterSpacing: '0.10em',
          fontSize,
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

function mapCountryToMarket(country?: string): Market {
  switch (country) {
    case 'e':
      return 'Emerging Markets';
    case 's':
      return 'Switzerland';
    case 'a':
      return 'USA';
    default:
      return 'Global';
  }
}

function mapSectorKeyToSector(sectorKey?: string): Sector {
  switch (sectorKey) {
    case 't':
      return 'Technology';
    case 'f':
      return 'Finance';
    case 'h':
      return 'Healthcare';
    default:
      return 'Broad Market';
  }
}

function etfMetaForSector(sector: Sector): { displayName: string; symbol: string } {
  switch (sector) {
    case 'Technology':
      return { displayName: 'Invesco QQQ Trust', symbol: 'QQQ' };
    case 'Finance':
      return { displayName: 'Financial Select Sector SPDR Fund', symbol: 'XLF' };
    case 'Healthcare':
      return { displayName: 'Health Care Select Sector SPDR Fund', symbol: 'XLV' };
    case 'Bonds':
      return { displayName: 'iShares Core U.S. Aggregate Bond ETF', symbol: 'AGG' };
    default:
      return { displayName: 'Vanguard Total World Stock ETF', symbol: 'VT' };
  }
}

function etfMetaForMarket(market: Market): { displayName: string; symbol: string } {
  switch (market) {
    case 'USA':
      return { displayName: 'SPDR S&P 500 ETF Trust', symbol: 'SPY' };
    case 'Switzerland':
      return { displayName: 'iShares MSCI Switzerland ETF', symbol: 'EWL' };
    case 'Emerging Markets':
      return { displayName: 'iShares MSCI Emerging Markets ETF', symbol: 'EEM' };
    default:
      return { displayName: 'iShares MSCI ACWI ETF', symbol: 'ACWI' };
  }
}

function hashStringToInt(s: string): number {
  // Simple deterministic hash for stable-but-varied asset parameters.
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function volatilityLabelForStock(companyName: string): Exclude<VolatilityLabel, 'stable'> {
  const r = hashStringToInt(companyName) % 3;
  return r === 0 ? 'high' : r === 1 ? 'medium' : 'low';
}

function createVolatilityValueFromLabel(label: VolatilityLabel): number {
  switch (label) {
    case 'low':
      return 0.08;
    case 'medium':
      return 0.12;
    case 'high':
      return 0.22;
    case 'stable':
      return 0.03;
  }
}

function isBuildingHouse(h: MapHouse) {
  const base = normalizeTypeName(h.type);
  if (base.startsWith('road-')) return false;
  if (base.startsWith('building-')) return true;
  if (base.startsWith('comm-building-')) return true;
  if (base.startsWith('building-type-')) return true;
  return false;
}

function createAssetsFromMap(map: MapJson): Record<string, Asset> {
  const houses = map.houses.filter(isBuildingHouse);

  const tickerToFullName: Record<string, string> = {
    // Your current examples
    NVS: 'Novartis',
    PFE: 'Pfizer',
    ZLAB: 'Zai Lab',
    LOGI: 'Logitech',
    AAPL: 'Apple',
    TCEHY: 'Tencent',
    POST: 'PostFinance',
    JPM: 'J.P. Morgan',
    IBN: 'ICICI Bank',

    // Older/shorthand keys that exist in some map.json variants
    NOV: 'Novartis',
    ELi: 'Eli Lilly',
    ELI: 'Eli Lilly',
    AAP: 'Apple',
    TEN: 'Tencent',
    JP: 'J.P. Morgan',
    ICI: 'ICICI Bank',
    ZAI: 'Zai Lab',
  };

  const companyHouses = new Map<string, MapHouse[]>();
  const sectorHouses = new Map<string, MapHouse[]>();

  for (const h of houses) {
    const company = h.companyName ?? h.id;
    const sectorKey = h.sector ?? 'DummySector';
    if (!companyHouses.has(company)) companyHouses.set(company, []);
    companyHouses.get(company)!.push(h);
    if (!sectorHouses.has(sectorKey)) sectorHouses.set(sectorKey, []);
    sectorHouses.get(sectorKey)!.push(h);
  }

  // Enforce a per-sector spread: one low, one medium, one high (cycled if >3).
  const companyVolatilityByName = new Map<string, Exclude<VolatilityLabel, 'stable'>>();
  const companiesBySector = new Map<Sector, string[]>();
  for (const [companyName, members] of companyHouses.entries()) {
    if (companyName === 'DummyCompany') continue;
    const sector = mapSectorKeyToSector(members[0]?.sector);
    if (!companiesBySector.has(sector)) companiesBySector.set(sector, []);
    companiesBySector.get(sector)!.push(companyName);
  }
  const volCycle: Array<Exclude<VolatilityLabel, 'stable'>> = ['low', 'medium', 'high'];
  for (const companies of companiesBySector.values()) {
    // Stable deterministic order so volatility assignment doesn't jump between runs.
    companies.sort((a, b) => a.localeCompare(b));
    for (let i = 0; i < companies.length; i++) {
      companyVolatilityByName.set(companies[i], volCycle[i % volCycle.length]);
    }
  }

  // DummyCompany buildings are private, non-tradable property (not stocks).
  const propertyById = new Map<string, Asset>();
  for (const h of houses) {
    if (h.companyName !== 'DummyCompany') continue;
    const market = mapCountryToMarket(h.country);
    const sector = mapSectorKeyToSector(h.sector);
    const basePrice = 10 + (hashStringToInt(h.id) % 40);
    const id = `property-${h.id}`;

    propertyById.set(id, {
      id,
      name: 'Private property',
      displayName: 'Private property',
      symbol: 'PROP',
      type: 'property',
      market,
      sector,
      buildingVisualType: 'Office',
      basePrice,
      currentPrice: basePrice,
      yearlyDrift: 0,
      volatilityLabel: 'stable',
      volatility: 0.03,
      peRatio: 0,
      description: 'Private property. It cannot be bought or sold.',
      unlocked: false,
      sharesOwned: 0,
      totalCostBasis: 0,
      priceHistory: [{ year: 2026, price: basePrice }],
      categoryTags: ['market', 'sector'],
    });
  }

  const stocksById = new Map<string, Asset>();
  for (const [companyName, members] of companyHouses.entries()) {
    if (companyName === 'DummyCompany') continue;
    const any = members[0];
    const volatilityLabel = companyVolatilityByName.get(companyName) ?? volatilityLabelForStock(companyName);
    const sector = mapSectorKeyToSector(any.sector);
    const market = mapCountryToMarket(any.country);
    const ticker = companyName.toUpperCase();
    const fullName = tickerToFullName[ticker] ?? companyName;
    const basePrice = 45 + (hashStringToInt(companyName) % 160);
    const peRatio = 10 + (hashStringToInt(companyName + ':pe') % 30);

    stocksById.set(companyName, {
      id: companyName,
      name: companyName,
      displayName: fullName,
      symbol: ticker,
      type: 'stock',
      market,
      sector,
      buildingVisualType: 'Hospital',
      basePrice,
      currentPrice: basePrice,
      yearlyDrift: 0.06,
      volatilityLabel,
      volatility: createVolatilityValueFromLabel(volatilityLabel),
      peRatio,
      description: 'A company stock. Volatility depends on its risk profile.',
      unlocked: true,
      sharesOwned: 0,
      totalCostBasis: 0,
      priceHistory: [{ year: 2026, price: basePrice }],
      categoryTags: ['volatility', 'market', 'sector'],
    });
  }

  const etfsById = new Map<string, Asset>();
  for (const [sectorKey, members] of sectorHouses.entries()) {
    const sector = mapSectorKeyToSector(sectorKey);
    const underlyingCompanies = new Set<string>(
      members.map((m) => m.companyName ?? m.id).filter((c) => c !== 'DummyCompany'),
    );
    const underlyingVol = Array.from(underlyingCompanies)
      .map((company) => stocksById.get(company))
      .filter(Boolean) as Asset[];

    if (underlyingVol.length === 0) continue;
    const avgVol = underlyingVol.reduce((a, s) => a + s.volatility, 0) / underlyingVol.length;
    const volatilityLabel: VolatilityLabel = 'stable';
    const volatility = Math.max(0.01, avgVol * 0.25);

    const id = `etf-${sector}`;
    const etfMeta = etfMetaForSector(sector);
    const displayName = etfMeta.displayName;

    etfsById.set(id, {
      id,
      name: displayName,
      displayName,
      symbol: etfMeta.symbol,
      type: 'etf',
      market: 'Global',
      sector,
      buildingVisualType: 'ETF',
      basePrice: 90 + (hashStringToInt(sector) % 90),
      currentPrice: 90,
      yearlyDrift: 0.04,
      volatilityLabel,
      volatility,
      peRatio: 0,
      description: 'A stable ETF that smooths risk across its sector.',
      unlocked: true,
      sharesOwned: 0,
      totalCostBasis: 0,
      priceHistory: [{ year: 2026, price: 90 }],
      categoryTags: ['etf', 'diversification', 'market'],
    });
  }

  // Country ETFs (from road country groups / underlying stocks in that market).
  const countryEtfsById = new Map<string, Asset>();
  const stocksByMarket = new Map<Market, Asset[]>();
  for (const s of stocksById.values()) {
    if (!stocksByMarket.has(s.market)) stocksByMarket.set(s.market, []);
    stocksByMarket.get(s.market)!.push(s);
  }

  for (const [market, underlying] of stocksByMarket.entries()) {
    if (underlying.length === 0) continue;
    const avgVol = underlying.reduce((a, s) => a + s.volatility, 0) / underlying.length;
    const volatilityLabel: VolatilityLabel = 'stable';
    const volatility = Math.max(0.01, avgVol * 0.25);

    const id = `etf-country-${market}`;
    const etfMeta = etfMetaForMarket(market);
    const displayName = etfMeta.displayName;

    countryEtfsById.set(id, {
      id,
      name: displayName,
      displayName,
      symbol: etfMeta.symbol,
      type: 'etf',
      // Sector is not meaningful for country ETF, but Asset requires it.
      sector: 'Broad Market',
      market,
      buildingVisualType: 'ETF',
      basePrice: 80 + (hashStringToInt(market) % 80),
      currentPrice: 80,
      yearlyDrift: 0.04,
      volatilityLabel,
      volatility,
      peRatio: 0,
      description: 'A stable country ETF that smooths volatility across companies in that region.',
      unlocked: true,
      sharesOwned: 0,
      totalCostBasis: 0,
      priceHistory: [{ year: 2026, price: 80 }],
      categoryTags: ['etf', 'diversification', 'market'],
    });
  }

  const out: Record<string, Asset> = {};
  for (const [id, a] of stocksById.entries()) out[id] = a;
  for (const [id, a] of etfsById.entries()) out[id] = a;
  for (const [id, a] of countryEtfsById.entries()) out[id] = a;
  for (const [id, a] of propertyById.entries()) out[id] = a;
  return out;
}

function getCompanyGroupKeyFromMapHouse(h: MapHouse) {
  // If the type name includes a trailing numeric attribute in parentheses, treat that as a grouping hint.
  // Examples:
  //  - "building-type-f (2)" -> grouped company key "building-type-f"
  //  - "building-m" -> no attribute group found => treat as separate company instance
  const normalized = normalizeTypeName(h.type);
  return normalized !== h.type ? normalized : h.id;
}

function createAssignedCompanies(map: MapJson, assets: Asset[]) {
  const buildings = map.houses.filter((h) => normalizeTypeName(h.type).startsWith('building-'));
  const grouped = new Map<string, MapHouse[]>();

  for (const h of buildings) {
    const key = getCompanyGroupKeyFromMapHouse(h);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(h);
  }

  const seed = 26;
  const rng = (n: number) => {
    let t = (seed + n * 997 + 0x6D2B79F5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const groupKeys = Array.from(grouped.keys());
  for (let i = groupKeys.length - 1; i > 0; i--) {
    const j = Math.floor(rng(i) * (i + 1));
    [groupKeys[i], groupKeys[j]] = [groupKeys[j], groupKeys[i]];
  }

  const assetList = [...assets];
  const out = new Map<
    string,
    {
      asset: Asset;
      members: MapHouse[];
      representative: MapHouse;
    }
  >();

  const count = Math.min(assetList.length, groupKeys.length);
  for (let i = 0; i < count; i++) {
    const companyKey = groupKeys[i];
    const members = grouped.get(companyKey) ?? [];
    if (members.length === 0) continue;
    out.set(companyKey, { asset: assetList[i], members, representative: members[0] });
  }

  return out;
}

function specForMapType(type: string): { obj: string; mtl: string; resourcePath: string } | null {
  const base = normalizeTypeName(type);
  if (base.startsWith('road-')) {
    return {
      obj: publicUrl(`/roads/${base}.obj`),
      mtl: publicUrl(`/roads/${base}.mtl`),
      resourcePath: publicUrl('/roads/'),
    };
  }
  if (base.startsWith('building-type-')) {
    // Suburban pack uses building-type-* naming.
    return {
      obj: publicUrl(`/suburban/${base}.obj`),
      mtl: publicUrl(`/suburban/${base}.mtl`),
      resourcePath: publicUrl('/suburban/'),
    };
  }

  // Mapper for commercial vs industrial buildings:
  //  - JSON uses building-x.* for industrial and comm-building-x.* for commercial
  //  - Commercial assets on disk are still named building-x.* in /commercial
  if (base.startsWith('comm-building-')) {
    const name = base.replace(/^comm-/, ''); // comm-building-a -> building-a
    return {
      obj: publicUrl(`/commercial/${name}.obj`),
      mtl: publicUrl(`/commercial/${name}.mtl`),
      resourcePath: publicUrl('/commercial/'),
    };
  }

   // Certain building families only exist in commercial (e.g. skyscrapers).
   if (base.startsWith('building-skyscraper-')) {
     return {
      obj: publicUrl(`/commercial/${base}.obj`),
      mtl: publicUrl(`/commercial/${base}.mtl`),
      resourcePath: publicUrl('/commercial/'),
     };
   }

  if (base.startsWith('building-') || base.startsWith('detail-') || base.startsWith('chimney-')) {
    // Default: treat as industrial pack naming.
    return {
      obj: publicUrl(`/industrial/${base}.obj`),
      mtl: publicUrl(`/industrial/${base}.mtl`),
      resourcePath: publicUrl('/industrial/'),
    };
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

function StockModeGrid({ enabled }: { enabled: boolean }) {
  const grid = useMemo(() => {
    // Match the visual scale of the ground plane mesh.
    const size = 92;
    const divisions = 32;
    const helper = new THREE.GridHelper(size, divisions, 0xffffff, 0xffffff);
    // Subtle overlay; keep it readable but not overpowering.
    const mat = helper.material as THREE.LineBasicMaterial;
    mat.transparent = true;
    mat.opacity = 0.34;
    mat.depthWrite = false;
    // Keep depth testing so the grid layers correctly with the scene.
    mat.depthTest = true;
    // Avoid tone mapping dimming the lines.
    (mat as unknown as { toneMapped?: boolean }).toneMapped = false;
    helper.position.set(0, 0.01, 0);
    helper.renderOrder = 3;
    return helper;
  }, []);

  if (!enabled) return null;
  return <primitive object={grid} />;
}

function CameraDistanceOnStart({
  started,
  enforceRadius,
  controlsRef,
  farRadius,
  nearRadius,
}: {
  started: boolean;
  enforceRadius: boolean;
  controlsRef: React.RefObject<any>;
  farRadius: number;
  nearRadius: number;
}) {
  const { camera } = useThree();

  useFrame((_state, dt) => {
    if (!enforceRadius) return;
    const controls = controlsRef.current;
    if (!controls) return;

    const target = controls.target as THREE.Vector3 | { x: number; y: number; z: number };
    const targetVec =
      target instanceof THREE.Vector3 ? target : new THREE.Vector3(target.x, target.y, target.z);

    const dir = camera.position.clone().sub(targetVec);
    const currentRadius = dir.length();
    if (currentRadius < 1e-6) return;

    const desiredRadius = started ? nearRadius : farRadius;
    const t = 1 - Math.exp(-dt * 4.2); // slightly gentler zoom-in feel
    const newRadius = currentRadius + (desiredRadius - currentRadius) * t;

    dir.normalize().multiplyScalar(newRadius);
    camera.position.copy(targetVec).add(dir);
    // Keep OrbitControls in sync.
    controls.update?.();
  });

  return null;
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
  interactionsEnabled,
}: {
  assets: Asset[];
  uiMode: 'city' | 'stocks';
  selectedId: string | null;
  onToggleBuilding: (id: string) => void;
  map: MapJson | null;
  interactionsEnabled: boolean;
}) {
  // Sector-driven colormaps (finance/technology/healthcare).
  // These replace whatever map_Kd was in the original MTL so visuals reflect `house.sector`.
  const colormapFinance = useLoader(THREE.TextureLoader, publicUrl('/industrial/Textures/colormap_finance.png'));
  const colormapTechnology = useLoader(THREE.TextureLoader, publicUrl('/industrial/Textures/colormap_technology.png'));
  const colormapHealthcare = useLoader(THREE.TextureLoader, publicUrl('/industrial/Textures/colormap_healthcare.png'));

  // Normalize texture sampler params to avoid intermittent black/incomplete sampling.
  for (const t of [colormapFinance, colormapTechnology, colormapHealthcare]) {
    t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
  }

  const colormapForSectorKey = (sectorKey?: string) => {
    switch (sectorKey) {
      case 't':
        return colormapTechnology;
      case 'f':
        return colormapFinance;
      case 'h':
        return colormapHealthcare;
      default:
        return colormapFinance;
    }
  };

  const selectedAsset = useMemo(() => {
    if (!selectedId) return null;
    return assets.find((a) => a.id === selectedId) ?? null;
  }, [assets, selectedId]);

  const stockByCompany = useMemo(() => {
    const m = new Map<string, Asset>();
    for (const a of assets) {
      if (a.type === 'stock') m.set(a.id, a);
    }
    return m;
  }, [assets]);

  const propertyByHouseId = useMemo(() => {
    const m = new Map<string, Asset>();
    for (const a of assets) {
      if (a.type !== 'property') continue;
      // asset.id = property-${house.id}
      const houseId = a.id.startsWith('property-') ? a.id.slice('property-'.length) : a.id;
      m.set(houseId, a);
    }
    return m;
  }, [assets]);

  const etfBySectorLabel = useMemo(() => {
    const m = new Map<Sector, Asset>();
    for (const a of assets) {
      if (a.type === 'etf') m.set(a.sector, a);
    }
    return m;
  }, [assets]);

  const countryEtfByMarket = useMemo(() => {
    const m = new Map<Market, Asset>();
    for (const a of assets) {
      if (a.type !== 'etf') continue;
      if (!a.id.startsWith('etf-country-')) continue;
      m.set(a.market, a);
    }
    return m;
  }, [assets]);

  const sectorGroups = useMemo(() => {
    if (!map) return null;
    const groups = new Map<
      string,
      {
        sectorKey: string;
        sectorLabel: Sector;
        cx: number;
        cy: number;
        cz: number;
        count: number;
      }
    >();

    for (const h of map.houses) {
      if (!isBuildingHouse(h)) continue;
      // Only business buildings participate in ETF/region presentation.
      if (h.companyName === 'DummyCompany') continue;
      const sectorKey = h.sector ?? 'DummySector';
      const sectorLabel = mapSectorKeyToSector(sectorKey);
      if (!groups.has(sectorKey)) {
        groups.set(sectorKey, { sectorKey, sectorLabel, cx: 0, cy: 0, cz: 0, count: 0 });
      }
      const g = groups.get(sectorKey)!;
      g.cx += h.position[0];
      g.cy += h.position[1];
      g.cz += -h.position[2];
      g.count += 1;
    }

    return Array.from(groups.values()).map((g) => ({
      ...g,
      cx: g.cx / g.count,
      cy: g.cy / g.count,
      cz: g.cz / g.count,
    }));
  }, [map]);

  const companyGroups = useMemo(() => {
    if (!map) return null;
    const groups = new Map<
      string,
      {
        companyName: string;
        cx: number;
        cy: number;
        cz: number;
        count: number;
      }
    >();

    for (const h of map.houses) {
      if (!isBuildingHouse(h)) continue;
      const companyName = h.companyName ?? h.id;
      if (companyName === 'DummyCompany') continue; // properties don't get bubbles
      if (!groups.has(companyName)) {
        groups.set(companyName, { companyName, cx: 0, cy: 0, cz: 0, count: 0 });
      }
      const g = groups.get(companyName)!;
      g.cx += h.position[0];
      g.cy += h.position[1];
      g.cz += -h.position[2]; // match Unity -> Three flip used for meshes
      g.count += 1;
    }

    return Array.from(groups.values()).map((g) => ({
      ...g,
      cx: g.cx / g.count,
      cy: g.cy / g.count,
      cz: g.cz / g.count,
    }));
  }, [map]);

  const countryGroups = useMemo(() => {
    if (!map) return null;
    const groups = new Map<
      Market,
      {
        market: Market;
        cx: number;
        cy: number;
        cz: number;
        count: number;
      }
    >();

    for (const h of map.houses) {
      const base = normalizeTypeName(h.type);
      if (!base.startsWith('road-')) continue;
      const market = mapCountryToMarket(h.country);
      if (!groups.has(market)) groups.set(market, { market, cx: 0, cy: 0, cz: 0, count: 0 });
      const g = groups.get(market)!;
      g.cx += h.position[0];
      g.cy += h.position[1];
      g.cz += -h.position[2]; // Unity -> Three flip
      g.count += 1;
    }

    return Array.from(groups.values()).map((g) => ({
      ...g,
      cx: g.cx / g.count,
      cy: g.cy / g.count,
      cz: g.cz / g.count,
    }));
  }, [map]);

  const stockBubblePosById = useMemo(() => {
    const m = new Map<string, [number, number, number]>();
    if (!companyGroups) return m;
    for (const g of companyGroups) {
      const s = stockByCompany.get(g.companyName);
      if (!s) continue;
      m.set(s.id, [g.cx, g.cy + 0.95, g.cz]);
    }
    return m;
  }, [companyGroups, stockByCompany]);

  const sectorEtfPosById = useMemo(() => {
    const m = new Map<string, [number, number, number]>();
    if (!sectorGroups) return m;
    for (const g of sectorGroups) {
      const etfAsset = etfBySectorLabel.get(g.sectorLabel);
      if (!etfAsset) continue;
      m.set(etfAsset.id, [g.cx, g.cy + 1.55, g.cz]);
    }
    return m;
  }, [sectorGroups, etfBySectorLabel]);

  const countryEtfPosById = useMemo(() => {
    const m = new Map<string, [number, number, number]>();
    if (!countryGroups) return m;
    for (const g of countryGroups) {
      const etfAsset = countryEtfByMarket.get(g.market);
      if (!etfAsset) continue;
      m.set(etfAsset.id, [g.cx, g.cy + 1.55, g.cz]);
    }
    return m;
  }, [countryGroups, countryEtfByMarket]);

  const stocksBySectorLabel = useMemo(() => {
    const m = new Map<Sector, Asset[]>();
    for (const a of assets) {
      if (a.type !== 'stock') continue;
      const sector = a.sector;
      if (!m.has(sector)) m.set(sector, []);
      m.get(sector)!.push(a);
    }
    return m;
  }, [assets]);

  const stocksByMarket = useMemo(() => {
    const m = new Map<Market, Asset[]>();
    for (const a of assets) {
      if (a.type !== 'stock') continue;
      const market = a.market;
      if (!m.has(market)) m.set(market, []);
      m.get(market)!.push(a);
    }
    return m;
  }, [assets]);

  const sectorLinesByEtfId = useMemo(() => {
    const m = new Map<string, THREE.BufferGeometry>();
    if (!sectorGroups) return m;

    for (const g of sectorGroups) {
      const etfAsset = etfBySectorLabel.get(g.sectorLabel);
      if (!etfAsset) continue;

      const etfPos = sectorEtfPosById.get(etfAsset.id);
      if (!etfPos) continue;

      const memberStocks = stocksBySectorLabel.get(g.sectorLabel) ?? [];
      const positions: number[] = [];
      for (const s of memberStocks) {
        const stockPos = stockBubblePosById.get(s.id);
        if (!stockPos) continue;
        positions.push(
          etfPos[0],
          etfPos[1],
          etfPos[2],
          stockPos[0],
          stockPos[1],
          stockPos[2],
        );
      }

      if (positions.length === 0) continue;
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
      m.set(etfAsset.id, geom);
    }

    return m;
  }, [sectorGroups, etfBySectorLabel, sectorEtfPosById, stocksBySectorLabel, stockBubblePosById]);

  const countryLinesByEtfId = useMemo(() => {
    const m = new Map<string, THREE.BufferGeometry>();
    if (!countryGroups) return m;

    for (const g of countryGroups) {
      const etfAsset = countryEtfByMarket.get(g.market);
      if (!etfAsset) continue;

      const etfPos = countryEtfPosById.get(etfAsset.id);
      if (!etfPos) continue;

      const memberStocks = stocksByMarket.get(g.market) ?? [];
      const positions: number[] = [];
      for (const s of memberStocks) {
        const stockPos = stockBubblePosById.get(s.id);
        if (!stockPos) continue;
        positions.push(
          etfPos[0],
          etfPos[1],
          etfPos[2],
          stockPos[0],
          stockPos[1],
          stockPos[2],
        );
      }

      if (positions.length === 0) continue;
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
      m.set(etfAsset.id, geom);
    }

    return m;
  }, [countryGroups, countryEtfByMarket, countryEtfPosById, stocksByMarket, stockBubblePosById]);

  const sectorLineMatDim = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: 0x7dd3fc, // #7dd3fc
        transparent: true,
        opacity: 0.12,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );

  const sectorLineMatBright = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: 0x7dd3fc,
        transparent: true,
        opacity: 0.62,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );

  const countryLineMatDim = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: 0xffc193, // very light orange
        transparent: true,
        opacity: 0.12,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );

  const countryLineMatBright = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: 0xffc193,
        transparent: true,
        opacity: 0.62,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );

  const selectedStockSectorLineGeom = useMemo(() => {
    if (!selectedAsset || selectedAsset.type !== 'stock') return null;
    const etfId = `etf-${selectedAsset.sector}`;
    const etfPos = sectorEtfPosById.get(etfId);
    const stockPos = stockBubblePosById.get(selectedAsset.id);
    if (!etfPos || !stockPos) return null;

    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([etfPos[0], etfPos[1], etfPos[2], stockPos[0], stockPos[1], stockPos[2]]),
        3,
      ),
    );
    return geom;
  }, [selectedAsset, sectorEtfPosById, stockBubblePosById]);

  const selectedStockCountryLineGeom = useMemo(() => {
    if (!selectedAsset || selectedAsset.type !== 'stock') return null;
    const etfId = `etf-country-${selectedAsset.market}`;
    const etfPos = countryEtfPosById.get(etfId);
    const stockPos = stockBubblePosById.get(selectedAsset.id);
    if (!etfPos || !stockPos) return null;

    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([etfPos[0], etfPos[1], etfPos[2], stockPos[0], stockPos[1], stockPos[2]]),
        3,
      ),
    );
    return geom;
  }, [selectedAsset, countryEtfPosById, stockBubblePosById]);

  const selectedSectorEtfFullGeom = useMemo(() => {
    if (!selectedAsset || selectedAsset.type !== 'etf') return null;
    if (!selectedAsset.id.startsWith('etf-')) return null;
    if (selectedAsset.id.startsWith('etf-country-')) return null;
    return sectorLinesByEtfId.get(selectedAsset.id) ?? null;
  }, [selectedAsset, sectorLinesByEtfId]);

  const selectedCountryEtfFullGeom = useMemo(() => {
    if (!selectedAsset || selectedAsset.type !== 'etf') return null;
    if (!selectedAsset.id.startsWith('etf-country-')) return null;
    return countryLinesByEtfId.get(selectedAsset.id) ?? null;
  }, [selectedAsset, countryLinesByEtfId]);

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

  const countrySelectedOutlineMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: 0xffc193,
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

  const batches = useMemo(() => {
    if (!map) return null;
    const groups = new Map<
      string,
      {
        spec: { obj: string; mtl: string; resourcePath: string };
        list: Array<{ key: string; position: [number, number, number]; quat: THREE.Quaternion; meta: unknown }>;
      }
    >();
    const flipY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

    for (let idx = 0; idx < map.houses.length; idx++) {
      const h = map.houses[idx];
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
        // `public/map.json` can contain duplicate `id`s for different houses.
        // Use a composite key so React keeps a stable identity per instance.
        key: `${h.id}-${idx}`,
        position: [h.position[0], h.position[1], -h.position[2]],
        quat,
        meta: {
          house: h,
          asset: isBuildingHouse(h)
            ? h.companyName === 'DummyCompany'
              ? propertyByHouseId.get(h.id) ?? null
              : stockByCompany.get(h.companyName ?? h.id) ?? null
            : null,
        },
      });
    }
    return Array.from(groups.values());
  }, [map, stockByCompany]);

  if (!map || !batches) return null;

  return (
    <>
      {/* ETF region hover text removed in building mode */}

      {batches.map((b) => (
        <ModelBatch
          key={`${b.spec.resourcePath}${b.spec.obj}`}
          spec={b.spec}
          placements={b.list}
          render={(base, p) => {
            const meta = p.meta as { house: MapHouse; asset: Asset | null };
            const isRoad = normalizeTypeName(meta.house.type).startsWith('road-');
            const asset = meta.asset;

            if (isRoad) {
              const countryMarket = mapCountryToMarket(meta.house.country);
              const countryEtf = countryEtfByMarket.get(countryMarket);
              const isSelectedCountryEtf =
                uiMode === 'city' && !!selectedAsset && selectedAsset.type === 'etf' && selectedAsset.market === countryMarket;
              const outlineRoadObj = isSelectedCountryEtf
                ? (() => {
                    const o = base.clone(true);
                    o.traverse((child) => {
                      if (!(child instanceof THREE.Mesh)) return;
                      const geo = child.geometry as unknown as THREE.BufferGeometry;
                      const edges = getEdgesGeometry(geo);
                      const line = new THREE.LineSegments(edges, roadOutlineLineMaterial);
                      line.frustumCulled = false;
                      line.renderOrder = 20;
                      child.add(line);
                      // Hide the filled surface so only the edge lines remain.
                      child.material = roadInvisibleFillMaterial;
                    });
                    return o;
                  })()
                : null;

              return (
                <CollapseIntoGround uiMode={uiMode} position={p.position} quaternion={p.quat}>
                  <group
                    onPointerDown={(e) => {
                      if (!interactionsEnabled) return;
                      e.stopPropagation();
                      if (countryEtf) onToggleBuilding(countryEtf.id);
                    }}
                  >
                    <primitive object={base.clone(true)} />
                    {outlineRoadObj && <primitive object={outlineRoadObj} />}
                  </group>
                </CollapseIntoGround>
              );
            }

            if (!asset) {
              return (
                <CollapseIntoGround uiMode={uiMode} position={p.position} quaternion={p.quat}>
                  <primitive object={base.clone(true)} />
                </CollapseIntoGround>
              );
            }

            return (
              <CollapseIntoGround uiMode={uiMode} position={p.position} quaternion={p.quat}>
                {(() => {
                  const selectedCountryMarket =
                    uiMode === 'city' &&
                    selectedAsset?.type === 'etf' &&
                    selectedAsset.id.startsWith('etf-country-')
                      ? selectedAsset.market
                      : null;

                  const highlightCountryBuildings =
                    uiMode === 'city' && !!selectedCountryMarket && asset.type !== 'etf' && asset.market === selectedCountryMarket;

                  return (
                <SelectableBuilding
                  id={asset.id}
                  base={base}
                  selected={selectedId === asset.id || highlightCountryBuildings}
                  locked={!asset.unlocked}
                  assetType={asset.type}
                  showInvestableOutline={interactionsEnabled && asset.type === 'stock' && asset.unlocked}
                  uiMode={uiMode}
                  interactionsEnabled={interactionsEnabled}
                  colormapTexture={meta.house.companyName === 'DummyCompany' ? undefined : colormapForSectorKey(meta.house.sector)}
                  position={[0, 0, 0]}
                  rotY={0}
                  onToggle={onToggleBuilding}
                  outlineMaterial={outlineMat}
                  selectedOutlineMaterial={highlightCountryBuildings ? countrySelectedOutlineMat : selectedOutlineMat}
                />
                  );
                })()}
              </CollapseIntoGround>
            );
          }}
        />
      ))}

      {/* ETF connectors: show all relationships dim, then highlight the currently-selected relationship */}
      {interactionsEnabled &&
        uiMode === 'stocks' &&
        sectorGroups?.map((g) => {
          const etfAsset = etfBySectorLabel.get(g.sectorLabel);
          if (!etfAsset) return null;
          const geom = sectorLinesByEtfId.get(etfAsset.id);
          if (!geom) return null;

          return (
            <lineSegments
              key={`line-sector-${etfAsset.id}`}
              geometry={geom}
              material={sectorLineMatDim}
              raycast={() => null}
              renderOrder={1}
            />
          );
        })}

      {interactionsEnabled &&
        uiMode === 'stocks' &&
        countryGroups?.map((g) => {
          const etfAsset = countryEtfByMarket.get(g.market);
          if (!etfAsset) return null;
          const geom = countryLinesByEtfId.get(etfAsset.id);
          if (!geom) return null;

          return (
            <lineSegments
              key={`line-country-${etfAsset.id}`}
              geometry={geom}
              material={countryLineMatDim}
              raycast={() => null}
              renderOrder={1}
            />
          );
        })}

      {/* Bright highlight: selecting an ETF lights up its entire fan-out */}
      {interactionsEnabled && uiMode === 'stocks' && selectedSectorEtfFullGeom && (
        <lineSegments
          geometry={selectedSectorEtfFullGeom}
          material={sectorLineMatBright}
          raycast={() => null}
          renderOrder={2}
        />
      )}
      {interactionsEnabled && uiMode === 'stocks' && selectedCountryEtfFullGeom && (
        <lineSegments
          geometry={selectedCountryEtfFullGeom}
          material={countryLineMatBright}
          raycast={() => null}
          renderOrder={2}
        />
      )}

      {/* Bright highlight: selecting a stock only lights up its own incoming links */}
      {interactionsEnabled && uiMode === 'stocks' && selectedStockSectorLineGeom && (
        <lineSegments
          geometry={selectedStockSectorLineGeom}
          material={sectorLineMatBright}
          raycast={() => null}
          renderOrder={3}
        />
      )}
      {interactionsEnabled && uiMode === 'stocks' && selectedStockCountryLineGeom && (
        <lineSegments
          geometry={selectedStockCountryLineGeom}
          material={countryLineMatBright}
          raycast={() => null}
          renderOrder={3}
        />
      )}

      {interactionsEnabled &&
        uiMode === 'stocks' &&
        companyGroups?.map((g) => {
          const stockAsset = stockByCompany.get(g.companyName);
          if (!stockAsset) return null;
          return (
            <TickerBubble
              key={`bubble-${stockAsset.id}`}
              symbol={stockAsset.symbol}
              locked={!stockAsset.unlocked}
              selected={selectedId === stockAsset.id}
              position={[g.cx, g.cy + 0.95, g.cz]}
              onSelect={() => onToggleBuilding(stockAsset.id)}
              interactionsEnabled={interactionsEnabled}
              size={92}
              variant="stock"
            />
          );
        })}

      {/* ETF bubbles (one per sector) */}
      {interactionsEnabled &&
        uiMode === 'stocks' &&
        sectorGroups?.map((g) => {
          const etfAsset = etfBySectorLabel.get(g.sectorLabel);
          if (!etfAsset) return null;
          const selectedThisBubble =
            selectedId === etfAsset.id ||
            (selectedAsset?.type === 'stock' && selectedAsset.sector === g.sectorLabel);

          return (
            <TickerBubble
              key={`etf-bubble-${etfAsset.id}`}
              symbol={etfAsset.symbol}
              locked={!etfAsset.unlocked}
              selected={selectedThisBubble}
              // lift ETFs above stock bubbles so both are visible
              position={[g.cx, g.cy + 1.55, g.cz]}
              onSelect={() => onToggleBuilding(etfAsset.id)}
              interactionsEnabled={interactionsEnabled}
              size={86}
              variant="country-etf"
            />
          );
        })}

      {/* Country ETF bubbles (one per country), centered */}
      {interactionsEnabled &&
        uiMode === 'stocks' &&
        countryGroups?.map((g) => {
          const etfAsset = countryEtfByMarket.get(g.market);
          if (!etfAsset) return null;

          const selectedThisBubble =
            selectedId === etfAsset.id ||
            ((selectedAsset?.type === 'stock' || selectedAsset?.type === 'property') &&
              selectedAsset.market === etfAsset.market);

          return (
            <TickerBubble
              key={`country-etf-${etfAsset.id}`}
              symbol={etfAsset.symbol}
              locked={!etfAsset.unlocked}
              selected={selectedThisBubble}
              position={[g.cx, g.cy + 1.55, g.cz]}
              onSelect={() => onToggleBuilding(etfAsset.id)}
              interactionsEnabled={interactionsEnabled}
              size={86}
              variant="country-etf"
            />
          );
        })}
    </>
  );
}

export default function Home() {
  const [started, setStarted] = useState(false);
  const [introZooming, setIntroZooming] = useState(false);
  const [titleVisible, setTitleVisible] = useState(false);

  const [difficulty, setDifficulty] = useState<Difficulty>('mid');
  const [leaderboard, setLeaderboard] = useState<Record<DifficultyBucket, LeaderboardRow[]>>({
    easy: [],
    medium: [],
    hard: [],
  });
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [pendingRun, setPendingRun] = useState<{ score: number; bucket: DifficultyBucket } | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [savingScore, setSavingScore] = useState(false);

  const startingCash = difficulty === 'min' ? 5_000 : difficulty === 'mid' ? 10_000 : 20_000;
  /** Same tier as start capital (min→easy, mid→medium, max→hard); single selector in the menu. */
  const leaderboardBucket = difficultyToBucket(difficulty);
  const [eventCatalog, setEventCatalog] = useState<ReturnType<typeof normalizeEventCatalog>>([]);

  const [state, setState] = useState(() =>
    createInitialState({ startingCash, seed: 26, year: 2026, eventCatalog: [] }),
  );

  const dispatch = (action: Parameters<typeof gameReducer>[1]) => setState((s) => gameReducer(s, action));

  const [map, setMap] = useReducer((_: MapJson | null, next: MapJson | null) => next, null);
  const dynamicAssets = useMemo(() => {
    if (!map) return null;
    return createAssetsFromMap(map);
  }, [map]);

  const controlsRef = useRef<any>(null);
  const farRadius = Math.sqrt(9 * 9 + 6 * 6 + 9 * 9); // matches initial camera position below
  const nearRadius = Math.sqrt(4.5 * 4.5 + 2.5 * 2.5 + 4.5 * 4.5); // slightly tighter orbit after pressing play

  useEffect(() => {
    if (started) return;
    setState(createInitialState({ startingCash, seed: 26, year: 2026, eventCatalog }, dynamicAssets ?? undefined));
  }, [difficulty, started, dynamicAssets, eventCatalog]);

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
    fetch(publicUrl('/map.json'))
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

  useEffect(() => {
    let cancelled = false;
    fetch(publicUrl('/events.json'))
      .then((r) => r.json())
      .then((j: unknown) => {
        if (cancelled) return;
        setEventCatalog(normalizeEventCatalog(j));
      })
      .catch(() => {
        if (!cancelled) setEventCatalog([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!started) {
      setIntroZooming(false);
      return;
    }
    setIntroZooming(true);
    const t = window.setTimeout(() => setIntroZooming(false), 1100);
    return () => window.clearTimeout(t);
  }, [started]);

  useEffect(() => {
    // Show the home-screen title animation once after initial load.
    const t = window.setTimeout(() => setTitleVisible(true), 80);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!started) return;
    setState((s) => {
      const activeEvents = activeEventsForYear(eventCatalog, s.year);
      const modeDriver =
        activeEvents.find((e) => e.seriousness === 'timed' || e.seriousness === 'serious') ??
        activeEvents.find((e) => e.mode !== 'both') ??
        null;
      const uiMode =
        modeDriver?.mode === 'city'
          ? 'city'
          : modeDriver?.mode === 'stock'
            ? 'stocks'
            : s.uiMode;
      return { ...s, eventCatalog, activeEvents, uiMode };
    });
  }, [started, eventCatalog]);

  const timedAutoAdvanceKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const timedEvent = state.activeEvents.find((e) => e.seriousness === 'timed');
    if (!timedEvent) {
      timedAutoAdvanceKeyRef.current = null;
      return;
    }
    const key = `${state.year}:${timedEvent.id}`;
    if (timedAutoAdvanceKeyRef.current === key) return;
    timedAutoAdvanceKeyRef.current = key;
    const t = window.setTimeout(() => {
      dispatch({ type: 'ADVANCE_YEAR' });
    }, 20_000);
    return () => window.clearTimeout(t);
  }, [state.activeEvents, state.year]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLeaderboardLoading(true);
      setLeaderboardError(null);
      try {
        const [easy, medium, hard] = await Promise.all([
          fetchLeaderboardForBucket('easy'),
          fetchLeaderboardForBucket('medium'),
          fetchLeaderboardForBucket('hard'),
        ]);
        if (cancelled) return;
        setLeaderboard({
          easy: mergeScreenshotDummyRows('easy', easy),
          medium: mergeScreenshotDummyRows('medium', medium),
          hard: mergeScreenshotDummyRows('hard', hard),
        });
      } catch (e) {
        if (!cancelled) setLeaderboardError(e instanceof Error ? e.message : 'Failed to load leaderboard');
      } finally {
        if (!cancelled) setLeaderboardLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const completedRunYearRef = useRef<number | null>(null);
  useEffect(() => {
    if (!started) {
      // Allow the next run to trigger completion again at the same end year.
      completedRunYearRef.current = null;
    }
  }, [started]);

  useEffect(() => {
    if (!started) return;
    const startYear = state.inflationHistory[0]?.year ?? state.year;
    const endYear = startYear + (RUN_LENGTH_YEARS - 1);
    if (state.year < endYear && !state.lastActionMessage?.startsWith('Run complete:')) return;
    if (completedRunYearRef.current === state.year) return;
    completedRunYearRef.current = state.year;
    const finalScore = Math.round(netWorth(state));
    const bucket = difficultyToBucket(difficulty);
    setPendingRun({ score: finalScore, bucket });
    setPlayerName('');
    // Return to main screen: camera smoothly moves back via existing start/menu camera logic.
    setStarted(false);
  }, [started, state.lastActionMessage, state.year, state.assets, state.player.cash, difficulty]);

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

  // Debug: show which 3D model file the selected company/building comes from.
  const debugSelectedBuildingFiles = useMemo(() => {
    if (!map || !state.selectedAssetId) return null;

    const selected = state.assets[state.selectedAssetId];
    if (!selected) return null;

    const relevantHouses =
      selected.type === 'stock'
        ? map.houses.filter((h) => isBuildingHouse(h) && (h.companyName ?? h.id) === selected.id)
        : map.houses.filter((h) => isBuildingHouse(h) && mapSectorKeyToSector(h.sector) === selected.sector);

    const objPaths = relevantHouses.map((m) => specForMapType(m.type)?.obj).filter((v): v is string => typeof v === 'string');
    if (objPaths.length === 0) return null;

    const filenames = Array.from(
      new Set(objPaths.map((p) => p.split('/').pop() ?? p)),
    );
    return filenames.join(', ');
  }, [map, state.assets, state.selectedAssetId]);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <Canvas
        shadows
        frameloop="always"
        camera={{ position: [9, 6, 9], fov: 60 }}
        onPointerMissed={() => {
          if (!started) return;
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
            interactionsEnabled={started}
          />
        </Suspense>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
          <planeGeometry args={[80, 80]} />
          <shadowMaterial transparent opacity={0.25} />
        </mesh>
        <StockModeGrid enabled={state.uiMode === 'stocks'} />
        <OrbitControls ref={controlsRef} autoRotate={!started} autoRotateSpeed={1.1} target={[0, 0, 0]} />
        <CameraDistanceOnStart
          started={started}
          enforceRadius={!started || introZooming}
          controlsRef={controlsRef}
          farRadius={farRadius}
          nearRadius={nearRadius}
        />
      </Canvas>

      {/* Game UI (rendered only after pressing play) */}
      {started && (
        <>
          <Hud
            state={state}
            onNextYear={() => dispatch({ type: 'ADVANCE_YEAR' })}
            onToggleMode={() => dispatch({ type: 'TOGGLE_UI_MODE' })}
            onSelectAsset={(assetId) =>
              dispatch({
                type: 'SELECT_ASSET',
                assetId: state.selectedAssetId === assetId ? null : assetId,
              })
            }
            onSellAll={(assetId, qty) => dispatch({ type: 'SELL', assetId, qty })}
            debugSelectedBuildingFileName={debugSelectedBuildingFiles ?? undefined}
          >
            {panelOpen && selectedAsset && (
              <AssetPanel
                asset={selectedAsset}
                uiMode={state.uiMode}
                cash={state.player.cash}
                onBuy={(qty) => dispatch({ type: 'BUY', assetId: selectedAsset.id, qty })}
                onSell={(qty) => dispatch({ type: 'SELL', assetId: selectedAsset.id, qty })}
                relatedSectorEtf={
                  (selectedAsset.type === 'stock' || selectedAsset.type === 'property') &&
                  state.assets[`etf-${selectedAsset.sector}`]
                    ? ({
                        id: `etf-${selectedAsset.sector}`,
                        displayName: `${selectedAsset.sector} ETF`,
                      } as const)
                    : null
                }
                onSelectRelatedSectorEtf={(etfId) =>
                  dispatch({
                    type: 'SELECT_ASSET',
                    assetId: state.selectedAssetId === etfId ? null : etfId,
                  })
                }
                relatedCountryEtf={
                  (selectedAsset.type === 'stock' || selectedAsset.type === 'property') &&
                  state.assets[`etf-country-${selectedAsset.market}`]
                    ? ({
                        id: `etf-country-${selectedAsset.market}`,
                        displayName: `${selectedAsset.market} ETF`,
                      } as const)
                    : null
                }
                onSelectRelatedCountryEtf={(etfId) =>
                  dispatch({
                    type: 'SELECT_ASSET',
                    assetId: state.selectedAssetId === etfId ? null : etfId,
                  })
                }
              />
            )}
          </Hud>

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
        </>
      )}

      {/* Main menu overlay */}
      <div
        role="presentation"
        onClick={() => {
          if (started || !map) return;
          setStarted(true);
        }}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: started ? 'none' : 'auto',
          opacity: started ? 0 : 1,
          transition: 'opacity 200ms ease',
          zIndex: 20,
          cursor: started ? 'default' : map ? 'pointer' : 'wait',
        }}
      >
        {(() => {
          const menuEdgeInset = 44;
          return (
            <>
        {/* Top title (letter-by-letter on initial page load) */}
        <div
          style={{
            position: 'absolute',
            top: '16%',
            transform: 'translateY(-50%)',
            left: 0,
            right: 0,
            textAlign: 'center',
            pointerEvents: 'none',
            userSelect: 'none',
            fontFamily:
              'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
            textShadow: '0 10px 24px rgba(0,0,0,0.35)',
            lineHeight: 1,
          }}
        >
          {'EquiCity'.split('').map((ch, i) => (
            <span
              key={i}
              style={{
                display: 'inline-block',
                opacity: titleVisible ? 1 : 0,
                transform: titleVisible ? 'translateY(0px) rotate(0deg)' : 'translateY(10px) rotate(-8deg)',
                transition: 'opacity 520ms ease, transform 520ms ease',
                transitionDelay: `${i * 60}ms`,
                background: 'linear-gradient(90deg, rgba(255,255,255,0.98), rgba(125,211,252,0.95))',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
                fontWeight: 950,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                fontSize: 72,
              }}
            >
              {ch}
            </span>
          ))}
        </div>

        {/* Center hint — slow fade pulse; clicks use full-screen overlay */}
        <style>{`
          @keyframes equicityMenuHintFade {
            0%, 100% { opacity: 0.35; }
            50% { opacity: 1; }
          }
        `}</style>
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            textAlign: 'center',
            maxWidth: 'min(320px, 88vw)',
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 650,
              letterSpacing: '0.04em',
              color: map ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.75)',
              textShadow: '0 2px 12px rgba(0,0,0,0.35)',
              fontFamily:
                'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
              animation: 'equicityMenuHintFade 3.2s ease-in-out infinite',
              willChange: 'opacity',
            }}
          >
            {map ? 'Press anywhere to start' : 'Loading map…'}
          </div>
        </div>

        {/* Bottom controls, symmetric margin to title top inset */}
        <div
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            left: '50%',
            bottom: menuEdgeInset,
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            width: 'min(760px, 92vw)',
            zIndex: 2,
          }}
        >
          {/* Difficulty + starting cash */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.20)',
              background: 'rgba(255,255,255,0.07)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              color: 'rgba(255,255,255,0.92)',
              fontWeight: 800,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              display: 'flex',
              flexDirection: 'row',
              gap: 10,
              alignItems: 'center',
              userSelect: 'none',
            }}
          >
            {(['min', 'mid', 'max'] as const).map((d, idx) => {
              const cash = d === 'min' ? 5_000 : d === 'mid' ? 10_000 : 20_000;
              const active = difficulty === d;
              return (
                <Fragment key={d}>
                  <button
                    onClick={() => setDifficulty(d)}
                    disabled={started}
                    style={{
                      all: 'unset',
                      cursor: started ? 'default' : 'pointer',
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'baseline',
                      gap: 8,
                      padding: '2px 10px',
                      borderRadius: 999,
                      background: active ? 'rgba(125,211,252,0.14)' : 'transparent',
                      border: active ? '1px solid rgba(125,211,252,0.55)' : '1px solid transparent',
                      opacity: active ? 1 : 0.78,
                      transition: 'background 160ms ease, border-color 160ms ease, opacity 160ms ease',
                    }}
                  >
                    <span style={{ fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      {d}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.95 }}>
                      {cash / 1000}k
                    </span>
                  </button>
                  {idx < 2 && <span style={{ opacity: 0.35 }}>|</span>}
                </Fragment>
              );
            })}
          </div>

          <div
            style={{
              width: 'min(760px, 92vw)',
              padding: '12px 14px',
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.20)',
              background: 'rgba(255,255,255,0.07)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              color: 'rgba(255,255,255,0.92)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Leaderboard</div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'rgba(125,211,252,0.9)',
                  opacity: 0.95,
                }}
                title="Matches your start capital tier above"
              >
                {leaderboardBucket === 'easy' ? 'Easy' : leaderboardBucket === 'medium' ? 'Medium' : 'Hard'}
              </div>
            </div>
            <div style={{ marginTop: 8, minHeight: 170 }}>
              {leaderboardLoading ? (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Loading scores...</div>
              ) : leaderboardError ? (
                <div style={{ fontSize: 12, color: 'rgba(255,180,180,0.95)' }}>{leaderboardError}</div>
              ) : leaderboard[leaderboardBucket].length === 0 ? (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>No scores yet.</div>
              ) : (
                leaderboard[leaderboardBucket].map((row, idx) => (
                  <div
                    key={`${leaderboardBucket}-${row.id}-${idx}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '36px 1fr auto',
                      gap: 8,
                      alignItems: 'center',
                      padding: '6px 2px',
                      borderBottom:
                        idx < leaderboard[leaderboardBucket].length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none',
                      fontSize: 13,
                    }}
                  >
                    <div style={{ fontWeight: 900, color: 'rgba(125,211,252,0.95)' }}>#{idx + 1}</div>
                    <div style={{ fontWeight: 700, color: 'rgba(255,255,255,0.92)' }}>{row.name || 'Player'}</div>
                    <div style={{ fontWeight: 800, color: 'rgba(120,255,180,0.95)' }}>{Math.round(row.score).toLocaleString('en-US')}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
            </>
          );
        })()}
      </div>

      {pendingRun && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(2,6,23,0.55)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              width: 'min(460px, 92vw)',
              padding: '16px',
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.20)',
              background: 'rgba(255,255,255,0.10)',
              color: 'rgba(255,255,255,0.95)',
              boxShadow: '0 20px 52px rgba(0,0,0,0.35)',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Run complete
            </div>
            <div style={{ marginTop: 8, fontSize: 15 }}>
              Score: <span style={{ fontWeight: 900 }}>{Math.round(pendingRun.score).toLocaleString('en-US')}</span>
              {' · '}
              <span style={{ textTransform: 'capitalize' }}>{pendingRun.bucket}</span>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>Enter your name for the leaderboard</div>
            <input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              maxLength={24}
              placeholder="Your name"
              style={{
                marginTop: 8,
                width: '100%',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.25)',
                background: 'rgba(15,23,42,0.55)',
                color: 'rgba(255,255,255,0.95)',
                padding: '10px 12px',
                outline: 'none',
              }}
            />
            <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setPendingRun(null)}
                disabled={savingScore}
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.25)',
                  background: 'rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.92)',
                  fontWeight: 700,
                  cursor: savingScore ? 'not-allowed' : 'pointer',
                }}
              >
                Skip
              </button>
              <button
                onClick={async () => {
                  if (!pendingRun || savingScore) return;
                  try {
                    setSavingScore(true);
                    setLeaderboardError(null);
                    await submitScore({
                      name: playerName || 'Player',
                      score: pendingRun.score,
                      bucket: pendingRun.bucket,
                    });
                    const rows = await fetchLeaderboardForBucket(pendingRun.bucket);
                    setLeaderboard((prev) => ({
                      ...prev,
                      [pendingRun.bucket]: mergeScreenshotDummyRows(pendingRun.bucket, rows),
                    }));
                    setPendingRun(null);
                  } catch (e) {
                    setLeaderboardError(e instanceof Error ? e.message : 'Failed to save score');
                  } finally {
                    setSavingScore(false);
                  }
                }}
                disabled={savingScore}
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(120,255,180,0.4)',
                  background: 'rgba(120,255,180,0.18)',
                  color: 'rgba(255,255,255,0.95)',
                  fontWeight: 800,
                  cursor: savingScore ? 'not-allowed' : 'pointer',
                }}
              >
                {savingScore ? 'Saving...' : 'Save score'}
              </button>
            </div>
            {!SUPABASE_ANON_KEY && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,180,180,0.95)' }}>
                Missing NEXT_PUBLIC_SUPABASE_ANON_KEY. Add it to enable leaderboard writes.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
