'use client';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
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

export default function Home() {
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <Canvas camera={{ position: [3, 2, 3], fov: 60 }} gl={{ clearColor: '#6b7c3a' }} scene={{ background: null }}>
        <color attach="background" args={['#6b7c3a']} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[2, 2, 5]} />
        <mesh>
          <boxGeometry />
          <meshStandardMaterial color="orange" />
        </mesh>
        <OrbitControls />
      </Canvas>
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
