import React, { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

const PARTICLE_COUNT = 40;

// Shared Three.js Geometries to prevent R3F reallocation lag
const sharedConeGeom = new THREE.ConeGeometry(0.18, 0.4, 4);
const sharedEyeGeom = new THREE.TorusGeometry(0.1, 0.024, 8, 24, Math.PI);
const sharedHPCylinder = new THREE.CylinderGeometry(0.22, 0.22, 0.08, 32);
const sharedHPTorus = new THREE.TorusGeometry(0.17, 0.04, 8, 24);
const sharedHPSphere = new THREE.SphereGeometry(0.1, 16, 16);
const sharedAntennaStem = new THREE.CylinderGeometry(0.03, 0.04, 0.16, 16);
const sharedAntennaBall = new THREE.SphereGeometry(0.11, 32, 32);
const sharedHaloGeom = new THREE.RingGeometry(1.08, 1.14, 48);

const sharedBubbleBox = new THREE.BoxGeometry(0.018, 0.08, 0.01);
const sharedBubbleSlash = new THREE.BoxGeometry(0.018, 0.12, 0.01);

const sharedOrbitBox = new THREE.BoxGeometry(1, 1, 1);
const sharedOrbitTorus = new THREE.TorusGeometry(0.65, 0.25, 6, 12);
const sharedOrbitOcta = new THREE.OctahedronGeometry(0.75);

interface RobotModelProps {
  hovered: boolean;
  setHovered: (h: boolean) => void;
}

function RobotModel({ hovered, setHovered }: RobotModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const leftEyeRef = useRef<THREE.Group>(null);
  const rightEyeRef = useRef<THREE.Group>(null);
  const orbitXRef = useRef<THREE.Group>(null);
  const orbitYRef = useRef<THREE.Group>(null);
  const burstPointsRef = useRef<THREE.Points>(null);
  
  const spinVelocityRef = useRef(0);
  const backflipVelocityRef = useRef(0);
  const blinkTimeRef = useRef(0);
  const nextBlinkTimeRef = useRef(2 + Math.random() * 3);

  // Particle explosion data
  const particlePositions = useMemo(() => new Float32Array(PARTICLE_COUNT * 3), []);
  const particleSpeeds = useRef<Array<{ x: number, y: number, z: number }>>([]);
  const particleLifes = useRef<Float32Array>(new Float32Array(PARTICLE_COUNT));

  // Initialize speeds for explosion blast
  if (particleSpeeds.current.length === 0) {
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particleSpeeds.current.push({ x: 0, y: 0, z: 0 });
      particlePositions[i * 3] = 999;
      particlePositions[i * 3 + 1] = 999;
      particlePositions[i * 3 + 2] = 999;
    }
  }

  const handleClick = (e: any) => {
    e.stopPropagation();
    spinVelocityRef.current = 13.0;
    backflipVelocityRef.current = 16.0;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particlePositions[i * 3] = 0;
      particlePositions[i * 3 + 1] = 0.05;
      particlePositions[i * 3 + 2] = 0.35;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 2) - 1);
      const speed = 1.6 + Math.random() * 2.4;

      particleSpeeds.current[i] = {
        x: Math.sin(phi) * Math.cos(theta) * speed,
        y: Math.sin(phi) * Math.sin(theta) * speed + 0.8,
        z: Math.cos(phi) * speed
      };

      particleLifes.current[i] = 1.0;
    }
  };

  useFrame((state, delta) => {
    const elapsed = state.clock.getElapsedTime();

    // 1. Organic Bobbing + Squash/Stretch
    const bobSpeed = hovered ? 2.5 : 1.6;
    const bobHeight = hovered ? 0.07 : 0.04;
    const bobSin = Math.sin(elapsed * bobSpeed);

    if (groupRef.current) {
      groupRef.current.position.y = bobSin * bobHeight;

      const scaleY = 1.15 + bobSin * 0.06;
      const scaleXZ = 1.15 - bobSin * 0.03;
      groupRef.current.scale.set(scaleXZ, scaleY, scaleXZ);

      if (spinVelocityRef.current > 0.05) {
        groupRef.current.rotation.y += spinVelocityRef.current * delta;
        spinVelocityRef.current *= 0.93;
      } else {
        const targetBaseRot = -0.28 + Math.sin(elapsed * 0.5) * 0.06;
        groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetBaseRot, 0.08);
      }

      if (backflipVelocityRef.current > 0.05) {
        groupRef.current.rotation.x += backflipVelocityRef.current * delta;
        backflipVelocityRef.current *= 0.93;
      } else {
        const targetPitch = 0.08 + Math.sin(elapsed * 0.8) * 0.02;
        groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, targetPitch, 0.08);
      }
    }

    // 2. Random Blink
    blinkTimeRef.current += delta;
    let eyeScaleY = 1.0;
    if (blinkTimeRef.current >= nextBlinkTimeRef.current) {
      const blinkDuration = 0.12;
      const progress = (blinkTimeRef.current - nextBlinkTimeRef.current) / blinkDuration;
      if (progress >= 1.0) {
        blinkTimeRef.current = 0;
        nextBlinkTimeRef.current = 1.5 + Math.random() * 3.5;
      } else {
        eyeScaleY = Math.abs(Math.sin(progress * Math.PI - Math.PI / 2));
      }
    }
    if (leftEyeRef.current) leftEyeRef.current.scale.y = eyeScaleY;
    if (rightEyeRef.current) rightEyeRef.current.scale.y = eyeScaleY;

    // 3. Double Axis Orbiting Rings
    const baseOrbitSpeed = hovered ? 2.2 : 0.9;
    const spinBonus = spinVelocityRef.current * 0.55;
    const currentOrbitSpeed = (baseOrbitSpeed + spinBonus) * delta;

    if (orbitXRef.current) {
      orbitXRef.current.rotation.y += currentOrbitSpeed;
      orbitXRef.current.rotation.x = Math.sin(elapsed * 0.4) * 0.12;
    }
    if (orbitYRef.current) {
      orbitYRef.current.rotation.y -= currentOrbitSpeed * 0.8;
      orbitYRef.current.rotation.z = Math.cos(elapsed * 0.4) * 0.12;
    }

    // 4. Update Particle Explosion positions
    const pts = burstPointsRef.current;
    if (pts) {
      const posArr = pts.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        if (particleLifes.current[i] > 0) {
          particleSpeeds.current[i].y -= 2.6 * delta; // Gravity pull
          
          posArr[i * 3] += particleSpeeds.current[i].x * delta;
          posArr[i * 3 + 1] += particleSpeeds.current[i].y * delta;
          posArr[i * 3 + 2] += particleSpeeds.current[i].z * delta;

          particleLifes.current[i] -= delta * 1.35; // Expire in ~0.7s
        } else {
          posArr[i * 3] = 999;
          posArr[i * 3 + 1] = 999;
          posArr[i * 3 + 2] = 999;
        }
      }
      pts.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <group 
      onClick={handleClick}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={(e) => { e.stopPropagation(); setHovered(false); }}
    >
      {/* Code Explosion Particles */}
      <points ref={burstPointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[particlePositions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          color="#d946ef"
          size={0.09}
          transparent
          opacity={0.85}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>

      {/* Main Model */}
      <group ref={groupRef}>
        {/* Glowing base platform halo ring */}
        <mesh position={[0, -0.7, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={sharedHaloGeom}>
          <meshBasicMaterial 
            color="#3b82f6" 
            transparent 
            opacity={hovered ? 0.8 : 0.3} 
          />
        </mesh>

        {/* Orbiting Ring Axis A */}
        <group ref={orbitXRef}>
          {[0, 1, 2, 3].map((i) => {
            const angle = (i / 4) * Math.PI * 2;
            const r = 1.38;
            return (
              <mesh 
                key={i} 
                position={[Math.cos(angle) * r, Math.sin(angle * 2) * 0.05, Math.sin(angle) * r]} 
                scale={0.05}
                geometry={i % 2 === 0 ? sharedOrbitBox : sharedOrbitTorus}
              >
                <meshStandardMaterial 
                  color="#6366f1" 
                  emissive="#6366f1" 
                  emissiveIntensity={hovered ? 2.8 : 1.3}
                  roughness={0.1}
                />
              </mesh>
            );
          })}
        </group>

        {/* Orbiting Ring Axis B */}
        <group ref={orbitYRef}>
          {[0, 1, 2].map((i) => {
            const angle = (i / 3) * Math.PI * 2 + Math.PI / 3;
            const r = 1.45;
            return (
              <mesh 
                key={i} 
                position={[Math.cos(angle) * r, Math.cos(angle * 2) * 0.05, Math.sin(angle) * r]} 
                scale={0.045}
                geometry={sharedOrbitOcta}
              >
                <meshStandardMaterial 
                  color="#d946ef" 
                  emissive="#d946ef" 
                  emissiveIntensity={hovered ? 2.8 : 1.3}
                  roughness={0.1}
                />
              </mesh>
            );
          })}
        </group>

        {/* 1. Main White Head */}
        <RoundedBox args={[1.4, 1.15, 1.05]} radius={0.24} smoothness={4}>
          <meshStandardMaterial 
            color="#ffffff" 
            roughness={hovered ? 0.05 : 0.12} 
            metalness={0.05} 
          />
        </RoundedBox>

        {/* Speech tail */}
        <mesh position={[-0.4, -0.5, 0.15]} rotation={[0, 0.4, Math.PI / 3]} geometry={sharedConeGeom}>
          <meshStandardMaterial color="#ffffff" roughness={0.12} />
        </mesh>

        {/* 2. Black Face Screen */}
        <RoundedBox args={[1.1, 0.76, 0.2]} radius={0.16} smoothness={4} position={[0, -0.04, 0.46]}>
          <meshStandardMaterial color="#15171F" roughness={0.18} />
        </RoundedBox>

        {/* 3. Blue LED Eyes */}
        <group ref={leftEyeRef} position={[-0.3, 0.02, 0.57]}>
          <mesh geometry={sharedEyeGeom}>
            <meshStandardMaterial 
              color="#38bdf8" 
              emissive="#38bdf8" 
              emissiveIntensity={hovered ? 4.0 : 2.2} 
            />
          </mesh>
        </group>
        <group ref={rightEyeRef} position={[0.3, 0.02, 0.57]}>
          <mesh geometry={sharedEyeGeom}>
            <meshStandardMaterial 
              color="#38bdf8" 
              emissive="#38bdf8" 
              emissiveIntensity={hovered ? 4.0 : 2.2} 
            />
          </mesh>
        </group>

        {/* 4. Headphones */}
        <group position={[-0.74, 0, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]} geometry={sharedHPCylinder}>
            <meshStandardMaterial color="#ffffff" roughness={0.15} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]} geometry={sharedHPTorus}>
            <meshStandardMaterial color="#2563eb" roughness={0.2} />
          </mesh>
          <mesh position={[-0.03, 0, 0]} geometry={sharedHPSphere}>
            <meshStandardMaterial color="#2563eb" roughness={0.15} />
          </mesh>
        </group>
        <group position={[0.74, 0, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]} geometry={sharedHPCylinder}>
            <meshStandardMaterial color="#ffffff" roughness={0.15} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]} geometry={sharedHPTorus}>
            <meshStandardMaterial color="#2563eb" roughness={0.2} />
          </mesh>
          <mesh position={[0.03, 0, 0]} geometry={sharedHPSphere}>
            <meshStandardMaterial color="#2563eb" roughness={0.15} />
          </mesh>
        </group>

        {/* 5. Antenna */}
        <mesh position={[0, 0.64, 0]} geometry={sharedAntennaStem}>
          <meshStandardMaterial color="#ffffff" roughness={0.15} />
        </mesh>
        <mesh position={[0, 0.75, 0]} geometry={sharedAntennaBall}>
          <meshStandardMaterial 
            color="#3b82f6" 
            emissive="#3b82f6" 
            emissiveIntensity={hovered ? 3.5 : 1.5} 
          />
        </mesh>

        {/* 6. Code Balloon */}
        <group position={[0.55, -0.42, 0.62]}>
          <RoundedBox args={[0.66, 0.4, 0.12]} radius={0.06} smoothness={4}>
            <meshStandardMaterial color="#111319" roughness={0.3} />
          </RoundedBox>
          <mesh position={[-0.14, -0.24, 0]} rotation={[0, 0, Math.PI / 3.2]} geometry={sharedConeGeom}>
            <meshStandardMaterial color="#111319" roughness={0.3} />
          </mesh>

          {/* Angle `<` */}
          <group position={[-0.17, 0.02, 0.07]}>
            <mesh position={[0, 0.035, 0]} rotation={[0, 0, Math.PI / 4]} geometry={sharedBubbleBox}>
              <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={hovered ? 3.5 : 2.0} />
            </mesh>
            <mesh position={[0, -0.02, 0]} rotation={[0, 0, -Math.PI / 4]} geometry={sharedBubbleBox}>
              <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={hovered ? 3.5 : 2.0} />
            </mesh>
          </group>

          {/* Slash `/` */}
          <mesh position={[0, 0, 0.07]} rotation={[0, 0, -Math.PI / 10]} geometry={sharedBubbleSlash}>
            <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={hovered ? 3.5 : 2.0} />
          </mesh>

          {/* Angle `>` */}
          <group position={[0.17, 0.02, 0.07]}>
            <mesh position={[0, 0.035, 0]} rotation={[0, 0, -Math.PI / 4]} geometry={sharedBubbleBox}>
              <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={hovered ? 3.5 : 2.0} />
            </mesh>
            <mesh position={[0, -0.02, 0]} rotation={[0, 0, Math.PI / 4]} geometry={sharedBubbleBox}>
              <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={hovered ? 3.5 : 2.0} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}

export default function Robot3D() {
  const [hovered, setHovered] = useState(false);

  return (
    <div className={`w-full h-full select-none relative transition-all duration-300 ${
      hovered ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
    }`}>
      <div className={`absolute inset-0 bg-[#6366F1]/5 rounded-full blur-2xl pointer-events-none scale-75 transition-all duration-300 ${
        hovered ? 'opacity-90 scale-95' : 'opacity-40'
      }`} />
      
      {hovered && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-[#1E1B4B]/90 text-white border border-indigo-400 px-3.5 py-1 rounded-xl text-[9px] font-black tracking-wide uppercase select-none pointer-events-none z-40 animate-bounce">
          Tap for Explosion Burst! 💥🌀
        </div>
      )}

      <Canvas
        camera={{ position: [0, 0, 2.5], fov: 45 }}
        style={{ background: 'transparent' }}
        gl={{ antialias: true }}
      >
        <ambientLight intensity={0.75} />
        <directionalLight position={[5, 8, 5]} intensity={1.6} />
        <directionalLight position={[-5, 5, -2]} intensity={0.5} />
        <directionalLight position={[0, -4, -3]} intensity={0.4} color="#6366F1" />
        <pointLight position={[0, 1.2, 0.5]} intensity={1.0} color="#38bdf8" />
        
        <RobotModel hovered={hovered} setHovered={setHovered} />
        
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
