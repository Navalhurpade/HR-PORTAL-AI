import { tool } from 'langchain';
import { z } from 'zod';
import { getLeavesData, getLeavesDataFiltersSchema } from './tools.util.js';

const getLeavesDataSchema = z
  .object({
    filters: getLeavesDataFiltersSchema.optional(),
  })
  .strict();

export function createAssistantTools(userId: string) {
  return [
    tool(
      async ({ filters }) => getLeavesData(userId, filters),
      {
        name: 'getLeavesData',
        description:
          "Fetch the signed-in user's 10 most recently submitted leave requests. Optionally filter by status and a date range.",
        schema: getLeavesDataSchema,
      },
    ),
  ];
}
