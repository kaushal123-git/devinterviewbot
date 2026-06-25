import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

function RobotModel() {
  const groupRef = useRef<THREE.Group>(null);

  // Subtle breathing/floating animation around the default tilted angle
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(state.clock.getElapsedTime() * 1.5) * 0.04;
      groupRef.current.rotation.y = -0.28 + Math.sin(state.clock.getElapsedTime() * 0.5) * 0.06;
      groupRef.current.rotation.x = 0.08;
    }
  });

  return (
    <group ref={groupRef} scale={1.15}>
      {/* 1. Main White Head (Rounded Box) */}
      <RoundedBox args={[1.4, 1.15, 1.05]} radius={0.24} smoothness={4}>
        <meshStandardMaterial 
          color="#ffffff" 
          roughness={0.12} 
          metalness={0.05} 
        />
      </RoundedBox>

      {/* Speech bubble tail for the head to match the reference image */}
      <mesh position={[-0.4, -0.5, 0.15]} rotation={[0, 0.4, Math.PI / 3]}>
        <coneGeometry args={[0.18, 0.4, 4]} />
        <meshStandardMaterial 
          color="#ffffff" 
          roughness={0.12} 
          metalness={0.05} 
        />
      </mesh>

      {/* 2. Black Face Screen (Inset, extremely rounded) */}
      <RoundedBox args={[1.1, 0.76, 0.2]} radius={0.16} smoothness={4} position={[0, -0.04, 0.46]}>
        <meshStandardMaterial 
          color="#15171F" 
          roughness={0.18} 
          metalness={0.05} 
        />
      </RoundedBox>

      {/* 3. Blue Glowing Eyes (Torus sections for happy arching look - curved upwards) */}
      {/* Left Eye */}
      <group position={[-0.3, 0.02, 0.57]} rotation={[0, 0, 0]}>
        <mesh>
          <torusGeometry args={[0.1, 0.024, 8, 24, Math.PI]} />
          <meshStandardMaterial 
            color="#38bdf8" 
            emissive="#38bdf8" 
            emissiveIntensity={2.5} 
            roughness={0.1}
          />
        </mesh>
      </group>
      {/* Right Eye */}
      <group position={[0.3, 0.02, 0.57]} rotation={[0, 0, 0]}>
        <mesh>
          <torusGeometry args={[0.1, 0.024, 8, 24, Math.PI]} />
          <meshStandardMaterial 
            color="#38bdf8" 
            emissive="#38bdf8" 
            emissiveIntensity={2.5} 
            roughness={0.1}
          />
        </mesh>
      </group>

      {/* 4. Snug Headphones (No headband connection) */}
      {/* Left Ear Piece */}
      <group position={[-0.74, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.22, 0.22, 0.08, 32]} />
          <meshStandardMaterial color="#ffffff" roughness={0.15} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.17, 0.04, 8, 24]} />
          <meshStandardMaterial color="#2563eb" roughness={0.2} />
        </mesh>
        <mesh position={[-0.03, 0, 0]}>
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshStandardMaterial color="#2563eb" roughness={0.15} />
        </mesh>
      </group>

      {/* Right Ear Piece */}
      <group position={[0.74, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.22, 0.22, 0.08, 32]} />
          <meshStandardMaterial color="#ffffff" roughness={0.15} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.17, 0.04, 8, 24]} />
          <meshStandardMaterial color="#2563eb" roughness={0.2} />
        </mesh>
        <mesh position={[0.03, 0, 0]}>
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshStandardMaterial color="#2563eb" roughness={0.15} />
        </mesh>
      </group>

      {/* 5. Antenna on Top */}
      {/* Stem */}
      <mesh position={[0, 0.64, 0]}>
        <cylinderGeometry args={[0.03, 0.04, 0.16, 16]} />
        <meshStandardMaterial color="#ffffff" roughness={0.15} />
      </mesh>
      {/* Top Sphere */}
      <mesh position={[0, 0.75, 0]}>
        <sphereGeometry args={[0.11, 32, 32]} />
        <meshStandardMaterial 
          color="#3b82f6" 
          emissive="#3b82f6" 
          emissiveIntensity={1.5} 
          roughness={0.1}
        />
      </mesh>

      {/* 6. Speech Bubble at Bottom-Right */}
      <group position={[0.55, -0.42, 0.62]}>
        <RoundedBox args={[0.66, 0.4, 0.12]} radius={0.06} smoothness={4}>
          <meshStandardMaterial color="#111319" roughness={0.3} />
        </RoundedBox>
        <mesh position={[-0.14, -0.24, 0]} rotation={[0, 0, Math.PI / 3.2]}>
          <coneGeometry args={[0.06, 0.14, 4]} />
          <meshStandardMaterial color="#111319" roughness={0.3} />
        </mesh>

        {/* 7. glowing code symbol `</>` */}
        {/* Angle bracket `<` */}
        <group position={[-0.17, 0.02, 0.07]}>
          <mesh position={[0, 0.035, 0]} rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[0.018, 0.08, 0.01]} />
            <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={2.0} />
          </mesh>
          <mesh position={[0, -0.02, 0]} rotation={[0, 0, -Math.PI / 4]}>
            <boxGeometry args={[0.018, 0.08, 0.01]} />
            <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={2.0} />
          </mesh>
        </group>

        {/* Slash `/` */}
        <mesh position={[0, 0, 0.07]} rotation={[0, 0, -Math.PI / 10]}>
          <boxGeometry args={[0.018, 0.12, 0.01]} />
          <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={2.0} />
        </mesh>

        {/* Angle bracket `>` */}
        <group position={[0.17, 0.02, 0.07]}>
          <mesh position={[0, 0.035, 0]} rotation={[0, 0, -Math.PI / 4]}>
            <boxGeometry args={[0.018, 0.08, 0.01]} />
            <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={2.0} />
          </mesh>
          <mesh position={[0, -0.02, 0]} rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[0.018, 0.08, 0.01]} />
            <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={2.0} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

export default function Robot3D() {
  return (
    <div className="w-full h-full cursor-grab active:cursor-grabbing select-none relative">
      {/* Background shadow glow behind Canvas */}
      <div className="absolute inset-0 bg-[#6366F1]/5 rounded-full blur-2xl pointer-events-none scale-75" />
      
      <Canvas
        camera={{ position: [0, 0, 2.5], fov: 45 }}
        style={{ background: 'transparent' }}
        gl={{ antialias: true }}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 8, 5]} intensity={1.5} />
        <directionalLight position={[-5, 5, -2]} intensity={0.5} />
        <directionalLight position={[0, -4, -3]} intensity={0.3} color="#6366F1" />
        <pointLight position={[0, 1.2, 0.5]} intensity={0.8} color="#38bdf8" />
        
        <RobotModel />
        
        <OrbitControls 
          enableZoom={false} 
          enablePan={false} 
          minPolarAngle={Math.PI / 3} 
          maxPolarAngle={Math.PI / 1.5} 
        />
      </Canvas>
    </div>
  );
}
