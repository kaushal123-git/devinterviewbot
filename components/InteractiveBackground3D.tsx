import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function WarpStarfield() {
  const pointsRef = useRef<THREE.Points>(null);
  const count = 350;
  
  // Acceleration multiplier for hyperdrive
  const warpFactorRef = useRef(1.0);

  // Generate initial coordinates in a radial distribution projecting into depth (Z)
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.4 + Math.random() * 4.6;
      pos[i * 3] = Math.cos(angle) * radius;
      pos[i * 3 + 1] = Math.sin(angle) * radius;
      pos[i * 3 + 2] = Math.random() * 15; // Z depth
    }
    return pos;
  }, []);

  // Window-wide click event listener to surge star speeds
  useEffect(() => {
    const handleTriggerWarp = () => {
      warpFactorRef.current = 12.0; // High velocity surge
    };
    window.addEventListener('click', handleTriggerWarp);
    return () => window.removeEventListener('click', handleTriggerWarp);
  }, []);

  useFrame((state, delta) => {
    if (!pointsRef.current) return;
    const points = pointsRef.current;
    const posArray = points.geometry.attributes.position.array as Float32Array;

    const { x: mouseX, y: mouseY } = state.pointer;

    // Exponentially decay warp velocity factor back to 1.0
    warpFactorRef.current = THREE.MathUtils.lerp(warpFactorRef.current, 1.0, delta * 3.5);

    // Dynamic travel speed
    const baseSpeed = 0.9;
    const currentSpeed = baseSpeed * warpFactorRef.current;

    for (let i = 0; i < count; i++) {
      // Move particles towards camera along Z-axis
      posArray[i * 3 + 2] -= currentSpeed * delta * 4;

      // Reset particles when they go past/near the camera lens
      if (posArray[i * 3 + 2] <= 0.1) {
        posArray[i * 3 + 2] = 15.0; // Warp back to far horizon
        const angle = Math.random() * Math.PI * 2;
        const radius = 0.4 + Math.random() * 4.6;
        pos[i * 3] = Math.cos(angle) * radius;
        pos[i * 3 + 1] = Math.sin(angle) * radius;
      }
    }

    points.geometry.attributes.position.needsUpdate = true;

    // Warp bend: Offset the star field center to follow cursor coordinates
    points.position.x = THREE.MathUtils.lerp(points.position.x, mouseX * 1.6, 0.05);
    points.position.y = THREE.MathUtils.lerp(points.position.y, mouseY * 1.6, 0.05);
    
    // Vortex spiral rotation
    points.rotation.z += 0.07 * delta * warpFactorRef.current;
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
        color="#818cf8"
        size={0.075}
        sizeAttenuation={true}
        transparent
        opacity={0.45}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

export default function InteractiveBackground3D() {
  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none z-0">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 60 }}
        style={{ pointerEvents: 'none', background: 'transparent' }}
        gl={{ antialias: true }}
      >
        <WarpStarfield />
      </Canvas>
    </div>
  );
}
