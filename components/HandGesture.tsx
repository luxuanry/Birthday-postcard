import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { Loader2 } from 'lucide-react';

interface HandGestureProps {
  onGestureChange: (factor: number) => void; // -1 (Fist/Implode) to 1 (Open/Explode), 0 is neutral
}

export const HandGesture: React.FC<HandGestureProps> = ({ onGestureChange }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugValue, setDebugValue] = useState(0); // For UI visualization
  
  const lastVideoTime = useRef(-1);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const requestRef = useRef<number>(0);
  
  // Smoothing variables
  const currentFactor = useRef(0);

  useEffect(() => {
    let mounted = true;

    const setupMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
        );
        
        if (!mounted) return;

        // Try standard configuration, fallback handled by MediaPipe usually
        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU" // Will fallback to CPU if GPU unavailable often
          },
          runningMode: "VIDEO",
          numHands: 1
        });

        if (!mounted) return;
        landmarkerRef.current = landmarker;
        startCamera();
      } catch (err) {
        console.error("MediaPipe setup error:", err);
        setError("Vision Init Failed");
      }
    };

    setupMediaPipe();

    return () => {
      mounted = false;
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
      cancelAnimationFrame(requestRef.current);
    };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
            width: 320, 
            height: 240,
            frameRate: { ideal: 30 }
        } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.addEventListener('loadeddata', predictWebcam);
        setIsReady(true);
      }
    } catch (err) {
      console.error("Camera error:", err);
      setError("No Cam Access");
    }
  };

  const predictWebcam = () => {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;

    if (video && landmarker) {
        if (video.currentTime !== lastVideoTime.current) {
            lastVideoTime.current = video.currentTime;
            const startTimeMs = performance.now();
            
            const results = landmarker.detectForVideo(video, startTimeMs);
            
            let targetFactor = 0;

            if (results.landmarks && results.landmarks.length > 0) {
                const landmarks = results.landmarks[0];
                
                // --- ROBUST SCALE-INVARIANT ALGORITHM ---
                
                // Point 0: Wrist
                // Point 9: Middle Finger MCP (Knuckle) -> Use as Scale Reference
                const wrist = landmarks[0];
                const middleKnuckle = landmarks[9];
                
                const scaleRef = Math.sqrt(
                    Math.pow(middleKnuckle.x - wrist.x, 2) +
                    Math.pow(middleKnuckle.y - wrist.y, 2) +
                    Math.pow(middleKnuckle.z - wrist.z, 2)
                );

                // Calculate average distance from Wrist to all 5 fingertips
                const tips = [4, 8, 12, 16, 20];
                let totalTipDist = 0;
                tips.forEach(idx => {
                    const tip = landmarks[idx];
                    const dist = Math.sqrt(
                        Math.pow(tip.x - wrist.x, 2) +
                        Math.pow(tip.y - wrist.y, 2) +
                        Math.pow(tip.z - wrist.z, 2)
                    );
                    totalTipDist += dist;
                });
                const avgTipDist = totalTipDist / 5;

                // Ratio: How far are tips compared to the hand size?
                // Fist: Tips are close to wrist. Ratio ~ 0.8 to 1.2
                // Open: Tips are far. Ratio ~ 2.0 to 2.5
                const ratio = avgTipDist / (scaleRef || 1);

                // Define thresholds based on Ratio (Scale Invariant)
                const closedRatio = 1.3; 
                const openRatio = 2.2;

                if (ratio < closedRatio) {
                    targetFactor = -1.0; // Implode
                } else if (ratio > openRatio) {
                    targetFactor = 1.0; // Explode
                } else {
                    // Normalize range [1.3, 2.2] to [-1, 1]
                    targetFactor = ((ratio - closedRatio) / (openRatio - closedRatio)) * 2 - 1;
                }
            } else {
                targetFactor = 0;
            }

            // Smooth interpolation
            currentFactor.current = currentFactor.current + (targetFactor - currentFactor.current) * 0.15;
            
            // Deadzone to prevent micro jitters at neutral
            if (Math.abs(currentFactor.current) < 0.1) currentFactor.current = 0;
            
            onGestureChange(currentFactor.current);
            setDebugValue(currentFactor.current);
        }
    }
    requestRef.current = requestAnimationFrame(predictWebcam);
  };

  if (error) {
      return (
        <div className="absolute top-4 right-4 bg-red-900/50 text-red-200 text-xs px-2 py-1 rounded border border-red-500/30">
            {error}
        </div>
      );
  }

  return (
    <div className="absolute bottom-4 right-4 z-40 flex flex-col items-end gap-2 pointer-events-none">
       {/* Hidden video element for processing */}
       <video 
         ref={videoRef} 
         autoPlay 
         playsInline 
         muted
         className="w-24 h-16 object-cover rounded-lg opacity-40 border border-pink-500/30 scale-x-[-1]" 
         style={{ display: isReady ? 'block' : 'none' }}
       />
       
       {!isReady && (
           <div className="flex items-center gap-2 text-pink-500/50 text-xs">
               <Loader2 className="w-3 h-3 animate-spin" />
               <span>Init Vision...</span>
           </div>
       )}
       
       {isReady && (
           <div className="flex flex-col items-end">
               <div className="text-[10px] text-pink-500/50 uppercase tracking-widest flex items-center gap-1 mb-1">
                   Gesture Control Active
               </div>
               {/* Visual Indicator Bar */}
               <div className="w-24 h-1 bg-gray-800 rounded-full overflow-hidden flex relative">
                    <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-white/30"></div>
                    <div 
                        className={`h-full transition-all duration-100 ${debugValue > 0 ? 'bg-blue-400' : 'bg-orange-500'}`}
                        style={{
                            width: `${Math.abs(debugValue) * 50}%`,
                            marginLeft: debugValue > 0 ? '50%' : `calc(50% - ${Math.abs(debugValue) * 50}%)`
                        }}
                    ></div>
               </div>
               <div className="text-[9px] text-white/40 font-mono mt-1">
                   {debugValue > 0.5 ? "EXPLODE" : debugValue < -0.5 ? "IMPLODE" : "NEUTRAL"} ({debugValue.toFixed(2)})
               </div>
           </div>
       )}
    </div>
  );
};