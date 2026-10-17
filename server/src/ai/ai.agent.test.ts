import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { AIMessage, AIMessageChunk } from '@langchain/core/messages';
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base';
import { RunnableLambda } from '@langchain/core/runnables';
import { FakeStreamingChatModel } from '@langchain/core/utils/testing';
import { tool } from 'langchain';
import { z } from 'zod';
import type { AssistantContext, AssistantDependencies, AssistantSourceUpdate } from './ai.agent.js';

const context: AssistantContext = {
  role: 'employee',
  userId: 'user-123',
  department: 'Engineering',
};

const originalGoogleApiKey = process.env.GOOGLE_API_KEY;
const originalGoogleModel = process.env.GOOGLE_MODEL;
const originalDatabaseUrl = process.env.DATABASE_URL;

class ScriptedChatModel extends FakeStreamingChatModel {
  private readonly script: AIMessage[];
  private currentResponse = 0;

  constructor(script: AIMessage[]) {
    super({ sleep: 0 });
    this.script = script;
  }

  override bindTools(tools: Parameters<FakeStreamingChatModel['bindTools']>[0]) {
    return new RunnableLambda({
      func: async (input: BaseLanguageModelInput) => {
        const response = this.script[this.currentResponse++];
        if (!response) throw new Error('The scripted model has no response remaining.');
        this.responses = [response];
        this.chunks = [new AIMessageChunk({ content: '', tool_calls: response.tool_calls })];
        return this.invoke(input);
      },
    });
  }
}

before(() => {
  process.env.GOOGLE_API_KEY = 'test-key';
  process.env.GOOGLE_MODEL = 'test-model';
  process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:5432/test';
});

after(() => {
  if (originalGoogleApiKey === undefined) delete process.env.GOOGLE_API_KEY;
  else process.env.GOOGLE_API_KEY = originalGoogleApiKey;

  if (originalGoogleModel === undefined) delete process.env.GOOGLE_MODEL;
  else process.env.GOOGLE_MODEL = originalGoogleModel;

  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});

function fixture(
  calls: Array<{ name: string; args: Record<string, unknown>; id: string }>,
  response: string,
  invocations: Array<{ name: string; args: Record<string, unknown> }>,
  result = [{ verified: true }],
): AssistantDependencies {
  const model = new ScriptedChatModel([
    new AIMessage({
      content: '',
      tool_calls: calls.map(({ name, args, id }) => ({ name, args, id, type: 'tool_call' })),
    }),
    new AIMessage(response),
  ]);

  const createTools: NonNullable<AssistantDependencies['createTools']> = (userId, onSourceUpdate) =>
    calls.map(({ name }) =>
      tool(
        async (args) => {
          assert.equal(userId, context.userId);
          invocations.push({ name, args });
          const source = sourceForTool(name);
          onSourceUpdate?.({ ...source, status: 'using' });
          if (name === 'searchCompanyDocuments') {
            assert.equal(typeof args.searchText, 'string');
          }
          onSourceUpdate?.({
            ...source,
            status: result.length ? 'used' : 'empty',
            detail: `${result.length} result${result.length === 1 ? '' : 's'}`,
          });
          return result;
        },
        {
          name,
          description: `Test tool for ${name}.`,
          schema: z.object({
            year: z.number().optional(),
            filters: z.record(z.string(), z.unknown()).optional(),
            leaveType: z.string().optional(),
            searchText: z.string().optional(),
          }),
        },
      ),
    );

  return {
    model,
    createTools,
  };
}

function sourceForTool(name: string): Omit<AssistantSourceUpdate, 'status' | 'detail'> {
  switch (name) {
    case 'getMyLeaveBalance':
      return { id: 'leave-balance', kind: 'balance', title: 'Your leave balance' };
    case 'getLeavesData':
      return { id: 'leave-requests', kind: 'leave', title: 'Your leave requests' };
    case 'getLeavePolicy':
      return { id: 'leave-policies', kind: 'policy', title: 'Company leave policies' };
    case 'searchCompanyDocuments':
      return { id: 'company-document-search', kind: 'document', title: 'Company documents' };
    default:
      throw new Error(`No test source configured for tool ${name}.`);
  }
}

async function runScenario(
  calls: Array<{ name: string; args: Record<string, unknown>; id: string }>,
  response: string,
  result?: Array<{ verified: boolean }>,
) {
  const { generateAssistantReply } = await import('./ai.agent.js');
  const sources: AssistantSourceUpdate[] = [];
  const invocations: Array<{ name: string; args: Record<string, unknown> }> = [];
  const dependencies = fixture(calls, response, invocations, result);
  const originalLog = console.log;
  const originalDir = console.dir;
  let reply: string;
  try {
    console.log = () => {};
    console.dir = () => {};
    reply = await generateAssistantReply(
      context,
      [{ role: 'user', content: 'Earlier question' }],
      'Current question',
      (source) => sources.push(source),
      dependencies,
    );
  } finally {
    console.log = originalLog;
    console.dir = originalDir;
  }
  return { reply, sources, invocations };
}

test('calls the leave-balance tool with the requested year and reports its source', async () => {
  const { reply, sources, invocations } = await runScenario(
    [{ name: 'getMyLeaveBalance', args: { year: 2026 }, id: 'balance-call' }],
    'You have 12 days remaining.',
  );

  assert.equal(reply, 'You have 12 days remaining.');
  assert.deepEqual(invocations, [{ name: 'getMyLeaveBalance', args: { year: 2026 } }]);
  assert.deepEqual(
    sources.map(({ id, status }) => [id, status]),
    [
      ['leave-balance', 'using'],
      ['leave-balance', 'used'],
    ],
  );
});

test('calls the leave-history tool with filters and reports the leave-request source', async () => {
  const { reply, sources, invocations } = await runScenario(
    [
      {
        name: 'getLeavesData',
        args: { filters: { status: 'pending' } },
        id: 'leave-history-call',
      },
    ],
    'You have one pending leave request.',
  );

  assert.equal(reply, 'You have one pending leave request.');
  assert.deepEqual(invocations, [{ name: 'getLeavesData', args: { filters: { status: 'pending' } } }]);
  assert.deepEqual(
    sources.map(({ id, status }) => [id, status]),
    [
      ['leave-requests', 'using'],
      ['leave-requests', 'used'],
    ],
  );
});

test('uses the policy tool and reports the policy source', async () => {
  const { reply, sources, invocations } = await runScenario(
    [{ name: 'getLeavePolicy', args: { leaveType: 'casual' }, id: 'policy-call' }],
    'The casual leave allowance is 10 days.',
  );

  assert.equal(reply, 'The casual leave allowance is 10 days.');
  assert.deepEqual(invocations, [{ name: 'getLeavePolicy', args: { leaveType: 'casual' } }]);
  assert.deepEqual(
    sources.map(({ id, status }) => [id, status]),
    [
      ['leave-policies', 'using'],
      ['leave-policies', 'used'],
    ],
  );
});

test('uses both document and personal-data tools for a mixed-source question', async () => {
  const { reply, sources, invocations } = await runScenario(
    [
      { name: 'searchCompanyDocuments', args: { searchText: 'annual leave carryover' }, id: 'doc-call' },
      { name: 'getMyLeaveBalance', args: { year: 2026 }, id: 'balance-call' },
    ],
    'Your balance and the policy details are verified.',
  );

  assert.equal(reply, 'Your balance and the policy details are verified.');
  assert.deepEqual(
    invocations.map(({ name }) => name).sort(),
    ['getMyLeaveBalance', 'searchCompanyDocuments'],
  );
  assert.deepEqual(
    new Set(sources.filter(({ status }) => status === 'used').map(({ id }) => id)),
    new Set(['company-document-search', 'leave-balance']),
  );
});

test('marks an empty tool result as an empty source rather than a used source', async () => {
  const { reply, sources, invocations } = await runScenario(
    [{ name: 'getLeavesData', args: {}, id: 'empty-history-call' }],
    'I could not find any leave requests.',
    [],
  );

  assert.equal(reply, 'I could not find any leave requests.');
  assert.deepEqual(invocations, [{ name: 'getLeavesData', args: {} }]);
  assert.deepEqual(
    sources.map(({ id, status }) => [id, status]),
    [
      ['leave-requests', 'using'],
      ['leave-requests', 'empty'],
    ],
  );
});
