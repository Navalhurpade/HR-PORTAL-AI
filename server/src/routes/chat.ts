import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth/guards.js';
import { AiServiceError, generateAssistantReply, type ChatTurn } from '../ai/config.ai.js';

export interface ChatRequestBody {
  /** A client-side conversation identifier; history is not persisted yet. */
  conversationId?: string;
  message: string;
  /** Recent prior turns only. The current message is supplied separately. */
  history?: ChatTurn[];
}

export interface ChatResponseBody {
  conversationId: string;
  message: {
    role: 'assistant';
    content: string;
    createdAt: string;
  };
}

const chatBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['message'],
  properties: {
    conversationId: { type: 'string', format: 'uuid' },
    message: { type: 'string', minLength: 1, maxLength: 4000 },
    history: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['role', 'content'],
        properties: {
          role: { type: 'string', enum: ['user', 'assistant'] },
          content: { type: 'string', minLength: 1, maxLength: 4000 },
        },
      },
    },
  },
} as const;

export async function registerChatRoute(app: FastifyInstance) {
  app.post<{ Body: ChatRequestBody }>(
    '/chat',
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        body: chatBodySchema,
        response: {
          503: {
            type: 'object',
            additionalProperties: false,
            required: ['error', 'code'],
            properties: {
              error: { type: 'string' },
              code: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      if (!request.body.message.trim()) {
        return reply.code(400).send({ error: 'Message cannot be blank.' });
      }

      const history = request.body.history ?? [];
      const historyLength = history.reduce((total, turn) => total + turn.content.length, 0);
      if (historyLength > 12_000) {
        return reply.code(400).send({ error: 'Conversation history is too long.' });
      }

      try {
        const content = await generateAssistantReply(
          {
            role: request.user.role,
            department: request.user.department,
            userId: request.user.sub,
          },
          history,
          request.body.message.trim(),
        );
        return {
          conversationId: request.body.conversationId ?? randomUUID(),
          message: {
            role: 'assistant' as const,
            content,
            createdAt: new Date().toISOString(),
          },
        };
      } catch (error) {
        if (error instanceof AiServiceError) {
          if (error.statusCode >= 500) app.log.warn({ code: error.code }, 'AI chat request failed.');
          return reply.code(error.statusCode).send({ error: error.message, code: error.code });
        }
        request.log.error(error, 'Unexpected AI chat error.');
        return reply.code(500).send({ error: 'Nori encountered an unexpected error.', code: 'AI_INTERNAL_ERROR' });
      }
    },
  );
}
