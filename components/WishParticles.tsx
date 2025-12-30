import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Trail } from '@react-three/drei';
import * as THREE from 'three';

interface WishParticlesProps {
  wishes: { id: number; text: string }[];
  onImpact: () => void;
  targetPosition: [number, number, number];
}

export const WishParticles: React.FC<WishParticlesProps> = ({ wishes, onImpact, targetPosition }) => {
  return (
    <group>
      {wishes.map((wish) => (
        <SingleWish 
          key={wish.id} 
          onImpact={onImpact} 
          targetPosition={targetPosition} 
        />
      ))}
    </group>
  );
};

const SingleWish: React.FC<{ onImpact: () => void; targetPosition: [number, number, number] }> = ({ onImpact, targetPosition }) => {
  const groupRef = useRef<THREE.Group>(null);
  const [finished, setFinished] = useState(false);
  
  // Bezier Curve Logic
  const { curve, startPos } = useMemo(() => {
    // Start somewhere at the bottom, slightly random X
    const start = new THREE.Vector3((Math.random() - 0.5) * 4, -4, 4);
    const end = new THREE.Vector3(...targetPosition);
    
    // Control point for the arc (midpoint up high)
    const mid = new THREE.Vector3(
      (start.x + end.x) / 2,
      2, // Arch height
      (start.z + end.z) / 2 + 2 // Curve outward slightly
    );
    
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    return { curve, startPos: start };
  }, [targetPosition]);

  // Particle System for the "Energy Ball"
  const particleCount = 40;
  const particles = useMemo(() => {
    const temp = [];
    const colorCore = new THREE.Color("#ff5e98"); // Warm Pink
    const colorHigh = new THREE.Color("#ffbd2e"); // Coral/Gold
    
    for (let i = 0; i < particleCount; i++) {
      const r = Math.random() * 0.15;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);
      
      temp.push({
        pos: new THREE.Vector3(x, y, z),
        color: Math.random() > 0.5 ? colorCore : colorHigh,
        size: Math.random() * 0.8 + 0.2
      });
    }
    return temp;
  }, []);

  const progress = useRef(0);
  const exploded = useRef(false);

  useFrame((state, delta) => {
    if (finished || !groupRef.current) return;

    // Flight Animation
    if (progress.current < 1) {
        // Easing: Cubic In-Out
        // t is linear time 0->1
        progress.current += delta * 0.8; // Speed
        
        const t = Math.min(progress.current, 1);
        // Quintic ease out for "Magical arrival" feel
        // or Cubic In-Out
        const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        
        const pos = curve.getPoint(ease);
        groupRef.current.position.copy(pos);
        
        // Rotate the cluster
        groupRef.current.rotation.z += delta * 5;
        groupRef.current.rotation.y += delta * 2;
    } else if (!exploded.current) {
        // Trigger Explosion
        exploded.current = true;
        onImpact();
    } else {
        // Explosion Animation (Expand and Fade)
        groupRef.current.scale.multiplyScalar(1.1);
        if (groupRef.current.scale.x > 5) {
            setFinished(true);
        }
    }
  });

  if (finished) return null;

  return (
    <group ref={groupRef} position={startPos}>
      {/* The Particle Cluster */}
      <pointLight distance={2} intensity={2} color="#ff88aa" />
      
      {/* Trail Effect */}
      <Trail
        width={1.5} 
        length={6} 
        color={new THREE.Color("#ff88aa")} 
        attenuation={(t) => t * t}
      >
        <mesh visible={false}>
            <sphereGeometry args={[0.05]} />
            <meshBasicMaterial />
        </mesh>
      </Trail>

      {/* Actual Particles */}
      <group>
        {particles.map((p, i) => (
            <mesh key={i} position={p.pos}>
                <sphereGeometry args={[0.02 * p.size, 8, 8]} />
                <meshBasicMaterial 
                    color={p.color} 
                    transparent 
                    opacity={exploded.current ? 0.0 : 0.8} // Fade out on explosion
                    blending={THREE.AdditiveBlending}
                />
            </mesh>
        ))}
        {/* Glow Halo */}
        <mesh>
             <sphereGeometry args={[0.2, 16, 16]} />
             <meshBasicMaterial color="#ffccdd" transparent opacity={0.2} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
};
