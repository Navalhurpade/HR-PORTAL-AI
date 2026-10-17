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

export interface AssistantSourceUpdate {
  id: string;
  kind: 'document' | 'leave' | 'balance' | 'policy' | 'action';
  title: string;
  status: 'using' | 'used' | 'empty' | 'failed';
  detail?: string;
}

const getLeavesDataSchema = z
  .object({
    filters: getLeavesDataFiltersSchema.optional(),
  })
  .strict();

const getLeavePolicySchema = z
  .object({
    leaveType: leaveTypeSchema.optional(),
  })
  .strict();

const getMyLeaveBalanceSchema = z
  .object({
    year: z.number().int().gte(1000).lte(9999).optional(),
  })
  .strict();

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
          "Fetch the signed-in user's 10 most recently submitted leave requests. Optionally filter by status and a date range.",
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
        description: 'Return the currently effective company leave policies. Optionally filter by a leave type.',
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
          "Return the signed-in user's leave balance for the specified calendar year. If omitted, use the current year.",
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
          'Submit a leave request for the signed-in user only when they explicitly ask to apply. Do not submit based on a question, hypothetical, or implied intent. Requires a leave type, start date, and end date.',
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
          'Update one of the signed-in user’s pending leave requests only when they explicitly ask to change it. Requires the leave request ID and at least one field to update.',
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
          'Search the uploaded company documents for evidence relevant to a policy or benefits question. Base factual answers only on the returned text chunks.',
        schema: searchCompanyDocumentsSchema,
      },
    ),
  ];
}
