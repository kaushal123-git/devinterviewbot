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
  <svg className="w-8 h-8" viewBox="0 0 256 255" version="1.1" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient x1="12.9593594%" y1="12.0393928%" x2="79.6388325%" y2="78.2008538%" id="pyBlueGrad">
        <stop stopColor="#387EB8" offset="0%"></stop>
        <stop stopColor="#366994" offset="100%"></stop>
      </linearGradient>
      <linearGradient x1="19.127525%" y1="20.5791813%" x2="90.7415328%" y2="88.4290372%" id="pyYellowGrad">
        <stop stopColor="#FFE052" offset="0%"></stop>
        <stop stopColor="#FFC331" offset="100%"></stop>
      </linearGradient>
    </defs>
    <g fillRule="nonzero">
      <path d="M126.915866,0.0722755491 C62.0835831,0.0722801733 66.1321288,28.1874648 66.1321288,28.1874648 L66.2044043,57.3145115 L128.072276,57.3145115 L128.072276,66.0598532 L41.6307171,66.0598532 C41.6307171,66.0598532 0.144551098,61.3549438 0.144551098,126.771315 C0.144546474,192.187673 36.3546019,189.867871 36.3546019,189.867871 L57.9649915,189.867871 L57.9649915,159.51214 C57.9649915,159.51214 56.8001363,123.302089 93.5968379,123.302089 L154.95878,123.302089 C154.95878,123.302089 189.434218,123.859386 189.434218,89.9830604 L189.434218,33.9695088 C189.434218,33.9695041 194.668541,0.0722755491 126.915866,0.0722755491 Z M92.8018069,19.6589497 C98.9572068,19.6589452 103.932242,24.6339846 103.932242,30.7893845 C103.932246,36.9447844 98.9572068,41.9198193 92.8018069,41.9198193 C86.646407,41.9198239 81.6713721,36.9447844 81.6713721,30.7893845 C81.6713674,24.6339846 86.646407,19.6589497 92.8018069,19.6589497 Z" fill="url(#pyBlueGrad)" />
      <path d="M128.757101,254.126271 C193.589403,254.126271 189.540839,226.011081 189.540839,226.011081 L189.468564,196.884035 L127.600692,196.884035 L127.600692,188.138693 L214.042251,188.138693 C214.042251,188.138693 255.528417,192.843589 255.528417,127.427208 C255.52844,62.0108566 219.318366,64.3306589 219.318366,64.3306589 L197.707976,64.3306589 L197.707976,94.6863832 C197.707976,94.6863832 198.87285,130.896434 162.07613,130.896434 L100.714182,130.896434 C100.714182,130.896434 66.238745,130.339138 66.238745,164.215486 L66.238745,220.229038 C66.238745,220.229038 61.0044225,254.126271 128.757101,254.126271 Z M162.87116,234.539597 C156.715759,234.539597 151.740726,229.564564 151.740726,223.409162 C151.740726,217.253759 156.715759,212.278727 162.87116,212.278727 C169.026563,212.278727 174.001595,217.253759 174.001595,223.409162 C174.001618,229.564564 169.026563,234.539597 162.87116,234.539597 Z" fill="url(#pyYellowGrad)" />
    </g>
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
    <path d="M12 2l8.5 5v10L12 22V2z" fill="#004482" />
    <path d="M12.5 15.8c-2.1 0-3.8-1.7-3.8-3.8s1.7-3.8 3.8-3.8c1.5 0 2.8.9 3.4 2.1l-1.7.9c-.3-.7-.9-1.2-1.7-1.2-1.1 0-2 1-2 2.1s.9 2.1 2 2.1c.8 0 1.4-.5 1.7-1.2h1.7c-.6 1.2-1.9 2.1-3.4 2.1z" fill="white" />
    <path d="M17 10.5h-1v-1h-1v1h-1v1h1v1h1v-1h1v-1z M20 13h-1v-1h-1v1h-1v1h1v1h1v-1h1v-1z" fill="white" />
  </svg>
);

const JavaIcon = () => (
  <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10.9 2c-.3.8-.2 1.6.2 2.4.4.8.9 1.5 1.1 2.4.3 1.1.1 2.3-.5 3.3-.3.6-.9 1.1-1.6 1.4l.6.8c1-.4 1.8-1.2 2.2-2.3.6-1.3.5-2.7 0-4-.4-.8-.9-1.6-1.1-2.4 0-.4.1-.9.3-1.3l-1.2-.2z" fill="#EA2D2E" />
    <path d="M13.6 3.5c-.3.7-.2 1.4.1 2.1.3.7.8 1.3 1 2.1.3 1 .1 2.1-.4 3-.3.5-.8.9-1.4 1.2l.5.7c.9-.4 1.6-1 2-2 .5-1.2.4-2.4.1-3.6-.3-.7-.7-1.4-.9-2.1 0-.4.1-.8.3-1.1l-1.3-.3z" fill="#EA2D2E" />
    <path d="M6 12.5c0 1.5 1.4 2.8 3.2 2.8h3.6c1.8 0 3.2-1.3 3.2-2.8H6z" fill="#0073B7" />
    <path d="M5 10.5h12v1.5H5v-1.5z" fill="#5382A1" />
    <path d="M16 11.2c.8 0 1.3.6 1.3 1.3s-.5 1.3-1.3 1.3v-.8c.4 0 .6-.2.6-.5s-.2-.5-.6-.5v-.8z" fill="#5382A1" />
    <path d="M4 16c0 .8 3 1.5 7 1.5s7-.7 7-1.5H4z" fill="#0073B7" />
    <text x="11" y="22" fill="#EA2D2E" fontSize="4.8" fontWeight="900" fontFamily="sans-serif" textAnchor="middle" letterSpacing="0.2">Java</text>
  </svg>
);

const CIcon = () => (
  <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2l8.5 5v10L12 22l-8.5-5V7L12 2z" fill="#5C6BC0" />
    <path d="M12 2l8.5 5v10L12 22V2z" fill="#3F51B5" />
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
    <div className="flex-1 w-full overflow-y-auto px-6 py-8 bg-gradient-to-br from-[#D2D6F7] via-[#E2F1F8] to-[#E3F6EC] text-[#1E1B4B] transition-colors duration-300 relative flex flex-col items-center select-none">
      
      {/* Background Glowing Blobs matching the mockup */}
      <div className="absolute top-[8%] left-[12%] w-[480px] h-[480px] bg-gradient-to-tr from-[#8A95F6]/40 to-[#6366F1]/30 rounded-full blur-[100px] pointer-events-none z-0" />
      <div className="absolute top-[25%] right-[8%] w-[500px] h-[500px] bg-gradient-to-tr from-[#C084FC]/35 to-[#818CF8]/25 rounded-full blur-[120px] pointer-events-none z-0" />
      <div className="absolute bottom-[20%] left-[8%] w-[420px] h-[420px] bg-gradient-to-tr from-[#FED7AA]/30 to-[#FDBA74]/20 rounded-full blur-[100px] pointer-events-none z-0" />
      <div className="absolute bottom-[8%] right-[12%] w-[480px] h-[480px] bg-gradient-to-tr from-[#A7F3D0]/35 to-[#6EE7B7]/25 rounded-full blur-[100px] pointer-events-none z-0" />
      
      {/* Frosted Glass Panel Container wrapping the dashboard matching the mockup */}
      <div className="w-full max-w-6xl rounded-[36px] bg-white/40 backdrop-blur-[24px] border border-white/60 shadow-[0_24px_60px_rgba(99,102,241,0.05)] p-8 lg:p-10 flex flex-col gap-8 relative z-10">
        
        {/* Banner Section - Matches Mockup perfectly */}
        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-white/70 via-white/50 to-white/20 border border-white/80 p-8 lg:p-10 flex flex-col md:flex-row justify-start items-start md:items-center min-h-[220px] shadow-[0_12px_40px_rgba(99,102,241,0.04)] gap-10 lg:gap-20 backdrop-blur-xl">
          
          {/* Accent blobs in the banner card */}
          <div className="absolute top-[-30%] right-[-5%] w-[260px] h-[260px] bg-gradient-to-tr from-[#6366F1] to-[#D946EF] rounded-full blur-3xl opacity-15 pointer-events-none" />
          <div className="absolute bottom-[-30%] left-[5%] w-[220px] h-[220px] bg-gradient-to-tr from-[#F472B6] to-[#F59E0B] rounded-full blur-3xl opacity-10 pointer-events-none" />

          <div className="max-w-xl flex flex-col gap-2.5 text-left z-10 flex-1">
            {/* User Greeting Tag */}
            <div className="flex items-center gap-1.5 text-indigo-700 bg-indigo-50/90 border border-indigo-100/60 px-3.5 py-1.5 rounded-full w-fit text-xs font-bold shadow-sm select-none mb-1 animate-pulse duration-1000">
              <span>Welcome back, {capitalizedUser}!</span>
              <span>👋</span>
            </div>

            <h1 className="text-3xl lg:text-4xl font-black text-[#1E1B4B] leading-tight font-sans tracking-tight">
              Crack Interviews.<br />Build Your Future.
            </h1>
            
            <p className="text-xs text-[#1E1B4B]/60 leading-relaxed max-w-md mt-1 font-semibold">
              AI-powered practice to help you master DSA, System Design, and real-world coding interviews.
            </p>
            
            <button
              onClick={() => onNavigateToPractice()}
              className="mt-5 px-10 py-4 bg-[#1E1B4B] text-white rounded-2xl text-xs font-black hover:opacity-90 active:scale-[0.98] transition-all flex items-center gap-3.5 shadow-md w-fit group"
            >
              <span>Start Practicing</span>
              <span className="text-white/40">|</span>
              <span className="font-mono text-xs group-hover:translate-x-0.5 transition-transform">&lt;/&gt;</span>
            </button>
          </div>

          {/* Interactive 3D Model on the right */}
          <div className="w-full md:w-[300px] h-[220px] shrink-0 z-10 flex items-center justify-center relative">
            <div className="absolute w-[240px] h-[240px] bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
            <Robot3D />
          </div>
        </section>

        {/* Stats Grid - Soft tinted glassmorphic card backgrounds matching the mockup */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          
          {/* Card 1: Problems Solved (Soft lavender/purple tint) */}
          <div className="bg-[#EBEAFB]/55 border border-[#D8D4F5]/70 rounded-[28px] p-6 flex items-center gap-5 shadow-[0_4px_25px_rgba(0,0,0,0.015)] hover:shadow-[0_15px_35px_rgba(99,102,241,0.1)] hover:border-indigo-300/80 hover:scale-[1.03] hover:-translate-y-1 transition-all duration-300 text-left relative overflow-hidden group">
            <div className="absolute top-4 right-4 w-1.5 h-1.5 rounded-full border border-indigo-900/40 opacity-40" />
            <div className="w-12 h-12 rounded-2xl bg-white border border-indigo-200/50 text-[#3C3B6E] flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
              <span className="font-mono text-sm font-black">&lt;/&gt;</span>
            </div>
            <div className="flex flex-col z-10">
              <span className="text-3xl font-black text-[#1E1B4B] font-mono leading-none">{animatedSolved}</span>
              <span className="text-[11px] text-[#3C3B6E]/70 font-extrabold mt-2 uppercase tracking-wider">Problems Solved</span>
              <span className="text-[10px] text-indigo-600 font-extrabold mt-0.5">↑ +{stats.problemsSolved} this week</span>
            </div>
          </div>

          {/* Card 2: Mock Interviews (Soft green/emerald tint) */}
          <div className="bg-[#EAF7EC]/55 border border-[#D4EED8]/70 rounded-[28px] p-6 flex items-center gap-5 shadow-[0_4px_25px_rgba(0,0,0,0.015)] hover:shadow-[0_15px_35px_rgba(16,185,129,0.1)] hover:border-emerald-300/80 hover:scale-[1.03] hover:-translate-y-1 transition-all duration-300 text-left relative overflow-hidden group">
            <div className="absolute top-4 right-4 w-1.5 h-1.5 rounded-full border border-emerald-900/40 opacity-40" />
            <div className="w-12 h-12 rounded-2xl bg-white border border-emerald-200/50 text-[#2E5E3D] flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
              <Calendar className="w-5 h-5" />
            </div>
            <div className="flex flex-col z-10">
              <span className="text-3xl font-black text-[#1E1B4B] font-mono leading-none">{animatedInterviews}</span>
              <span className="text-[11px] text-[#2E5E3D]/70 font-extrabold mt-2 uppercase tracking-wider">Mock Interviews</span>
              <span className="text-[10px] text-emerald-600 font-extrabold mt-0.5">↑ +{stats.mockInterviews} this week</span>
            </div>
          </div>

          {/* Card 3: Success Rate (Soft orange/peach tint) */}
          <div className="bg-[#FDF3E7]/55 border border-[#F7E1C5]/75 rounded-[28px] p-6 flex items-center gap-5 shadow-[0_4px_25px_rgba(0,0,0,0.015)] hover:shadow-[0_15px_35px_rgba(245,158,11,0.1)] hover:border-amber-300/80 hover:scale-[1.03] hover:-translate-y-1 transition-all duration-300 text-left relative overflow-hidden group">
            <div className="absolute top-4 right-4 w-1.5 h-1.5 rounded-full border border-amber-900/40 opacity-40" />
            <div className="w-12 h-12 rounded-2xl bg-white border border-amber-200/50 text-[#6B4B1B] flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
              <Trophy className="w-5 h-5" />
            </div>
            <div className="flex flex-col z-10">
              <span className="text-3xl font-black text-[#1E1B4B] font-mono leading-none">{animatedSuccess}%</span>
              <span className="text-[11px] text-[#6B4B1B]/70 font-extrabold mt-2 uppercase tracking-wider">Success Rate</span>
              <span className="text-[10px] text-amber-600 font-extrabold mt-0.5">↑ +{stats.successRate}% this week</span>
            </div>
          </div>

          {/* Card 4: XP Earned (Soft blue/cyan tint) */}
          <div className="bg-[#EAF3FA]/55 border border-[#D0E5F5]/70 rounded-[28px] p-6 flex items-center gap-5 shadow-[0_4px_25px_rgba(0,0,0,0.015)] hover:shadow-[0_15px_35px_rgba(59,130,246,0.1)] hover:border-blue-300/80 hover:scale-[1.03] hover:-translate-y-1 transition-all duration-300 text-left relative overflow-hidden group">
            <div className="absolute top-4 right-4 w-1.5 h-1.5 rounded-full border border-blue-900/40 opacity-40" />
            <div className="w-12 h-12 rounded-2xl bg-white border border-blue-200/50 text-[#214660] flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
              <BarChart2 className="w-5 h-5" />
            </div>
            <div className="flex flex-col z-10">
              <span className="text-3xl font-black text-[#1E1B4B] font-mono leading-none">{animatedXP}</span>
              <span className="text-[11px] text-[#214660]/70 font-extrabold mt-2 uppercase tracking-wider">XP Earned</span>
              <span className="text-[10px] text-blue-600 font-extrabold mt-0.5">↑ +{stats.xp} this week</span>
            </div>
          </div>

        </section>

        {/* Dynamic content tables */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Practice by Language card */}
          <section className="lg:col-span-2 rounded-[28px] bg-white/60 border border-white/70 p-6 flex flex-col gap-6 shadow-[0_12px_40px_rgba(0,0,0,0.015)] backdrop-blur-xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E1B4B]/10">
              <h3 className="text-sm font-black text-[#1E1B4B] tracking-wide flex items-center gap-2">
                <span className="w-1.5 h-3.5 bg-[#6366F1] rounded-full" />
                <span>Practice by Language</span>
              </h3>
              <span className="text-xs font-bold text-[#6366F1] bg-indigo-50 border border-indigo-100/55 px-2 py-0.5 rounded-md font-mono select-none">&lt;/&gt;</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {[
                { name: 'Python', icon: PythonIcon, count: stats.languages?.python || 0, color: 'from-[#3776AB] to-[#FFD43B]', shadowColor: 'hover:shadow-[#3776AB]/15', borderColor: 'hover:border-[#3776AB]/30', tint: 'bg-[#FDFBE7]/55 border-[#F7F2C5]/70 text-[#5F5B2F]' },
                { name: 'TypeScript', icon: TypeScriptIcon, count: stats.languages?.typescript || 0, color: 'from-[#3178C6] to-[#00599C]', shadowColor: 'hover:shadow-[#3178C6]/15', borderColor: 'hover:border-[#3178C6]/30', tint: 'bg-[#EAF3FA]/55 border-[#D0E5F5]/70 text-[#214660]' },
                { name: 'C++', icon: CppIcon, count: stats.languages?.cpp || 0, color: 'from-[#00599C] to-[#0080FF]', shadowColor: 'hover:shadow-[#00599C]/15', borderColor: 'hover:border-[#00599C]/30', tint: 'bg-[#E9EDF5]/55 border-[#CBD6EA]/70 text-[#2C3C58]' },
                { name: 'Java', icon: JavaIcon, count: stats.languages?.java || 0, color: 'from-[#EA2D2E] to-[#F89820]', shadowColor: 'hover:shadow-[#EA2D2E]/15', borderColor: 'hover:border-[#EA2D2E]/30', tint: 'bg-[#FAF1F1]/55 border-[#F5D8D8]/70 text-[#5F2F2F]' },
                { name: 'C', icon: CIcon, count: stats.languages?.c || 0, color: 'from-[#00599C] to-[#5B83AD]', shadowColor: 'hover:shadow-[#00599C]/10', borderColor: 'hover:border-[#00599C]/20', tint: 'bg-[#EAF7F3]/55 border-[#D0EDE3]/70 text-[#2E5A4D]' }
              ].map((lang, idx) => {
                const IconComponent = lang.icon;
                const progressWidth = Math.max(8, Math.min(100, (lang.count / totalSystemProblems) * 100));
                return (
                  <button 
                    key={idx} 
                    onClick={() => onNavigateToPractice(lang.name.toLowerCase())}
                    className={`${lang.tint} shadow-[0_4px_15px_rgba(0,0,0,0.01)] hover:shadow-lg ${lang.shadowColor} ${lang.borderColor} hover:scale-[1.04] hover:-translate-y-1 transition-all duration-300 rounded-[24px] p-5 flex flex-col items-center justify-center text-center gap-3.5 w-full group cursor-pointer relative overflow-hidden`}
                  >
                    <div className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full border border-current opacity-30" />
                    <div className="group-hover:scale-110 transition-transform duration-300 bg-white/70 p-2.5 rounded-xl border border-white/50 shadow-sm">
                      <IconComponent />
                    </div>
                    <span className="text-xs font-black text-[#1E1B4B]">{lang.name}</span>
                    <span className="text-[11px] font-bold text-[#1E1B4B]/40 font-mono">{lang.count} / {totalSystemProblems}</span>
                    
                    <div className="w-full h-1.5 bg-white/50 border border-white/40 rounded-full mt-1 overflow-hidden">
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
          <section className="rounded-[28px] bg-white/60 border border-white/70 p-6 flex flex-col gap-4 shadow-[0_12px_40px_rgba(0,0,0,0.015)] text-left relative overflow-hidden backdrop-blur-xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E1B4B]/10">
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
                  <span className="text-[10px] text-zinc-400 mt-1 max-w-[200px] text-center font-bold leading-relaxed">
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
