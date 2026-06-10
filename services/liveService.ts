import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
import { base64ToBytes, decodeAudioData, float32To16BitPCM, bytesToBase64 } from '@/utils/audioUtils';
import {
  SYSTEM_INSTRUCTION_INTERVIEWER,
  GEMINI_LIVE_MODEL,
  GEMINI_TTS_MODEL,
  DEFAULT_VOICE_NAME,
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
  onStateChange?: (state: 'connecting' | 'connected' | 'closed' | 'error') => void;
  systemInstruction?: string;
  initialMessage?: string;
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
  private isConnected: boolean = false;
  private isMicrophoneMuted: boolean = false;

  public onVolumeChange: ((volume: number) => void) | null = null;
  public onOutputLevelChange: ((level: number) => void) | null = null;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  /** Opens a live session, acquires the microphone, and begins streaming. */
  public async connect(options?: LiveConnectOptions): Promise<void> {
    if (this.isConnected) return;
    options?.onStateChange?.('connecting');

    await this.ensureAudioContexts();

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.inputStream = stream;

    const instructionText = options?.systemInstruction || SYSTEM_INSTRUCTION_INTERVIEWER;

    this.session = await this.ai.live.connect({
      model: GEMINI_LIVE_MODEL,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: DEFAULT_VOICE_NAME } },
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

    // Send initial trigger BEFORE audio so the model responds to the text prompt
    // rather than ambient silence.
    if (options?.initialMessage) {
      await this.sendText(options.initialMessage);
      // Brief pause so the backend registers the text turn before audio floods in
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    this.startAudioInput(stream);
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
    if (!this.inputAudioContext || !this.session) return;

    this.inputSource = this.inputAudioContext.createMediaStreamSource(stream);
    this.processor = this.inputAudioContext.createScriptProcessor(AUDIO_CHUNK_SIZE, 1, 1);

    this.processor.onaudioprocess = (e) => {
      if (!this.session || !this.isConnected) return;

      // CRITICAL: While processing a text turn, do NOT send any audio data.
      // Even silence frames signal "user is speaking" and cancel the text turn.
      if (this.isMicrophoneMuted) return;

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
    }

    if (serverContent.modelTurn?.parts?.[0]?.inlineData) {
      const audioData = serverContent.modelTurn.parts[0].inlineData.data;
      if (audioData) {
        // Unmute microphone when the model starts speaking so the user can interrupt
        if (this.isMicrophoneMuted) {
          this.isMicrophoneMuted = false;
        }
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
    if (textParts.length > 0 && onTextMessage) {
      const fullText = textParts.join('\n');
      console.log(`[LiveService] Received text part (${serverContent.turnComplete ? 'complete' : 'partial'}):`, fullText);
      onTextMessage({
        text: fullText,
        partial: !serverContent.turnComplete,
      });
    }
  }

  // --- Audio Playback ---

  private async playAudioChunk(base64Audio: string) {
    // Ensure output context is ready (also needed for standalone TTS outside live session)
    this.outputAudioContext = await this.ensureSingleContext(this.outputAudioContext, OUTPUT_SAMPLE_RATE);
    this.ensureOutputNodes();

    if (!this.outputAudioContext || !this.outputMixGain) return;

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

      this.nextStartTime = Math.max(this.outputAudioContext.currentTime, this.nextStartTime);

      const source = this.outputAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputMixGain);
      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;

      this.activeSources.add(source);
      source.onended = () => {
        this.activeSources.delete(source);
      };
    } catch (error) {
      console.error('[LiveService] playAudioChunk error decoding audio:', error);
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
    await this.sendText(prompt);
  }

  /**
   * Sends a text turn to the live session.
   */
  public async sendText(text: string) {
    if (!this.session || !this.isConnected) return;

    try {
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
    return this.isMicrophoneMuted;
  }

  public setMicMuted(muted: boolean) {
    this.isMicrophoneMuted = muted;
    console.log(`[LiveService] Microphone is now ${muted ? 'MUTED' : 'UNMUTED'}.`);
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
  public async speak(text: string) {
    try {
      const response = await this.ai.models.generateContent({
        model: GEMINI_TTS_MODEL,
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: DEFAULT_VOICE_NAME },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        await this.playAudioChunk(base64Audio);
      } else {
        console.warn('[LiveService] speak response did not contain base64 audio data. Response candidates:', response.candidates);
      }
    } catch (error) {
      console.error('[LiveService] speak error generating content:', error);
    }
  }

  /** Tears down the live session, releases microphone, and closes audio contexts. */
  public async disconnect() {
    this.stopAudioPlayback();

    // Close the WebSocket session before dropping the reference
    if (this.session) {
      try { await (this.session as any).close(); } catch { /* already closed */ }
      this.session = null;
    }

    if (this.inputSource) this.inputSource.disconnect();
    if (this.processor) this.processor.disconnect();
    if (this.inputStream) {
      this.inputStream.getTracks().forEach((track) => track.stop());
      this.inputStream = null;
    }

    if (this.inputAudioContext) await this.inputAudioContext.close();
    if (this.outputAudioContext) await this.outputAudioContext.close();

    this.stopOutputMetering();
    this.outputMixGain = null;
    this.outputAnalyser = null;
    this.outputMeterData = null;
    this.inputAudioContext = null;
    this.outputAudioContext = null;
    this.isConnected = false;
    this.isMicrophoneMuted = false;
  }
}
