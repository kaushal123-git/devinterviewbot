import React, { useEffect, useState } from 'react';
import { Award, Code, Play, CheckCircle2, Calendar, Target, BarChart2, Trophy } from 'lucide-react';
import Robot3D from './Robot3D';

interface Activity {
  id: string;
  type: 'solve' | 'achievement';
  title: string;
  detail: string;
  timestamp: number;
}

interface UserProgress {
  email: string;
  xp: number;
  problemsSolved: number;
  mockInterviews: number;
  successRate: number;
  languages: {
    python: number;
    typescript: number;
    c: number;
    cpp: number;
    java: number;
  };
  activities: Activity[];
}

interface DashboardViewProps {
  user: UserProgress | null;
  onNavigateToPractice: (language?: string) => void;
  onTriggerLogin: () => void;
  isFemale: boolean;
  onAvatarChange: (isFemale: boolean) => void;
}

// Hook to animate numbers counting up on load
function useCountUp(target: number, duration: number = 800) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = target;
    if (start === end) {
      setCount(end);
      return;
    }

    const totalMiliseconds = duration;
    const incrementTime = Math.max(Math.floor(totalMiliseconds / Math.max(end, 1)), 15);
    
    const timer = setInterval(() => {
      start += Math.ceil(end / (totalMiliseconds / incrementTime));
      if (start >= end) {
        clearInterval(timer);
        setCount(end);
      } else {
        setCount(start);
      }
    }, incrementTime);

    return () => clearInterval(timer);
  }, [target, duration]);

  return count;
}

// Custom Language SVGs exactly like the branding
const PythonIcon = () => (
  <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12.12 2c-2.48 0-4.66 1.8-4.82 4.28V7.5h4.94c.91 0 1.65.74 1.65 1.65v4.94h1.39A4.86 4.86 0 0 0 20.14 9.5V7.12A5.12 5.12 0 0 0 15 2h-2.88z" fill="#3776AB" />
    <path d="M11.88 22c2.48 0 4.66-1.8 4.82-4.28v-1.22h-4.94a1.65 1.65 0 0 1-1.65-1.65v-4.94H8.72A4.86 4.86 0 0 0 3.86 14.5v2.38A5.12 5.12 0 0 0 9 22h2.88z" fill="#FFD43B" />
    <circle cx="9.5" cy="5.5" r="0.75" fill="#FFFFFF" />
    <circle cx="14.5" cy="18.5" r="0.75" fill="#1E1B4B" />
  </svg>
);

const TypeScriptIcon = () => (
  <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="24" rx="4" fill="#3178C6" />
    <path d="M11.5 17h-1.8v-6.5H7.5v-1.5h6.2v1.5h-2.2V17zm7.2-2.3c0 .6-.2 1.1-.6 1.5-.4.4-1 .6-1.7.6-.8 0-1.4-.2-1.8-.7-.4-.4-.6-1-.6-1.6h1.7c0 .3.1.5.2.7.1.1.3.2.6.2.2 0 .4-.1.5-.2.1-.1.2-.2.2-.4s0-.3-.2-.4c-.1-.1-.3-.2-.7-.3l-.7-.2c-.6-.1-1-.4-1.3-.7-.3-.3-.4-.7-.4-1.2s.2-1 .6-1.4c.4-.4 1-.6 1.7-.6.7 0 1.2.2 1.6.6.4.4.6.9.6 1.4h-1.7c0-.3-.1-.5-.2-.6-.1-.1-.3-.2-.5-.2-.2 0-.3.1-.4.2-.1.1-.1.2-.1.3s.1.3.3.4l.6.2c.7.2 1.2.4 1.5.7.3.3.4.7.4 1.2z" fill="white" />
  </svg>
);

const CppIcon = () => (
  <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2l8.5 5v10L12 22l-8.5-5V7L12 2z" fill="#00599C" />
    <path d="M12 2l-8.5 5v10L12 22V2z" fill="white" fillOpacity="0.08" />
    <path d="M12.5 15.8c-2.1 0-3.8-1.7-3.8-3.8s1.7-3.8 3.8-3.8c1.5 0 2.8.9 3.4 2.1l-1.7.9c-.3-.7-.9-1.2-1.7-1.2-1.1 0-2 1-2 2.1s.9 2.1 2 2.1c.8 0 1.4-.5 1.7-1.2h1.7c-.6 1.2-1.9 2.1-3.4 2.1z" fill="white" />
    <path d="M17 10.5h-1v-1h-1v1h-1v1h1v1h1v-1h1v-1z M20 13h-1v-1h-1v1h-1v1h1v1h1v-1h1v-1z" fill="white" />
  </svg>
);

const JavaIcon = () => (
  <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10.9 2c-.3.8-.2 1.6.2 2.4.4.8.9 1.5 1.1 2.4.3 1.1.1 2.3-.5 3.3-.3.6-.9 1.1-1.6 1.4l.6.8c1-.4 1.8-1.2 2.2-2.3.6-1.3.5-2.7 0-4-.4-.8-.9-1.6-1.1-2.4 0-.4.1-.9.3-1.3l-1.2-.2z" fill="#EA2D2E" />
    <path d="M13.6 3.5c-.3.7-.2 1.4.1 2.1.3.7.8 1.3 1 2.1.3 1 .1 2.1-.4 3-.3.5-.8.9-1.4 1.2l.5.7c.9-.4 1.6-1 2-2 .5-1.2.4-2.4.1-3.6-.3-.7-.7-1.4-.9-2.1 0-.4.1-.8.3-1.1l-1.3-.3z" fill="#F89820" />
    <path d="M8.5 4.5c-.2.7-.1 1.4.2 2.1.3.7.8 1.3 1 2.1.3 1 .1 2.1-.4 3-.3.5-.8.9-1.4 1.2l.5.7c.9-.4 1.6-1 2-2 .5-1.2.4-2.4.1-3.6-.3-.7-.7-1.4-.9-2.1 0-.4.1-.8.3-1.1l-1.3-.3z" fill="#EA2D2E" />
    <path d="M6 13c0 1.9 1.8 3.5 4 3.5h4c2.2 0 4-1.6 4-3.5H6z" fill="#0073B7" />
    <path d="M5 11h14v2H5v-2z" fill="#5382A1" />
    <path d="M18 12c1.2 0 2 .8 2 1.8s-.8 1.8-2 1.8v-1c.7 0 1-.3 1-.8s-.3-.8-1-.8v-1z" fill="#5382A1" />
    <path d="M4 17.5c0 1 3.6 1.8 8 1.8s8-.8 8-1.8H4z" fill="#0073B7" />
  </svg>
);

const CIcon = () => (
  <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2l8.5 5v10L12 22l-8.5-5V7L12 2z" fill="#00599C" />
    <path d="M12 2l-8.5 5v10L12 22V2z" fill="white" fillOpacity="0.08" />
    <path d="M12.5 15.8c-2.1 0-3.8-1.7-3.8-3.8s1.7-3.8 3.8-3.8c1.5 0 2.8.9 3.4 2.1l-1.7.9c-.3-.7-.9-1.2-1.7-1.2-1.1 0-2 1-2 2.1s.9 2.1 2 2.1c.8 0 1.4-.5 1.7-1.2h1.7c-.6 1.2-1.9 2.1-3.4 2.1z" fill="white" />
  </svg>
);

export default function DashboardView({ 
  user, 
  onNavigateToPractice, 
  onTriggerLogin,
  isFemale,
  onAvatarChange
}: DashboardViewProps) {
  // STRICTLY use real user data with 0 as guest/new user fallback. No fake placeholder stats.
  const stats = user || {
    email: '',
    xp: 0,
    problemsSolved: 0,
    mockInterviews: 0,
    successRate: 0,
    languages: { python: 0, typescript: 0, c: 0, cpp: 0, java: 0 },
    activities: []
  };

  const animatedXP = useCountUp(stats.xp);
  const animatedSolved = useCountUp(stats.problemsSolved);
  const animatedInterviews = useCountUp(stats.mockInterviews);
  const animatedSuccess = useCountUp(stats.successRate);

  const totalSystemProblems = 45;

  // Extract username for greeting matching the mockup
  const username = stats.email ? stats.email.split('@')[0] : 'Developer';
  const capitalizedUser = username.charAt(0).toUpperCase() + username.slice(1);

  return (
    <div className="flex-1 w-full overflow-y-auto px-8 py-8 bg-gradient-to-tr from-[#ECEEFA] via-[#F4F5FC] to-[#FBF8FD] text-[#1E1B4B] transition-colors duration-300 relative">
      
      {/* Glowing blurred blobs in page background for depth and premium mockup aesthetic */}
      <div className="absolute top-[5%] left-[-8%] w-[400px] h-[400px] bg-gradient-to-br from-[#818CF8]/25 to-[#C084FC]/15 rounded-full blur-[110px] pointer-events-none z-0 animate-pulse duration-[8000ms]" />
      <div className="absolute top-[35%] right-[-8%] w-[450px] h-[450px] bg-gradient-to-tr from-[#F472B6]/20 to-[#38BDF8]/15 rounded-full blur-[130px] pointer-events-none z-0" />
      <div className="absolute bottom-[10%] left-[15%] w-[380px] h-[380px] bg-gradient-to-br from-[#60A5FA]/15 to-[#34D399]/10 rounded-full blur-[100px] pointer-events-none z-0" />
      
      {/* Background wave design overlays matching mockup */}
      <div className="absolute bottom-0 left-0 right-0 h-[450px] overflow-hidden pointer-events-none z-0">
        <svg className="absolute bottom-0 w-full h-full text-indigo-300/10" viewBox="0 0 1440 320" fill="currentColor" preserveAspectRatio="none">
          <path d="M0,192L80,181.3C160,171,320,149,480,165.3C640,181,800,235,960,240C1120,245,1280,203,1360,181.3L1440,160L1440,320L1360,320C1280,320,1120,320,960,320C800,320,640,320,480,320C320,320,160,320,80,320L0,320Z"></path>
        </svg>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-[320px] overflow-hidden pointer-events-none z-0">
        <svg className="absolute bottom-0 w-full h-full text-violet-300/10" viewBox="0 0 1440 320" fill="currentColor" preserveAspectRatio="none">
          <path d="M0,96L120,112C240,128,480,160,720,176C960,192,1200,192,1320,192L1440,192L1440,320L1320,320C1200,320,960,320,720,320C480,320,240,320,120,320L0,320Z"></path>
        </svg>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .glass-card-premium {
          background: rgba(255, 255, 255, 0.45);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.65);
        }
      `}} />

      <div className="max-w-6xl mx-auto flex flex-col gap-8 relative z-10">
        
        {/* Banner Section - Matches Mockup perfectly */}
        <section className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-white/70 via-white/50 to-white/20 border border-white/80 p-10 lg:p-12 flex flex-col md:flex-row justify-start items-start md:items-center min-h-[260px] shadow-[0_20px_50px_rgba(99,102,241,0.06)] gap-12 lg:gap-24 backdrop-blur-xl">
          
          {/* Accent blobs in the banner card */}
          <div className="absolute top-[-30%] right-[-5%] w-[260px] h-[260px] bg-gradient-to-tr from-[#6366F1] to-[#D946EF] rounded-full blur-3xl opacity-20 pointer-events-none" />
          <div className="absolute bottom-[-30%] left-[5%] w-[220px] h-[220px] bg-gradient-to-tr from-[#F472B6] to-[#F59E0B] rounded-full blur-3xl opacity-15 pointer-events-none" />

          <div className="max-w-2xl flex flex-col gap-3 text-left z-10 flex-1">
            {/* User Greeting Tag */}
            <div className="flex items-center gap-1.5 text-indigo-600 bg-indigo-50/80 border border-indigo-100/50 px-3.5 py-1.5 rounded-full w-fit text-xs font-bold shadow-sm select-none mb-2 animate-bounce duration-1000">
              <span>Welcome back, {capitalizedUser}!</span>
              <span>👋</span>
            </div>

            <h1 className="text-4xl lg:text-5xl font-black text-[#1E1B4B] leading-tight font-sans tracking-tight">
              Crack Interviews.<br />Build Your Future.
            </h1>
            
            <p className="text-xs text-[#1E1B4B]/60 leading-relaxed max-w-md mt-2 font-medium">
              AI-powered practice to help you master DSA, System Design, and real-world coding interviews.
            </p>
            
            <button
              onClick={() => onNavigateToPractice()}
              className="mt-6 px-7 py-3.5 bg-gradient-to-r from-[#6366F1] to-[#4F46E5] text-white rounded-2xl text-xs font-bold hover:opacity-95 active:scale-[0.98] transition-all flex items-center gap-3 shadow-lg shadow-indigo-500/25 w-fit group"
            >
              <span>Start Practicing</span>
              <span className="text-white/40">|</span>
              <span className="font-mono text-xs group-hover:translate-x-0.5 transition-transform">&lt;/&gt;</span>
            </button>
          </div>

          {/* Interactive 3D Model on the right */}
          <div className="w-full md:w-[320px] h-[240px] shrink-0 z-10 flex items-center justify-center relative">
            <div className="absolute w-[280px] h-[280px] bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
            <Robot3D />
          </div>
        </section>

        {/* Stats Grid - Glassmorphism, glows & gradients */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          
          {/* Card 1: Problems Solved */}
          <div className="glass-card-premium rounded-[28px] p-6 flex items-center gap-5 shadow-[0_8px_30px_rgb(0,0,0,0.02)] hover:shadow-[0_20px_40px_rgba(99,102,241,0.12)] hover:border-indigo-300/60 hover:scale-[1.03] hover:-translate-y-1 transition-all duration-300 text-left relative overflow-hidden group">
            <div className="absolute right-[-20px] bottom-[-20px] w-24 h-24 bg-indigo-400/8 rounded-full blur-xl pointer-events-none group-hover:bg-indigo-400/12 transition-all" />
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/20 group-hover:scale-110 transition-transform">
              <span className="font-mono text-sm font-bold">&lt;/&gt;</span>
            </div>
            <div className="flex flex-col z-10">
              <span className="text-3xl font-black text-indigo-950 font-mono leading-none">{animatedSolved}</span>
              <span className="text-xs text-indigo-950/50 font-bold mt-1.5 uppercase tracking-wide">Problems Solved</span>
              <span className="text-[10px] text-indigo-600 font-extrabold mt-1">↑ +{stats.problemsSolved} this week</span>
            </div>
          </div>

          {/* Card 2: Mock Interviews */}
          <div className="glass-card-premium rounded-[28px] p-6 flex items-center gap-5 shadow-[0_8px_30px_rgb(0,0,0,0.02)] hover:shadow-[0_20px_40px_rgba(16,185,129,0.12)] hover:border-emerald-300/60 hover:scale-[1.03] hover:-translate-y-1 transition-all duration-300 text-left relative overflow-hidden group">
            <div className="absolute right-[-20px] bottom-[-20px] w-24 h-24 bg-emerald-400/8 rounded-full blur-xl pointer-events-none group-hover:bg-emerald-400/12 transition-all" />
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/20 group-hover:scale-110 transition-transform">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col z-10">
              <span className="text-3xl font-black text-emerald-950 font-mono leading-none">{animatedInterviews}</span>
              <span className="text-xs text-emerald-950/50 font-bold mt-1.5 uppercase tracking-wide">Mock Interviews</span>
              <span className="text-[10px] text-emerald-600 font-extrabold mt-1">↑ +{stats.mockInterviews} this week</span>
            </div>
          </div>

          {/* Card 3: Success Rate */}
          <div className="glass-card-premium rounded-[28px] p-6 flex items-center gap-5 shadow-[0_8px_30px_rgb(0,0,0,0.02)] hover:shadow-[0_20px_40px_rgba(245,158,11,0.12)] hover:border-amber-300/60 hover:scale-[1.03] hover:-translate-y-1 transition-all duration-300 text-left relative overflow-hidden group">
            <div className="absolute right-[-20px] bottom-[-20px] w-24 h-24 bg-amber-400/8 rounded-full blur-xl pointer-events-none group-hover:bg-amber-400/12 transition-all" />
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/20 group-hover:scale-110 transition-transform">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col z-10">
              <span className="text-3xl font-black text-amber-950 font-mono leading-none">{animatedSuccess}%</span>
              <span className="text-xs text-amber-950/50 font-bold mt-1.5 uppercase tracking-wide">Success Rate</span>
              <span className="text-[10px] text-amber-600 font-extrabold mt-1">↑ +{stats.successRate}% this week</span>
            </div>
          </div>

          {/* Card 4: XP Earned */}
          <div className="glass-card-premium rounded-[28px] p-6 flex items-center gap-5 shadow-[0_8px_30px_rgb(0,0,0,0.02)] hover:shadow-[0_20px_40px_rgba(59,130,246,0.12)] hover:border-blue-300/60 hover:scale-[1.03] hover:-translate-y-1 transition-all duration-300 text-left relative overflow-hidden group">
            <div className="absolute right-[-20px] bottom-[-20px] w-24 h-24 bg-blue-400/8 rounded-full blur-xl pointer-events-none group-hover:bg-blue-400/12 transition-all" />
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20 group-hover:scale-110 transition-transform">
              <BarChart2 className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col z-10">
              <span className="text-3xl font-black text-blue-950 font-mono leading-none">{animatedXP}</span>
              <span className="text-xs text-blue-950/50 font-bold mt-1.5 uppercase tracking-wide">XP Earned</span>
              <span className="text-[10px] text-blue-600 font-extrabold mt-1">↑ +{stats.xp} this week</span>
            </div>
          </div>

        </section>

        {/* Dynamic content tables */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Practice by Language card */}
          <section className="lg:col-span-2 rounded-[28px] bg-white/70 border border-white/90 p-6 flex flex-col gap-6 shadow-[0_12px_40px_rgba(0,0,0,0.02)] backdrop-blur-xl">
            <div className="flex items-center justify-between pb-3 border-b border-indigo-100/50">
              <h3 className="text-sm font-black text-[#1E1B4B] tracking-wide flex items-center gap-2">
                <span className="w-1.5 h-3.5 bg-[#6366F1] rounded-full" />
                <span>Practice by Language</span>
              </h3>
              <span className="text-xs font-bold text-[#6366F1] bg-indigo-50 border border-indigo-100/55 px-2 py-0.5 rounded-md font-mono select-none">&lt;/&gt;</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {[
                { name: 'Python', icon: PythonIcon, count: stats.languages?.python || 0, color: 'from-[#3776AB] to-[#FFD43B]', shadowColor: 'hover:shadow-[#3776AB]/20', borderColor: 'hover:border-[#3776AB]/30' },
                { name: 'TypeScript', icon: TypeScriptIcon, count: stats.languages?.typescript || 0, color: 'from-[#3178C6] to-[#00599C]', shadowColor: 'hover:shadow-[#3178C6]/20', borderColor: 'hover:border-[#3178C6]/30' },
                { name: 'C++', icon: CppIcon, count: stats.languages?.cpp || 0, color: 'from-[#00599C] to-[#0080FF]', shadowColor: 'hover:shadow-[#00599C]/20', borderColor: 'hover:border-[#00599C]/30' },
                { name: 'Java', icon: JavaIcon, count: stats.languages?.java || 0, color: 'from-[#EA2D2E] to-[#F89820]', shadowColor: 'hover:shadow-[#EA2D2E]/20', borderColor: 'hover:border-[#EA2D2E]/30' },
                { name: 'C', icon: CIcon, count: stats.languages?.c || 0, color: 'from-[#00599C] to-[#5B83AD]', shadowColor: 'hover:shadow-[#00599C]/15', borderColor: 'hover:border-[#00599C]/20' }
              ].map((lang, idx) => {
                const IconComponent = lang.icon;
                const progressWidth = Math.max(8, Math.min(100, (lang.count / totalSystemProblems) * 100));
                return (
                  <button 
                    key={idx} 
                    onClick={() => onNavigateToPractice(lang.name.toLowerCase())}
                    className={`bg-white/80 border border-white/95 shadow-[0_4px_20px_rgba(0,0,0,0.01)] hover:shadow-lg ${lang.shadowColor} ${lang.borderColor} hover:scale-[1.05] hover:-translate-y-1 transition-all duration-300 rounded-[24px] p-5 flex flex-col items-center justify-center text-center gap-3.5 w-full group cursor-pointer`}
                  >
                    <div className="group-hover:scale-110 transition-transform duration-300">
                      <IconComponent />
                    </div>
                    <span className="text-xs font-black text-[#1E1B4B]">{lang.name}</span>
                    <span className="text-[11px] font-bold text-[#1E1B4B]/40 font-mono">{lang.count} / {totalSystemProblems}</span>
                    
                    <div className="w-full h-1.5 bg-zinc-100 rounded-full mt-1 overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 bg-gradient-to-r ${lang.color}`} 
                        style={{ width: `${progressWidth}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Recent Activity card - Glassmorphism timeline + Floating Code Window Deco */}
          <section className="rounded-[28px] glass-card-premium p-6 flex flex-col gap-4 shadow-[0_12px_40px_rgba(0,0,0,0.02)] text-left relative overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-indigo-100/50">
              <h3 className="text-sm font-black text-[#1E1B4B] tracking-wide flex items-center gap-2">
                <span className="w-1.5 h-3.5 bg-[#D946EF] rounded-full" />
                <span>Recent Activity</span>
              </h3>
            </div>

            <div className="flex-1 flex flex-col gap-4 relative z-10">
              {stats.activities.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 my-auto relative">
                  {/* Floating glass illustration matching mockup */}
                  <div className="w-24 h-24 mb-4 relative flex items-center justify-center animate-pulse">
                    <svg className="w-full h-full text-indigo-400/20" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="15" y="20" width="70" height="50" rx="8" fill="url(#grad)" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
                      <circle cx="27" cy="30" r="2.5" fill="#EF4444" />
                      <circle cx="35" cy="30" r="2.5" fill="#F59E0B" />
                      <circle cx="43" cy="30" r="2.5" fill="#10B981" />
                      <path d="M40 45 L45 50 L40 55" stroke="#6366F1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M60 45 L55 50 L60 55" stroke="#6366F1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M48 57 L52 43" stroke="#D946EF" strokeWidth="2" strokeLinecap="round" />
                      <defs>
                        <linearGradient id="grad" x1="15" y1="20" x2="85" y2="70" gradientUnits="userSpaceOnUse">
                          <stop stopColor="rgba(255,255,255,0.7)" />
                          <stop offset="1" stopColor="rgba(238,242,255,0.4)" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                  <span className="text-xs text-[#1E1B4B]/60 font-bold">No logs available</span>
                  <span className="text-[10px] text-zinc-400 mt-1 max-w-[200px] text-center font-medium leading-relaxed">
                    Submit code in the Practice editor to record accomplishments!
                  </span>
                </div>
              ) : (
                <div className="flex flex-col gap-3.5">
                  {stats.activities.map((act, idx) => (
                    <div key={act.id || idx} className="flex items-start gap-3.5 text-xs border-b border-indigo-50/50 pb-3 last:border-0 last:pb-0 hover:translate-x-1 transition-transform duration-200">
                      <div className="mt-0.5">
                        {act.type === 'solve' ? (
                          <div className="w-7 h-7 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shadow-sm">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm">
                            <Calendar className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 flex flex-col gap-0.5">
                        <span className="font-extrabold text-[#1E1B4B]">{act.title}</span>
                        <span className="text-[10px] text-[#1E1B4B]/50 font-bold">{act.detail}</span>
                      </div>
                      <span className="text-[9px] text-[#1E1B4B]/40 font-mono mt-0.5">
                        {act.timestamp ? `${Math.ceil((Date.now() - act.timestamp) / (60 * 60 * 1000))}h ago` : '2h ago'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Decorative background visual matching the mockup's code screen */}
            <div className="absolute right-[-10px] bottom-[-20px] w-24 h-24 bg-gradient-to-tr from-[#D946EF]/5 to-[#6366F1]/5 rounded-full blur-xl pointer-events-none" />
          </section>

        </div>

      </div>
    </div>
  );
}
