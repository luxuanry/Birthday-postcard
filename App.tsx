import React, { useState, Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, Float } from '@react-three/drei';
import { EffectComposer, Bloom, ToneMapping } from '@react-three/postprocessing';
import { BirthdayCake } from './components/BirthdayCake';
import { Loader, Mic, RotateCcw, Send } from 'lucide-react';

interface Wish {
    id: number;
    text: string;
}

const App: React.FC = () => {
  const [isBlown, setIsBlown] = useState(false);
  const [isBlowing, setIsBlowing] = useState(false); // Intermediate state for animation
  const [hasWished, setHasWished] = useState(false); 
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [inputValue, setInputValue] = useState("");

  const wishIdCounter = useRef(0);

  const handleBlow = () => {
    setIsBlowing(true);
    // Delay the actual extinguish state by 1 second to allow for the "shaking" animation
    setTimeout(() => {
        setIsBlown(true);
    }, 1000);
  };

  const handleReset = () => {
    setIsBlown(false);
    setIsBlowing(false);
    setHasWished(false); 
    setWishes([]); 
  };

  const handleSendWish = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const newWish = { id: wishIdCounter.current++, text: inputValue };
    setWishes(prev => [...prev, newWish]);
    setInputValue("");
    setHasWished(true); 
  };

  return (
    <div className="relative w-full h-full bg-[#050203] text-white overflow-hidden font-mono selection:bg-pink-500 selection:text-white">
      
      {/* 3D Scene */}
      <Canvas 
        gl={{ antialias: false, stencil: false, depth: true, alpha: false }} 
        camera={{ position: [0, 3, 7], fov: 35 }}
        dpr={[1, 1.5]} 
      >
        <color attach="background" args={['#050203']} />
        <fog attach="fog" args={['#050203', 5, 25]} />
        
        <Suspense fallback={null}>
          <Environment preset="city" />
          
          <ambientLight intensity={0.1} />
          <pointLight position={[5, 5, 5]} intensity={1.0} color="#ff99cc" distance={20} />
          
          {/* Adjusted vertical position to center between UI elements */}
          <group position={[0, -0.4, 0]}>
            <Float speed={2} rotationIntensity={0.05} floatIntensity={0.1}>
              <BirthdayCake 
                isBlown={isBlown} 
                isBlowing={isBlowing} 
                wishes={wishes} 
              />
            </Float>
          </group>
          
          <OrbitControls 
            enablePan={false} 
            minPolarAngle={Math.PI / 4} 
            maxPolarAngle={Math.PI / 1.8}
            minDistance={4}
            maxDistance={12}
            autoRotate={!isBlown}
            autoRotateSpeed={0.3}
            rotateSpeed={0.5}
          />

          <EffectComposer enableNormalPass={false}>
            <Bloom 
                luminanceThreshold={0.2} 
                mipmapBlur 
                intensity={1.5} 
                radius={0.6}
                levels={9}
            />
            <ToneMapping adaptive={false} resolution={256} middleGrey={0.6} maxLuminance={16.0} averageLuminance={1.0} adaptationRate={1.0} />
          </EffectComposer>
        </Suspense>
      </Canvas>

      {/* Main Title Overlay (TOP) */}
      <div className="absolute top-16 left-0 right-0 flex justify-center pointer-events-none z-10">
          <div className="text-center space-y-4 pointer-events-auto mix-blend-screen">
            <h1 className="text-2xl md:text-4xl tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-pink-200 via-yellow-100 to-pink-200 drop-shadow-[0_0_25px_rgba(255,200,200,0.4)] uppercase font-bold" style={{ textShadow: '0 0 30px rgba(255,100,150,0.3)' }}>
              Joyeux Anniversaire
            </h1>
            <div className="h-px w-24 bg-gradient-to-r from-transparent via-pink-400 to-transparent mx-auto opacity-50" />
          </div>
      </div>

      {/* Center Action Area (Blow / Reset) */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center gap-6 pointer-events-none">
         
         {/* STAGE 2: Ready to Blow */}
         {/* Show only if wished, not yet blown, and not currently in the blowing animation sequence */}
         {hasWished && !isBlown && !isBlowing && (
            <div className="pointer-events-auto flex flex-col items-center animate-in fade-in zoom-in duration-700">
                <p className="text-pink-100/80 text-sm tracking-[0.2em] mb-4 animate-pulse uppercase drop-shadow-[0_0_8px_rgba(255,105,180,0.8)]">
                    SOUFFLEZ SUR L'ÉCRAN
                </p>
                <button
                    onClick={handleBlow}
                    className="group relative flex items-center gap-3 bg-black/40 backdrop-blur-md border border-pink-500/50 text-pink-100 px-8 py-3 rounded-full text-sm uppercase tracking-widest hover:bg-pink-900/40 hover:border-pink-400 hover:shadow-[0_0_30px_rgba(255,105,180,0.4)] transition-all duration-300"
                >
                    <Mic className="w-4 h-4 text-pink-400 group-hover:text-pink-200 animate-pulse" />
                    <span>Blow</span>
                    {/* Ring animation effect */}
                    <span className="absolute inset-0 rounded-full border border-pink-500/30 animate-ping opacity-75"></span>
                </button>
            </div>
         )}

         {/* STAGE 3: Reset */}
         {isBlown && (
            <div className="pointer-events-auto animate-in fade-in duration-1000 delay-500">
                <button
                    onClick={handleReset}
                    className="flex items-center gap-2 bg-white/5 backdrop-blur-sm border border-white/10 text-white/50 px-6 py-2 rounded-full text-xs uppercase tracking-widest hover:bg-white/10 hover:text-white hover:border-white/30 transition-all"
                >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                </button>
            </div>
         )}
      </div>

      {/* Bottom Interaction Area: Make A Wish */}
      {/* STAGE 1: Wish Input (Only visible if not wished yet) */}
      {!hasWished && (
          <div className="absolute bottom-12 left-0 right-0 flex flex-col items-center justify-center pointer-events-none z-20 gap-6 animate-in slide-in-from-bottom-10 fade-in duration-700">
             
             <h2 className="text-xl md:text-2xl text-pink-200/60 tracking-[0.8em] uppercase font-light animate-pulse drop-shadow-[0_0_10px_rgba(255,105,180,0.3)]">
                Make A Wish
             </h2>

             <div className="w-full max-w-md px-6 pointer-events-auto">
                <form onSubmit={handleSendWish} className="relative flex items-end gap-2 group">
                    <div className="relative flex-1">
                        <input 
                            type="text" 
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder="Type your wish..."
                            className="w-full bg-transparent border-b border-pink-500/50 py-2 text-white placeholder-pink-200/70 focus:outline-none focus:border-pink-300 transition-colors text-sm font-normal tracking-wide"
                        />
                        <div className="absolute bottom-0 left-0 h-[1px] w-0 bg-pink-400 shadow-[0_0_10px_#ff69b4] transition-all duration-500 group-focus-within:w-full"></div>
                    </div>
                    <button 
                        type="submit"
                        disabled={!inputValue.trim()}
                        className="text-pink-300 hover:text-white disabled:text-pink-500/50 text-sm uppercase tracking-widest font-bold pb-2 transition-colors border-b border-transparent hover:border-pink-200 flex items-center gap-2"
                    >
                        <span>SEND</span>
                        <Send className="w-3 h-3" />
                    </button>
                </form>
             </div>
          </div>
      )}

      {/* Loading Overlay */}
      <Suspense fallback={
        <div className="absolute inset-0 flex items-center justify-center bg-black z-50">
          <Loader className="w-8 h-8 text-pink-500 animate-spin opacity-50" />
        </div>
      }>
        <></>
      </Suspense>
    </div>
  );
};

export default App;