import { tool } from 'langchain';
import { z } from 'zod';
import {
  getLeavesData,
  getLeavesDataFiltersSchema,
  getMyLeaveBalance,
  getLeavePolicy,
  leaveTypeSchema,
  createLeaveInputSchema,
  applyLeave,
  updateLeaveInputSchema,
  updateLeave,
  SearchCompanyDocuments,
  searchCompanyDocumentsSchema,
} from './tools.util.js';
console.log(new Date().toDateString());

export interface AssistantSourceUpdate {
  id: string;
  kind: 'document' | 'leave' | 'balance' | 'policy' | 'action';
  title: string;
  status: 'using' | 'used' | 'empty' | 'failed';
  detail?: string;
}

const getLeavesDataSchema = z
  .object({
    filters: getLeavesDataFiltersSchema
      .optional()
      .describe(
        'Optional filters for the leave requests to return. Leave empty to return the most recent requests across all statuses.',
      ),
  })
  .strict()
  .describe("Request for retrieving the signed-in user's recent leave requests.");

const getLeavePolicySchema = z
  .object({
    leaveType: leaveTypeSchema
      .optional()
      .describe('Optional leave type to narrow policy results. Example: casual, sick, earned, or parental.'),
  })
  .strict()
  .describe("Request for retrieving the company's leave policy rules.");

const getMyLeaveBalanceSchema = z
  .object({
    year: z.coerce
      .number()
      .int()
      .min(1900)
      .max(9999)
      .optional()
      .describe('Optional calendar year to check, such as 2026. If omitted, the current year is used automatically.'),
  })
  .strict()
  .describe("Request for retrieving the signed-in user's leave balance for a specific year.");

export function createAssistantTools(userId: string, onSourceUpdate?: (source: AssistantSourceUpdate) => void) {
  return [
    tool(
      async ({ filters }) => {
        onSourceUpdate?.({
          id: 'leave-requests',
          kind: 'leave',
          title: 'Your leave requests',
          status: 'using',
        });
        try {
          const result = await getLeavesData(userId, filters);
          onSourceUpdate?.({
            id: 'leave-requests',
            kind: 'leave',
            title: 'Your leave requests',
            status: result.length ? 'used' : 'empty',
            detail: `${result.length} ${result.length === 1 ? 'request' : 'requests'} found`,
          });
          return result;
        } catch (error) {
          onSourceUpdate?.({
            id: 'leave-requests',
            kind: 'leave',
            title: 'Your leave requests',
            status: 'failed',
          });
          throw error;
        }
      },
      {
        name: 'getLeavesData',
        description:
          "Retrieve the signed-in user's most recent leave requests, ordered newest first. Use this to answer questions about leave history, status, or date ranges. Optionally filter by status and overlap dates.",
        schema: getLeavesDataSchema,
      },
    ),
    tool(
      async ({ leaveType }) => {
        onSourceUpdate?.({
          id: 'leave-policies',
          kind: 'policy',
          title: 'Company leave policies',
          status: 'using',
        });
        try {
          const result = await getLeavePolicy(leaveType);
          onSourceUpdate?.({
            id: 'leave-policies',
            kind: 'policy',
            title: 'Company leave policies',
            status: result.length ? 'used' : 'empty',
            detail: `${result.length} ${result.length === 1 ? 'policy' : 'policies'} found`,
          });
          return result;
        } catch (error) {
          onSourceUpdate?.({
            id: 'leave-policies',
            kind: 'policy',
            title: 'Company leave policies',
            status: 'failed',
          });
          throw error;
        }
      },
      {
        name: 'getLeavePolicy',
        description:
          'Return the currently effective company leave policies and rules. Use this when a user asks about eligibility, annual allowance, carryover, documentation requirements, or a specific leave type.',
        schema: getLeavePolicySchema,
      },
    ),
    tool(
      async ({ year }) => {
        const balanceYear = year ?? new Date().getUTCFullYear();
        onSourceUpdate?.({
          id: 'leave-balance',
          kind: 'balance',
          title: 'Your leave balance',
          status: 'using',
        });
        try {
          const result = await getMyLeaveBalance(userId, year);
          onSourceUpdate?.({
            id: 'leave-balance',
            kind: 'balance',
            title: 'Your leave balance',
            status: result.length ? 'used' : 'empty',
            detail: `${balanceYear} balance`,
          });
          return result;
        } catch (error) {
          onSourceUpdate?.({
            id: 'leave-balance',
            kind: 'balance',
            title: 'Your leave balance',
            status: 'failed',
          });
          throw error;
        }
      },
      {
        name: 'getMyLeaveBalance',
        description:
          'Return the signed-in user\'s available leave balance for a specified calendar year. If the year is omitted, use the current year automatically. Use this to answer questions like "How much leave do I have left?"',
        schema: getMyLeaveBalanceSchema,
      },
    ),
    tool(
      async (input) => {
        onSourceUpdate?.({
          id: 'leave-request-action',
          kind: 'action',
          title: 'Submitting leave request',
          status: 'using',
        });
        try {
          const result = await applyLeave(userId, input);
          onSourceUpdate?.({
            id: 'leave-request-action',
            kind: 'action',
            title: 'Leave request submitted',
            status: 'used',
          });
          return result;
        } catch (error) {
          onSourceUpdate?.({
            id: 'leave-request-action',
            kind: 'action',
            title: 'Leave request',
            status: 'failed',
          });
          throw error;
        }
      },
      {
        name: 'applyLeave',
        description:
          'Create a leave request for the signed-in user only when the user explicitly asks to submit or apply for leave. Require a leave type, start date, and end date. Do not create a request from a question, hypothetical, or implied intention.',
        schema: createLeaveInputSchema,
      },
    ),
    tool(
      async (input) => {
        onSourceUpdate?.({
          id: 'leave-request-action',
          kind: 'action',
          title: 'Updating leave request',
          status: 'using',
        });
        try {
          const result = await updateLeave(userId, input);
          onSourceUpdate?.({
            id: 'leave-request-action',
            kind: 'action',
            title: 'Leave request updated',
            status: 'used',
          });
          return result;
        } catch (error) {
          onSourceUpdate?.({
            id: 'leave-request-action',
            kind: 'action',
            title: 'Leave request',
            status: 'failed',
          });
          throw error;
        }
      },
      {
        name: 'updateLeave',
        description:
          'Update an existing leave request for the signed-in user only when they explicitly ask to change it. Requires the leave request ID and at least one field to update, such as dates, policy, or reason.',
        schema: updateLeaveInputSchema,
      },
    ),
    tool(
      async ({ searchText }) => {
        onSourceUpdate?.({
          id: 'company-document-search',
          kind: 'document',
          title: 'Company documents',
          status: 'using',
        });
        try {
          const results = await SearchCompanyDocuments(searchText);
          onSourceUpdate?.({
            id: 'company-document-search',
            kind: 'document',
            title: 'Company documents',
            status: results.length ? 'used' : 'empty',
          });
          const documents = new Map<string, { documentName: string; count: number }>();
          for (const result of results) {
            const document = documents.get(result.documentId);
            if (document) document.count += 1;
            else documents.set(result.documentId, { documentName: result.documentName, count: 1 });
          }

          for (const [documentId, document] of documents) {
            onSourceUpdate?.({
              id: `document-${documentId}`,
              kind: 'document',
              title: document.documentName,
              status: 'used',
              detail: `${document.count} ${document.count === 1 ? 'excerpt' : 'excerpts'} retrieved`,
            });
          }
          return results;
        } catch (error) {
          onSourceUpdate?.({
            id: 'company-document-search',
            kind: 'document',
            title: 'Company documents',
            status: 'failed',
          });
          throw error;
        }
      },
      {
        name: 'searchCompanyDocuments',
        description:
          'Search uploaded company documents and policy text for evidence relevant to a policy, benefits, or HR question. Use this when the answer depends on company documents rather than general knowledge. Base factual answers only on the returned excerpts.',
        schema: searchCompanyDocumentsSchema,
      },
    ),
  ];
}
