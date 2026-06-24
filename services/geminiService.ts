import { GoogleGenAI } from '@google/genai';
import {
  SYSTEM_INSTRUCTION_INTERVIEWER,
  GEMINI_CHAT_MODEL,
  GEMINI_THINKING_MODEL,
  THINKING_BUDGET,
} from '@/constants';

export interface TokenUsage {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

/**
 * Sends a single chat message to the Gemini API and returns the response text.
 *
 * Creates a fresh chat session each call (stateless wrapper). The current code
 * is injected as context alongside the user's message so the interviewer model
 * can reference what the candidate has written.
 *
 * @param apiKey         - Gemini API key
 * @param history        - Prior conversation turns
 * @param currentMessage - The new user message (may include a context prefix)
 * @param currentCode    - The candidate's current editor contents
 * @param useThinking    - When true, uses the thinking-capable model with an extended budget
 */
export const generateChatMessage = async (
  apiKey: string,
  history: { role: 'user' | 'model'; text: string }[],
  currentMessage: string,
  currentCode: string,
  useThinking: boolean = false,
) => {
  const ai = new GoogleGenAI({ apiKey });

  const fullMessage = `
[CURRENT CODE CONTEXT]
${currentCode}
[END CODE CONTEXT]

${currentMessage}
`;

  const createChat = (modelName: string, withThinking: boolean) => {
    const config: Record<string, unknown> = {
      systemInstruction: SYSTEM_INSTRUCTION_INTERVIEWER,
    };

    if (withThinking) {
      config.thinkingConfig = { thinkingBudget: THINKING_BUDGET };
    }

    return ai.chats.create({
      model: modelName,
      config,
      history: history.map(h => ({
        role: h.role,
        parts: [{ text: h.text }],
      })),
    });
  };

  try {
    const chat = createChat(
      useThinking ? GEMINI_THINKING_MODEL : GEMINI_CHAT_MODEL,
      useThinking,
    );
    const result = await chat.sendMessage({ message: fullMessage });
    return result.text;
  } catch (error: any) {
    const errorText = String(error?.message || error || '');
    const isQuotaError =
      error?.status === 429 ||
      errorText.includes('RESOURCE_EXHAUSTED') ||
      errorText.includes('quota');

    if (useThinking && isQuotaError) {
      console.warn('[Gemini] Thinking model quota unavailable; falling back to chat model.');
      const fallbackChat = createChat(GEMINI_CHAT_MODEL, false);
      const fallbackResult = await fallbackChat.sendMessage({ message: fullMessage });
      return `Reasoning model quota is unavailable right now, so I used the regular chat model instead.\n\n${fallbackResult.text}`;
    }

    console.error('[Gemini] generateChatMessage failed:', error);
    if (isQuotaError) {
      throw new Error('Gemini quota is exhausted right now. Please wait a bit or check your API billing/quota.');
    }

    throw new Error(`Gemini chat request failed: ${errorText || error}`);
  }
};

/**
 * Streams a chat response and calls `onChunk` as text arrives.
 * Returns the complete response text after the stream finishes.
 */
export const streamChatMessage = async (
  apiKey: string,
  history: { role: 'user' | 'model'; text: string }[],
  currentMessage: string,
  currentCode: string,
  useThinking: boolean = false,
  onChunk: (chunk: string) => void,
  onUsage?: (usage: TokenUsage) => void,
) => {
  const ai = new GoogleGenAI({ apiKey });

  const fullMessage = `
[CURRENT CODE CONTEXT]
${currentCode}
[END CODE CONTEXT]

${currentMessage}
`;

  const createChat = (modelName: string, withThinking: boolean) => {
    const config: Record<string, unknown> = {
      systemInstruction: SYSTEM_INSTRUCTION_INTERVIEWER,
    };

    if (withThinking) {
      config.thinkingConfig = { thinkingBudget: THINKING_BUDGET };
    }

    return ai.chats.create({
      model: modelName,
      config,
      history: history.map(h => ({
        role: h.role,
        parts: [{ text: h.text }],
      })),
    });
  };

  const streamFrom = async (modelName: string, withThinking: boolean) => {
    const chat = createChat(modelName, withThinking);
    const stream = await chat.sendMessageStream({ message: fullMessage });
    let fullText = '';

    for await (const chunk of stream) {
      if (chunk.usageMetadata && onUsage) {
        onUsage(chunk.usageMetadata);
      }

      const text = chunk.text || '';
      if (!text) continue;
      fullText += text;
      onChunk(text);
    }

    return fullText;
  };

  try {
    return await streamFrom(
      useThinking ? GEMINI_THINKING_MODEL : GEMINI_CHAT_MODEL,
      useThinking,
    );
  } catch (error: any) {
    const errorText = String(error?.message || error || '');
    const isQuotaError =
      error?.status === 429 ||
      errorText.includes('RESOURCE_EXHAUSTED') ||
      errorText.includes('quota');

    if (useThinking && isQuotaError) {
      console.warn('[Gemini] Thinking model quota unavailable; falling back to chat model.');
      const fallbackPrefix = 'Reasoning model quota is unavailable right now, so I used the regular chat model instead.\n\n';
      onChunk(fallbackPrefix);
      const fallbackText = await streamFrom(GEMINI_CHAT_MODEL, false);
      return fallbackPrefix + fallbackText;
    }

    console.error('[Gemini] streamChatMessage failed:', error);
    if (isQuotaError) {
      throw new Error('Gemini quota is exhausted right now. Please wait a bit or check your API billing/quota.');
    }

    throw new Error(`Gemini chat request failed: ${errorText || error}`);
  }
};
