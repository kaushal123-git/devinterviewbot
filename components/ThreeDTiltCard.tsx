import React, { useState, useRef } from 'react';

interface ThreeDTiltCardProps {
  children: React.ReactNode;
  maxTilt?: number; // max tilt in degrees, default 12
  className?: string;
}

export default function ThreeDTiltCard({ children, maxTilt = 12, className = '' }: ThreeDTiltCardProps) {
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);
  const [glarePosition, setGlarePosition] = useState({ x: 50, y: 50 });
  const [shadowOffset, setShadowOffset] = useState({ x: 0, y: 10 });
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const card = cardRef.current;
    const rect = card.getBoundingClientRect();
    
    // Calculate cursor position relative to the card
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const width = rect.width;
    const height = rect.height;
    
    // Normalize coordinates around center: -0.5 to 0.5
    const relativeX = (x / width) - 0.5;
    const relativeY = (y / height) - 0.5;
    
    // Y-rotation corresponds to horizontal movement, X-rotation corresponds to vertical movement
    const nextRotateY = relativeX * maxTilt * 2.2;
    const nextRotateX = -relativeY * maxTilt * 2.2;
    
    setRotateX(nextRotateX);
    setRotateY(nextRotateY);
    setGlarePosition({
      x: (x / width) * 100,
      y: (y / height) * 100,
    });
    
    // Dynamic opposite-direction shadow offset for depth
    setShadowOffset({
      x: -relativeX * 28,
      y: -relativeY * 28,
    });
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setRotateX(0);
    setRotateY(0);
    setShadowOffset({ x: 0, y: 10 });
  };

  const cardStyle: React.CSSProperties = {
    transform: isHovered
      ? `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.04, 1.04, 1.04)`
      : 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)',
    boxShadow: isHovered
      ? `${shadowOffset.x}px ${shadowOffset.y + 24}px 50px rgba(99, 102, 241, 0.18)`
      : '0 12px 40px rgba(99, 102, 241, 0.04)',
    transition: isHovered ? 'transform 0.08s ease-out, box-shadow 0.08s ease-out' : 'transform 0.6s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.6s cubic-bezier(0.25, 1, 0.5, 1)',
    transformStyle: 'preserve-3d',
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={cardStyle}
      className={`relative overflow-visible rounded-[28px] ${className}`}
    >
      {/* Specular Sheen (glare) effect */}
      <div
        className="absolute inset-0 pointer-events-none z-30 transition-opacity duration-300 mix-blend-overlay rounded-[28px] overflow-hidden"
        style={{
          opacity: isHovered ? 0.55 : 0,
          background: `radial-gradient(circle at ${glarePosition.x}% ${glarePosition.y}%, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0) 65%)`,
        }}
      />
      
      {/* 3D Border Glow reflection */}
      <div 
        className="absolute inset-0 pointer-events-none z-20 rounded-[28px] border transition-colors duration-300"
        style={{
          borderColor: isHovered ? 'rgba(255, 255, 255, 0.65)' : 'rgba(255, 255, 255, 0.1)',
        }}
      />

      {/* Preserve-3D wrapper to enable child translateZ parallax */}
      <div style={{ transform: 'translateZ(20px)', transformStyle: 'preserve-3d' }} className="h-full w-full rounded-[28px]">
        {children}
      </div>
    </div>
  );
}
