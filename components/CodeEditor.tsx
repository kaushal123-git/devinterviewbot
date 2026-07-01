import React, { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react';
import type { InterviewLanguage } from '@/types';
import { Sun, Moon, Loader2, Check, Play, X, Terminal, AlertCircle, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { runCode, type RunResult } from '@/services/codeRunner';

interface CodeEditorProps {
  code: string;
  onChange: (code: string) => void;
  language: InterviewLanguage;
  onLanguageChange: (lang: InterviewLanguage) => void;
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  className?: string;
  onSubmitCode?: () => void;
}

export interface CodeEditorHandle {
  captureFrame: () => Promise<string | null>;
}

const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(({ 
  code, 
  onChange, 
  language, 
  onLanguageChange,
  theme,
  onThemeToggle,
  className,
  onSubmitCode
}, ref) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [submittingState, setSubmittingState] = useState<'idle' | 'running' | 'success'>('idle');

  // Run output state
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [outputOpen, setOutputOpen] = useState(false);
  const [hasRunSuccessfully, setHasRunSuccessfully] = useState(false);

  // Sync scrolling between textarea and line numbers
  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  // Expose a method to capture the editor as an image
  useImperativeHandle(ref, () => ({
    captureFrame: async () => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // Draw background
      ctx.fillStyle = '#09090b'; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw text
      ctx.fillStyle = '#e4e4e7';
      ctx.font = '14px "JetBrains Mono"';
      ctx.textBaseline = 'top';
      
      const lines = code.split('\n');
      const lineHeight = 24;
      const x = 20;
      let y = 20;

      lines.forEach((line, index) => {
        // Draw line number
        ctx.fillStyle = '#52525b';
        ctx.fillText((index + 1).toString(), 5, y);
        
        // Draw code
        ctx.fillStyle = '#e4e4e7';
        const cleanLine = line.length > 80 ? line.substring(0, 77) + '...' : line;
        ctx.fillText(cleanLine, 40, y);
        y += lineHeight;
      });

      return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    }
  }));

  const handleSubmit = () => {
    if (submittingState !== 'idle') return;
    setSubmittingState('running');
    
    setTimeout(() => {
      if (onSubmitCode) {
        onSubmitCode();
      }
      setSubmittingState('success');
      setTimeout(() => setSubmittingState('idle'), 2500);
    }, 1200);
  };

  const handleRun = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setOutputOpen(true);
    setRunResult(null);
    setHasRunSuccessfully(false);

    const result = await runCode(code, language);
    setRunResult(result);
    setIsRunning(false);

    const hasErr = result.exitCode !== 0 || !!result.error || !!result.stderr;
    if (!hasErr) {
      setHasRunSuccessfully(true);
    }
  };

  useEffect(() => {
    if (canvasRef.current) {
        canvasRef.current.width = 800;
        canvasRef.current.height = 600;
    }
  }, []);

  useEffect(() => {
    setHasRunSuccessfully(false);
  }, [language]);

  const lineCount = code.split('\n').length;

  // Determine output panel status
  const hasError = runResult && (runResult.exitCode !== 0 || !!runResult.error || !!runResult.stderr);
  const hasOutput = runResult && (!!runResult.stdout || !!runResult.stderr || !!runResult.error);

  return (
    <div className={`relative w-full h-full min-h-0 flex flex-col bg-app transition-colors duration-300 ${className}`}>
      {/* Hidden canvas for AI vision */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Main Editor Area */}
      <div className="flex-1 min-h-0 flex overflow-hidden relative">
        
        {/* Line Numbers Column */}
        <div 
            ref={lineNumbersRef}
            className="w-12 pt-4 pb-4 text-right pr-3 bg-app border-r border-subtle text-secondary font-mono text-sm leading-6 select-none overflow-hidden"
            style={{ fontFamily: '"JetBrains Mono", monospace', lineHeight: '1.5rem' }}
        >
            {Array.from({ length: Math.max(lineCount, 1) }).map((_, i) => (
                <div key={i}>{i + 1}</div>
            ))}
        </div>

        {/* Code Textarea */}
        <textarea
          ref={textareaRef}
          value={code}
          onChange={(e) => {
            onChange(e.target.value);
            setHasRunSuccessfully(false);
          }}
          onScroll={handleScroll}
          className="flex-1 w-full h-full min-h-0 overflow-y-scroll overflow-x-auto bg-transparent text-primary font-mono text-sm leading-6 p-4 resize-none focus:outline-none placeholder-secondary/50 selection:bg-subtle selection:text-primary whitespace-pre transition-colors duration-300"
          style={{ fontFamily: '"JetBrains Mono", monospace', lineHeight: '1.5rem', tabSize: 4, scrollbarGutter: 'stable' }}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          wrap="off"
          placeholder="// Write your solution here..."
        />
      </div>

      {/* Output Panel */}
      {outputOpen && (
        <div
          className="border-t border-subtle bg-app transition-all duration-300 flex flex-col overflow-hidden"
          style={{ height: outputOpen ? '200px' : '0px' }}
        >
          {/* Output Header */}
          <div className="flex items-center justify-between px-4 py-2 bg-panel border-b border-subtle shrink-0">
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-secondary" />
              <span className="text-xs font-bold text-secondary uppercase tracking-wider">Output</span>
              {runResult?.time && !isRunning && (
                <span className="flex items-center gap-1 text-[10px] text-secondary/60 font-mono">
                  <Clock className="w-3 h-3" />
                  {runResult.time}
                </span>
              )}
              {!isRunning && runResult && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                    hasError
                      ? 'bg-rose-500/15 text-rose-400 border border-rose-500/20'
                      : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                  }`}
                >
                  {hasError ? 'Error' : 'Passed'}
                </span>
              )}
            </div>
            <button
              onClick={() => setOutputOpen(false)}
              className="p-1 text-secondary hover:text-primary transition-colors rounded hover:bg-subtle/30"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Output Body */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 font-mono text-xs leading-relaxed">
            {isRunning ? (
              <div className="flex items-center gap-2 text-secondary animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#6366F1]" />
                <span>Running code on remote sandbox…</span>
              </div>
            ) : runResult?.error ? (
              <div className="flex items-start gap-2 text-rose-400">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <pre className="whitespace-pre-wrap break-all">{runResult.error}</pre>
              </div>
            ) : (
              <div className="space-y-2">
                {runResult?.stdout && (
                  <pre className="text-emerald-400 whitespace-pre-wrap break-all">{runResult.stdout}</pre>
                )}
                {runResult?.stderr && (
                  <pre className="text-rose-400 whitespace-pre-wrap break-all">{runResult.stderr}</pre>
                )}
                {!runResult?.stdout && !runResult?.stderr && runResult && (
                  <span className="text-secondary italic">No output produced.</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Status Bar & Controls */}
      <div className="h-10 border-t border-subtle bg-app flex items-center justify-between px-6 text-[11px] font-medium text-secondary uppercase select-none transition-colors duration-300 shrink-0">
        
        {/* Left: Stats & Run/Submit */}
        <div className="flex items-center gap-4 tracking-wide">
            <span>UTF-8</span>
            <span>{code.length} chars</span>
            
            <div className="w-px h-3 bg-subtle" />

            {/* Run Button */}
            <button
              id="run-code-btn"
              onClick={handleRun}
              disabled={isRunning}
              className={`px-3 py-1 font-semibold text-[10px] tracking-wider rounded transition-all duration-200 flex items-center gap-1.5 active:scale-[0.98] ${
                isRunning
                  ? 'bg-[#6366F1]/20 text-[#6366F1]/60 cursor-not-allowed'
                  : 'bg-[#6366F1] text-white hover:bg-[#5558e3] shadow-sm shadow-[#6366F1]/20'
              }`}
              title="Run Code (Ctrl+Enter)"
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Running…</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 fill-current" />
                  <span>Run</span>
                </>
              )}
            </button>

            {/* Toggle Output panel if already has result */}
            {runResult && !outputOpen && (
              <button
                onClick={() => setOutputOpen(true)}
                className={`flex items-center gap-1 text-[10px] font-bold transition-colors ${
                  hasError ? 'text-rose-400 hover:text-rose-300' : 'text-emerald-400 hover:text-emerald-300'
                }`}
              >
                <ChevronUp className="w-3 h-3" />
                <span>{hasError ? 'Error' : 'Output'}</span>
              </button>
            )}

            {onSubmitCode && (
              <>
                <div className="w-px h-3 bg-subtle" />
                <button
                  onClick={handleSubmit}
                  disabled={submittingState !== 'idle' || !hasRunSuccessfully}
                  title={!hasRunSuccessfully ? "Please run your code successfully before submitting" : "Submit Code"}
                  className={`px-3 py-1 font-semibold text-[10px] tracking-wider rounded transition-all duration-300 flex items-center gap-1.5 active:scale-[0.98] ${
                    submittingState === 'success'
                      ? 'bg-emerald-500 text-white'
                      : submittingState === 'running'
                        ? 'bg-zinc-800 text-secondary cursor-not-allowed'
                        : !hasRunSuccessfully
                          ? 'bg-zinc-800/50 text-secondary/40 cursor-not-allowed border border-subtle'
                          : 'bg-primary text-accent-contrast hover:opacity-90'
                  }`}
                >
                  {submittingState === 'running' && (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Verifying...</span>
                    </>
                  )}
                  {submittingState === 'success' && (
                    <>
                      <Check className="w-3 h-3 text-white" />
                      <span>+20 XP Added!</span>
                    </>
                  )}
                  {submittingState === 'idle' && (
                    <span>Submit Code</span>
                  )}
                </button>
              </>
            )}
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-4">
            {/* Theme Toggle Button */}
            <button
                onClick={onThemeToggle}
                className="p-1.5 text-secondary hover:text-primary transition-colors rounded hover:bg-subtle/30"
                title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
                {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>

            <div className="w-px h-3 bg-subtle"></div>

            {/* Language Selector */}
            <div className="flex items-center gap-1 bg-subtle/20 p-0.5 rounded">
                {(['python', 'typescript', 'c', 'cpp', 'java'] as InterviewLanguage[]).map((lang) => {
                  const labelMap: Record<InterviewLanguage, string> = {
                    python: 'Python',
                    typescript: 'TypeScript',
                    c: 'C',
                    cpp: 'C++',
                    java: 'Java'
                  };
                  return (
                    <button
                      key={lang}
                      onClick={() => onLanguageChange(lang)}
                      className={`px-2 py-0.5 rounded-sm transition-all ${
                        language === lang
                          ? 'bg-panel text-primary shadow-sm'
                          : 'text-secondary hover:text-primary'
                      }`}
                    >
                      {labelMap[lang]}
                    </button>
                  );
                })}
            </div>
        </div>
      </div>
    </div>
  );
});

export default CodeEditor;
