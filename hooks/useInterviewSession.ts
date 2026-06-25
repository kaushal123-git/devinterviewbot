import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ChatMessage, InterviewLanguage, InterviewProblem } from '@/types';
import type { LiveService } from '@/services/liveService';
import { streamChatMessage, type TokenUsage } from '@/services/geminiService';
import { FEMALE_VOICE_NAME } from '@/constants';
import { PROBLEMS } from '@/constants';

interface UseInterviewSessionParams {
  apiKey: string;
}

interface SessionTokenTotals {
  prompt: number;
  candidates: number;
  total: number;
}

function takeSpeakableChunk(text: string, force: boolean = false, minBoundaryLength: number = 50) {
  const trimmed = text.trim();
  if (!trimmed) return { chunk: '', rest: '' };

  const boundaryRegex = /[.!?](?:\s+|$)/g;
  let boundary: RegExpExecArray | null;
  let lastBoundaryEnd = -1;

  while ((boundary = boundaryRegex.exec(text)) !== null) {
    const end = boundary.index + boundary[0].length;
    lastBoundaryEnd = end;
    if (end >= minBoundaryLength) {
      return {
        chunk: text.slice(0, end).trim(),
        rest: text.slice(end),
      };
    }
  }

  if (trimmed.length >= 140 && lastBoundaryEnd >= minBoundaryLength) {
    return {
      chunk: text.slice(0, lastBoundaryEnd).trim(),
      rest: text.slice(lastBoundaryEnd),
    };
  }

  const lineBreakIndex = text.indexOf('\n');
  if (lineBreakIndex >= minBoundaryLength) {
    return {
      chunk: text.slice(0, lineBreakIndex).trim(),
      rest: text.slice(lineBreakIndex + 1),
    };
  }

  if (force || trimmed.length >= 140) {
    return {
      chunk: trimmed,
      rest: '',
    };
  }

  return { chunk: '', rest: text };
}

/**
 * Manages the interview session state: problem selection, language,
 * code editor content, chat messages, and message sending (text or live).
 *
 * Call `setLiveRefs()` inside a useEffect after the live hook initialises
 * to wire up live-connected state without creating a circular dependency.
 */
export function useInterviewSession({ apiKey }: UseInterviewSessionParams) {
  const [currentProblem, setCurrentProblem] = useState<InterviewProblem>(PROBLEMS[0]);
  const [language, setLanguage] = useState<InterviewLanguage>('python');
  const [code, setCode] = useState(PROBLEMS[0].starters.python);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [chatTokens, setChatTokens] = useState<SessionTokenTotals>({ prompt: 0, candidates: 0, total: 0 });
  
  // Animation Ref
  const typeEffectIntervalRef = useRef<number | null>(null);

  // Refs for values read inside async callbacks — avoids stale closures
  // and keeps useCallback dependency arrays minimal.
  const isLiveConnectedRef = useRef(false);
  const liveServiceExtRef = useRef<React.RefObject<LiveService | null> | null>(null);
  const liveUserTurnStartedRef = useRef<(() => void) | null>(null);
  const messagesRef = useRef(messages);
  const currentProblemRef = useRef(currentProblem);
  const languageRef = useRef(language);
  const codeRef = useRef(code);

  // Keep refs in sync with state
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { currentProblemRef.current = currentProblem; }, [currentProblem]);
  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { codeRef.current = code; }, [code]);

  /**
   * Synchronise live-interview refs.
   * Must be called inside a useEffect in the parent component.
   */
  const setLiveRefs = useCallback(
    (
      connected: boolean,
      service: React.RefObject<LiveService | null>,
      onUserTurnStarted?: () => void,
    ) => {
      isLiveConnectedRef.current = connected;
      liveServiceExtRef.current = service; // store the ref object, not a snapshot of .current
      liveUserTurnStartedRef.current = onUserTurnStarted || null;
    },
    [],
  );

  // Reset messages when problem changes
  useEffect(() => {
    setMessages([
      {
        id: '1',
        role: 'model',
        text: `Hello. I am your AI Technical Interviewer. We will be working on "${currentProblem.title}".\n\nPlease let me know when you are ready to begin.`,
        timestamp: Date.now(),
      },
    ]);
  }, [currentProblem.title]);

  const handleRandomProblem = useCallback(() => {
    // Filter out current problem so user always sees a different one
    const others = PROBLEMS.filter(p => p.id !== currentProblemRef.current.id);
    const pool = others.length > 0 ? others : PROBLEMS;
    const random = pool[Math.floor(Math.random() * pool.length)];
    setCurrentProblem(random);
    setCode(random.starters[languageRef.current]);
  }, []);

  const handleLanguageChange = useCallback(
    (lang: InterviewLanguage) => {
      if (lang === languageRef.current) return;
      setLanguage(lang);
      // Only reset the code if the current problem has a starter for this language
      const starter = currentProblemRef.current.starters[lang];
      if (starter) {
        setCode(starter);
      }
    },
    [],
  );

  const setDynamicProblem = useCallback(
    (lang: string, title: string, description: string, starterCode: string) => {
      // Create a dynamic problem object
      const dynamicProblem: InterviewProblem = {
        id: `dynamic-${Date.now()}`,
        title,
        description,
        difficulty: 'Medium',
        starters: {
          [lang as InterviewLanguage]: starterCode
        } as Record<InterviewLanguage, string>
      };
      
      setCurrentProblem(dynamicProblem);
      setLanguage(lang as InterviewLanguage);
      setCode(starterCode);

      console.log(`[useInterviewSession] Successfully changed problem to: "${title}" in ${lang}`);
    },
    []
  );

  const addChatUsageDelta = useCallback((usage: TokenUsage, previousUsage: SessionTokenTotals) => {
    const nextUsage = {
      prompt: usage.promptTokenCount || 0,
      candidates: usage.candidatesTokenCount || 0,
      total: usage.totalTokenCount || 0,
    };

    const delta = {
      prompt: Math.max(0, nextUsage.prompt - previousUsage.prompt),
      candidates: Math.max(0, nextUsage.candidates - previousUsage.candidates),
      total: Math.max(0, nextUsage.total - previousUsage.total),
    };

    if (delta.prompt || delta.candidates || delta.total) {
      setChatTokens(prev => ({
        prompt: prev.prompt + delta.prompt,
        candidates: prev.candidates + delta.candidates,
        total: prev.total + delta.total,
      }));
    }

    return nextUsage;
  }, []);

  const handleSendMessage = useCallback(
    async (text: string, useThinking: boolean) => {
      const newUserMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        text,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, newUserMsg]);

      const liveSpeechService = liveServiceExtRef.current?.current ?? null;
      if (liveSpeechService && liveSpeechService.isConnected) {
        liveUserTurnStartedRef.current?.();
        liveSpeechService.sendText(text);
        return;
      }

      // Build history of prior turns (excluding the active user message)
      const history = messagesRef.current.map(m => ({
        role: m.role,
        text: m.text,
      }));

      const problem = currentProblemRef.current;
      const contextPrompt = `
      [Current Problem]
      Title: ${problem.title}
      Description: ${problem.description}
      Language: ${languageRef.current}
      `;

      setIsLoadingChat(true);
      try {
        const speechService = liveServiceExtRef.current?.current ?? null;
        const speechVoiceName = speechService?.getVoiceName();
        const effectiveVoice = speechVoiceName || FEMALE_VOICE_NAME;
        console.log('[useInterviewSession] speechService:', speechService, 'voice:', effectiveVoice, 'liveConnected:', isLiveConnectedRef.current);
        // Use effectiveVoice for TTS when live is off
        const modelMessageId = (Date.now() + 1).toString();
        let speechBuffer = '';
        let spokenChunkCount = 0;
        let responseText = '';
        let lastUsage: SessionTokenTotals = { prompt: 0, candidates: 0, total: 0 };

        setMessages(prev => [
          ...prev,
          {
            id: modelMessageId,
            role: 'model',
            text: '',
            timestamp: Date.now(),
            isThinking: useThinking,
          },
        ]);

        if (speechService) {
          speechService.stopSpeech();
          if (isLiveConnectedRef.current) {
            speechService.prepareForSpeech().catch((error) => {
              console.warn('[useInterviewSession] Failed to prepare speech audio:', error);
            });
          }
        }

        // When live voice is ON: stream chunks to TTS for low-latency playback.
        // When live voice is OFF: collect full response, then speak once for natural prosody.
        const flushSpeech = (force: boolean = false) => {
          if (!speechService || !isLiveConnectedRef.current) return;

          const minBoundaryLength = spokenChunkCount === 0 ? 18 : 50;
          let next = takeSpeakableChunk(speechBuffer, force, minBoundaryLength);
          while (next.chunk) {
            spokenChunkCount += 1;
            speechService.speak(next.chunk, { interrupt: false, voiceName: speechVoiceName }).catch((error) => {
              console.warn('[useInterviewSession] Failed to speak chat chunk:', error);
            });
            speechBuffer = next.rest;
            next = takeSpeakableChunk(speechBuffer, force);
          }
        };

        responseText = await streamChatMessage(
          apiKey,
          history,
          contextPrompt + '\n' + text,
          codeRef.current,
          useThinking,
          (chunk) => {
            responseText += chunk;
            speechBuffer += chunk;

            setMessages(prev => prev.map(message =>
              message.id === modelMessageId
                ? { ...message, text: message.text + chunk }
                : message
            ));

            flushSpeech(false);
          },
          (usage) => {
            lastUsage = addChatUsageDelta(usage, lastUsage);
          },
        );

        flushSpeech(true);

        // When voice is OFF: speak the complete response in one TTS call
        if (speechService && effectiveVoice && !isLiveConnectedRef.current && responseText.trim()) {
          speechService.prepareForSpeech().catch(() => undefined);
          speechService.speak(responseText, { interrupt: true, voiceName: effectiveVoice }).catch((error) => {
            console.warn('[useInterviewSession] Failed to speak chat response:', error);
          });
        // When voice is ON but nothing was chunked yet (edge case): speak full response
        } else if (isLiveConnectedRef.current && speechService && speechVoiceName && spokenChunkCount === 0 && responseText.trim()) {
          speechService.speak(responseText, { interrupt: false, voiceName: speechVoiceName }).catch((error) => {
            console.warn('[useInterviewSession] Failed to speak final chat response:', error);
          });
        }

        if (!responseText) {
          setMessages(prev => prev.map(message =>
            message.id === modelMessageId
              ? { ...message, text: 'No response generated.' }
              : message
          ));
        }
      } catch (error: any) {
        const errorMsg: ChatMessage = {
          id: (Date.now() + 2).toString(),
          role: 'model',
          text: error?.message || 'An error occurred while generating a response. Please try again.',
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, errorMsg]);
      } finally {
        setIsLoadingChat(false);
      }
    },
    [apiKey],
  );

  const typeCodeEffect = useCallback((targetCode: string) => {
    // Clear any existing animation
    if (typeEffectIntervalRef.current) clearInterval(typeEffectIntervalRef.current);
    
    let currentIndex = 0;
    // Set to 5 characters per tick for a smooth, fast typing effect
    const charsPerTick = 5;
    
    // Clear the current editor first
    setCode("");
    
    typeEffectIntervalRef.current = window.setInterval(() => {
      currentIndex += charsPerTick;
      if (currentIndex >= targetCode.length) {
        setCode(targetCode);
        if (typeEffectIntervalRef.current) clearInterval(typeEffectIntervalRef.current);
      } else {
        setCode(targetCode.substring(0, currentIndex));
      }
    }, 20); // 20ms per tick
  }, []);

  const latestModelText = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'model' && messages[i].text.trim()) {
        return messages[i].text;
      }
    }
    return '';
  }, [messages]);

  return {
    currentProblem,
    setCurrentProblem,
    language,
    setLanguage,
    setDynamicProblem,
    code,
    setCode,
    messages,
    setMessages,
    isLoadingChat,
    chatTokens,
    handleRandomProblem,
    handleLanguageChange,
    handleSendMessage,
    setLiveRefs,
    typeCodeEffect,
    latestModelText,
  } as const;
}
