'use client';
import { Canvas, ThreeEvent, useLoader } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Suspense, useEffect, useMemo, useState } from 'react';
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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

const chartData = {
  labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  datasets: [
    {
      data: [42, 58, 45, 70, 65, 88, 75, 92, 80, 105, 98, 120],
      borderColor: 'rgba(255, 255, 255, 0.85)',
      borderWidth: 2,
      pointRadius: 3,
      pointBackgroundColor: 'rgba(255, 255, 255, 0.9)',
      fill: true,
      backgroundColor: 'rgba(255, 255, 255, 0.08)',
      tension: 0.4,
    },
  ],
};

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
        const anyMat = mat as unknown as { map?: THREE.Texture | null; needsUpdate?: boolean };
        if (anyMat.map) anyMat.map.colorSpace = THREE.SRGBColorSpace;
        if (anyMat.needsUpdate !== undefined) anyMat.needsUpdate = true;
      }
    });
  }, [obj]);

  return obj;
}

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
  position,
  rotY,
  onToggle,
  outlineMaterial,
}: {
  id: string;
  base: THREE.Object3D;
  selected: boolean;
  position: [number, number, number];
  rotY: number;
  onToggle: (id: string) => void;
  outlineMaterial: THREE.Material;
}) {
  // Stable clones so we don't regenerate meshes every render.
  const model = useMemo(() => base.clone(true), [base]);
  const outline = useMemo(() => createOutlineClone(base, outlineMaterial), [base, outlineMaterial]);

  return (
    <group position={position} rotation={[0, rotY, 0]}>
      {selected && <primitive object={outline} scale={1.03} />}
      <primitive
        object={model}
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          onToggle(id);
        }}
      />
    </group>
  );
}

function City({
  selectedId,
  onToggleBuilding,
}: {
  selectedId: string | null;
  onToggleBuilding: (id: string) => void;
}) {
  const industrialA = useObjWithMtl({
    obj: '/industrial/building-a.obj',
    mtl: '/industrial/building-a.mtl',
    resourcePath: '/industrial/',
  });
  const industrialN = useObjWithMtl({
    obj: '/industrial/building-n.obj',
    mtl: '/industrial/building-n.mtl',
    resourcePath: '/industrial/',
  });
  const industrialT = useObjWithMtl({
    obj: '/industrial/building-t.obj',
    mtl: '/industrial/building-t.mtl',
    resourcePath: '/industrial/',
  });
  const commercialA = useObjWithMtl({
    obj: '/commercial/building-a.obj',
    mtl: '/commercial/building-a.mtl',
    resourcePath: '/commercial/',
  });
  const commercialK = useObjWithMtl({
    obj: '/commercial/building-k.obj',
    mtl: '/commercial/building-k.mtl',
    resourcePath: '/commercial/',
  });
  const commercialSkyscraperA = useObjWithMtl({
    obj: '/commercial/building-skyscraper-a.obj',
    mtl: '/commercial/building-skyscraper-a.mtl',
    resourcePath: '/commercial/',
  });
  const roadStraight = useObjWithMtl({
    obj: '/roads/road-straight.obj',
    mtl: '/roads/road-straight.mtl',
    resourcePath: '/roads/',
  });
  const roadCross = useObjWithMtl({
    obj: '/roads/road-crossroad.obj',
    mtl: '/roads/road-crossroad.mtl',
    resourcePath: '/roads/',
  });

  const placements = useMemo(() => {
    const rng = mulberry32(26);
    const grid = 14;
    const cell = 1;
    const roadEvery = 4;

    const items: Array<
      | { kind: 'building'; id: string; model: 'industrialA' | 'industrialN' | 'industrialT' | 'commercialA' | 'commercialK' | 'commercialSkyscraperA'; x: number; z: number; rotY: number }
      | { kind: 'roadStraight'; x: number; z: number; rotY: number }
      | { kind: 'roadCross'; x: number; z: number }
    > = [];

    const half = (grid - 1) / 2;
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
          // road-straight is modeled 90° off from our grid axes
          const rotY = onRoadX ? Math.PI / 2 : 0;
          items.push({ kind: 'roadStraight', x, z, rotY });
          continue;
        }

        if (rng() < 0.7) {
          const pick = rng();
          const model:
            | 'industrialA'
            | 'industrialN'
            | 'industrialT'
            | 'commercialA'
            | 'commercialK'
            | 'commercialSkyscraperA' =
            pick < 0.22
              ? 'industrialA'
              : pick < 0.38
                ? 'industrialN'
                : pick < 0.5
                  ? 'industrialT'
                  : pick < 0.68
                    ? 'commercialA'
                    : pick < 0.86
                      ? 'commercialK'
                      : 'commercialSkyscraperA';
          const rotY = Math.floor(rng() * 4) * (Math.PI / 2);
          items.push({ kind: 'building', id: `${gx}-${gz}`, model, x, z, rotY });
        }
      }
    }

    return { items, grid, cell };
  }, []);

  const getBuilding = (
    model:
      | 'industrialA'
      | 'industrialN'
      | 'industrialT'
      | 'commercialA'
      | 'commercialK'
      | 'commercialSkyscraperA',
  ) => {
    switch (model) {
      case 'industrialA':
        return industrialA;
      case 'industrialN':
        return industrialN;
      case 'industrialT':
        return industrialT;
      case 'commercialA':
        return commercialA;
      case 'commercialK':
        return commercialK;
      case 'commercialSkyscraperA':
        return commercialSkyscraperA;
    }
  };

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

  return (
    <group>
      {placements.items.map((p, idx) => {
        if (p.kind === 'roadCross') {
          return <primitive key={idx} object={roadCross.clone(true)} position={[p.x, 0, p.z]} />;
        }
        if (p.kind === 'roadStraight') {
          return (
            <primitive
              key={idx}
              object={roadStraight.clone(true)}
              position={[p.x, 0, p.z]}
              rotation={[0, p.rotY, 0]}
            />
          );
        }
        const obj = getBuilding(p.model);
        return (
          <SelectableBuilding
            key={p.id}
            id={p.id}
            base={obj}
            selected={selectedId === p.id}
            position={[p.x, 0, p.z]}
            rotY={p.rotY}
            onToggle={onToggleBuilding}
            outlineMaterial={outlineMat}
          />
        );
      })}
    </group>
  );
}

const buildingInfo = [
  { label: 'Type', value: 'Commercial Office' },
  { label: 'Floors', value: '12' },
  { label: 'Year Built', value: '2018' },
  { label: 'Total Area', value: '18,400 m²' },
  { label: 'Occupancy', value: '87%' },
  { label: 'Energy Rating', value: 'A+' },
  { label: 'Last Inspection', value: 'Jan 2026' },
];

export default function Home() {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const panelOpen = selectedBuildingId !== null;

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <Canvas
        shadows
        camera={{ position: [3, 2, 3], fov: 60 }}
        onPointerMissed={() => {
          setSelectedBuildingId(null);
        }}
      >
        <color attach="background" args={['#1a2535']} />
        <ambientLight intensity={0.5} />
        <hemisphereLight args={['#d8ecff', '#1b2a3a', 0.55]} />
        <directionalLight
          position={[6, 10, 6]}
          intensity={5.2}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.00015}
        >
          <orthographicCamera attach="shadow-camera" args={[-10, 10, 10, -10, 0.1, 60]} />
        </directionalLight>
        <Suspense fallback={null}>
          <City
            selectedId={selectedBuildingId}
            onToggleBuilding={(id) => setSelectedBuildingId((prev) => (prev === id ? null : id))}
          />
        </Suspense>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
          <planeGeometry args={[80, 80]} />
          <shadowMaterial transparent opacity={0.25} />
        </mesh>
        <OrbitControls />
      </Canvas>

      {panelOpen && (
        <div
          style={{
            position: 'absolute',
            left: '2rem',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '280px',
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '16px',
            padding: '20px 24px',
            color: 'rgba(255,255,255,0.9)',
            pointerEvents: 'auto',
          }}
        >
          <button
            onClick={() => setSelectedBuildingId(null)}
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.6)',
              fontSize: '1.1rem',
              cursor: 'pointer',
              lineHeight: 1,
              padding: '2px 6px',
            }}
          >
            ×
          </button>
          <h2
            style={{
              margin: '0 0 16px',
              fontSize: '1rem',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.95)',
            }}
          >
            Building A
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {buildingInfo.map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</span>
                <span style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
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
