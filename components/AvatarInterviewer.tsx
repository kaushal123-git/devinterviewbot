import React, { Suspense, useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react';
import { GripHorizontal, Loader2, Mic, Minus, Plus, RotateCcw, Volume2 } from 'lucide-react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { VRMLoaderPlugin, VRMHumanBoneName, type VRM } from '@pixiv/three-vrm';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useVRMFace } from '../hooks/useVRMFace';
import { useVRMPose } from '../hooks/useVRMPose';
import { useMediaPipeTracking, type TrackingData } from '../hooks/useMediaPipeTracking';

interface AvatarInterviewerProps {
  speechLevel: number;
  isLiveConnected: boolean;
  isCameraEnabled: boolean;
  subtitles?: string;
  agentState?: 'idle' | 'listening' | 'thinking' | 'speaking';
  isFemale?: boolean;
  onAvatarChange?: (isFemale: boolean) => void;
}

export interface AvatarInterviewerHandle {
  captureWebcamFrame: () => string | null;
}

function CameraController({ isFemale }: { isFemale: boolean }) {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0, isFemale ? -0.2 : 0.04, 0.98);
    camera.lookAt(0, isFemale ? -0.2 : 0.04, 0);
  }, [isFemale, camera]);
  return null;
}

function VRMHead({
  speechLevel,
  trackingRef,
  cursorRef,
  scale,
  vrmUrl,
  isFemale,
  isActive,
}: {
  speechLevel: number;
  trackingRef: React.RefObject<TrackingData>;
  cursorRef: React.RefObject<THREE.Vector2>;
  scale: number;
  vrmUrl: string;
  isFemale: boolean;
  isActive: boolean;
}) {
  const rootRef = useRef<THREE.Group>(null);
  const vrmRef = useRef<VRM | null>(null);

  const face = useVRMFace({
    vrmRef,
    trackingRef,
    emotionMode: 'neutral',
    behaviorMode: 'neutral',
    speechLevel
  });

  const pose = useVRMPose({
    vrmRef,
    trackingRef,
    cursorRef,
    emotionMode: 'neutral',
    behaviorMode: 'neutral',
    isNodding: false,
    isShaking: false,
    isFemale,
    onNodEnd: () => { },
    onShakeEnd: () => { }
  });

  useEffect(() => {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      vrmUrl,
      (gltf) => {
        const vrm = gltf.userData.vrm as VRM | undefined;
        if (!vrm || !rootRef.current) return;

        if (pose.jitterObj.current) {
          vrm.lookAt.target = pose.jitterObj.current;
        }

        rootRef.current.add(vrm.scene);
        vrmRef.current = vrm;
      },
      undefined,
      (err) => {
        console.error('Failed to load VRM', err);
      }
    );

    return () => {
      if (vrmRef.current && rootRef.current) {
        rootRef.current.remove(vrmRef.current.scene);
      }
      vrmRef.current = null;
    };
  }, [vrmUrl]);

  useFrame((state, delta) => {
    if (!isActive) return;
    const vrm = vrmRef.current;
    if (!vrm) return;
    const now = state.clock.elapsedTime;
    const { isSpeaking, headReact, curAa } = face.tick(now, delta);
    pose.tick(delta, now, isSpeaking, headReact, curAa);
    vrm.update(delta);
  });

  return <group ref={rootRef} visible={isActive} position={[0, -1.56, 0]} rotation={[0, isFemale ? Math.PI : 0, 0]} scale={scale} />;
}

interface AvatarLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
}

const AVATAR_LAYOUT_KEY = 'devinterview-avatar-layout-v2';

function getDefaultLayout(): AvatarLayout {
  const width = typeof window !== 'undefined' && window.innerWidth < 640 ? 210 : 320;
  return { x: 0, y: 0, width, height: width, zoom: 1 };
}

function getInitialLayout(): AvatarLayout {
  try {
    const saved = localStorage.getItem(AVATAR_LAYOUT_KEY);
    return saved ? { ...getDefaultLayout(), ...JSON.parse(saved) } : getDefaultLayout();
  } catch {
    return getDefaultLayout();
  }
}

export const AvatarInterviewer = forwardRef<AvatarInterviewerHandle, AvatarInterviewerProps>(
  ({ speechLevel, isLiveConnected, isCameraEnabled, subtitles, agentState, isFemale: isFemaleprop = false, onAvatarChange }, ref) => {
  const tracking = useMediaPipeTracking();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const webcamDotsRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef(new THREE.Vector2(0, 0));
  const [layout, setLayout] = useState<AvatarLayout>(getInitialLayout);
  const isFemale = isFemaleprop;
  const interactionRef = useRef<{
    type: 'drag' | 'resize';
    startX: number;
    startY: number;
    layout: AvatarLayout;
    parentWidth: number;
    parentHeight: number;
  } | null>(null);

  useEffect(() => {
    localStorage.setItem(AVATAR_LAYOUT_KEY, JSON.stringify(layout));
  }, [layout]);

  const beginInteraction = (type: 'drag' | 'resize') => (event: React.PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const parentRect = event.currentTarget.closest('section')?.parentElement?.getBoundingClientRect();
    interactionRef.current = {
      type,
      startX: event.clientX,
      startY: event.clientY,
      layout,
      parentWidth: parentRect?.width ?? window.innerWidth,
      parentHeight: parentRect?.height ?? window.innerHeight,
    };
  };

  const updateInteraction = (event: React.PointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current;
    if (!interaction) return;
    const dx = event.clientX - interaction.startX;
    const dy = event.clientY - interaction.startY;
    if (interaction.type === 'drag') {
      const minX = Math.min(0, interaction.layout.width + 32 - interaction.parentWidth);
      const maxY = Math.max(0, interaction.parentHeight - 64);
      setLayout({
        ...interaction.layout,
        x: THREE.MathUtils.clamp(interaction.layout.x + dx, minX, 0),
        y: THREE.MathUtils.clamp(interaction.layout.y + dy, 0, maxY),
      });
      return;
    }
    setLayout({
      ...interaction.layout,
      width: THREE.MathUtils.clamp(interaction.layout.width + dx, 190, 520),
      height: THREE.MathUtils.clamp(interaction.layout.height + dy, 190, 520),
    });
  };

  const endInteraction = (event: React.PointerEvent<HTMLElement>) => {
    interactionRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const changeZoom = (amount: number) => {
    setLayout((current) => ({
      ...current,
      zoom: THREE.MathUtils.clamp(current.zoom + amount, 0.7, 1.5),
    }));
  };

  const resetLayout = () => setLayout(getDefaultLayout());

  useEffect(() => {
    if (isLiveConnected && isCameraEnabled) {
      tracking.startTracking();
      return () => { tracking.stopTracking(); };
    }
    tracking.stopTracking();
    return undefined;
  }, [isLiveConnected, isCameraEnabled, tracking.startTracking, tracking.stopTracking]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const x = (event.clientX / window.innerWidth) * 2 - 1;
      const y = (event.clientY / window.innerHeight) * 2 - 1;
      cursorRef.current.set(
        THREE.MathUtils.clamp(x, -1, 1),
        THREE.MathUtils.clamp(y, -1, 1),
      );
    };
    const onPointerLeave = () => { cursorRef.current.set(0, 0); };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerleave', onPointerLeave);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    captureWebcamFrame: () => {
      if (!isLiveConnected || !isCameraEnabled) return null;
      const video = tracking.videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return null;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    }
  }));

  useEffect(() => {
    let rafId = 0;
    const drawDots = () => {
      const video = tracking.videoRef.current;
      const dotsCanvas = webcamDotsRef.current;
      if (video && dotsCanvas) {
        const w = dotsCanvas.clientWidth;
        const h = dotsCanvas.clientHeight;
        if (w > 0 && h > 0) {
          if (dotsCanvas.width !== w || dotsCanvas.height !== h) {
            dotsCanvas.width = w;
            dotsCanvas.height = h;
          }
          const ctx = dotsCanvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, w, h);
            const facePoints = tracking.trackingRef.current.facePoints;
            if (facePoints.length > 0) {
              ctx.fillStyle = '#22c55e';
              for (let i = 0; i < facePoints.length; i++) {
                const p = facePoints[i];
                ctx.beginPath();
                ctx.arc(p.x * w, p.y * h, 1.8, 0, Math.PI * 2);
                ctx.fill();
              }
            }
            const handPoints = tracking.trackingRef.current.handPoints;
            if (handPoints.length > 0) {
              ctx.fillStyle = tracking.trackingRef.current.handRaised ? '#facc15' : '#38bdf8';
              for (let i = 0; i < handPoints.length; i++) {
                const hp = handPoints[i];
                ctx.beginPath();
                ctx.arc(hp.x * w, hp.y * h, 2.3, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }
        }
      }
      rafId = requestAnimationFrame(drawDots);
    };
    rafId = requestAnimationFrame(drawDots);
    return () => cancelAnimationFrame(rafId);
  }, [tracking.videoRef, tracking.trackingRef]);

  return (
    <section
      className="pointer-events-auto absolute right-4 top-4 z-20 rounded-lg border border-subtle bg-panel/85 shadow-lg overflow-hidden"
      style={{ width: layout.width, height: layout.height, transform: `translate3d(${layout.x}px, ${layout.y}px, 0)` }}
    >
      <canvas ref={canvasRef} className="hidden" />
      <div
        className="absolute inset-x-0 top-0 z-30 flex h-10 touch-none cursor-move items-center justify-between border-b border-white/15 bg-zinc-900 px-2 text-white shadow-md"
        onPointerDown={beginInteraction('drag')}
        onPointerMove={updateInteraction}
        onPointerUp={endInteraction}
        onPointerCancel={endInteraction}
      >
        <div className="flex items-center gap-2 px-1">
          <GripHorizontal className="h-4 w-4" />
          <span className="text-xs font-semibold">Move interviewer</span>
        </div>
        <div className="flex items-center" onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" className="grid h-8 w-8 place-items-center rounded text-white/80 hover:bg-white/10 hover:text-white" onClick={() => changeZoom(-0.1)}><Minus className="h-4 w-4" /></button>
          <button type="button" className="grid h-8 w-8 place-items-center rounded text-white/80 hover:bg-white/10 hover:text-white" onClick={() => changeZoom(0.1)}><Plus className="h-4 w-4" /></button>
          <button type="button" className="grid h-8 w-8 place-items-center rounded text-white/80 hover:bg-white/10 hover:text-white" onClick={resetLayout}><RotateCcw className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="absolute inset-x-0 z-30 flex border-b border-white/10 bg-zinc-900/90" style={{ top: '40px' }} onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => onAvatarChange?.(false)} className={`flex-1 py-1 text-xs font-semibold transition-colors ${!isFemale ? 'bg-zinc-700 text-white' : 'text-white/50 hover:text-white/80'}`}>♂ Male</button>
        <button type="button" onClick={() => onAvatarChange?.(true)} className={`flex-1 py-1 text-xs font-semibold transition-colors ${isFemale ? 'bg-zinc-700 text-white' : 'text-white/50 hover:text-white/80'}`}>♀ Female</button>
      </div>

      <div className={`absolute bottom-3 right-3 z-20 w-24 overflow-hidden rounded-md border border-white/20 bg-black shadow-lg ${isLiveConnected && isCameraEnabled ? '' : 'hidden'}`}>
        <video ref={tracking.videoRef} playsInline muted className="h-auto w-full" style={{ transform: 'scaleX(-1)' }} />
        <canvas ref={webcamDotsRef} className="pointer-events-none absolute inset-0 h-full w-full" style={{ transform: 'scaleX(-1)' }} />
      </div>

      <div className="absolute inset-x-0 bottom-0 top-16">
        <Canvas camera={{ position: [0, 0.04, 0.98], fov: 32 }} style={{ background: 'transparent' }}>
          <CameraController isFemale={isFemale} />
          <ambientLight intensity={1.05} />
          <directionalLight position={[2, 4, 3]} intensity={1.2} />
          <directionalLight position={[-2, 1.5, -2]} intensity={0.5} color="#b8c4ff" />
          <Suspense fallback={null}>
            <VRMHead
              speechLevel={speechLevel}
              trackingRef={tracking.trackingRef}
              cursorRef={cursorRef}
              scale={layout.zoom}
              vrmUrl="/Anurag.vrm"
              isFemale={false}
              isActive={!isFemale}
            />
            <VRMHead
              speechLevel={speechLevel}
              trackingRef={tracking.trackingRef}
              cursorRef={cursorRef}
              scale={layout.zoom}
              vrmUrl="/zuuzu.vrm"
              isFemale={true}
              isActive={isFemale}
            />
          </Suspense>
        </Canvas>
      </div>

      <div className="absolute bottom-0 right-0 z-30 h-6 w-6 touch-none cursor-se-resize border-b-4 border-r-4 border-zinc-900 bg-white/60" onPointerDown={beginInteraction('resize')} onPointerMove={updateInteraction} onPointerUp={endInteraction} onPointerCancel={endInteraction} />

      {isLiveConnected && agentState && agentState !== 'idle' && (
        <div className="absolute top-20 left-4 bg-panel/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-subtle shadow-sm flex items-center gap-2 animate-in fade-in zoom-in duration-300 z-10">
          {agentState === 'listening' && <Mic className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />}
          {agentState === 'thinking' && <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />}
          {agentState === 'speaking' && <Volume2 className="w-3.5 h-3.5 text-primary animate-pulse" />}
          <span className="text-[10px] font-bold tracking-wider text-secondary uppercase">{agentState}</span>
        </div>
      )}

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] uppercase text-secondary/80 z-10">
        {isLiveConnected ? 'Listening' : 'Interviewer'}
      </div>

    </section>
  );
});

export default AvatarInterviewer;
