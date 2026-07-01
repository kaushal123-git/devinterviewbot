import React, { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';

const FOUNTAIN_COUNT = 45; // Optimized down from 90 to reduce draw overhead

// Shared Three.js Geometries to prevent GC thrashing in frame loop
const sharedColGeom = new THREE.BoxGeometry(0.5, 1, 0.5);
const sharedColRing = new THREE.RingGeometry(0.3, 0.35, 24);

interface BarProps {
  position: [number, number, number];
  targetHeight: number;
  color: string;
  emissiveColor: string;
  label: string;
  count: number;
  total: number;
  onClick: () => void;
}

function ProgressBar3D({
  position,
  targetHeight,
  color,
  emissiveColor,
  label,
  count,
  total,
  onClick
}: BarProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const [currentHeight, setCurrentHeight] = useState(0);

  // Spring physics references
  const targetJumpRef = useRef(0.0);
  const jumpYRef = useRef(0.0);
  const jumpVelRef = useRef(0.0);

  useFrame((state, delta) => {
    // 1. Growing grow state
    if (currentHeight < targetHeight) {
      const speed = Math.max(0.2, targetHeight * 2);
      const nextHeight = Math.min(targetHeight, currentHeight + delta * speed);
      setCurrentHeight(nextHeight);
    }

    // 2. spring jump calculation
    targetJumpRef.current = hovered ? 0.38 : 0.0;
    const springK = 210.0;
    const damping = 13.0;
    
    const force = (targetJumpRef.current - jumpYRef.current) * springK;
    jumpVelRef.current += force * delta;
    jumpVelRef.current -= jumpVelRef.current * damping * delta;
    jumpYRef.current += jumpVelRef.current * delta;

    if (meshRef.current) {
      meshRef.current.scale.y = currentHeight;
      const idleFloat = hovered ? Math.sin(state.clock.getElapsedTime() * 6.5) * 0.025 : 0;
      meshRef.current.position.y = position[1] + currentHeight / 2 + jumpYRef.current + idleFloat;
    }
  });

  return (
    <group>
      <mesh
        ref={meshRef}
        position={[position[0], position[1] + currentHeight / 2, position[2]]}
        onClick={onClick}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
        }}
        castShadow
        receiveShadow
        geometry={sharedColGeom}
      >
        <meshStandardMaterial
          color={color}
          roughness={0.08}
          metalness={0.25}
          transparent
          opacity={0.88}
          emissive={emissiveColor}
          emissiveIntensity={hovered ? 1.5 : 0.35}
        />
      </mesh>

      {/* Floating HTML label */}
      <Html
        position={[position[0], position[1] + targetHeight + 0.58 + jumpYRef.current + (hovered ? 0.2 : 0), position[2]]}
        center
        distanceFactor={6}
        className="pointer-events-none select-none transition-all duration-150"
      >
        <div 
          className={`flex flex-col items-center gap-1 px-2.5 py-1.5 rounded-xl border text-center whitespace-nowrap shadow-lg transition-all duration-200 ${
            hovered 
              ? 'bg-[#1E1B4B] text-white border-pink-400 scale-115 shadow-pink-500/30' 
              : 'bg-white/95 text-[#1E1B4B] border-zinc-200/80 shadow-black/5'
          }`}
        >
          <span className="text-[10px] font-black tracking-wide">{label}</span>
          <span className={`font-mono font-bold text-[9px] ${hovered ? 'text-pink-300' : 'text-indigo-600'}`}>
            {count} / {total}
          </span>
        </div>
      </Html>

      {/* Base glow ring mesh */}
      <mesh position={[position[0], 0.01, position[2]]} rotation={[-Math.PI / 2, 0, 0]} geometry={sharedColRing}>
        <meshBasicMaterial color={emissiveColor} transparent opacity={hovered ? 0.95 : 0.3} />
      </mesh>
    </group>
  );
}

function ParticleFountain({ data }: { data: any[] }) {
  const pointsRef = useRef<THREE.Points>(null);
  
  const [positions, speeds] = useMemo(() => {
    const pos = new Float32Array(FOUNTAIN_COUNT * 3);
    const spds = new Float32Array(FOUNTAIN_COUNT);
    for (let i = 0; i < FOUNTAIN_COUNT; i++) {
      const bar = data[Math.floor(Math.random() * data.length)];
      pos[i * 3] = bar.x + (Math.random() - 0.5) * 0.38;
      pos[i * 3 + 1] = Math.random() * 2.2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.38;
      spds[i] = 0.5 + Math.random() * 1.5;
    }
    return [pos, spds];
  }, [data]);

  useFrame((state, delta) => {
    if (!pointsRef.current) return;
    const points = pointsRef.current;
    const posArr = points.geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < FOUNTAIN_COUNT; i++) {
      posArr[i * 3 + 1] += speeds[i] * delta;
      
      if (posArr[i * 3 + 1] > 2.3) {
        posArr[i * 3 + 1] = 0.02;
        const bar = data[Math.floor(Math.random() * data.length)];
        posArr[i * 3] = bar.x + (Math.random() - 0.5) * 0.38;
        posArr[i * 3 + 2] = (Math.random() - 0.5) * 0.38;
      }
    }
    points.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#d946ef"
        size={0.05}
        sizeAttenuation={true}
        transparent
        opacity={0.65}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

interface LanguageProgress3DProps {
  stats: {
    python: number;
    typescript: number;
    c: number;
    cpp: number;
    java: number;
  };
  onSelectLanguage: (language: string) => void;
}

export default function LanguageProgress3D({ stats, onSelectLanguage }: LanguageProgress3DProps) {
  const totalProblems = 45;

  const data = [
    {
      key: 'python',
      label: 'Python',
      count: stats.python || 0,
      color: '#3776AB',
      emissiveColor: '#306998',
      x: -1.6
    },
    {
      key: 'typescript',
      label: 'TypeScript',
      count: stats.typescript || 0,
      color: '#3178C6',
      emissiveColor: '#2b66a5',
      x: -0.8
    },
    {
      key: 'cpp',
      label: 'C++',
      count: stats.cpp || 0,
      color: '#00599C',
      emissiveColor: '#004482',
      x: 0
    },
    {
      key: 'java',
      label: 'Java',
      count: stats.java || 0,
      color: '#EA2D2E',
      emissiveColor: '#c51f20',
      x: 0.8
    },
    {
      key: 'c',
      label: 'C',
      count: stats.c || 0,
      color: '#5C6BC0',
      emissiveColor: '#3F51B5',
      x: 1.6
    }
  ];

  return (
    <div className="w-full h-[280px] select-none relative cursor-grab active:cursor-grabbing rounded-[24px] bg-white/40 border border-white/60 shadow-inner overflow-hidden">
      
      {/* Floating instructional caption */}
      <div className="absolute bottom-3 left-0 right-0 text-center text-[9px] text-[#1E1B4B]/40 font-bold tracking-wider uppercase pointer-events-none">
        Drag to rotate chart • Hover columns to spring bounce
      </div>

      <Canvas
        camera={{ position: [0, 2.5, 4.5], fov: 42 }}
        shadows
        gl={{ antialias: true }}
      >
        <ambientLight intensity={0.7} />
        
        <directionalLight
          position={[5, 8, 4]}
          intensity={1.3}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <directionalLight position={[-5, 5, -2]} intensity={0.4} />
        <pointLight position={[0, -0.5, 1]} intensity={0.7} color="#d946ef" />

        <group position={[0, -0.75, 0]}>
          <gridHelper args={[10, 10, '#6366F1', 'rgba(99, 102, 241, 0.12)']} position={[0, 0, 0]} />
          
          {/* Neon Particle Fountain streams */}
          <ParticleFountain data={data} />

          {data.map((item) => {
            const percentage = item.count / totalProblems;
            const targetHeight = Math.max(0.15, percentage * 2.2);

            return (
              <ProgressBar3D
                key={item.key}
                position={[item.x, 0, 0]}
                targetHeight={targetHeight}
                color={item.color}
                emissiveColor={item.emissiveColor}
                label={item.label}
                count={item.count}
                total={totalProblems}
                onClick={() => onSelectLanguage(item.key)}
              />
            );
          })}
        </group>

        <OrbitControls
          enableZoom={false}
          enablePan={false}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 2.1}
          minAzimuthAngle={-Math.PI / 3}
          maxAzimuthAngle={Math.PI / 3}
        />
      </Canvas>
    </div>
  );
}
