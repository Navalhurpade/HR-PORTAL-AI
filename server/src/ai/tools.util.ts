import { z } from 'zod';
import { pool } from '../db/pool.js';
import { generateTextEmbedding } from './embbeding.ai.js';

export const leaveStatusSchema = z
  .enum(['pending', 'approved', 'rejected', 'cancelled'])
  .describe('Leave request status. Use this to filter by whether a request is pending, approved, rejected, or cancelled.');

export const leaveTypeSchema = z
  .enum(['casual', 'sick', 'earned', 'parental'])
  .describe(
    'Leave type. Supported values are casual, sick, earned, and parental. Use the exact value when filtering policies or submitting a leave request.',
  );

export type LeaveStatus = z.infer<typeof leaveStatusSchema>;

export const getLeavesDataFiltersSchema = z
  .object({
    status: leaveStatusSchema.optional().describe('Filter leave requests by status. Leave this empty to include all states.'),
    fromDate: z.iso.date().optional().describe('Only include leave requests whose period overlaps on or after this date (YYYY-MM-DD).'),
    toDate: z.iso.date().optional().describe('Only include leave requests whose period overlaps on or before this date (YYYY-MM-DD).'),
  })
  .strict()
  .describe('Optional filters for retrieving the signed-in user\'s leave requests.');

export type GetLeavesDataFilters = z.infer<typeof getLeavesDataFiltersSchema>;

export interface LeaveDataRecord {
  leaveRequestId: string;
  userId: string;
  leaveType: string;
  leaveName: string;
  startDate: string;
  endDate: string;
  requestedDays: number;
  status: LeaveStatus;
  createdAt: Date;
}

export interface LeavePolicyRecord {
  policyId: string;
  leaveType: string;
  name: string;
  annualAllowanceDays: number | null;
  maxConsecutiveDays: number | null;
  carryoverLimitDays: number;
  isPaid: boolean;
  requiresDocumentation: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface LeaveBalanceRecord {
  leaveType: string;
  leaveName: string;
  annualAllowanceDays: number | null;
  approvedDays: number;
  remainingDays: number | null;
  year: number;
}

export const createLeaveInputSchema = z
  .object({
    leaveType: leaveTypeSchema.describe('The type of leave being requested. Example: casual, sick, earned, or parental.'),
    startDate: z.iso.date().describe('The first day of the leave period in YYYY-MM-DD format.'),
    endDate: z.iso.date().describe('The last day of the leave period in YYYY-MM-DD format. Must be on or after startDate.'),
    reason: z.string().max(2000).optional().describe('Optional explanation for the leave request. Maximum 2000 characters.'),
  })
  .strict()
  .describe('Input for creating a new leave request for the signed-in user.');

export const updateLeaveInputSchema = z
  .object({
    leaveRequestId: z.uuid().describe('The UUID of the leave request to update.'),
    policyId: z.uuid().optional().describe('Optional policy to switch the leave request to. Use only when the leave type or policy has changed.'),
    startDate: z.iso.date().optional().describe('Optional new start date for the leave request in YYYY-MM-DD format.'),
    endDate: z.iso.date().optional().describe('Optional new end date for the leave request in YYYY-MM-DD format.'),
    reason: z.string().max(2000).optional().describe('Optional revised reason for the leave request. Maximum 2000 characters.'),
  })
  .strict()
  .describe('Input for updating an existing leave request.')
  .refine(
    ({ policyId, startDate, endDate, reason }) =>
      policyId !== undefined || startDate !== undefined || endDate !== undefined || reason !== undefined,
    'Provide at least one field to update.',
  );

export const searchCompanyDocumentsSchema = z
  .object({
    searchText: z.string().trim().min(1).max(2000).describe('Natural-language search query for finding relevant company documents or policy excerpts.'),
  })
  .strict()
  .describe('Search request for company documents and policy text.');

interface LeaveRequestMutationRow {
  leave_request_id: string;
  user_id: string;
  leave_type: string;
  display_name: string;
  start_date: string;
  end_date: string;
  requested_days: string;
  reason: string | null;
  status: LeaveStatus;
  created_at: Date;
}

export class LeaveOperationError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'LeaveOperationError';
    this.statusCode = statusCode;
  }
}

function formatLeaveRequest(row: LeaveRequestMutationRow): LeaveDataRecord & { reason: string | null } {
  return {
    leaveRequestId: row.leave_request_id,
    userId: row.user_id,
    leaveType: row.leave_type,
    leaveName: row.display_name,
    startDate: row.start_date,
    endDate: row.end_date,
    requestedDays: Number(row.requested_days),
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
  };
}

function toLeavePolicyRecord(row: {
  policy_id: string;
  leave_type: string;
  display_name: string;
  annual_allowance_days: string | null;
  max_consecutive_days: string | null;
  carryover_limit_days: string;
  is_paid: boolean;
  requires_documentation: boolean;
  effective_from: string;
  effective_to: string | null;
}): LeavePolicyRecord {
  return {
    policyId: row.policy_id,
    leaveType: row.leave_type,
    name: row.display_name,
    annualAllowanceDays: row.annual_allowance_days === null ? null : Number(row.annual_allowance_days),
    maxConsecutiveDays: row.max_consecutive_days === null ? null : Number(row.max_consecutive_days),
    carryoverLimitDays: Number(row.carryover_limit_days),
    isPaid: row.is_paid,
    requiresDocumentation: row.requires_documentation,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
  };
}

function validateLeavePeriod(startDate: string, endDate: string, maxConsecutiveDays: string | null): number {
  if (endDate < startDate) {
    throw new LeaveOperationError('Provide an end date on or after the start date.', 400);
  }
  if (startDate < new Date().toISOString().slice(0, 10)) {
    throw new LeaveOperationError('Leave cannot start in the past.', 400);
  }

  const requestedDays =
    Math.floor((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1;
  if (maxConsecutiveDays !== null && requestedDays > Number(maxConsecutiveDays)) {
    throw new LeaveOperationError('The request exceeds this policy’s maximum consecutive days.', 400);
  }
  return requestedDays;
}

/**
 * Fetch one user's latest leave requests. Optional date bounds filter periods
 * that overlap them. Free-text reasons and reviewer notes are omitted.
 */
export async function getLeavesData(userId: string, filters: GetLeavesDataFilters = {}): Promise<LeaveDataRecord[]> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) throw new TypeError('userId is required.');

  const parsedFilters = getLeavesDataFiltersSchema.parse(filters);
  const fromDate = parsedFilters.fromDate ?? null;
  const toDate = parsedFilters.toDate ?? null;

  if (fromDate !== null && toDate !== null && fromDate > toDate) {
    throw new TypeError('fromDate must be on or before toDate.');
  }

  const result = await pool.query<{
    leave_request_id: string;
    user_id: string;
    leave_type: string;
    display_name: string;
    start_date: string;
    end_date: string;
    requested_days: string;
    status: LeaveStatus;
    created_at: Date;
  }>(
    `SELECT lr.leave_request_id, lr.user_id, lp.leave_type, lp.display_name,
						to_char(lr.start_date, 'YYYY-MM-DD') AS start_date,
						to_char(lr.end_date, 'YYYY-MM-DD') AS end_date,
						lr.requested_days::text AS requested_days, lr.status, lr.created_at
		 FROM leave_requests lr
		 JOIN leave_policies lp ON lp.policy_id = lr.policy_id
     WHERE lr.user_id = $1
       AND ($2::text IS NULL OR lr.status = $2)
       AND ($3::date IS NULL OR lr.end_date >= $3::date)
       AND ($4::date IS NULL OR lr.start_date <= $4::date)
     ORDER BY lr.created_at DESC, lr.leave_request_id DESC
     LIMIT 10`,
    [normalizedUserId, parsedFilters.status ?? null, fromDate, toDate],
  );
  console.log({ getMyLeaves: result });

  return result.rows.map((row) => ({
    leaveRequestId: row.leave_request_id,
    userId: row.user_id,
    leaveType: row.leave_type,
    leaveName: row.display_name,
    startDate: row.start_date,
    endDate: row.end_date,
    requestedDays: Number(row.requested_days),
    status: row.status,
    createdAt: row.created_at,
  }));
}

export async function getMyLeaveBalance(
  userId: string,
  year = new Date().getUTCFullYear(),
): Promise<LeaveBalanceRecord[]> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) throw new TypeError('userId is required.');
  if (!Number.isInteger(year) || year < 1 || year > 9999) throw new TypeError('year must be a valid calendar year.');

  const policies = await pool.query<{
    leave_type: string;
    display_name: string;
    annual_allowance_days: string | null;
    approved_days: string;
  }>(
    `SELECT current_policy.leave_type, current_policy.display_name,
            current_policy.annual_allowance_days::text,
            COALESCE(usage.approved_days, 0)::text AS approved_days
     FROM (
       SELECT DISTINCT ON (leave_type)
              leave_type, display_name, annual_allowance_days
       FROM leave_policies
       WHERE effective_from <= CURRENT_DATE
         AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
       ORDER BY leave_type, effective_from DESC
     ) current_policy
     LEFT JOIN (
       SELECT lp.leave_type,
              SUM(
                LEAST(lr.end_date, make_date($2, 12, 31))
                - GREATEST(lr.start_date, make_date($2, 1, 1)) + 1
              ) AS approved_days
       FROM leave_requests lr
       JOIN leave_policies lp ON lp.policy_id = lr.policy_id
       WHERE lr.user_id = $1
         AND lr.status = 'approved'
         AND lr.start_date <= make_date($2, 12, 31)
         AND lr.end_date >= make_date($2, 1, 1)
       GROUP BY lp.leave_type
     ) usage ON usage.leave_type = current_policy.leave_type
     ORDER BY current_policy.display_name`,
    [normalizedUserId, year],
  );
  console.log({ leaveBalence: policies });

  return policies.rows.map((policy) => {
    const approvedDays = Number(policy.approved_days);
    const annualAllowanceDays = policy.annual_allowance_days === null ? null : Number(policy.annual_allowance_days);
    return {
      leaveType: policy.leave_type,
      leaveName: policy.display_name,
      annualAllowanceDays,
      approvedDays,
      remainingDays: annualAllowanceDays === null ? null : annualAllowanceDays - approvedDays,
      year,
    };
  });
}

export async function getLeavePolicy(leaveType?: string): Promise<LeavePolicyRecord[]> {
  const normalizedLeaveType = leaveType?.trim() || null;
  console.log({ leaveType });

  const result = await pool.query<{
    policy_id: string;
    leave_type: string;
    display_name: string;
    annual_allowance_days: string | null;
    max_consecutive_days: string | null;
    carryover_limit_days: string;
    is_paid: boolean;
    requires_documentation: boolean;
    effective_from: string;
    effective_to: string | null;
  }>(
    `SELECT policy_id, leave_type, display_name, annual_allowance_days::text,
            max_consecutive_days::text, carryover_limit_days::text, is_paid,
            requires_documentation, to_char(effective_from, 'YYYY-MM-DD') AS effective_from,
            to_char(effective_to, 'YYYY-MM-DD') AS effective_to
     FROM leave_policies
     WHERE effective_from <= CURRENT_DATE
       AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
       AND ($1::text IS NULL OR leave_type = $1)
     ORDER BY display_name`,
    [normalizedLeaveType],
  );
  console.log('leave policy');

  return result.rows.map(toLeavePolicyRecord);
}

export async function applyLeave(userId: string, input: unknown): Promise<LeaveDataRecord & { reason: string | null }> {
  const { leaveType, startDate, endDate, reason } = createLeaveInputSchema.parse(input);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId]);

    const policyResult = await client.query<{
      policy_id: string;
      leave_type: string;
      max_consecutive_days: string | null;
    }>(
      `SELECT policy_id, leave_type, max_consecutive_days::text
       FROM leave_policies
       WHERE leave_type = $1 AND effective_from <= $2::date
         AND (effective_to IS NULL OR effective_to >= $3::date)
       ORDER BY effective_from DESC
       LIMIT 1
       FOR SHARE`,
      [leaveType, startDate, endDate],
    );
    const policy = policyResult.rows[0];
    if (!policy) {
      throw new LeaveOperationError('No active policy for this leave type covers the requested dates.', 400);
    }
    const requestedDays = validateLeavePeriod(startDate, endDate, policy.max_consecutive_days);

    const conflict = await client.query(
      `SELECT 1 FROM leave_requests
       WHERE user_id = $1 AND status IN ('pending', 'approved')
         AND start_date <= $3::date AND end_date >= $2::date
       LIMIT 1`,
      [userId, startDate, endDate],
    );
    if (conflict.rowCount) {
      throw new LeaveOperationError('These dates overlap an existing pending or approved leave request.', 409);
    }

    const inserted = await client.query<{ leave_request_id: string }>(
      `INSERT INTO leave_requests (user_id, policy_id, start_date, end_date, requested_days, reason)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING leave_request_id`,
      [userId, policy.policy_id, startDate, endDate, requestedDays, reason?.trim() || null],
    );
    const leaveRequestId = inserted.rows[0]?.leave_request_id;
    if (!leaveRequestId) throw new Error('Leave request was not created.');
    const leaveResult = await client.query<LeaveRequestMutationRow>(
      `SELECT lr.leave_request_id, lr.user_id, lp.leave_type, lp.display_name,
              to_char(lr.start_date, 'YYYY-MM-DD') AS start_date,
              to_char(lr.end_date, 'YYYY-MM-DD') AS end_date,
              lr.requested_days::text, lr.reason, lr.status, lr.created_at
       FROM leave_requests lr
       JOIN leave_policies lp ON lp.policy_id = lr.policy_id
       WHERE lr.leave_request_id = $1 AND lr.user_id = $2`,
      [leaveRequestId, userId],
    );
    const leave = leaveResult.rows[0];
    if (!leave) throw new Error('Created leave request could not be retrieved.');
    await client.query('COMMIT');
    return formatLeaveRequest(leave);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateLeave(
  userId: string,
  input: unknown,
): Promise<LeaveDataRecord & { reason: string | null }> {
  const { leaveRequestId, policyId, startDate, endDate, reason } = updateLeaveInputSchema.parse(input);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId]);

    const currentResult = await client.query<{
      policy_id: string;
      start_date: string;
      end_date: string;
      reason: string | null;
    }>(
      `SELECT policy_id, to_char(start_date, 'YYYY-MM-DD') AS start_date,
              to_char(end_date, 'YYYY-MM-DD') AS end_date, reason
       FROM leave_requests
       WHERE leave_request_id = $1 AND user_id = $2 AND status = 'pending'
       FOR UPDATE`,
      [leaveRequestId, userId],
    );
    const current = currentResult.rows[0];
    if (!current) {
      throw new LeaveOperationError('Pending leave request not found.', 404);
    }

    const updatedPolicyId = policyId ?? current.policy_id;
    const updatedStartDate = startDate ?? current.start_date;
    const updatedEndDate = endDate ?? current.end_date;
    const policyResult = await client.query<{ max_consecutive_days: string | null }>(
      `SELECT max_consecutive_days::text
       FROM leave_policies
       WHERE policy_id = $1 AND effective_from <= $2::date
         AND (effective_to IS NULL OR effective_to >= $3::date)
       FOR SHARE`,
      [updatedPolicyId, updatedStartDate, updatedEndDate],
    );
    const policy = policyResult.rows[0];
    if (!policy) {
      throw new LeaveOperationError('No active leave policy covers the requested dates.', 400);
    }
    const requestedDays = validateLeavePeriod(updatedStartDate, updatedEndDate, policy.max_consecutive_days);

    const conflict = await client.query(
      `SELECT 1 FROM leave_requests
       WHERE user_id = $1 AND leave_request_id <> $2
         AND status IN ('pending', 'approved')
         AND start_date <= $4::date AND end_date >= $3::date
       LIMIT 1`,
      [userId, leaveRequestId, updatedStartDate, updatedEndDate],
    );
    if (conflict.rowCount) {
      throw new LeaveOperationError('These dates overlap an existing pending or approved leave request.', 409);
    }

    await client.query(
      `UPDATE leave_requests
       SET policy_id = $3, start_date = $4, end_date = $5, requested_days = $6,
           reason = $7, updated_at = NOW()
       WHERE leave_request_id = $1 AND user_id = $2 AND status = 'pending'`,
      [
        leaveRequestId,
        userId,
        updatedPolicyId,
        updatedStartDate,
        updatedEndDate,
        requestedDays,
        reason === undefined ? current.reason : reason.trim() || null,
      ],
    );
    const leaveResult = await client.query<LeaveRequestMutationRow>(
      `SELECT lr.leave_request_id, lr.user_id, lp.leave_type, lp.display_name,
              to_char(lr.start_date, 'YYYY-MM-DD') AS start_date,
              to_char(lr.end_date, 'YYYY-MM-DD') AS end_date,
              lr.requested_days::text, lr.reason, lr.status, lr.created_at
       FROM leave_requests lr
       JOIN leave_policies lp ON lp.policy_id = lr.policy_id
       WHERE lr.leave_request_id = $1 AND lr.user_id = $2`,
      [leaveRequestId, userId],
    );
    const leave = leaveResult.rows[0];
    if (!leave) throw new Error('Updated leave request could not be retrieved.');
    await client.query('COMMIT');
    return formatLeaveRequest(leave);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export interface CompanyDocumentSearchResult {
  documentId: string;
  documentName: string;
  chunkIndex: number;
  chunkText: string;
  similarity: number;
}

export async function SearchCompanyDocuments(query: string): Promise<CompanyDocumentSearchResult[]> {
  const embedding = await generateTextEmbedding(query);
  const queryVector = `[${embedding.join(',')}]`;
  const result = await pool.query<CompanyDocumentSearchResult>(
    `SELECT
       document_id AS "documentId",
       name AS "documentName",
       chunk_index AS "chunkIndex",
       chunk_text AS "chunkText",
       1 - (embedding <=> $1::vector) AS similarity
     FROM company_document_chunks
     JOIN company_documents USING (document_id)
     ORDER BY embedding <=> $1::vector
     LIMIT 3`,
    [queryVector],
  );
  console.log({ query, result });

  return result.rows;
}
