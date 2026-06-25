import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
import { base64ToBytes, decodeAudioData, float32To16BitPCM, bytesToBase64 } from '@/utils/audioUtils';
import {
  SYSTEM_INSTRUCTION_INTERVIEWER,
  GEMINI_LIVE_MODEL,
  GEMINI_TTS_MODEL,
  DEFAULT_VOICE_NAME,
  FEMALE_VOICE_NAME,
  INPUT_SAMPLE_RATE,
  OUTPUT_SAMPLE_RATE,
  AUDIO_CHUNK_SIZE,
  CODE_TRUNCATE_LIMIT,
  MIC_UNMUTE_TIMEOUT_MS,
} from '@/constants';

// Define LiveSession type locally as it is not exported from the SDK
type LiveSession = Awaited<ReturnType<GoogleGenAI['live']['connect']>>;

export interface LiveConnectOptions {
  onMessage?: (message: { text: string; partial?: boolean }) => void;
  onInputTranscript?: (message: { text: string; partial?: boolean }) => void;
  onStateChange?: (state: 'connecting' | 'connected' | 'closed' | 'error') => void;
  onWarning?: (message: string) => void;
  systemInstruction?: string;
  initialMessage?: string;
  voiceName?: string;
  onToolCall?: (functionCall: any) => void;
  onUsageUpdate?: (usage: any) => void;
}

/**
 * Manages a real-time voice interview session with the Gemini Live API.
 *
 * Responsibilities:
 * - Opens a WebSocket connection to Gemini Live (audio modality)
 * - Captures microphone input at 16 kHz PCM and streams it to the model
 * - Decodes and plays the model's 24 kHz audio responses in sequence
 * - Provides helpers for sending text turns, code context, and video frames
 * - Offers a standalone TTS method for text-chat responses
 */
export class LiveService {
  private ai: GoogleGenAI;
  private session: LiveSession | null = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private inputStream: MediaStream | null = null;
  private outputMixGain: GainNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private outputMeterData: Float32Array | null = null;
  private outputMeterRafId: number | null = null;
  private smoothedOutputLevel: number = 0;
  private nextStartTime: number = 0;
  private activeSources: Set<AudioBufferSourceNode> = new Set();
  public isConnected: boolean = false;
  private isManualMicMuted: boolean = false;
  private isTextTurnMuted: boolean = false;
  private textTurnMuteTimeoutId: number | null = null;
  private speechQueue: Promise<void> = Promise.resolve();
  private speechGeneration: number = 0;
  private voiceName: string = DEFAULT_VOICE_NAME;
  private connectOptions: LiveConnectOptions | null = null;

  public onVolumeChange: ((volume: number) => void) | null = null;
  public onOutputLevelChange: ((level: number) => void) | null = null;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  public setVoiceName(voiceName: string) {
    this.voiceName = voiceName;
  }

  public getVoiceName() {
    return this.voiceName;
  }

  private prepareTextForSpeech(text: string, voiceName: string) {
    return text
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/([!?]){2,}/g, '$1')
      .replace(/\s*([,;:])\s*/g, '$1 ')
      .replace(/([.!?])\s+(?=\S)/g, ', ')
      .trim();
  }

  /** Opens a live session, acquires the microphone, and begins streaming. */
  public async connect(options?: LiveConnectOptions & { muted?: boolean }): Promise<void> {
    if (this.isConnected) return;
    if (options) {
      this.connectOptions = options;
    }
    options?.onStateChange?.('connecting');

    const shouldRequestMic = !(options?.muted ?? false);
    let stream: MediaStream | null = this.inputStream;

    if (shouldRequestMic) {
      const isStreamActive = stream && stream.getTracks().some(track => track.readyState === 'live');
      try {
        if (!isStreamActive) {
          stream = await this.requestMicrophone();
          this.inputStream = stream;
        }
        this.inputAudioContext = await this.ensureSingleContext(this.inputAudioContext, INPUT_SAMPLE_RATE);
      } catch (error) {
        const message = this.describeMicrophoneError(error);
        console.warn('[LiveService] Microphone unavailable, connecting without mic:', error);
        options?.onWarning?.(message);
      }
    } else {
      this.isManualMicMuted = true;
    }

    try {
      this.outputAudioContext = await this.ensureSingleContext(this.outputAudioContext, OUTPUT_SAMPLE_RATE);
      this.ensureOutputNodes();
    } catch (error) {
      console.warn('[LiveService] Output audio setup will retry when audio arrives:', error);
    }

    const instructionText = options?.systemInstruction || SYSTEM_INSTRUCTION_INTERVIEWER;
    const voiceName = options?.voiceName ?? this.voiceName;

    try {
      this.session = await this.ai.live.connect({
        model: GEMINI_LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
          systemInstruction: {
            parts: [{ text: instructionText }]
          },
          tools: [{
            functionDeclarations: [
              {
                name: 'update_interview_context',
                description: 'Changes the interview programming language and sets a new dynamically generated problem. Use this when the user asks to switch languages, or asks for a new interview question.',
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    language: {
                      type: Type.STRING,
                      description: 'The programming language (e.g. "python", "typescript", "javascript", "java", "cpp", "c")'
                    },
                    problemTitle: {
                      type: Type.STRING,
                      description: 'Title of the new coding problem'
                    },
                    problemDescription: {
                      type: Type.STRING,
                      description: 'Detailed markdown description of the new problem requirements and constraints'
                    },
                    starterCode: {
                      type: Type.STRING,
                      description: 'Initial starter code for the user to begin with in the specified language'
                    }
                  },
                  required: ['language', 'problemTitle', 'problemDescription', 'starterCode']
                }
              },
              {
                name: 'type_code',
                description: 'Types or replaces code directly in the code editor. Use this tool when the user asks you to write code, provide an example, fix a bug, or type something out.',
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    code: {
                      type: Type.STRING,
                      description: 'The exact code to write into the code editor. This will completely replace the current contents of the editor.'
                    }
                  },
                  required: ['code']
                }
              }
            ]
          }],
        },
        callbacks: {
          onopen: async () => {
            console.log('[LiveService] WebSocket connected successfully.');
            this.isConnected = true;
            options?.onStateChange?.('connected');
          },
          onmessage: async (msg: LiveServerMessage) => {
            this.handleServerMessage(msg, options?.onMessage, options);
          },
          onclose: (event: any) => {
            console.warn('[LiveService] WebSocket closed:', event);
            this.isConnected = false;
            options?.onStateChange?.('closed');
          },
          onerror: (err: any) => {
            console.error('[LiveService] WebSocket error:', err);
            this.isConnected = false;
            options?.onStateChange?.('error');
          },
        },
      });
    } catch (error) {
      this.stopAudioInput(true);
      throw error;
    }

    // Send initial trigger BEFORE audio so the model responds to the text prompt
    // rather than ambient silence.
    if (options?.initialMessage) {
      await this.sendText(options.initialMessage);
      // Brief pause so the backend registers the text turn before audio floods in
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (stream) {
      this.startAudioInput(stream);
    }
  }

  // --- Audio Context Helpers ---

  /**
   * Ensures both input and output AudioContexts exist and are active.
   * Recreates closed contexts and resumes suspended ones (browser autoplay policy).
   */
  private async ensureAudioContexts() {
    this.inputAudioContext = await this.ensureSingleContext(this.inputAudioContext, INPUT_SAMPLE_RATE);
    this.outputAudioContext = await this.ensureSingleContext(this.outputAudioContext, OUTPUT_SAMPLE_RATE);
    this.ensureOutputNodes();
  }

  /**
   * Creates or resumes a single AudioContext at the given sample rate.
   * Returns the ready-to-use context.
   */
  private async ensureSingleContext(
    ctx: AudioContext | null,
    sampleRate: number,
  ): Promise<AudioContext> {
    if (!ctx || ctx.state === 'closed') {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate });
    }
    if (ctx.state === 'suspended') await ctx.resume();
    return ctx;
  }

  private async requestMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone access is not available in this browser.');
    }

    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
    } catch (error) {
      // Retry with the broadest constraints in case a specific enhancement is unsupported.
      return await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {
        throw error;
      });
    }
  }

  private describeMicrophoneError(error: unknown) {
    const err = error as { name?: string; message?: string };
    const detail = err?.message ? ` (${err.message})` : '';

    if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
      return 'Microphone permission is blocked. Allow mic access in the browser, then reconnect voice.';
    }

    if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
      return 'No microphone was found. Connect or select an input device, then reconnect voice.';
    }

    if (err?.name === 'NotReadableError' || err?.name === 'TrackStartError') {
      return `Microphone is busy or could not start${detail}. Close other apps/tabs using the mic, then reconnect voice.`;
    }

    return `Microphone could not start${detail}. The voice session connected without mic input.`;
  }

  /** Creates shared output nodes for audio playback + level metering. */
  private ensureOutputNodes() {
    if (!this.outputAudioContext) return;

    const outputCtx = this.outputAudioContext;
    if (
      this.outputMixGain &&
      this.outputAnalyser &&
      this.outputMixGain.context === outputCtx &&
      this.outputAnalyser.context === outputCtx
    ) {
      this.startOutputMetering();
      return;
    }

    this.stopOutputMetering();

    this.outputMixGain = outputCtx.createGain();
    this.outputMixGain.gain.value = 1;

    this.outputAnalyser = outputCtx.createAnalyser();
    this.outputAnalyser.fftSize = 1024;
    this.outputAnalyser.smoothingTimeConstant = 0.75;
    this.outputMeterData = new Float32Array(this.outputAnalyser.fftSize);

    this.outputMixGain.connect(this.outputAnalyser);
    this.outputAnalyser.connect(outputCtx.destination);
    this.startOutputMetering();
  }

  private startOutputMetering() {
    if (!this.outputAnalyser || this.outputMeterRafId !== null) return;

    const tick = () => {
      if (!this.outputAnalyser || !this.outputMeterData) {
        this.outputMeterRafId = null;
        return;
      }
      this.outputAnalyser.getFloatTimeDomainData(this.outputMeterData as Float32Array<ArrayBuffer>);

      let sum = 0;
      const len = this.outputMeterData.length;
      for (let i = 0; i < len; i++) {
        const v = this.outputMeterData[i];
        sum += v * v;
      }

      const rms = Math.sqrt(sum / len);
      const normalized = Math.min(1, rms * 4);
      const attack = 0.55;
      const release = 0.15;
      const smoothing = normalized > this.smoothedOutputLevel ? attack : release;
      this.smoothedOutputLevel += (normalized - this.smoothedOutputLevel) * smoothing;

      if (this.onOutputLevelChange) {
        this.onOutputLevelChange(this.smoothedOutputLevel);
      }

      this.outputMeterRafId = requestAnimationFrame(tick);
    };

    this.outputMeterRafId = requestAnimationFrame(tick);
  }

  private stopOutputMetering() {
    if (this.outputMeterRafId !== null) {
      cancelAnimationFrame(this.outputMeterRafId);
      this.outputMeterRafId = null;
    }
    this.smoothedOutputLevel = 0;
    if (this.onOutputLevelChange) this.onOutputLevelChange(0);
  }

  // --- Microphone Input ---

  private startAudioInput(stream: MediaStream) {
    this.stopAudioInput(false);

    if (!this.inputAudioContext || !this.session) return;

    this.inputSource = this.inputAudioContext.createMediaStreamSource(stream);
    this.processor = this.inputAudioContext.createScriptProcessor(AUDIO_CHUNK_SIZE, 1, 1);

    this.processor.onaudioprocess = (e) => {
      if (!this.session || !this.isConnected) return;

      // CRITICAL: While processing a text turn, do NOT send any audio data.
      // Even silence frames signal "user is speaking" and cancel the text turn.
      if (this.isEffectiveMicMuted()) return;

      const inputData = e.inputBuffer.getChannelData(0);

      // RMS volume for the UI visualiser
      if (this.onVolumeChange) {
        let sum = 0;
        const len = inputData.length;
        for (let i = 0; i < len; i++) {
          sum += inputData[i] * inputData[i];
        }
        this.onVolumeChange(Math.sqrt(sum / len));
      }

      const pcmData = float32To16BitPCM(inputData);
      const base64 = bytesToBase64(new Uint8Array(pcmData));

      try {
        this.session.sendRealtimeInput({
          audio: { mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`, data: base64 },
        });
      } catch {
        // Ignore transient WebSocket send errors
      }
    };

    this.inputSource.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);
  }

  private stopAudioInput(stopStream: boolean = true) {
    if (this.processor) {
      this.processor.onaudioprocess = null;
      this.processor.disconnect();
      this.processor = null;
    }

    if (this.inputSource) {
      this.inputSource.disconnect();
      this.inputSource = null;
    }

    if (stopStream && this.inputStream) {
      this.inputStream.getTracks().forEach((track) => track.stop());
      this.inputStream = null;
    }

    if (this.onVolumeChange) this.onVolumeChange(0);
  }

  // --- Server Message Handling ---

  private async handleServerMessage(
    message: LiveServerMessage,
    onTextMessage?: (message: { text: string; partial?: boolean }) => void,
    options?: LiveConnectOptions,
  ) {
    const serverContent = message.serverContent;
    
    // Process usage metadata
    if (message.usageMetadata && options?.onUsageUpdate) {
      options.onUsageUpdate(message.usageMetadata);
    }

    // Process tool calls (these arrive outside of serverContent in the new SDK)
    if (message.toolCall?.functionCalls && options?.onToolCall) {
      console.log('[LiveService] Received toolCall from server:', message.toolCall.functionCalls);
      for (const funcCall of message.toolCall.functionCalls) {
        options.onToolCall(funcCall);
      }
    }

    // Process server content (audio, text)
    if (!serverContent) return;

    if (serverContent.interrupted) {
      this.stopAudioPlayback();
      this.clearTextTurnMute();
    }

    if (serverContent.outputTranscription?.text && onTextMessage) {
      onTextMessage({
        text: serverContent.outputTranscription.text,
        partial: !serverContent.outputTranscription.finished,
      });
    }

    if (serverContent.inputTranscription?.text && options?.onInputTranscript) {
      options.onInputTranscript({
        text: serverContent.inputTranscription.text,
        partial: !serverContent.inputTranscription.finished,
      });
    }

    if (serverContent.modelTurn?.parts?.[0]?.inlineData) {
      const audioData = serverContent.modelTurn.parts[0].inlineData.data;
      if (audioData) {
        // Re-enable barge-in as soon as model audio begins.
        this.clearTextTurnMute();
        this.playAudioChunk(audioData);
      }
    }

    // Collect any text parts for the optional text callback
    const textParts: string[] = [];
    const parts = serverContent.modelTurn?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.text) textParts.push(part.text);
        // Fallback for older SDKs where functionCall was inside parts
        if (part.functionCall && options?.onToolCall) {
          options.onToolCall(part.functionCall);
        }
      }
    }
    if (textParts.length > 0 && onTextMessage && !serverContent.outputTranscription?.text) {
      const fullText = textParts.join('\n');
      console.log(`[LiveService] Received text part (${serverContent.turnComplete ? 'complete' : 'partial'}):`, fullText);
      onTextMessage({
        text: fullText,
        partial: !serverContent.turnComplete,
      });
    }
  }

  // --- Audio Playback ---

  private async playAudioChunk(base64Audio: string): Promise<number> {
    // Ensure output context is ready (also needed for standalone TTS outside live session)
    this.outputAudioContext = await this.ensureSingleContext(this.outputAudioContext, OUTPUT_SAMPLE_RATE);
    this.ensureOutputNodes();

    if (!this.outputAudioContext || !this.outputMixGain) return 0;

    try {
      const bytes = base64ToBytes(base64Audio);
      let audioBuffer: AudioBuffer;

      // Check if it's a WAV container (starts with RIFF and has WAVE at offset 8)
      const isWav = bytes.length > 12 &&
        bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // 'RIFF'
        bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45; // 'WAVE'

      if (isWav) {
        // Decode container format using native AudioContext.decodeAudioData
        const arrayBufferCopy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        audioBuffer = await this.outputAudioContext.decodeAudioData(arrayBufferCopy as ArrayBuffer);
      } else {
        // Decode raw PCM using our helper
        audioBuffer = await decodeAudioData(
          bytes,
          this.outputAudioContext,
        );
      }

      const startTime = Math.max(this.outputAudioContext.currentTime, this.nextStartTime);
      this.nextStartTime = startTime;

      const source = this.outputAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputMixGain);
      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;

      this.activeSources.add(source);
      source.onended = () => {
        this.activeSources.delete(source);
      };
      return Math.max(0, this.nextStartTime - this.outputAudioContext.currentTime);
    } catch (error) {
      console.error('[LiveService] playAudioChunk error decoding audio:', error);
      return 0;
    }
  }

  private stopAudioPlayback() {
    this.activeSources.forEach(source => {
      try { source.stop(); } catch { /* already stopped */ }
    });
    this.activeSources.clear();
    if (this.outputAudioContext) {
      this.nextStartTime = this.outputAudioContext.currentTime;
    }
    this.smoothedOutputLevel = 0;
    if (this.onOutputLevelChange) this.onOutputLevelChange(0);
  }

  public stopSpeech() {
    this.speechGeneration += 1;
    this.speechQueue = Promise.resolve();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.stopAudioPlayback();
  }

  // --- Public Messaging API ---

  /** Sends a JPEG frame of the code editor for the model's vision input. */
  public async sendVideoFrame(base64Image: string) {
    if (!this.session || !this.isConnected) return;

    try {
      await this.session.sendRealtimeInput({
        video: { mimeType: 'image/jpeg', data: base64Image },
      });
      console.log('[LiveService] Sent video frame.');
    } catch (err) {
      console.error('[LiveService] Error sending video frame:', err);
    }
  }

  /**
   * Sends the candidate's current code as a text context update.
   * Truncates to CODE_TRUNCATE_LIMIT to stay within token limits.
   */
  public async sendCodeContext(code: string) {
    const safeCode =
      code.length > CODE_TRUNCATE_LIMIT
        ? code.substring(0, CODE_TRUNCATE_LIMIT) + '\n...[truncated]'
        : code;

    const prompt = `[SYSTEM UPDATE] The user has updated their code:\n\`\`\`${safeCode}\`\`\`\nReview the code silently in the background. Do NOT speak to acknowledge this update unless the user explicitly asked you a question about it.`;
    console.log('[LiveService] Sending code context update.');
    await this.sendText(prompt, { temporaryMuteMic: false });
  }

  /**
   * Sends a text turn to the live session.
   */
  public async sendText(text: string, options: { temporaryMuteMic?: boolean } = {}) {
    if (!this.isConnected) {
      console.log('[LiveService] Reconnecting WebSocket in background for text turn...');
      await this.connect({ ...this.connectOptions, muted: true });
    }

    if (!this.session || !this.isConnected) return;

    try {
      if (options.temporaryMuteMic !== false) {
        this.startTextTurnMute();
      }

      await this.session.sendClientContent({
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true,
      });
      console.log('[LiveService] Sent client text content:', text);
    } catch (err) {
      console.error('[LiveService] Error sending client text:', err);
    }
  }

  // --- Microphone Controls ---

  public get isMicMuted() {
    return this.isManualMicMuted;
  }

  public async setMicMuted(muted: boolean) {
    if (muted === this.isManualMicMuted) return;

    this.isManualMicMuted = muted;

    if (muted) {
      this.stopAudioInput(true);
    } else if (this.isConnected) {
      await this.ensureAudioContexts();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.inputStream = stream;
      this.startAudioInput(stream);
    }

    console.log(`[LiveService] Microphone is now ${muted ? 'MUTED' : 'UNMUTED'}.`);
  }

  private isAudioPlaying(): boolean {
    if (!this.outputAudioContext) return false;
    return this.activeSources.size > 0 || this.outputAudioContext.currentTime < this.nextStartTime;
  }

  private isEffectiveMicMuted() {
    return this.isManualMicMuted || this.isTextTurnMuted || this.isAudioPlaying();
  }

  private startTextTurnMute(timeoutMs: number = MIC_UNMUTE_TIMEOUT_MS) {
    this.isTextTurnMuted = true;
    if (this.textTurnMuteTimeoutId !== null) {
      window.clearTimeout(this.textTurnMuteTimeoutId);
    }
    this.textTurnMuteTimeoutId = window.setTimeout(() => {
      this.clearTextTurnMute();
    }, timeoutMs);
  }

  private clearTextTurnMute() {
    this.isTextTurnMuted = false;
    if (this.textTurnMuteTimeoutId !== null) {
      window.clearTimeout(this.textTurnMuteTimeoutId);
      this.textTurnMuteTimeoutId = null;
    }
  }

  /** Sends a response back to the server after a tool call completes */
  public sendToolResponse(functionResponses: any[]) {
    if (!this.session || !this.isConnected) return;
    try {
      this.session.sendToolResponse({ functionResponses });
      console.log('[LiveService] Sent tool response successfully.');
    } catch (e) {
      console.error('[LiveService] Error sending tool response:', e);
    }
  }

  /** Generates speech from text using the Gemini TTS model and plays it. */
  public async speak(text: string, options: { interrupt?: boolean; voiceName?: string } = {}) {
    const interrupt = options.interrupt ?? true;
    const voiceName = options.voiceName ?? this.voiceName;

    if (interrupt) {
      this.speechGeneration += 1;
      this.speechQueue = Promise.resolve();
      await this.prepareForSpeech();
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      this.stopAudioPlayback();
    }

    const generation = this.speechGeneration;
    
    // Clean text: remove code blocks, markdown symbols, and emojis so fallback voices do not read them
    const cleanedText = text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*+/g, '')
      .replace(/\p{Emoji_Presentation}/gu, '')
      .replace(/[#_~[\]()]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanedText) return;

    // Queue the entire cleaned text sequentially
    this.speechQueue = this.speechQueue
      .catch(() => undefined)
      .then(async () => {
        if (generation !== this.speechGeneration) return;
        try {
          this.startTextTurnMute(10000);
          await this.generateAndPlaySpeech(cleanedText, generation, voiceName);
        } catch (error) {
          console.error('[LiveService] speak error generating content:', error);
        }
      });

    await this.speechQueue;
  }

  private async generateAndPlaySpeech(text: string, generation: number, voiceName: string) {
    try {
      await this.prepareForSpeech();
      const speechText = this.prepareTextForSpeech(text, voiceName);
      const response = await this.ai.models.generateContent({
        model: GEMINI_TTS_MODEL,
        contents: [{ parts: [{ text: speechText }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        if (generation !== this.speechGeneration) return;
        const duration = await this.playAudioChunk(base64Audio);
        if (duration > 0) {
          this.startTextTurnMute(Math.ceil(duration * 1000) + 1000);
        }
      } else {
        console.warn('[LiveService] speak response did not contain base64 audio data. Response candidates:', response.candidates);
        await this.speakWithBrowserFallback(text, generation, voiceName);
      }
    } catch (error) {
      console.error('[LiveService] Gemini TTS failed, using browser speech fallback:', error);
      await this.speakWithBrowserFallback(text, generation, voiceName);
    }
  }

  private async speakWithBrowserFallback(text: string, generation: number, voiceName: string) {
    if (generation !== this.speechGeneration || !('speechSynthesis' in window)) return;

    await this.prepareForSpeech().catch(() => undefined);
    this.startTextTurnMute(Math.max(4000, Math.min(20000, text.length * 70)));

    return new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      utterance.pitch = voiceName === FEMALE_VOICE_NAME ? 1.08 : 0.92;

      const voices = window.speechSynthesis.getVoices();
      
      // Prioritize natural/online voices which sound much less robotic
      const preferredVoice = voices.find((voice) => {
        const name = voice.name.toLowerCase();
        const isMatch = voiceName === FEMALE_VOICE_NAME
          ? /female|zira|susan|samantha|aria|jenny|hazel|google uk english female/.test(name)
          : /male|david|mark|guy|daniel|google uk english male/.test(name);
        return isMatch && (name.includes('natural') || name.includes('google') || name.includes('online') || name.includes('premium'));
      }) || voices.find((voice) => {
        const name = voice.name.toLowerCase();
        return voiceName === FEMALE_VOICE_NAME
          ? /female|zira|susan|samantha|aria|jenny|hazel|google uk english female/.test(name)
          : /male|david|mark|guy|daniel|google uk english male/.test(name);
      });

      if (preferredVoice) utterance.voice = preferredVoice;

      utterance.onstart = () => {
        this.smoothedOutputLevel = 0.35;
        if (this.onOutputLevelChange) this.onOutputLevelChange(this.smoothedOutputLevel);
      };
      utterance.onend = () => {
        this.smoothedOutputLevel = 0;
        if (this.onOutputLevelChange) this.onOutputLevelChange(0);
        this.clearTextTurnMute();
        resolve();
      };
      utterance.onerror = () => {
        this.smoothedOutputLevel = 0;
        if (this.onOutputLevelChange) this.onOutputLevelChange(0);
        this.clearTextTurnMute();
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  /** Primes output audio so playback can begin immediately when TTS arrives. */
  public async prepareForSpeech() {
    this.outputAudioContext = await this.ensureSingleContext(this.outputAudioContext, OUTPUT_SAMPLE_RATE);
    this.ensureOutputNodes();
  }

  /** Tears down the live session, releases microphone, and closes audio contexts. */
  public async disconnect(options?: { keepAudioContexts?: boolean }) {
    this.speechGeneration += 1;
    this.speechQueue = Promise.resolve();
    this.stopAudioPlayback();

    // Close the WebSocket session before dropping the reference
    if (this.session) {
      try { await (this.session as any).close(); } catch { /* already closed */ }
      this.session = null;
    }

    const keepAudioContexts = options?.keepAudioContexts ?? false;
    this.stopAudioInput(!keepAudioContexts);

    if (!keepAudioContexts) {
      if (this.inputAudioContext && this.inputAudioContext.state !== 'closed') {
        await this.inputAudioContext.close();
      }
      if (this.outputAudioContext && this.outputAudioContext.state !== 'closed') {
        await this.outputAudioContext.close();
      }

      this.outputMixGain = null;
      this.outputAnalyser = null;
      this.outputMeterData = null;
      this.inputAudioContext = null;
      this.outputAudioContext = null;
      this.stopOutputMetering();
    } else {
      this.stopOutputMetering();
    }

    this.isConnected = false;
    this.isManualMicMuted = false;
    this.clearTextTurnMute();
  }
}
