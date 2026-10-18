import { ChatGoogle } from '@langchain/google';
import { ChatGroq } from '@langchain/groq';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const OPENAI_MODEL = 'gpt-4o-mini';
const NVIDIA_MODEL = 'meta/llama-3.3-70b-instruct';
const LM_STUDIO_MODEL = 'meta-llama-3-8b-instruct';

export class AiProviderConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiProviderConfigurationError';
  }
}

function getApiKey(environmentVariable: string): string {
  const apiKey = process.env[environmentVariable]?.trim();
  if (!apiKey || apiKey === 'key_here' || apiKey.startsWith('replace-with-')) {
    throw new AiProviderConfigurationError(`${environmentVariable} is required for the selected AI provider.`);
  }
  return apiKey;
}

export function createChatModel(): BaseChatModel {
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase() || 'google';

  switch (provider) {
    case 'google':
      return new ChatGoogle({
        apiKey: getApiKey('GOOGLE_API_KEY'),
        model: process.env.GOOGLE_MODEL || 'gemini-3.1-flash-lite',
        temperature: 0,
        maxOutputTokens: 2048,
        topP: 0.95,
      });
    case 'groq':
      return new ChatGroq({
        apiKey: getApiKey('GROQ_API_KEY'),
        model: process.env.GROQ_MODEL || GROQ_MODEL,
        temperature: 0,
        maxTokens: 2048,
        topP: 0.95,
        timeout: 30_000,
      });
    case 'openai':
      return new ChatOpenAI({
        apiKey: getApiKey('OPENAI_API_KEY'),
        model: process.env.OPENAI_MODEL || OPENAI_MODEL,
        temperature: 0,
        maxTokens: 2048,
        topP: 0.95,
      });
    case 'nvidia':
      return new ChatOpenAI({
        apiKey: getApiKey('NVIDIA_API_KEY'),
        configuration: {
          baseURL: 'https://integrate.api.nvidia.com/v1',
        },
        model: process.env.NVIDIA_MODEL || NVIDIA_MODEL,
        temperature: 0.5,
      });
    case 'lmstudio':
      return new ChatOpenAI({
        apiKey: 'lm-studio',
        configuration: {
          baseURL: process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234/v1',
        },
        model: process.env.LM_STUDIO_MODEL || LM_STUDIO_MODEL,
        temperature: 0.7,
      });
    default:
      throw new AiProviderConfigurationError(
        `Unsupported AI_PROVIDER "${provider}". Choose google, groq, openai, nvidia, or lmstudio.`,
      );
  }
}
