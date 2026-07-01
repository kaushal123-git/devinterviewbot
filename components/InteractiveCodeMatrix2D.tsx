import React, { useEffect, useRef } from 'react';

const CODE_TOKENS = [
  '{ }', '[ ]', '( )', '< />', '=>', '++', '&&', '||', '!', '?',
  'py', 'ts', 'cpp', 'java', 'c', '0', '1', 'fn', 'let', 'const',
  'if', 'else', 'for', 'while', 'return', 'async', 'await', 'import',
  'class', 'interface', 'struct', 'func', 'def', 'stack', 'queue',
  'tree', 'graph', 'node', 'map', 'set', 'true', 'false', 'null', 'void'
];

const COLORS = [
  'rgba(99, 102, 241, 0.45)', // Neon Indigo
  'rgba(217, 70, 239, 0.45)', // Neon Pink
  'rgba(56, 189, 248, 0.45)', // Neon Sky Blue
];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  text: string;
  size: number;
  color: string;
  angle: number;
  spin: number;
}

export default function InteractiveCodeMatrix2D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const particles: Particle[] = [];
    const particleCount = 75;

    // Initialize particles spread across canvas
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.7,
        vy: (Math.random() - 0.5) * 0.7,
        text: CODE_TOKENS[Math.floor(Math.random() * CODE_TOKENS.length)],
        size: Math.floor(Math.random() * 8) + 11, // 11px to 18px font sizes
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.015,
      });
    }

    let mouseX = -9999;
    let mouseY = -9999;

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    const handleMouseLeave = () => {
      mouseX = -9999;
      mouseY = -9999;
    };

    const handleWindowClick = (e: MouseEvent) => {
      const clickX = e.clientX;
      const clickY = e.clientY;

      // Trigger outward shockwave burst from click origin
      particles.forEach((p) => {
        const dx = p.x - clickX;
        const dy = p.y - clickY;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;

        if (dist < 320) {
          const force = (320 - dist) * 0.045;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
        }
      });
    };

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('click', handleWindowClick);
    window.addEventListener('resize', handleResize);

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      // 1. Update positions and draw node particles
      particles.forEach((p) => {
        // Base drift speed
        p.x += p.vx;
        p.y += p.vy;
        p.angle += p.spin;

        // Friction damping to cap speeds
        p.vx *= 0.97;
        p.vy *= 0.97;

        // Apply gentle floating drift velocity
        p.vx += (Math.random() - 0.5) * 0.02;
        p.vy += (Math.random() - 0.5) * 0.02;

        // Cursor attraction gravity
        if (mouseX !== -9999 && mouseY !== -9999) {
          const dx = mouseX - p.x;
          const dy = mouseY - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;

          if (dist < 180) {
            // Attract towards mouse
            const force = (180 - dist) * 0.0003;
            p.vx += dx * force;
            p.vy += dy * force;

            // Subtle push away if too close to avoid cluttering cursor
            if (dist < 40) {
              p.vx -= dx * 0.015;
              p.vy -= dy * 0.015;
            }
          }
        }

        // Screen boundary checking
        if (p.x < 0) { p.x = 0; p.vx *= -1; }
        if (p.x > width) { p.x = width; p.vx *= -1; }
        if (p.y < 0) { p.y = 0; p.vy *= -1; }
        if (p.y > height) { p.y = height; p.vy *= -1; }

        // Draw particle text
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.font = `bold ${p.size}px 'JetBrains Mono', 'Courier New', monospace`;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 4; // glowing neon text look
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.text, 0, 0);
        ctx.restore();
      });

      // 2. Draw connecting mesh constellation grid lines
      ctx.lineWidth = 0.75;
      
      for (let i = 0; i < particleCount; i++) {
        const p1 = particles[i];

        // Draw connecting lines to nearby particles
        for (let j = i + 1; j < particleCount; j++) {
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 110) {
            const alpha = (1 - dist / 110) * 0.16;
            ctx.strokeStyle = `rgba(99, 102, 241, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }

        // Draw connection lines to the mouse cursor
        if (mouseX !== -9999 && mouseY !== -9999) {
          const mdx = p1.x - mouseX;
          const mdy = p1.y - mouseY;
          const mdist = Math.sqrt(mdx * mdx + mdy * mdy);

          if (mdist < 160) {
            const alpha = (1 - mdist / 160) * 0.28;
            ctx.strokeStyle = `rgba(217, 70, 239, ${alpha})`; // Glowing Pink trail to cursor
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(mouseX, mouseY);
            ctx.stroke();
          }
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('click', handleWindowClick);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className="absolute inset-0 w-full h-full pointer-events-none z-0"
    />
  );
}
