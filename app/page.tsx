'use client';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

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
    </div>
  );
}
