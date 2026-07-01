import React, { useEffect, useRef } from 'react';

export default function InteractiveBackground2D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const starCount = 180;
    const stars: Array<{
      x: number;
      y: number;
      z: number;
      px: number;
      py: number;
    }> = [];

    // Initialize stars with radial distribution and Z depth
    for (let i = 0; i < starCount; i++) {
      stars.push({
        x: (Math.random() - 0.5) * width,
        y: (Math.random() - 0.5) * height,
        z: Math.random() * width,
        px: 0,
        py: 0,
      });
    }

    let mouseX = 0;
    let mouseY = 0;
    let targetWarp = 1.0;
    let currentWarp = 1.0;

    const handleMouseMove = (e: MouseEvent) => {
      // Scale coordinates relative to screen center
      mouseX = (e.clientX - width / 2) * 0.35;
      mouseY = (e.clientY - height / 2) * 0.35;
    };

    const handleWindowClick = () => {
      targetWarp = 14.0; // Instantly enter hyperdrive
    };

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('click', handleWindowClick);
    window.addEventListener('resize', handleResize);

    const draw = () => {
      // Clear canvas on each tick
      ctx.clearRect(0, 0, width, height);

      // Smoothly interpolate warp speed damping
      currentWarp += (targetWarp - currentWarp) * 0.08;
      if (targetWarp > 1.0) targetWarp -= 0.35;
      if (targetWarp < 1.0) targetWarp = 1.0;

      const speed = currentWarp * 1.6;

      ctx.strokeStyle = 'rgba(99, 102, 241, 0.22)'; // Soft neon indigo star lines
      ctx.lineWidth = 1.25;

      for (let i = 0; i < starCount; i++) {
        const star = stars[i];
        const px = star.px;
        const py = star.py;

        // Move star closer
        star.z -= speed;

        // Reset star to back horizon once it goes past the viewport
        if (star.z <= 0) {
          star.z = width;
          star.x = (Math.random() - 0.5) * width;
          star.y = (Math.random() - 0.5) * height;
          star.px = 0;
          star.py = 0;
          continue;
        }

        // Project 3D coordinate to 2D
        const scale = 130 / star.z;
        const sx = star.x * scale + width / 2 + mouseX * (1 - star.z / width);
        const sy = star.y * scale + height / 2 + mouseY * (1 - star.z / width);

        star.px = sx;
        star.py = sy;

        // Draw star trail line
        if (px !== 0 && py !== 0 && sx > 0 && sx < width && sy > 0 && sy < height) {
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(sx, sy);
          ctx.stroke();
        }
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleWindowClick);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className="absolute inset-0 w-full h-full pointer-events-none z-0" 
      style={{ mixBlendMode: 'screen' }}
    />
  );
}
