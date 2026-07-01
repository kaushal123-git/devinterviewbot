import React, { useRef, useEffect, useMemo, useState } from 'react';
import CodeEditor, { type CodeEditorHandle } from '@/components/CodeEditor';
import ChatPanel from '@/components/ChatPanel';
import LiveControls from '@/components/LiveControls';
import AvatarInterviewer, { type AvatarInterviewerHandle } from '@/components/AvatarInterviewer';
import { useTheme } from '@/hooks/useTheme';
import { useLiveInterview } from '@/hooks/useLiveInterview';
import { useInterviewSession } from '@/hooks/useInterviewSession';
import { RefreshCw, User, LogOut, Trophy, ChevronDown, Sparkles, Zap } from 'lucide-react';
import { PROBLEMS } from '@/constants';
import DashboardView from '@/components/DashboardView';
import LoginModal from '@/components/LoginModal';

const API_KEY = (import.meta as any).env.VITE_API_KEY || '';

const getApiBase = () => {
  const host = window.location.hostname;
  const ip = host === 'localhost' ? '127.0.0.1' : host;
  return `http://${ip}:3002`;
};

/**
 * Root application component.
 * Composes the code editor, chat transcript, and live interview controls
 * into a single-page interview workspace.
 */
const App: React.FC = () => {
  const editorRef = useRef<CodeEditorHandle>(null);
  const avatarRef = useRef<AvatarInterviewerHandle>(null);
  const { theme, toggleTheme } = useTheme();
  const [isFemale, setIsFemale] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'practice'>('dashboard');
  
  // Authentication states
  const [user, setUser] = useState<any | null>(null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  const session = useInterviewSession({ apiKey: API_KEY });

  const live = useLiveInterview({
    apiKey: API_KEY,
    currentProblem: session.currentProblem,
    language: session.language,
    code: session.code,
    isFemale,
    editorRef,
    avatarRef,
    setMessages: session.setMessages,
    onUpdateContext: (lang, title, desc, code) => {
      session.setDynamicProblem(lang, title, desc, code);
    },
    onTypeCode: (newCode) => {
      session.typeCodeEffect(newCode);
    }
  });

  // Wire live refs into session for message routing (effect, not render-phase)
  useEffect(() => {
    session.setLiveRefs(live.isLiveConnected, live.liveServiceRef, live.noteUserTurnStarted);
  }, [live.isLiveConnected, live.liveServiceRef, live.noteUserTurnStarted, session.setLiveRefs]);

  // Synchronise page theme class based on activeTab
  useEffect(() => {
    const doc = document.documentElement;
    if (activeTab === 'dashboard') {
      doc.classList.add('light');
    } else {
      if (theme === 'light') {
        doc.classList.add('light');
      } else {
        doc.classList.remove('light');
      }
    }
  }, [activeTab, theme]);

  // Load user session on mount
  useEffect(() => {
    const sessionToken = localStorage.getItem('devinterview-session-token');
    if (sessionToken) {
      fetch(`${getApiBase()}/api/auth/validate-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionToken })
      })
        .then(res => {
          if (!res.ok) throw new Error('Session invalid');
          return res.json();
        })
        .then(data => {
          if (data.success && data.user) {
            setUser(data.user);
          }
        })
        .catch(err => {
          console.warn('[App] Could not restore user session:', err);
          localStorage.removeItem('devinterview-session-token');
        });
    }
  }, []);

  // Fetch saved solution on problem/language switch
  useEffect(() => {
    if (user?.email) {
      fetch(`${getApiBase()}/api/user/load-state?email=${encodeURIComponent(user.email)}&problemId=${session.currentProblem.id}&language=${session.language}`)
        .then(res => res.json())
        .then(data => {
          if (data.code) {
            session.setCode(data.code);
          } else {
            // Restore starter template if no saved code
            const starter = session.currentProblem.starters[session.language];
            if (starter) {
              session.setCode(starter);
            }
          }
        })
        .catch(err => console.warn('[App] Failed to load saved code:', err));
    }
  }, [user?.email, session.currentProblem.id, session.language]);

  // Debounced auto-save code to local server
  useEffect(() => {
    if (user?.email && session.code) {
      const saveTimer = setTimeout(() => {
        fetch(`${getApiBase()}/api/user/save-state`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            problemId: session.currentProblem.id,
            language: session.language,
            code: session.code
          })
        }).catch(err => console.warn('[App] Auto-save failed:', err));
      }, 3000);
      return () => clearTimeout(saveTimer);
    }
  }, [session.code, user?.email, session.currentProblem.id, session.language]);

  const handleSolve = async () => {
    if (!user?.email) return;
    try {
      const res = await fetch(`${getApiBase()}/api/user/progress/solve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          problemId: session.currentProblem.id,
          language: session.language
        })
      });
      const data = await res.json();
      if (data.success && data.user) {
        setUser(data.user);
      }
    } catch (err) {
      console.error('[App] Failed to update progress:', err);
    }
  };

  const handleLogout = () => {
    const sessionToken = localStorage.getItem('devinterview-session-token');
    if (sessionToken) {
      fetch(`${getApiBase()}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionToken })
      }).catch(err => console.warn('[App] Logout notify failed:', err));
    }
    localStorage.removeItem('devinterview-session-token');
    setUser(null);
    setActiveTab('dashboard');
  };

  const totalTokens = useMemo(() => ({
    prompt: session.chatTokens.prompt + live.sessionTokens.prompt,
    candidates: session.chatTokens.candidates + live.sessionTokens.candidates,
    total: session.chatTokens.total + live.sessionTokens.total,
  }), [session.chatTokens, live.sessionTokens]);

  return (
    <div className="h-screen w-full flex flex-col bg-app text-primary font-sans overflow-hidden transition-colors duration-300">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        user={user}
        onTriggerLogin={() => setIsLoginOpen(true)}
        onLogout={handleLogout}
        currentProblem={session.currentProblem}
        onRandomProblem={session.handleRandomProblem}
        live={live}
        sessionTokens={totalTokens}
      />

      <div className="flex-1 flex overflow-hidden relative">
        {activeTab === 'dashboard' ? (
          <DashboardView
            user={user}
            onNavigateToPractice={(lang) => {
              if (lang) {
                const validLangs = ['python', 'typescript', 'cpp', 'java', 'c'];
                if (validLangs.includes(lang)) {
                  session.handleLanguageChange(lang as any);
                }
              }
              setActiveTab('practice');
            }}
            onTriggerLogin={() => setIsLoginOpen(true)}
            isFemale={isFemale}
            onAvatarChange={setIsFemale}
          />
        ) : (
          <main className="flex-1 flex overflow-hidden w-full">
            <div className="flex-1 flex flex-col relative min-w-0">
              <AvatarInterviewer
                ref={avatarRef}
                speechLevel={live.speechLevel}
                isLiveConnected={live.isLiveConnected}
                isCameraEnabled={live.isCameraEnabled}
                subtitles={live.subtitles}
                agentState={live.agentState}
                isFemale={isFemale}
                onAvatarChange={setIsFemale}
              />
              <DescriptionBanner description={session.currentProblem.description} />
              <div className="flex-1 min-h-0 relative">
                <CodeEditor
                  ref={editorRef}
                  code={session.code}
                  onChange={session.setCode}
                  language={session.language}
                  onLanguageChange={session.handleLanguageChange}
                  theme={theme}
                  onThemeToggle={toggleTheme}
                  onSubmitCode={user ? handleSolve : undefined}
                />
              </div>
            </div>

            <div className="w-[400px] xl:w-[450px] flex-shrink-0 flex flex-col border-l border-subtle bg-panel z-10 shadow-2xl shadow-black/5 transition-colors duration-300">
              <ChatPanel
                messages={session.messages}
                onSendMessage={session.handleSendMessage}
                isLoading={session.isLoadingChat}
              />
            </div>
          </main>
        )}
      </div>

      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onLoginSuccess={(userData, token) => {
          setUser(userData);
          localStorage.setItem('devinterview-session-token', token);
        }}
      />
    </div>
  );
};

export default App;

// --- Sub-components extracted from the layout ---

interface HeaderProps {
  activeTab: 'dashboard' | 'practice';
  onTabChange: (tab: 'dashboard' | 'practice') => void;
  user: any;
  onTriggerLogin: () => void;
  onLogout: () => void;
  currentProblem: { title: string; difficulty: 'Easy' | 'Medium' | 'Hard' };
  onRandomProblem: () => void;
  sessionTokens: { prompt: number; candidates: number; total: number };
  live: {
    isLiveConnected: boolean;
    isConnectingLive: boolean;
    volume: number;
    isMicMuted: boolean;
    isCameraEnabled: boolean;
    sessionTokens: { prompt: number; candidates: number; total: number };
    toggleMic: () => void;
    toggleCamera: () => void;
    handleConnectLive: () => void;
    handleDisconnectLive: () => void;
  };
}

function Header({ 
  activeTab, 
  onTabChange, 
  user, 
  onTriggerLogin, 
  onLogout,
  currentProblem, 
  onRandomProblem, 
  live, 
  sessionTokens 
}: HeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const difficultyClass =
    currentProblem.difficulty === 'Easy'
      ? 'border-emerald-900/50 text-emerald-500'
      : currentProblem.difficulty === 'Medium'
        ? 'border-amber-900/50 text-amber-500'
        : 'border-rose-900/50 text-rose-500';

  const userInitial = user?.email ? user.email.charAt(0).toUpperCase() : 'K';

  const isDash = activeTab === 'dashboard';
  const headerBg = isDash 
    ? 'bg-[#EEF2FF]/60 border-[#ECE9F8]/20 text-[#1E1B4B]' 
    : 'bg-app border-subtle text-primary';
  const logoColor = 'text-[#6366F1]';
  const nameColor = isDash ? 'text-[#1E1B4B]' : 'text-primary';
  const separatorColor = isDash ? 'bg-indigo-200' : 'bg-subtle';

  return (
    <header className={`relative h-16 border-b flex items-center justify-between px-6 shrink-0 z-50 transition-all duration-300 ${headerBg}`}>
      <div className="flex items-center gap-4 h-full">
        
        {/* Logo matching mockup */}
        <div className="flex items-center gap-2">
          <svg className={`w-6 h-6 ${logoColor}`} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2a1 1 0 0 1 1 1v1.07A7.002 7.002 0 0 1 19 11v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-8a7.002 7.002 0 0 1 6-6.93V3a1 1 0 0 1 1-1zm6 9H6v8h12v-8zm-9 2a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z" />
          </svg>
          <span className={`font-black tracking-tight text-sm ${nameColor}`}>DevInterviewBot</span>
        </div>

        {/* Tab Selection matching mockup */}
        <nav className="flex items-center gap-6 ml-6 h-full select-none">
          {[
            { id: 'dashboard', name: 'Dashboard' },
            { id: 'practice', name: 'Practice' },
            { id: 'mock-interviews', name: 'Mock Interviews', disabled: true },
            { id: 'bookmarks', name: 'Bookmarks', disabled: true }
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  if (tab.disabled) {
                    alert(`${tab.name} is preparing for the next beta release!`);
                  } else {
                    onTabChange(tab.id as 'dashboard' | 'practice');
                  }
                }}
                className={`relative px-1 text-xs font-bold transition-all h-full flex items-center ${
                  isActive 
                    ? (isDash ? 'text-[#6366F1]' : 'text-primary') 
                    : 'text-zinc-500 hover:text-[#6366F1]'
                }`}
              >
                <span>{tab.name}</span>
                {isActive && (
                  <span className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-[#6366F1] rounded-t animate-in fade-in duration-300" />
                )}
              </button>
            );
          })}
        </nav>

        {activeTab === 'practice' && (
          <>
            <div className={`h-4 w-px ${separatorColor} mx-1`} />
            <div className="flex items-center gap-3 animate-in fade-in slide-in-from-left-2 duration-300">
              <span className="text-sm font-medium text-primary">{currentProblem.title}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${difficultyClass} uppercase tracking-wider`}>
                {currentProblem.difficulty}
              </span>
              <button onClick={onRandomProblem} className="p-1.5 text-secondary hover:text-primary transition-colors" title="Next Problem">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}
      </div>

      {activeTab === 'practice' && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <LiveControls 
            isConnected={live.isLiveConnected}
            isConnecting={live.isConnectingLive}
            onConnect={live.handleConnectLive}
            onDisconnect={live.handleDisconnectLive}
            volume={live.volume}
            isMicMuted={live.isMicMuted}
            onToggleMic={live.toggleMic}
            isCameraEnabled={live.isCameraEnabled}
            onToggleCamera={live.toggleCamera}
            sessionTokens={sessionTokens}
          />
        </div>
      )}

      {/* Right: Auth Profile controls */}
      <div className="flex items-center gap-4">
        {/* XP Badge matching mockup */}
        <div className="flex items-center gap-1.5 text-[#6366F1] font-black text-xs">
          <Zap className="w-3.5 h-3.5 fill-current animate-pulse text-[#6366F1]" />
          <span>{user ? user.xp : 120} XP</span>
        </div>

        <div className={`w-px h-4 ${separatorColor}`} />

        <div className="relative" ref={dropdownRef}>
          {user ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="w-8 h-8 rounded-full bg-[#6366F1] text-white flex items-center justify-center text-xs font-black shadow-md hover:opacity-90 transition-all"
              >
                {userInitial}
              </button>
              <button 
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="text-secondary hover:text-primary transition-colors"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={onTriggerLogin}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all active:scale-[0.98] ${
                isDash
                  ? 'bg-white hover:bg-zinc-50 border border-zinc-200 text-[#1E1B4B] shadow-sm'
                  : 'bg-zinc-800 hover:bg-zinc-700 border border-subtle text-primary'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Login</span>
            </button>
          )}

          {dropdownOpen && user && (
            <div className="absolute right-0 mt-2 w-48 p-2 bg-panel border border-subtle rounded-xl shadow-2xl flex flex-col gap-1.5 z-[99] animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="px-2 py-1.5 border-b border-subtle select-none text-left">
                <span className="block text-[9px] text-secondary font-bold uppercase tracking-wider">Session Profile</span>
                <span className="block text-xs font-semibold text-primary truncate mt-0.5">{user.email}</span>
              </div>
              <div className="px-2 py-1 flex items-center justify-between text-xs text-secondary select-none">
                <span className="flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5 text-amber-500" />
                  <span>XP Gained</span>
                </span>
                <span className="font-bold text-primary font-mono">{user.xp} XP</span>
              </div>
              <button
                onClick={() => { setDropdownOpen(false); onLogout(); }}
                className="w-full py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function DescriptionBanner({ description }: { description: string }) {
  return (
    <div className="px-8 py-6 border-b border-subtle bg-app transition-colors duration-300">
      <p className="text-sm text-secondary leading-relaxed max-w-3xl">{description}</p>
    </div>
  );
}
