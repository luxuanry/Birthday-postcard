import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Instance, Instances } from '@react-three/drei';
import * as THREE from 'three';

interface CandleProps {
  isBlown: boolean;
  isBlowing: boolean;
}

// --- Candle Body Shaders (Solid Particles) ---
const candleVertexShader = `
  attribute float size;
  attribute vec3 color;
  varying vec3 vColor;
  uniform float uTime;
  
  void main() {
    vColor = color;
    vec3 pos = position;
    
    // Slight breathing
    float breath = sin(uTime * 3.0 + pos.y * 10.0) * 0.002;
    pos.x += pos.x * breath;
    pos.z += pos.z * breath;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = size * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const candleFragmentShader = `
  varying vec3 vColor;
  
  void main() {
    vec2 xy = gl_PointCoord.xy - vec2(0.5);
    float len = length(xy);
    if (len > 0.5) discard;
    
    float strength = pow(1.0 - (len * 2.0), 2.0);
    gl_FragColor = vec4(vColor, strength * 0.8);
  }
`;

// --- Flame Particle Shaders ---
const flameVertexShader = `
  attribute float size;
  attribute float offset; // Random seed per particle
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uTime;
  uniform float uBlown; // 0.0 (active) -> 1.0 (gone)
  uniform float uBlowing; // 0.0 (calm) -> 1.0 (shaking)

  void main() {
    // Particle Life Cycle
    float lifeTime = 0.8; 
    float t = mod(uTime * 1.5 + offset * lifeTime, lifeTime); 
    float p = t / lifeTime; // Normalized progress 0 -> 1

    vec3 pos = position; // Base emission point (near 0,0,0)
    
    // Upward motion - Compact flame
    float height = 0.35; 
    pos.y += p * height; 
    
    // Teardrop Shape Logic
    float widthProfile = sin(p * 3.14); 
    float spread = widthProfile * 0.06 * (1.0 - p * 0.5); 
    
    // Subtle Flicker / Turbulence (Base)
    float flickerFreq = 12.0;
    float noise = sin(uTime * flickerFreq + p * 8.0 + offset * 10.0);
    float wind = sin(uTime * 2.0) * 0.01 * p * p; // Very subtle sway
    
    // --- SHAKE LOGIC ---
    // Driven by uBlowing. When uBlowing is 1, shake is intense.
    // Also modulate by uBlown: if partially blown out, still shake until gone.
    float effectiveShake = uBlowing; 
    float shakeIntensity = sin(uTime * 50.0 + pos.y * 30.0) * 0.12 * effectiveShake;
    
    pos.x += spread * sin(offset * 6.2831) + (noise * 0.005 * p) + wind + shakeIntensity;
    pos.z += spread * cos(offset * 6.2831) + (noise * 0.005 * p) + shakeIntensity;
    
    // --- Gradient Coloring ---
    vec3 colBase = vec3(0.1, 0.1, 1.0); // Blue base
    vec3 colMid  = vec3(1.0, 0.9, 0.2); // Yellow/Gold
    vec3 colTip  = vec3(1.0, 0.4, 0.0); // Orange
    
    vec3 c = colBase;
    if (p > 0.15) {
        float t2 = (p - 0.15) / 0.85;
        c = mix(colMid, colTip, t2 * t2); 
    } else {
        c = mix(colBase, colMid, p / 0.15);
    }
    
    vColor = c * 2.0; // Overdrive for bloom

    // --- Extinguish Logic ---
    // Driven by uBlown. When uBlown -> 1.0, scale -> 0.
    float blownFactor = smoothstep(0.0, 0.9, uBlown);
    float scale = size * (1.0 - p) * (1.0 - blownFactor);
    
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = scale * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
    
    // Alpha
    // Fade in at bottom, fade out at top
    float fadeIn = smoothstep(0.0, 0.1, p);
    float fadeOut = 1.0 - pow(p, 4.0);
    vAlpha = fadeIn * fadeOut * (1.0 - blownFactor);
  }
`;

const flameFragmentShader = `
  varying vec3 vColor;
  varying float vAlpha;
  
  void main() {
    vec2 xy = gl_PointCoord.xy - vec2(0.5);
    float r = length(xy);
    if (r > 0.5) discard;
    
    // Soft circular glow
    float glow = pow(1.0 - r * 2.0, 1.5);
    
    gl_FragColor = vec4(vColor, vAlpha * glow);
  }
`;

export const Candle: React.FC<CandleProps> = ({ isBlown, isBlowing }) => {
  return (
    <group>
      {/* Energy Candle Body - Particles */}
      <CandleBodyParticles />
      
      {/* Wick - Keep solid for definition */}
      <mesh position={[0, 0.52, 0]}>
        <cylinderGeometry args={[0.005, 0.005, 0.1, 8]} />
        <meshBasicMaterial color="#333" />
      </mesh>

      {/* Flame Logic - Positioned just above wick */}
      <FlameParticles isBlown={isBlown} isBlowing={isBlowing} position={[0, 0.58, 0]} />
      
      {/* Smoke Logic - linked to FINAL blown state */}
      <Smoke isBlown={isBlown} position={[0, 0.60, 0]} />
    </group>
  );
};

// --- Candle Body Particles ---
const CandleBodyParticles = () => {
    const count = 3000;
    const meshRef = useRef<THREE.Points>(null);
    const materialRef = useRef<THREE.ShaderMaterial>(null);

    const { positions, colors, sizes } = useMemo(() => {
        const pos = new Float32Array(count * 3);
        const col = new Float32Array(count * 3);
        const sz = new Float32Array(count);

        const color1 = new THREE.Color("#FFF5F9"); // White/Pink
        const color2 = new THREE.Color("#FFB7D5"); // Darker Pink
        
        for (let i = 0; i < count; i++) {
            const theta = Math.random() * Math.PI * 2;
            const rBase = 0.06;
            const r = Math.random() > 0.3 
                ? rBase * (0.9 + Math.random() * 0.1) // Surface
                : Math.random() * rBase;          // Volume
                
            const x = r * Math.cos(theta);
            const z = r * Math.sin(theta);
            const y = Math.random() * 0.5;
            
            pos[i * 3] = x;
            pos[i * 3 + 1] = y;
            pos[i * 3 + 2] = z;

            const color = Math.random() > 0.5 ? color1 : color2;
            col[i * 3] = color.r;
            col[i * 3 + 1] = color.g;
            col[i * 3 + 2] = color.b;

            sz[i] = Math.random() * 0.03 + 0.02;
        }

        return { positions: pos, colors: col, sizes: sz };
    }, []);

    useFrame((state) => {
        if (materialRef.current) {
            materialRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
        }
    });

    return (
        <points ref={meshRef} position={[0, 0, 0]}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
                <bufferAttribute attach="attributes-color" count={count} array={colors} itemSize={3} />
                <bufferAttribute attach="attributes-size" count={count} array={sizes} itemSize={1} />
            </bufferGeometry>
            <shaderMaterial
                ref={materialRef}
                transparent
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                vertexShader={candleVertexShader}
                fragmentShader={candleFragmentShader}
                uniforms={{ uTime: { value: 0 } }}
            />
        </points>
    );
};

// --- Flame Particles Component ---
const FlameParticles: React.FC<{ isBlown: boolean; isBlowing: boolean; position: [number, number, number] }> = ({ isBlown, isBlowing, position }) => {
    const count = 1000; 
    const meshRef = useRef<THREE.Points>(null);
    const materialRef = useRef<THREE.ShaderMaterial>(null);
    const lightRef = useRef<THREE.PointLight>(null);
    
    // Internal state for blown animation transition
    const blownUniform = useRef(0);
    const blowingUniform = useRef(0);

    const { positions, offsets, sizes } = useMemo(() => {
        const p = new Float32Array(count * 3);
        const o = new Float32Array(count);
        const s = new Float32Array(count);
        
        for(let i=0; i<count; i++) {
            p[i*3] = 0; 
            p[i*3+1] = 0; 
            p[i*3+2] = 0;
            
            o[i] = Math.random(); 
            s[i] = Math.random() * 0.04 + 0.02; 
        }
        return { positions: p, offsets: o, sizes: s };
    }, []);

    useFrame((state, delta) => {
        const time = state.clock.getElapsedTime();
        
        // Handle Blown Transition (Extinguish)
        const targetBlown = isBlown ? 1.0 : 0.0;
        blownUniform.current = THREE.MathUtils.lerp(blownUniform.current, targetBlown, delta * 3.0); // Fast extinguish

        // Handle Blowing Transition (Shake)
        const targetBlowing = isBlowing ? 1.0 : 0.0;
        blowingUniform.current = THREE.MathUtils.lerp(blowingUniform.current, targetBlowing, delta * 4.0); // Fast reaction to click

        if (materialRef.current) {
            materialRef.current.uniforms.uTime.value = time;
            materialRef.current.uniforms.uBlown.value = blownUniform.current;
            materialRef.current.uniforms.uBlowing.value = blowingUniform.current;
        }

        // Flicker Light
        if (lightRef.current) {
            const flicker = Math.sin(time * 25) * 0.05 + Math.sin(time * 60) * 0.02;
            const baseIntensity = 1.2;
            // Intensity drops as blownUniform goes up
            const intensity = (baseIntensity + flicker) * (1.0 - blownUniform.current);
            lightRef.current.intensity = Math.max(0, intensity);
            
            // Subtle light movement matches flame shake logic roughly
            const shake = blowingUniform.current * 0.05;
            lightRef.current.position.x = Math.sin(time * 10) * (0.01 + shake);
            lightRef.current.position.z = Math.cos(time * 8) * (0.01 + shake);
        }
    });

    return (
        <group position={position}>
            <pointLight ref={lightRef} distance={2} decay={2} color="#ffaa00" />
            <points ref={meshRef}>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
                    <bufferAttribute attach="attributes-offset" count={count} array={offsets} itemSize={1} />
                    <bufferAttribute attach="attributes-size" count={count} array={sizes} itemSize={1} />
                </bufferGeometry>
                <shaderMaterial
                    ref={materialRef}
                    transparent
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                    vertexShader={flameVertexShader}
                    fragmentShader={flameFragmentShader}
                    uniforms={{ 
                        uTime: { value: 0 },
                        uBlown: { value: 0 },
                        uBlowing: { value: 0 }
                    }}
                />
            </points>
        </group>
    );
};

// --- Smoke Component ---
const Smoke: React.FC<{ isBlown: boolean; position: [number, number, number] }> = ({ isBlown, position }) => {
    // Only render smoke if isBlown is true (final state)
    if (!isBlown) return null;
    return <SmokeParticles position={position} />;
};

const SmokeParticles: React.FC<{ position: [number, number, number] }> = ({ position }) => {
    const count = 30;
    
    const particles = useMemo(() => {
        return new Array(count).fill(0).map(() => ({
            velocity: [
                (Math.random() - 0.5) * 0.03, 
                Math.random() * 0.04 + 0.02, 
                (Math.random() - 0.5) * 0.03
            ],
            scale: Math.random() * 0.5 + 0.5,
            delay: Math.random() * 0.5 
        }));
    }, []);

    return (
        <group position={position}>
            <Instances range={count}>
                <sphereGeometry args={[0.03, 16, 16]} />
                <meshStandardMaterial 
                    transparent 
                    opacity={0.3} 
                    color="#e0e0e0" 
                    emissive="#555555"
                    depthWrite={false}
                />
                {particles.map((data, i) => (
                    <SmokeParticle key={i} {...data} />
                ))}
            </Instances>
        </group>
    );
};

const SmokeParticle = ({ velocity, scale, delay }: { velocity: number[], scale: number, delay: number }) => {
    const ref = useRef<THREE.Group>(null);
    const [started, setStarted] = useState(false);

    useEffect(() => {
        const timeout = setTimeout(() => setStarted(true), delay * 1000);
        return () => clearTimeout(timeout);
    }, [delay]);

    useFrame((state) => {
        if (!ref.current || !started) {
            if(ref.current) ref.current.scale.set(0,0,0);
            return;
        }
        
        ref.current.position.x += velocity[0];
        ref.current.position.y += velocity[1];
        ref.current.position.z += velocity[2];
        
        const age = ref.current.position.y;
        let currentScale = scale + age * 0.5;
        
        if (age > 1.5) {
            currentScale = Math.max(0, currentScale - 0.05);
        }

        ref.current.scale.set(currentScale, currentScale, currentScale);
    });

    return (
        <Instance 
            ref={ref} 
            scale={0} 
            position={[0, 0, 0]} 
        />
    );
};