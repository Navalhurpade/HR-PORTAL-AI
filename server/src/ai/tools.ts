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
} from './tools.util.js';

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

export function createAssistantTools(userId: string) {
  return [
    tool(async ({ filters }) => getLeavesData(userId, filters), {
      name: 'getLeavesData',
      description:
        "Fetch the signed-in user's 10 most recently submitted leave requests. Optionally filter by status and a date range.",
      schema: getLeavesDataSchema,
    }),
    tool(async ({ leaveType }) => getLeavePolicy(leaveType), {
      name: 'getLeavePolicy',
      description: 'Return the currently effective company leave policies. Optionally filter by a leave type.',
      schema: getLeavePolicySchema,
    }),
    tool(async ({ year }) => getMyLeaveBalance(userId, year), {
      name: 'getMyLeaveBalance',
      description:
        "Return the signed-in user's leave balance for the specified calendar year. If omitted, use the current year.",
      schema: getMyLeaveBalanceSchema,
    }),
    tool(async (input) => applyLeave(userId, input), {
      name: 'applyLeave',
      description:
        'Submit a leave request for the signed-in user only when they explicitly ask to apply. Do not submit based on a question, hypothetical, or implied intent. Requires a leave type, start date, and end date.',
      schema: createLeaveInputSchema,
    }),
    tool(async (input) => updateLeave(userId, input), {
      name: 'updateLeave',
      description:
        'Update one of the signed-in user’s pending leave requests only when they explicitly ask to change it. Requires the leave request ID and at least one field to update.',
      schema: updateLeaveInputSchema,
    }),
  ];
}
