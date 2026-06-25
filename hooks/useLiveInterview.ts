import { useState, useRef, useCallback, useEffect } from 'react';
import { LiveService } from '@/services/liveService';
import type { CodeEditorHandle } from '@/components/CodeEditor';
import type { AvatarInterviewerHandle } from '@/components/AvatarInterviewer';
import type { ChatMessage, InterviewLanguage, InterviewProblem } from '@/types';
import {
  SYSTEM_INSTRUCTION_INTERVIEWER,
  CODE_DEBOUNCE_MS,
  VIDEO_FRAME_INTERVAL_MS,
  MALE_VOICE_NAME,
  FEMALE_VOICE_NAME,
} from '@/constants';

interface UseLiveInterviewParams {
  apiKey: string;
  currentProblem: InterviewProblem;
  language: InterviewLanguage;
  code: string;
  isFemale: boolean;
  editorRef: React.RefObject<CodeEditorHandle | null>;
  avatarRef: React.RefObject<AvatarInterviewerHandle | null>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  onUpdateContext?: (language: string, title: string, description: string, starterCode: string) => void;
  onTypeCode?: (code: string) => void;
}

function appendTranscriptChunk(current: string, chunk: string) {
  if (!current) return chunk;
  if (!chunk) return current;
  if (/\s$/.test(current) || /^\s|^[,.;:!?)]/.test(chunk)) {
    return current + chunk;
  }
  return `${current} ${chunk}`;
}

/**
 * Manages the Gemini Live audio interview session.
 */
export function useLiveInterview({
  apiKey,
  currentProblem,
  language,
  code,
  isFemale,
  editorRef,
  avatarRef,
  setMessages,
  onUpdateContext,
  onTypeCode,
}: UseLiveInterviewParams) {
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [isConnectingLive, setIsConnectingLive] = useState(false);
  const [volume, setVolume] = useState(0);
  const [speechLevel, setSpeechLevel] = useState(0);
  const [subtitles, setSubtitles] = useState('');
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [sessionTokens, setSessionTokens] = useState({ prompt: 0, candidates: 0, total: 0 });
  const [agentState, setAgentState] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');

  const liveServiceRef = useRef<LiveService | null>(null);
  const videoIntervalRef = useRef<number | null>(null);
  const frameAlternatorRef = useRef(false);
  const lastSentCodeRef = useRef<string>('');
  const currentModelTurnIdRef = useRef<string | null>(null);
  const currentUserSpeechTurnIdRef = useRef<string | null>(null);
  const isCameraEnabledRef = useRef(isCameraEnabled);
  const isLiveConnectedRef = useRef(isLiveConnected);
  const connectWarningRef = useRef<string | null>(null);
  const isConnectingLiveRef = useRef(false);
  const isSwitchingVoiceRef = useRef(false);
  const selectedVoiceRef = useRef(isFemale ? FEMALE_VOICE_NAME : MALE_VOICE_NAME);
  
  const lastUserSpeechTime = useRef<number>(0);
  const lastAISpeechTime = useRef<number>(0);

  // Refs for values read inside async callbacks — avoids stale closures
  const currentProblemRef = useRef(currentProblem);
  const languageRef = useRef(language);
  useEffect(() => { currentProblemRef.current = currentProblem; }, [currentProblem]);
  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { isCameraEnabledRef.current = isCameraEnabled; }, [isCameraEnabled]);
  useEffect(() => { isLiveConnectedRef.current = isLiveConnected; }, [isLiveConnected]);

  // Initialise LiveService once when apiKey is available
  useEffect(() => {
    if (apiKey && !liveServiceRef.current) {
      liveServiceRef.current = new LiveService(apiKey);
      liveServiceRef.current.setVoiceName(selectedVoiceRef.current);
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

  // Agent State Machine Tracker
  useEffect(() => {
    if (!isLiveConnected) {
      setAgentState('idle');
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      
      if (speechLevel > 0.05) {
        lastAISpeechTime.current = now;
        setAgentState('speaking');
      } else if (volume > 0.02 && !isMicMuted) {
        lastUserSpeechTime.current = now;
        setAgentState('listening');
      } else {
        // Neither is currently speaking actively.
        // If the user spoke recently, and the AI hasn't spoken since, the AI is likely "thinking".
        if (now - lastUserSpeechTime.current < 8000 && lastUserSpeechTime.current > lastAISpeechTime.current) {
          // Wait 500ms after the user stops speaking before showing 'thinking' to avoid flickering
          if (now - lastUserSpeechTime.current > 500) {
            setAgentState('thinking');
          }
        } else {
          // If no one has spoken for a while, go to idle
          if (now - lastAISpeechTime.current > 1000 && now - lastUserSpeechTime.current > 1000) {
            setAgentState('idle');
          }
        }
      }
    }, 150);

    return () => clearInterval(interval);
  }, [isLiveConnected, volume, speechLevel, isMicMuted]);

  // Log state changes for debugging
  useEffect(() => {
    if (isLiveConnected) {
      console.log(`[Agent State Changed]: ${agentState.toUpperCase()}`);
    }
  }, [agentState, isLiveConnected]);

  const noteUserTurnStarted = useCallback(() => {
    currentModelTurnIdRef.current = null;
    currentUserSpeechTurnIdRef.current = null;
    setSubtitles('');
  }, []);

  const handleConnectLive = useCallback(async (options?: { muted?: boolean }) => {
    if (!apiKey || !liveServiceRef.current || isConnectingLiveRef.current) return;

    const isMuted = options?.muted ?? false;

    // If already connected, just unmute the mic and update UI state
    if (liveServiceRef.current.isConnected) {
      if (!isMuted) {
        await liveServiceRef.current.setMicMuted(false);
        isLiveConnectedRef.current = true;
        setIsLiveConnected(true);
      }
      return;
    }

    if (isLiveConnectedRef.current) return;

    const problem = currentProblemRef.current;
    const lang = languageRef.current;
    const voiceName = selectedVoiceRef.current;

    try {
      isConnectingLiveRef.current = true;
      setIsConnectingLive(true);
      connectWarningRef.current = null;

      const sessionInstruction = `
        ${SYSTEM_INSTRUCTION_INTERVIEWER}
        CONTEXT: We are currently looking at problem: ${problem.title} (Difficulty: ${problem.difficulty}, Lang: ${lang})
        Description: ${problem.description}
        NOTE: Operate as an open voice companion. Wait for the user to speak first, or greet them casually.
      `;

      await liveServiceRef.current.connect({
        voiceName,
        systemInstruction: sessionInstruction,
        muted: isMuted,
        onStateChange: (state) => {
          if (state === 'connected') {
            if (!isMuted) {
              isLiveConnectedRef.current = true;
              setIsLiveConnected(true);
            }
            return;
          }

          if (state === 'closed' || state === 'error') {
            isLiveConnectedRef.current = false;
            setIsLiveConnected(false);
            setVolume(0);
            setSpeechLevel(0);
          }
        },
        onWarning: (message) => {
          connectWarningRef.current = message;
        },
        onMessage: (msg) => {
          if (!currentModelTurnIdRef.current) {
             currentModelTurnIdRef.current = Date.now().toString();
             setSubtitles(''); // Clear subtitle at start of new turn
          }

          const turnId = currentModelTurnIdRef.current;

          // Update Subtitles
          setSubtitles((prev) => {
            const newSub = prev + msg.text;
            return newSub.length > 200 ? "..." + newSub.substring(newSub.length - 197) : newSub;
          });

          // Append to Chat Messages
          setMessages((prev) => {
            const newMessages = [...prev];
            const lastMsgIndex = newMessages.findIndex(m => m.id === turnId);

            if (lastMsgIndex >= 0) {
              newMessages[lastMsgIndex] = {
                ...newMessages[lastMsgIndex],
                text: appendTranscriptChunk(newMessages[lastMsgIndex].text, msg.text)
              };
            } else {
              newMessages.push({
                id: turnId,
                role: 'model',
                text: msg.text,
                timestamp: Date.now()
              });
            }
            return newMessages;
          });

          // If turn is complete, reset the turn ID
          if (!msg.partial) {
             currentModelTurnIdRef.current = null;
          }
        },
        onInputTranscript: (msg) => {
          if (!currentUserSpeechTurnIdRef.current) {
            currentUserSpeechTurnIdRef.current = `user-speech-${Date.now()}`;
            currentModelTurnIdRef.current = null;
          }

          const turnId = currentUserSpeechTurnIdRef.current;

          setMessages((prev) => {
            const newMessages = [...prev];
            const lastMsgIndex = newMessages.findIndex(m => m.id === turnId);

            if (lastMsgIndex >= 0) {
              newMessages[lastMsgIndex] = {
                ...newMessages[lastMsgIndex],
                text: appendTranscriptChunk(newMessages[lastMsgIndex].text, msg.text)
              };
            } else {
              newMessages.push({
                id: turnId,
                role: 'user',
                text: msg.text,
                timestamp: Date.now()
              });
            }

            return newMessages;
          });

          if (!msg.partial) {
            currentUserSpeechTurnIdRef.current = null;
          }
        },
        onToolCall: (functionCall) => {
          console.log('[Live] Tool call received:', functionCall);
          if (functionCall.name === 'update_interview_context') {
            const args = functionCall.args as any;
            console.log('[Live] update_interview_context args:', args);
            
            const lang = args.language || 'python';
            const title = args.problemTitle || 'Custom Problem';
            const desc = args.problemDescription || 'Please solve the problem described by the interviewer.';
            const code = args.starterCode || '# Your code here';

            if (onUpdateContext) {
              onUpdateContext(lang, title, desc, code);
              // PREVENT echoing this new code back immediately!
              lastSentCodeRef.current = code;
            }
            
            liveServiceRef.current?.sendToolResponse([{
              id: functionCall.id,
              name: functionCall.name,
              response: { result: `Context successfully updated to ${title} in ${lang}.` }
            }]);
          } else if (functionCall.name === 'type_code') {
            const args = functionCall.args as any;
            const newCode = args.code || '';
            console.log('[Live] type_code args:', args);

            if (onTypeCode) {
              onTypeCode(newCode);
              lastSentCodeRef.current = newCode;
            }

            liveServiceRef.current?.sendToolResponse([{
              id: functionCall.id,
              name: functionCall.name,
              response: { result: `Code successfully typed into the editor.` }
            }]);
          }
        },
        onUsageUpdate: (usage) => {
          setSessionTokens(prev => ({
            prompt: prev.prompt + (usage.promptTokenCount || 0),
            candidates: prev.candidates + (usage.candidatesTokenCount || 0),
            total: prev.total + (usage.totalTokenCount || 0)
          }));
        }
      });

      // Visual confirmation in the transcript
      if (!isSwitchingVoiceRef.current) {
        setTimeout(() => {
          setMessages(prev => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'user' as const,
              text: 'Voice Session Connected',
              timestamp: Date.now(),
            },
            ...(connectWarningRef.current
              ? [{
                  id: (Date.now() + 1).toString(),
                  role: 'model' as const,
                  text: connectWarningRef.current,
                  timestamp: Date.now(),
                  source: 'system' as const,
                }]
              : []),
          ]);
        }, 1000);
      }

      // Begin periodic video frame capture of the WebCam
      videoIntervalRef.current = window.setInterval(async () => {
        if (liveServiceRef.current && avatarRef.current && isCameraEnabledRef.current) {
          const base64Frame = avatarRef.current.captureWebcamFrame();
          if (base64Frame) {
            await liveServiceRef.current.sendVideoFrame(base64Frame);
          }
        }
      }, VIDEO_FRAME_INTERVAL_MS);
    } catch (error: any) {
      console.error('[Live] Failed to connect voice session:', error);
      setIsLiveConnected(false);
      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'model',
          text: error?.message || 'Voice connection failed. Please check mic permission, API key, and Live API access.',
          timestamp: Date.now(),
          source: 'system',
        },
      ]);
    } finally {
      isConnectingLiveRef.current = false;
      setIsConnectingLive(false);
    }
  }, [apiKey, avatarRef, onTypeCode, onUpdateContext, setMessages]);

  const handleDisconnectLive = useCallback(async (options?: { keepAudioContexts?: boolean }) => {
    if (liveServiceRef.current) {
      await liveServiceRef.current.setMicMuted(true);
    }
    if (videoIntervalRef.current) {
      clearInterval(videoIntervalRef.current);
      videoIntervalRef.current = null;
    }
    isLiveConnectedRef.current = false;
    setIsLiveConnected(false);
    setVolume(0);
    setSpeechLevel(0);
    setIsMicMuted(false);
  }, []);

  // Autoconnect on load in background (muted)
  useEffect(() => {
    if (apiKey && liveServiceRef.current && !isLiveConnectedRef.current && !isConnectingLiveRef.current) {
      handleConnectLive({ muted: true }).catch((err) => {
        console.error('[Live] Background auto-connect failed:', err);
      });
    }
  }, [apiKey, handleConnectLive]);

  const toggleMic = useCallback(() => {
    if (liveServiceRef.current) {
      const currentMuted = liveServiceRef.current.isMicMuted;
      const nextMuted = !currentMuted;
      setIsMicMuted(nextMuted);
      liveServiceRef.current.setMicMuted(nextMuted).catch((error) => {
        console.error('[Live] Failed to toggle microphone:', error);
        setIsMicMuted(currentMuted);
      });
    }
  }, []);

  const toggleCamera = useCallback(() => {
    setIsCameraEnabled(prev => !prev);
  }, []);

  // Gemini Live applies its voice when a session is created. If the user
  // changes interviewer avatars, quietly recreate the voice connection
  // so the visible avatar and spoken voice match.
  useEffect(() => {
    const nextVoiceName = isFemale ? FEMALE_VOICE_NAME : MALE_VOICE_NAME;
    const voiceChanged = selectedVoiceRef.current !== nextVoiceName;
    selectedVoiceRef.current = nextVoiceName;
    liveServiceRef.current?.setVoiceName(nextVoiceName);

    if (!voiceChanged || isConnectingLiveRef.current || !liveServiceRef.current?.isConnected) return;

    let cancelled = false;

    const switchLiveVoice = async () => {
      const wasVoiceActive = isLiveConnectedRef.current;
      const wasMicMuted = liveServiceRef.current?.isMicMuted ?? false;
      isSwitchingVoiceRef.current = true;
      currentModelTurnIdRef.current = null;
      currentUserSpeechTurnIdRef.current = null;
      setSubtitles('');

      try {
        if (liveServiceRef.current) {
          await liveServiceRef.current.disconnect({ keepAudioContexts: true });
        }
        if (cancelled) return;

        await handleConnectLive({ muted: !wasVoiceActive });
        if (cancelled || !liveServiceRef.current) return;

        if (wasVoiceActive && wasMicMuted) {
          await liveServiceRef.current.setMicMuted(true);
          setIsMicMuted(true);
        }
      } catch (error) {
        console.error('[Live] Failed to switch interviewer voice:', error);
      } finally {
        isSwitchingVoiceRef.current = false;
      }
    };

    switchLiveVoice();
    return () => {
      cancelled = true;
    };
  }, [isFemale, handleConnectLive]);

  return {
    isLiveConnected,
    isConnectingLive,
    volume,
    speechLevel,
    subtitles,
    isMicMuted,
    isCameraEnabled,
    sessionTokens,
    agentState,
    toggleMic,
    toggleCamera,
    liveServiceRef,
    handleConnectLive,
    handleDisconnectLive,
    noteUserTurnStarted,
  } as const;
}
