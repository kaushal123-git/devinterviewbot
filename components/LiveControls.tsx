import React from 'react';
import { Mic, MicOff, Activity, X, Square } from 'lucide-react';

interface LiveControlsProps {
  isConnected: boolean;
  isConnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  volume: number; // 0-1
  isMicMuted: boolean;
  onToggleMic: () => void;
  isCameraEnabled: boolean;
  onToggleCamera: () => void;
  sessionTokens?: { prompt: number; candidates: number; total: number };
}

const LiveControls: React.FC<LiveControlsProps> = ({ 
  isConnected, 
  isConnecting, 
  onConnect, 
  onDisconnect,
  volume,
  isMicMuted,
  onToggleMic,
  isCameraEnabled,
  onToggleCamera,
  sessionTokens
}) => {
  // Rough estimate based on a mixed audio/text average of $0.30 per 1M tokens.
  const roughCostDollars = sessionTokens ? (sessionTokens.total / 1_000_000 * 0.30).toFixed(4) : "0.0000";

  if (isConnected) {
    return (
      <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-4 px-5 py-2 bg-panel border border-subtle rounded-full shadow-lg animate-in fade-in zoom-in duration-300">
        {/* Audio Visualizer */}
        <div className="flex items-center gap-0.5 h-5 w-24">
          {Array.from({ length: 12 }).map((_, i) => {
              const activeHeight = Math.max(15, Math.min(100, volume * 100 * (1.5 + Math.sin(i * 0.5))));
              return (
                  <div 
                      key={i} 
                      className="w-1 rounded-full bg-primary transition-all duration-75 ease-out"
                      style={{ height: `${activeHeight}%`, opacity: 0.8 }}
                  />
              );
          })}
        </div>
        
        <div className="w-px h-4 bg-subtle"></div>

        <button
            onClick={onToggleMic}
            className={`p-2 rounded-full transition-colors ${isMicMuted ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20' : 'hover:bg-subtle/50 text-secondary hover:text-primary'}`}
            title={isMicMuted ? "Unmute Microphone" : "Mute Microphone"}
          >
            {isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
          
          <button
            onClick={onToggleCamera}
            className={`p-2 rounded-full transition-colors ${!isCameraEnabled ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20' : 'hover:bg-subtle/50 text-secondary hover:text-primary'}`}
            title={isCameraEnabled ? "Disable Camera" : "Enable Camera"}
          >
            {isCameraEnabled ? 
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg> 
              : 
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2.3 3H21a2 2 0 0 1 2 2v7m-1.44 3.94A2 2 0 0 1 21 21Z"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            }
          </button>

          <div className="w-px h-6 bg-subtle mx-1" />

        <button
          onClick={onDisconnect}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all"
          title="End Interview"
        >
          <Square className="w-3 h-3 fill-current" />
        </button>
      </div>
      {sessionTokens && (
        <div className="text-[10px] text-secondary/60 bg-panel/50 px-2 py-0.5 rounded-full border border-subtle backdrop-blur-sm shadow-sm flex gap-3 mr-2">
          <span><span className="font-medium text-primary/70">{sessionTokens.total.toLocaleString()}</span> tokens</span>
          <span>~<span className="font-medium text-primary/70">${roughCostDollars}</span></span>
        </div>
      )}
      </div>
    );
  }

  return (
    <button
      onClick={onConnect}
      disabled={isConnecting}
      className={`
        group relative flex items-center gap-2 px-4 py-2 rounded-full 
        font-medium text-sm tracking-wide transition-all duration-300
        ${isConnecting 
            ? 'bg-panel border border-subtle text-secondary cursor-wait' 
            : 'bg-primary text-app hover:scale-105 shadow-lg shadow-primary/10'
        }
      `}
      title="Connect AI Companion"
    >
      {isConnecting ? (
        <>
           <Activity className="w-4 h-4 animate-spin" />
           <span>Connecting...</span>
        </>
      ) : (
        <>
           <Mic className="w-4 h-4" />
           <span>Connect Voice</span>
        </>
      )}
    </button>
  );
};

export default LiveControls;
