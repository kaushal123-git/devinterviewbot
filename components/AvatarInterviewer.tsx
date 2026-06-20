import React, { Suspense, useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react';
import { GripHorizontal, Loader2, Mic, Minus, Plus, RotateCcw, Volume2 } from 'lucide-react';
import { Canvas, useFrame } from '@react-three/fiber';
import { VRMLoaderPlugin, VRMHumanBoneName, type VRM } from '@pixiv/three-vrm';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useVRMFace } from '../hooks/useVRMFace';
import { useVRMPose } from '../hooks/useVRMPose';
import { useMediaPipeTracking, type TrackingData } from '../hooks/useMediaPipeTracking';

/*
  AvatarInterviewer.tsx — annotated

  This file provides a small embedded avatar preview using a VRM model.
  Key concepts and flow:
  - `useMediaPipeTracking` manages webcam + MediaPipe face tracking and exposes
    a `trackingRef` (used by face/pose hooks) and a `videoRef` for capture.
  - `useVRMFace` computes and applies VRM expression blendshapes each frame.
  - `useVRMPose` drives bone rotations (neck, arms, chest) and exposes a
    `jitterObj` used as the VRM lookAt target.
  - `VRMHead` loads the VRM and runs a per-frame loop: face.tick -> pose.tick -> vrm.update
  - The exported component is a `forwardRef` wrapper that exposes `captureWebcamFrame`
    via `useImperativeHandle` so callers can snapshot the webcam from the parent.
*/

interface AvatarInterviewerProps {
  speechLevel: number;
  isLiveConnected: boolean;
  isCameraEnabled: boolean;
  subtitles?: string;
  agentState?: 'idle' | 'listening' | 'thinking' | 'speaking';
}

export interface AvatarInterviewerHandle {
  captureWebcamFrame: () => string | null;
}

function VRMHead({
  speechLevel,
  trackingRef,
  cursorRef,
  scale,
}: {
  speechLevel: number;
  trackingRef: React.RefObject<TrackingData>;
  cursorRef: React.RefObject<THREE.Vector2>;
  scale: number;
}) {
  // `rootRef` is the Three.js group that will receive the VRM scene once loaded.
  const rootRef = useRef<THREE.Group>(null);
  // `vrmRef` holds the loaded VRM instance so the frame loop can update it.
  const vrmRef = useRef<VRM | null>(null);

  // Face hook: handles expressions (visemes, blinks) and exposes a `tick(now, delta)`.
  // We pass `speechLevel` so the face logic can bias lip-sync intensity.
  const face = useVRMFace({
    vrmRef,
    trackingRef,
    emotionMode: 'neutral',
    behaviorMode: 'neutral',
    speechLevel
  });

  // Pose hook: bone rotations and look-at jitter. It exposes `tick(delta, now, ...)`
  // and a `jitterObj` which we assign to `vrm.lookAt.target` after loading.
  const pose = useVRMPose({
    vrmRef,
    trackingRef,
    cursorRef,
    emotionMode: 'neutral',
    behaviorMode: 'neutral',
    isNodding: false,
    isShaking: false,
    onNodEnd: () => { },
    onShakeEnd: () => { }
  });

  useEffect(() => {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      '/Anurag.vrm',
      (gltf) => {
        // The VRM loader attaches the VRM instance to `gltf.userData.vrm`.
        const vrm = gltf.userData.vrm as VRM | undefined;
        if (!vrm || !rootRef.current) return;

        // Wire the lookAt target to the pose jitter object so the head follows it.
        if (pose.jitterObj.current) {
          vrm.lookAt.target = pose.jitterObj.current;
        }

        // Add the VRM scene to our group and keep a reference for updates.
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
  }, []);

  // The per-frame update: compute expressions first, then apply bone pose.
  // Order matters so expressions (jaw open) can influence pose reactions.
  useFrame((state, delta) => {
    const vrm = vrmRef.current;
    if (!vrm) return;
    const now = state.clock.elapsedTime;

    // face.tick returns `isSpeaking`/`headReact` and a smoothed jaw value (`curAa`).
    const { isSpeaking, headReact, curAa } = face.tick(now, delta);
    // Pose uses the jaw value and speaking flags to drive neck/head/arm motion.
    pose.tick(delta, now, isSpeaking, headReact, curAa);

    // Finally, let the VRM internal driver update skeleton/blendshapes.
    vrm.update(delta);
  });

  return <group ref={rootRef} position={[0, -1.56, 0]} scale={scale} />;
}

interface AvatarLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
}

const AVATAR_LAYOUT_KEY = 'devinterview-avatar-layout';

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
  ({ speechLevel, isLiveConnected, isCameraEnabled, subtitles, agentState }, ref) => {
  const tracking = useMediaPipeTracking();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const webcamDotsRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef(new THREE.Vector2(0, 0));
  const [layout, setLayout] = useState<AvatarLayout>(getInitialLayout);
  const interactionRef = useRef<{
    type: 'drag' | 'resize';
    startX: number;
    startY: number;
    layout: AvatarLayout;
  } | null>(null);

  useEffect(() => {
    localStorage.setItem(AVATAR_LAYOUT_KEY, JSON.stringify(layout));
  }, [layout]);

  const beginInteraction = (type: 'drag' | 'resize') => (event: React.PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = {
      type,
      startX: event.clientX,
      startY: event.clientY,
      layout,
    };
  };

  const updateInteraction = (event: React.PointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current;
    if (!interaction) return;

    const dx = event.clientX - interaction.startX;
    const dy = event.clientY - interaction.startY;
    if (interaction.type === 'drag') {
      setLayout({
        ...interaction.layout,
        x: interaction.layout.x + dx,
        y: interaction.layout.y + dy,
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

    const onPointerLeave = () => {
      cursorRef.current.set(0, 0);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerleave', onPointerLeave);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
    };
  }, []);

  // Expose an imperative API so parent components can request a webcam snapshot.
  // `captureWebcamFrame` draws the hidden `<video>` into a `<canvas>` and returns
  // a base64 JPEG payload (without the data: prefix).
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

  // Render a small embedded 3D canvas containing the VRM head. The `tracking.videoRef`
  // and `canvasRef` remain hidden — they are only used for capture and for the
  // tracking pipeline; the visible UI is the 3D Canvas and a small status label.
  return (
    <section
      className="pointer-events-auto absolute right-4 top-4 z-20 rounded-lg border border-subtle bg-panel/85 shadow-lg overflow-hidden"
      style={{
        width: layout.width,
        height: layout.height,
        transform: `translate3d(${layout.x}px, ${layout.y}px, 0)`,
      }}
    >
      {/* Hidden canvas used by MediaPipe and capture API */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Webcam preview with landmark dots so user can see live tracking */}
      <div className="absolute bottom-3 right-3 z-20 w-24 rounded-md border border-white/20 bg-black shadow-lg overflow-hidden">
        <video
          ref={tracking.videoRef}
          playsInline
          muted
          className="w-full h-auto"
          style={{ transform: 'scaleX(-1)' }}
        />
        <canvas
          ref={webcamDotsRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ transform: 'scaleX(-1)' }}
        />
        {(!isLiveConnected || !isCameraEnabled) && (
          <div className="absolute inset-0 grid place-items-center bg-black/80 px-3 text-center">
            <p className="text-xs text-white/70">
              {isLiveConnected ? 'Camera off' : 'Camera idle'}
            </p>
          </div>
        )}
      </div>

      <Canvas camera={{ position: [0, 0.04, 0.98], fov: 32 }} style={{ background: 'transparent' }}>
        <ambientLight intensity={1.05} />
        <directionalLight position={[2, 4, 3]} intensity={1.2} />
        <directionalLight position={[-2, 1.5, -2]} intensity={0.5} color="#b8c4ff" />
        <Suspense fallback={null}>
          {/* VRMHead contains the VRM load + per-frame face/pose ticks */}
          <VRMHead
            speechLevel={speechLevel}
            trackingRef={tracking.trackingRef}
            cursorRef={cursorRef}
            scale={layout.zoom}
          />
        </Suspense>
      </Canvas>

      <div
        className="absolute left-1/2 top-1 z-30 flex h-7 -translate-x-1/2 touch-none cursor-move items-center gap-0.5 rounded-md border border-subtle bg-panel/90 px-1 shadow-sm backdrop-blur-md"
        onPointerDown={beginInteraction('drag')}
        onPointerMove={updateInteraction}
        onPointerUp={endInteraction}
        onPointerCancel={endInteraction}
        title="Drag interviewer"
      >
        <GripHorizontal className="h-4 w-4 text-secondary" />
      </div>

      <div className="absolute right-2 top-2 z-30 flex items-center rounded-md border border-subtle bg-panel/90 p-0.5 shadow-sm backdrop-blur-md">
        <button type="button" className="grid h-7 w-7 place-items-center text-secondary hover:text-primary" onClick={() => changeZoom(-0.1)} title="Zoom out">
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button type="button" className="grid h-7 w-7 place-items-center text-secondary hover:text-primary" onClick={() => changeZoom(0.1)} title="Zoom in">
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button type="button" className="grid h-7 w-7 place-items-center text-secondary hover:text-primary" onClick={resetLayout} title="Reset position and size">
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      <div
        className="absolute bottom-0 right-0 z-30 h-5 w-5 touch-none cursor-se-resize border-b-2 border-r-2 border-secondary/60"
        onPointerDown={beginInteraction('resize')}
        onPointerMove={updateInteraction}
        onPointerUp={endInteraction}
        onPointerCancel={endInteraction}
        title="Resize interviewer"
      />

      {/* Agent State Badge */}
      {isLiveConnected && agentState && agentState !== 'idle' && (
        <div className="absolute top-4 left-4 bg-panel/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-subtle shadow-sm flex items-center gap-2 animate-in fade-in zoom-in duration-300 z-10">
          {agentState === 'listening' && <Mic className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />}
          {agentState === 'thinking' && <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />}
          {agentState === 'speaking' && <Volume2 className="w-3.5 h-3.5 text-primary animate-pulse" />}
          <span className="text-[10px] font-bold tracking-wider text-secondary uppercase">
            {agentState}
          </span>
        </div>
      )}

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] uppercase text-secondary/80 z-10">
        {isLiveConnected ? 'Listening' : 'Interviewer'}
      </div>

      {subtitles && (
        <div className="absolute bottom-6 left-0 right-0 px-4 flex justify-center pointer-events-none z-10">
          <div className="bg-black/70 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 shadow-xl max-w-full">
            <p className="text-white text-[11px] font-medium text-center leading-snug drop-shadow-md">
              {subtitles}
            </p>
          </div>
        </div>
      )}
    </section>
  );
});

export default AvatarInterviewer;
