'use client';
import { Canvas, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, useFBX } from '@react-three/drei';
import { Suspense, useEffect, useState } from 'react';
import * as THREE from 'three';
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

function Building({ onSelect }: { onSelect: () => void }) {
  const fbx = useFBX('/building-a.fbx');

  useEffect(() => {
    fbx.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const oldMat = child.material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial;
        child.material = new THREE.MeshStandardMaterial({
          color: oldMat.color ?? new THREE.Color(0xcccccc),
          map: oldMat.map ?? null,
        });
      }
    });
  }, [fbx]);

  return (
    <primitive
      object={fbx}
      scale={0.01}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(); }}
    />
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
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <Canvas camera={{ position: [3, 2, 3], fov: 60 }}>
        <color attach="background" args={['#1a2535']} />
        <ambientLight intensity={1} />
        <directionalLight position={[2, 2, 5]} intensity={2} />
        <Suspense fallback={null}>
          <Building onSelect={() => setPanelOpen(true)} />
        </Suspense>
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
            onClick={() => setPanelOpen(false)}
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
          top: 0,
          left: 0,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: '2rem',
          pointerEvents: 'none',
        }}
      >
        <h1
          style={{
            color: '#111',
            fontSize: '6rem',
            fontWeight: 'bold',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            margin: 0,
            textShadow:
              '0 1px 2px rgba(255,255,255,0.4), 0 2px 8px rgba(0,0,0,0.5), 0 0px 1px rgba(255,255,255,0.6)',
          }}
        >
          logos
        </h1>
      </div>
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
