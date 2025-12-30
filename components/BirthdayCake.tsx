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
  gestureFactor: number; // -1 (Implode) to 1 (Explode)
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
  uniform float uGesture; // -1.0 to 1.0
  
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

    // --- GESTURE CONTROL (INTENSIFIED) ---
    
    // 1. EXPLOSION (Open Palm, uGesture > 0)
    if (uGesture > 0.0) {
        vec3 center = vec3(0.0, 0.5, 0.0);
        vec3 dir = pos - center;
        vec3 norm = normalize(dir);
        
        // Chaotic dispersion
        float noise = sin(pos.x * 12.0 + uTime * 8.0) * cos(pos.z * 12.0 + uTime * 8.0);
        
        // Slightly reduced shader offset because we are now scaling the whole group 3x
        // Previous was 8.0, reduced to 4.0 to keep particles on screen when scaled up
        float explodeFactor = uGesture * 4.0; 
        
        pos += norm * explodeFactor * (0.8 + noise * 0.8);
        
        // Add random rotation/swirl during explosion
        float angle = uGesture * length(pos) * 1.5;
        float c = cos(angle); float s = sin(angle);
        float nx = pos.x * c - pos.z * s;
        float nz = pos.x * s + pos.z * c;
        pos.x = nx; pos.z = nz;
    }

    // 2. IMPLOSION/COHESION (Fist, uGesture < 0)
    if (uGesture < 0.0) {
        float implodeStrength = -uGesture; // 0 to 1
        vec3 target = vec3(0.0, 1.8, 0.0); // Target the candle flame area
        
        // Move towards target strongly
        pos = mix(pos, target, implodeStrength * 0.95);
        
        // Intense Spiral Vortex Effect
        float angle = implodeStrength * 20.0 + (pos.y * 5.0);
        float c = cos(angle); 
        float s = sin(angle);
        
        float nx = pos.x * c - pos.z * s;
        float nz = pos.x * s + pos.z * c;
        
        pos.x = nx; 
        pos.z = nz;
        
        // Jitter energy core (Energy Ball feel)
        if (implodeStrength > 0.5) {
            vec3 jitter = vec3(
                sin(uTime * 50.0 + pos.y), 
                cos(uTime * 45.0 + pos.x), 
                sin(uTime * 60.0 + pos.z)
            );
            pos += jitter * 0.05 * implodeStrength;
        }
    }

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    
    float flicker = 1.0 + sin(uTime * 5.0 + pos.x * 100.0) * 0.15;
    float gestureSizeMod = 1.0;
    
    // Make particles smaller when imploded to look dense
    if (uGesture < 0.0) gestureSizeMod = 0.5 + (1.0 + uGesture) * 0.5;
    // Make particles larger when exploded
    if (uGesture > 0.0) gestureSizeMod = 1.0 + uGesture * 0.5;
    
    float currentSize = size * flicker * (1.0 + uBoost * 0.5) * gestureSizeMod;
    
    gl_PointSize = currentSize * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const particleFragmentShader = `
  varying vec3 vColor;
  uniform float uBoost;
  uniform float uGesture;
  
  void main() {
    vec2 xy = gl_PointCoord.xy - vec2(0.5);
    float len = length(xy);
    if (len > 0.5) discard;
    
    float strength = pow(1.0 - (len * 2.0), 3.5);
    vec3 baseColor = vColor * 1.8;
    
    // Color shift based on gesture
    // Gold/White for implosion (Energy) - Higher intensity
    if (uGesture < -0.2) {
        float t = -uGesture;
        baseColor = mix(baseColor, vec3(1.2, 1.0, 0.5) * 8.0, t * 0.8);
    }
    
    // Cool Blue/White for explosion
    if (uGesture > 0.2) {
         float t = uGesture;
         baseColor = mix(baseColor, vec3(0.5, 0.8, 1.0) * 5.0, t * 0.5);
    }
    
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
    gl_PointSize = size * (200.0 / -mvPosition.z); // Slightly larger point size for shape detail
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const snowFragmentShader = `
  varying vec3 vColor;
  
  void main() {
    // Transform point coord to -1..1
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    
    // Convert to polar
    float r = length(p);
    float a = atan(p.y, p.x);
    
    // Snowflake Shape: 6-fold symmetry
    // We modify radius based on angle to cut out a star shape
    // cos(a * 3.0) gives 3 lobes, abs makes it 6
    float f = abs(cos(a * 3.0)); 
    float d = 0.4 + 0.3 * f; // Shape definition
    
    // Soft edge
    float opacity = smoothstep(d + 0.1, d, r);
    
    if (opacity < 0.1) discard;
    
    gl_FragColor = vec4(vColor, opacity * 0.8);
  }
`;

export const BirthdayCake: React.FC<BirthdayCakeProps> = ({ isBlown, isBlowing, wishes, gestureFactor }) => {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const boostRef = useRef(0);
  const groupRef = useRef<THREE.Group>(null);
  const currentScale = useRef(1.0);

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
        const r = isSurface 
            ? r1 * (0.95 + Math.random() * 0.05) 
            : Math.random() * r1;                
        const y = Math.random() * h1;
        const color = getPointColor(r, r1, y, totalHeight);
        const size = Math.random() * 0.015 + 0.015;
        addPoint(r * Math.cos(theta), y, r * Math.sin(theta), color, size);
    }

    const yOff = h1;
    for (let i = 0; i < topCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const isSurface = Math.random() > 0.20;
        const r = isSurface 
             ? r2 * (0.92 + Math.random() * 0.08) 
             : Math.random() * r2;
        const y = Math.random() * h2 + yOff;
        let color = getPointPoint(r, r2, y, totalHeight);
        if (y > (yOff + h2 - 0.05)) color = COLOR_LIGHT_PINK; 
        const size = Math.random() * 0.015 + 0.015;
        addPoint(r * Math.cos(theta), y, r * Math.sin(theta), color, size);
    }

    // Helper function fix inside memo
    function getPointPoint(r: number, maxR: number, y: number, totalHeight: number) {
        return getPointColor(r, maxR, y, totalHeight);
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
      
      // Update Boost
      boostRef.current = THREE.MathUtils.lerp(boostRef.current, 0, delta * 2.5);
      materialRef.current.uniforms.uBoost.value = boostRef.current;
      
      // Update Gesture
      materialRef.current.uniforms.uGesture.value = gestureFactor;
    }

    // --- SCALING LOGIC (SMOOTH & CONTINUOUS) ---
    // Instead of a binary switch, we map the gesture factor directly to scale.
    // Base scale: 1.0
    // Max scale: 3.0 (at gestureFactor = 1.0)
    // Formula: 1.0 + (positive_gesture * 2.0)
    
    // We only scale UP for "Explosion". Implosion (negative gesture) keeps scale at 1.0 (or could shrink if desired).
    const expansion = Math.max(0, gestureFactor);
    const targetScale = 1.0 + (expansion * 2.0);
    
    // Smooth interpolation with dampening (0.1) for weight/feel
    currentScale.current += (targetScale - currentScale.current) * 0.1;
    
    if (groupRef.current) {
        groupRef.current.scale.setScalar(currentScale.current);
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
              uBoost: { value: 0 },
              uGesture: { value: 0 }
          }}
        />
      </points>
        
      <BackgroundSnow />
      <BottomRings />
      
      {/* High Performance Confetti Explosion */}
      {isBlown && <ConfettiExplosion />}

      <group position={[0, 1.6, 0]}>
        <Candle isBlown={isBlown} isBlowing={isBlowing} />
      </group>
    </group>
  );
};

// --- Sub-component: Falling Snow (Updated to Snowflake Shape) ---
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
            // Loop back to top
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
                transparent 
                opacity={0.8} 
                blending={THREE.AdditiveBlending} 
                depthWrite={false} 
            />
        </points>
    );
};

// --- Sub-component: Confetti Explosion (High Performance InstancedMesh) ---
const ConfettiExplosion = () => {
    // Massively increased count to fill the screen
    const count = 4000;
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);

    // Physics State stored in Arrays for performance (avoiding React Overhead for 4000 items)
    const { positions, velocities, rotations, rotationSpeeds, colors } = useMemo(() => {
        const positions = new Float32Array(count * 3);
        const velocities = new Float32Array(count * 3);
        const rotations = new Float32Array(count * 3);
        const rotationSpeeds = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);

        // Custom Palette: Pink, Sky Blue, Purple, Yellow
        const palette = [
            new THREE.Color("#FF69B4"), // Hot Pink
            new THREE.Color("#FFB6C1"), // Light Pink
            new THREE.Color("#87CEEB"), // Sky Blue
            new THREE.Color("#00BFFF"), // Deep Sky Blue
            new THREE.Color("#9370DB"), // Medium Purple
            new THREE.Color("#BA55D3"), // Medium Orchid
            new THREE.Color("#FFD700"), // Gold
            new THREE.Color("#FFFF00"), // Yellow
        ];

        for (let i = 0; i < count; i++) {
            // 1. Initial Position: Start at the candle/top of cake
            positions[i * 3] = (Math.random() - 0.5) * 0.5;
            positions[i * 3 + 1] = 2.0 + (Math.random() - 0.5) * 0.5;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 0.5;

            // 2. Explosion Velocity
            // Use spherical distribution but biased UP and OUTWARDS towards CAMERA
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI; // Full sphere
            
            const speed = 4 + Math.random() * 8; // Varied speed

            // Convert spherical to cartesian
            let vx = speed * Math.sin(phi) * Math.cos(theta);
            let vy = speed * Math.sin(phi) * Math.sin(theta);
            let vz = speed * Math.cos(phi);

            // Bias: Add upward force
            vy += 5 + Math.random() * 5; 
            
            // Bias: Add outward force to fill screen (spread X and Z)
            vx *= 1.5;
            vz *= 1.5;

            // Bias: Push some towards camera (Positive Z) to fly past user
            if (Math.random() > 0.4) {
                vz += 5 + Math.random() * 5;
            }

            velocities[i * 3] = vx;
            velocities[i * 3 + 1] = vy;
            velocities[i * 3 + 2] = vz;

            // 3. Rotation
            rotations[i * 3] = Math.random() * Math.PI;
            rotations[i * 3 + 1] = Math.random() * Math.PI;
            rotations[i * 3 + 2] = Math.random() * Math.PI;

            // 4. Rotation Speed
            rotationSpeeds[i * 3] = (Math.random() - 0.5) * 10;
            rotationSpeeds[i * 3 + 1] = (Math.random() - 0.5) * 10;
            rotationSpeeds[i * 3 + 2] = (Math.random() - 0.5) * 10;

            // 5. Color
            const col = palette[Math.floor(Math.random() * palette.length)];
            colors[i * 3] = col.r;
            colors[i * 3 + 1] = col.g;
            colors[i * 3 + 2] = col.b;
        }

        return { positions, velocities, rotations, rotationSpeeds, colors };
    }, []);

    useFrame((state, delta) => {
        if (!meshRef.current) return;

        // Clamp delta to avoid huge jumps if tab inactive
        const dt = Math.min(delta, 0.1);

        for (let i = 0; i < count; i++) {
            const idx = i * 3;

            // --- Physics Update ---
            
            // Gravity
            velocities[idx + 1] -= 15.0 * dt; 

            // Air Drag (simulating paper resistance)
            velocities[idx] *= 0.96;
            velocities[idx + 1] *= 0.96;
            velocities[idx + 2] *= 0.96;

            // Update Position
            positions[idx] += velocities[idx] * dt;
            positions[idx + 1] += velocities[idx + 1] * dt;
            positions[idx + 2] += velocities[idx + 2] * dt;

            // Update Rotation
            rotations[idx] += rotationSpeeds[idx] * dt;
            rotations[idx + 1] += rotationSpeeds[idx + 1] * dt;
            rotations[idx + 2] += rotationSpeeds[idx + 2] * dt;

            // Cull if too far below screen to keep clean
            let s = 1.0;
            if (positions[idx + 1] < -20) {
                 s = 0.0;
            }

            // Update Matrix
            dummy.position.set(positions[idx], positions[idx + 1], positions[idx + 2]);
            dummy.rotation.set(rotations[idx], rotations[idx + 1], rotations[idx + 2]);
            
            // Varied scales for interest
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

// --- Sub-component: Bottom Rings ---
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
            
            // Gold Rings
            c[i*3] = COLOR_GOLD.r; c[i*3+1] = COLOR_GOLD.g; c[i*3+2] = COLOR_GOLD.b;
        }
        return { pos: p, col: c };
    }, []);

    useFrame((state, delta) => {
        if(groupRef.current) {
            groupRef.current.rotation.y += delta * 0.15; 
        }
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