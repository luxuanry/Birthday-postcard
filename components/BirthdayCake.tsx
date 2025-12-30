import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Instance, Instances } from '@react-three/drei';
import * as THREE from 'three';
import { Candle } from './Candle';
import { WishParticles } from './WishParticles';

interface BirthdayCakeProps {
  isBlown: boolean;
  isBlowing: boolean;
  wishes: { id: number; text: string }[];
}

// --- Configuration Constants ---
const PARTICLES_CAKE = 250000; 
const PARTICLES_SNOW = 7500;
const PARTICLES_RINGS = 3000;

// Refined Color Palette
const COLOR_WARM_PINK = new THREE.Color("#FF4D80"); 
const COLOR_SOFT_PINK = new THREE.Color("#FF9EC1"); 
const COLOR_LIGHT_PINK = new THREE.Color("#FFFFFF"); 
const COLOR_GOLD = new THREE.Color("#FFD700");       

// Snow Colors
const COLOR_SNOW_1 = new THREE.Color("#ffffff");
const COLOR_SNOW_2 = new THREE.Color("#e6f7ff");

// --- Cake Particle Shaders ---
const particleVertexShader = `
  attribute float size;
  attribute vec3 color;
  varying vec3 vColor;
  uniform float uTime;
  uniform float uBoost;
  
  void main() {
    vColor = color;
    vec3 pos = position;
    
    // --- Natural Breathing ---
    float breath = sin(uTime * 1.0 + pos.y * 3.0) * cos(uTime * 0.5 + pos.x * 2.0);
    float displacement = breath * 0.005; 
    
    pos.x += pos.x * displacement;
    pos.z += pos.z * displacement;
    pos.y += sin(uTime * 0.8 + pos.z * 5.0) * 0.005;
    
    // --- Wish Impact Boost ---
    if (uBoost > 0.0) {
        float shake = sin(uTime * 30.0 + pos.y * 20.0) * 0.05 * uBoost;
        pos += normalize(pos) * shake;
    }

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    float flicker = 1.0 + sin(uTime * 5.0 + pos.x * 100.0) * 0.15;
    float currentSize = size * flicker * (1.0 + uBoost * 0.5);
    
    gl_PointSize = currentSize * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const particleFragmentShader = `
  varying vec3 vColor;
  uniform float uBoost;
  
  void main() {
    vec2 xy = gl_PointCoord.xy - vec2(0.5);
    float len = length(xy);
    if (len > 0.5) discard;
    
    float strength = pow(1.0 - (len * 2.0), 3.5);
    vec3 baseColor = vColor * 1.8;
    vec3 boostColor = vec3(1.0, 1.0, 0.8) * uBoost * 0.8;
    
    gl_FragColor = vec4(baseColor + boostColor, strength * (0.95 + uBoost * 0.2)); 
  }
`;

// --- Snowflake Shaders ---
const snowVertexShader = `
  attribute float size;
  attribute vec3 color;
  varying vec3 vColor;
  
  void main() {
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (200.0 / -mvPosition.z); 
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const snowFragmentShader = `
  varying vec3 vColor;
  
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = length(p);
    float a = atan(p.y, p.x);
    float f = abs(cos(a * 3.0)); 
    float d = 0.4 + 0.3 * f; 
    float opacity = smoothstep(d + 0.1, d, r);
    if (opacity < 0.1) discard;
    gl_FragColor = vec4(vColor, opacity * 0.8);
  }
`;

export const BirthdayCake: React.FC<BirthdayCakeProps> = ({ isBlown, isBlowing, wishes }) => {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const boostRef = useRef(0);
  const groupRef = useRef<THREE.Group>(null);

  const handleWishImpact = () => {
    boostRef.current = 2.5;
  };

  // --- Main Cake Geometry ---
  const { positions, colors, sizes } = useMemo(() => {
    const pos = new Float32Array(PARTICLES_CAKE * 3);
    const col = new Float32Array(PARTICLES_CAKE * 3);
    const sz = new Float32Array(PARTICLES_CAKE);

    let idx = 0;
    const addPoint = (x: number, y: number, z: number, c: THREE.Color, s: number) => {
      if (idx >= PARTICLES_CAKE) return;
      pos[idx * 3] = x; pos[idx * 3 + 1] = y; pos[idx * 3 + 2] = z;
      col[idx * 3] = c.r; col[idx * 3 + 1] = c.g; col[idx * 3 + 2] = c.b;
      sz[idx] = s;
      idx++;
    };

    const getPointColor = (r: number, maxR: number, y: number, totalHeight: number) => {
        const rRatio = r / maxR;
        const isOuter = rRatio > 0.88; 
        const yNorm = Math.min(Math.max(y / totalHeight, 0.0), 1.0);
        const heightFactor = 1.0 - yNorm;

        if (isOuter) {
            const pLightPink = 0.3 * heightFactor; 
            const pGold = 0.2 * heightFactor;      
            const rnd = Math.random();

            if (rnd < pLightPink) {
                return COLOR_LIGHT_PINK;
            } else if (rnd < (pLightPink + pGold)) {
                return COLOR_GOLD;
            } else {
                return Math.random() > 0.5 ? COLOR_WARM_PINK : COLOR_SOFT_PINK;
            }
        } else {
            return Math.random() > 0.6 ? COLOR_WARM_PINK : COLOR_SOFT_PINK;
        }
    };

    const r1 = 1.4; const h1 = 0.9;
    const r2 = 0.9; const h2 = 0.7; 
    const totalHeight = h1 + h2;
    const bottomCount = 120000;
    const topCount = 80000;
    const plateCount = 50000;

    for (let i = 0; i < bottomCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const isSurface = Math.random() > 0.20; 
        const r = isSurface ? r1 * (0.95 + Math.random() * 0.05) : Math.random() * r1;                
        const y = Math.random() * h1;
        const color = getPointColor(r, r1, y, totalHeight);
        const size = Math.random() * 0.015 + 0.015;
        addPoint(r * Math.cos(theta), y, r * Math.sin(theta), color, size);
    }

    const yOff = h1;
    for (let i = 0; i < topCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const isSurface = Math.random() > 0.20;
        const r = isSurface ? r2 * (0.92 + Math.random() * 0.08) : Math.random() * r2;
        const y = Math.random() * h2 + yOff;
        let color = getPointColor(r, r2, y, totalHeight);
        if (y > (yOff + h2 - 0.05)) color = COLOR_LIGHT_PINK; 
        const size = Math.random() * 0.015 + 0.015;
        addPoint(r * Math.cos(theta), y, r * Math.sin(theta), color, size);
    }

    for (let i = 0; i < plateCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const r = 1.5 + Math.random() * 1.2;
        const decay = (r - 1.5) / 1.2; 
        const color = Math.random() > 0.6 ? COLOR_GOLD : COLOR_WARM_PINK;
        addPoint(r * Math.cos(theta), (Math.random() - 0.5) * 0.02, r * Math.sin(theta), color, (1 - decay) * 0.03);
    }

    return { positions: pos, colors: col, sizes: sz };
  }, []);

  useFrame((state, delta) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
      boostRef.current = THREE.MathUtils.lerp(boostRef.current, 0, delta * 2.5);
      materialRef.current.uniforms.uBoost.value = boostRef.current;
    }
  });

  return (
    <group ref={groupRef}>
      <WishParticles 
        wishes={wishes} 
        onImpact={handleWishImpact} 
        targetPosition={[0, 1.9, 0]} 
      />

      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={positions.length / 3} array={positions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={colors.length / 3} array={colors} itemSize={3} />
          <bufferAttribute attach="attributes-size" count={sizes.length} array={sizes} itemSize={1} />
        </bufferGeometry>
        <shaderMaterial
          ref={materialRef}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          vertexShader={particleVertexShader}
          fragmentShader={particleFragmentShader}
          uniforms={{ 
              uTime: { value: 0 }, 
              uBoost: { value: 0 }
          }}
        />
      </points>
        
      <BackgroundSnow />
      <BottomRings />
      
      {isBlown && <ConfettiExplosion />}

      <group position={[0, 1.6, 0]}>
        <Candle isBlown={isBlown} isBlowing={isBlowing} />
      </group>
    </group>
  );
};

const BackgroundSnow = () => {
    const count = PARTICLES_SNOW;
    const ref = useRef<THREE.Points>(null);
    const { pos, col, size, speed } = useMemo(() => {
        const p = new Float32Array(count * 3);
        const c = new Float32Array(count * 3);
        const s = new Float32Array(count);
        const sp = new Float32Array(count);
        for(let i=0; i<count; i++) {
            p[i*3] = (Math.random() - 0.5) * 20; 
            p[i*3+1] = (Math.random() - 0.5) * 20; 
            p[i*3+2] = (Math.random() - 0.5) * 15 - 5; 
            const color = Math.random() > 0.5 ? COLOR_SNOW_1 : COLOR_SNOW_2;
            c[i*3] = color.r; c[i*3+1] = color.g; c[i*3+2] = color.b;
            s[i] = Math.random() * 0.15 + 0.05; 
            sp[i] = Math.random() * 0.5 + 0.2;
        }
        return { pos: p, col: c, size: s, speed: sp };
    }, []);

    useFrame((state, delta) => {
        if (!ref.current) return;
        const positions = ref.current.geometry.attributes.position.array as Float32Array;
        for(let i=0; i<count; i++) {
            positions[i*3+1] -= speed[i] * delta;
            if (positions[i*3+1] < -10) positions[i*3+1] = 10;
        }
        ref.current.geometry.attributes.position.needsUpdate = true;
    });

    return (
        <points ref={ref}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={count} array={pos} itemSize={3} />
                <bufferAttribute attach="attributes-color" count={count} array={col} itemSize={3} />
                <bufferAttribute attach="attributes-size" count={count} array={size} itemSize={1} />
            </bufferGeometry>
            <shaderMaterial 
                vertexShader={snowVertexShader}
                fragmentShader={snowFragmentShader}
                transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} 
            />
        </points>
    );
};

const ConfettiExplosion = () => {
    const count = 4000;
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const { positions, velocities, rotations, rotationSpeeds, colors } = useMemo(() => {
        const positions = new Float32Array(count * 3);
        const velocities = new Float32Array(count * 3);
        const rotations = new Float32Array(count * 3);
        const rotationSpeeds = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const palette = [new THREE.Color("#FF69B4"), new THREE.Color("#FFB6C1"), new THREE.Color("#87CEEB"), new THREE.Color("#00BFFF"), new THREE.Color("#9370DB"), new THREE.Color("#BA55D3"), new THREE.Color("#FFD700"), new THREE.Color("#FFFF00")];
        for (let i = 0; i < count; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 0.5;
            positions[i * 3 + 1] = 2.0 + (Math.random() - 0.5) * 0.5;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI; 
            const speed = 4 + Math.random() * 8; 
            let vx = speed * Math.sin(phi) * Math.cos(theta);
            let vy = speed * Math.sin(phi) * Math.sin(theta);
            let vz = speed * Math.cos(phi);
            vy += 5 + Math.random() * 5; 
            vx *= 1.5; vz *= 1.5;
            if (Math.random() > 0.4) vz += 5 + Math.random() * 5;
            velocities[i * 3] = vx; velocities[i * 3 + 1] = vy; velocities[i * 3 + 2] = vz;
            rotations[i * 3] = Math.random() * Math.PI; rotations[i * 3 + 1] = Math.random() * Math.PI; rotations[i * 3 + 2] = Math.random() * Math.PI;
            rotationSpeeds[i * 3] = (Math.random() - 0.5) * 10; rotationSpeeds[i * 3 + 1] = (Math.random() - 0.5) * 10; rotationSpeeds[i * 3 + 2] = (Math.random() - 0.5) * 10;
            const col = palette[Math.floor(Math.random() * palette.length)];
            colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
        }
        return { positions, velocities, rotations, rotationSpeeds, colors };
    }, []);

    useFrame((state, delta) => {
        if (!meshRef.current) return;
        const dt = Math.min(delta, 0.1);
        for (let i = 0; i < count; i++) {
            const idx = i * 3;
            velocities[idx + 1] -= 15.0 * dt; 
            velocities[idx] *= 0.96; velocities[idx + 1] *= 0.96; velocities[idx + 2] *= 0.96;
            positions[idx] += velocities[idx] * dt; positions[idx + 1] += velocities[idx + 1] * dt; positions[idx + 2] += velocities[idx + 2] * dt;
            rotations[idx] += rotationSpeeds[idx] * dt; rotations[idx + 1] += rotationSpeeds[idx + 1] * dt; rotations[idx + 2] += rotationSpeeds[idx + 2] * dt;
            let s = positions[idx + 1] < -20 ? 0.0 : 1.0;
            dummy.position.set(positions[idx], positions[idx + 1], positions[idx + 2]);
            dummy.rotation.set(rotations[idx], rotations[idx + 1], rotations[idx + 2]);
            dummy.scale.set(s, s, s);
            dummy.updateMatrix();
            meshRef.current.setMatrixAt(i, dummy.matrix);
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
            <planeGeometry args={[0.08, 0.15]} />
            <meshBasicMaterial side={THREE.DoubleSide} toneMapped={false} />
            <instancedBufferAttribute attach="instanceColor" args={[colors, 3]} />
        </instancedMesh>
    );
};

const BottomRings = () => {
    const groupRef = useRef<THREE.Group>(null);
    const count = PARTICLES_RINGS;
    const { pos, col } = useMemo(() => {
        const p = new Float32Array(count * 3);
        const c = new Float32Array(count * 3);
        const radiusBase = 1.4; 
        for(let i=0; i<count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const layer = Math.random() > 0.5 ? 1.5 : 1.7; 
            const r = radiusBase * layer + (Math.random() * 0.2);
            p[i*3] = Math.cos(angle) * r;
            p[i*3+1] = (Math.random() - 0.5) * 0.1;
            p[i*3+2] = Math.sin(angle) * r;
            c[i*3] = COLOR_GOLD.r; c[i*3+1] = COLOR_GOLD.g; c[i*3+2] = COLOR_GOLD.b;
        }
        return { pos: p, col: c };
    }, []);

    useFrame((state, delta) => {
        if(groupRef.current) groupRef.current.rotation.y += delta * 0.15; 
    });

    return (
        <group ref={groupRef} position={[0, -0.2, 0]}>
             <points>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" count={count} array={pos} itemSize={3} />
                    <bufferAttribute attach="attributes-color" count={count} array={col} itemSize={3} />
                </bufferGeometry>
                <pointsMaterial size={0.03} vertexColors transparent opacity={0.8} blending={THREE.AdditiveBlending} sizeAttenuation depthWrite={false} />
            </points>
        </group>
    );
};