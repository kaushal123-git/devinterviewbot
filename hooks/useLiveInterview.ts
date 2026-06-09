import { useState, useRef, useCallback, useEffect } from 'react';
import { LiveService } from '@/services/liveService';
import type { CodeEditorHandle } from '@/components/CodeEditor';
import type { AvatarInterviewerHandle } from '@/components/AvatarInterviewer';
import type { ChatMessage, InterviewLanguage, InterviewProblem } from '@/types';
import {
  SYSTEM_INSTRUCTION_INTERVIEWER,
  CODE_DEBOUNCE_MS,
  VIDEO_FRAME_INTERVAL_MS,
} from '@/constants';

interface UseLiveInterviewParams {
  apiKey: string;
  currentProblem: InterviewProblem;
  language: InterviewLanguage;
  code: string;
  editorRef: React.RefObject<CodeEditorHandle | null>;
  avatarRef: React.RefObject<AvatarInterviewerHandle | null>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  onUpdateContext?: (language: string, title: string, description: string, starterCode: string) => void;
}

/**
 * Manages the Gemini Live audio interview session.
 *
 * Handles:
 * - LiveService initialisation and volume binding
 * - Connect / disconnect lifecycle
 * - Periodic video-frame capture (1 s interval)
 * - Debounced code-context updates (3 s)
 */
export function useLiveInterview({
  apiKey,
  currentProblem,
  language,
  code,
  editorRef,
  avatarRef,
  setMessages,
  onUpdateContext,
}: UseLiveInterviewParams) {
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [isConnectingLive, setIsConnectingLive] = useState(false);
  const [volume, setVolume] = useState(0);
  const [speechLevel, setSpeechLevel] = useState(0);
  const [subtitles, setSubtitles] = useState('');

  const liveServiceRef = useRef<LiveService | null>(null);
  const videoIntervalRef = useRef<number | null>(null);
  const frameAlternatorRef = useRef(false);
  const lastSentCodeRef = useRef<string>('');

  // Refs for values read inside async callbacks — avoids stale closures
  const currentProblemRef = useRef(currentProblem);
  const languageRef = useRef(language);
  useEffect(() => { currentProblemRef.current = currentProblem; }, [currentProblem]);
  useEffect(() => { languageRef.current = language; }, [language]);

  // Initialise LiveService once when apiKey is available
  useEffect(() => {
    if (apiKey && !liveServiceRef.current) {
      liveServiceRef.current = new LiveService(apiKey);
      liveServiceRef.current.onVolumeChange = (vol) => setVolume(vol);
      liveServiceRef.current.onOutputLevelChange = (level) => setSpeechLevel(level);
    }
  }, [apiKey]);

  // Cleanup on unmount — disconnect WebSocket and release microphone
  useEffect(() => {
    return () => {
      if (liveServiceRef.current) liveServiceRef.current.disconnect();
      if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
    };
  }, []);

  // Debounced code watcher — sends code updates during live sessions
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isLiveConnected && liveServiceRef.current && code !== lastSentCodeRef.current) {
        liveServiceRef.current.sendCodeContext(code);
        lastSentCodeRef.current = code;
      }
    }, CODE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [code, isLiveConnected]);

  const handleConnectLive = useCallback(async () => {
    if (!apiKey || !liveServiceRef.current) return;

    const problem = currentProblemRef.current;
    const lang = languageRef.current;

    try {
      setIsConnectingLive(true);

      const sessionInstruction = `
        ${SYSTEM_INSTRUCTION_INTERVIEWER}
        CONTEXT: We are currently looking at problem: ${problem.title} (Difficulty: ${problem.difficulty}, Lang: ${lang})
        Description: ${problem.description}
        NOTE: Operate as an open voice companion. Wait for the user to speak first, or greet them casually.
      `;

      await liveServiceRef.current.connect({
        systemInstruction: sessionInstruction,
        onMessage: (msg) => {
          setSubtitles(msg.text);
        },
        onToolCall: (functionCall) => {
          console.log('[Live] Tool call received:', functionCall);
          if (functionCall.name === 'update_interview_context') {
            const args = functionCall.args as any;
            if (args.language && args.problemTitle && args.problemDescription && args.starterCode && onUpdateContext) {
              onUpdateContext(args.language, args.problemTitle, args.problemDescription, args.starterCode);
            }
            liveServiceRef.current?.sendToolResponse([{
              id: functionCall.id,
              name: functionCall.name,
              response: { result: `Context successfully updated to ${args.problemTitle} in ${args.language}` }
            }]);
          }
        }
      });

      setIsLiveConnected(true);

      // Visual confirmation in the transcript
      setTimeout(() => {
        setMessages(prev => [
          ...prev,
          {
            id: Date.now().toString(),
            role: 'user' as const,
            text: 'Voice Session Connected',
            timestamp: Date.now(),
          },
        ]);
      }, 1000);

      // Begin periodic video frame capture of the WebCam
      videoIntervalRef.current = window.setInterval(async () => {
        if (liveServiceRef.current && avatarRef.current) {
          const base64Frame = avatarRef.current.captureWebcamFrame();
          if (base64Frame) {
            await liveServiceRef.current.sendVideoFrame(base64Frame);
          }
        }
      }, VIDEO_FRAME_INTERVAL_MS);
    } catch {
      // Connection failed — state resets in finally block
    } finally {
      setIsConnectingLive(false);
    }
  }, [apiKey, editorRef, setMessages]);

  const handleDisconnectLive = useCallback(async () => {
    if (liveServiceRef.current) await liveServiceRef.current.disconnect();
    if (videoIntervalRef.current) {
      clearInterval(videoIntervalRef.current);
      videoIntervalRef.current = null;
    }
    setIsLiveConnected(false);
    setVolume(0);
    setSpeechLevel(0);
  }, []);

  return {
    isLiveConnected,
    isConnectingLive,
    volume,
    speechLevel,
    subtitles,
    liveServiceRef,
    handleConnectLive,
    handleDisconnectLive,
  } as const;
}
