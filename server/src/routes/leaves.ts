import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { authenticate, requireRoles } from '../auth/guards.js';
import { pool } from '../db/pool.js';

const leaveStatuses = ['pending', 'approved', 'rejected', 'cancelled'] as const;
type LeaveStatus = (typeof leaveStatuses)[number];

interface CreateLeaveBody {
  policyId: string;
  startDate: string;
  endDate: string;
  reason?: string;
}

interface DecisionBody {
  decisionNote?: string;
}

interface LeaveRequestRow {
  leave_request_id: string;
  user_id: string;
  employee_name: string;
  email: string;
  department: string;
  policy_id: string;
  leave_type: string;
  display_name: string;
  start_date: string;
  end_date: string;
  requested_days: string;
  reason: string | null;
  status: LeaveStatus;
  reviewed_by_user_id: string | null;
  reviewer_name: string | null;
  reviewed_at: Date | null;
  decision_note: string | null;
  created_at: Date;
  updated_at: Date;
}

const leaveSelect = `
  SELECT lr.leave_request_id, lr.user_id, u.name AS employee_name, u.email, u.department,
         lr.policy_id, lp.leave_type, lp.display_name,
         to_char(lr.start_date, 'YYYY-MM-DD') AS start_date,
         to_char(lr.end_date, 'YYYY-MM-DD') AS end_date,
         lr.requested_days::text AS requested_days, lr.reason, lr.status,
         lr.reviewed_by_user_id, reviewer.name AS reviewer_name, lr.reviewed_at,
         lr.decision_note, lr.created_at, lr.updated_at
  FROM leave_requests lr
  JOIN users u ON u.user_id = lr.user_id
  JOIN leave_policies lp ON lp.policy_id = lr.policy_id
  LEFT JOIN users reviewer ON reviewer.user_id = lr.reviewed_by_user_id
`;

function formatLeave(row: LeaveRequestRow) {
  return {
    leaveRequestId: row.leave_request_id,
    userId: row.user_id,
    employee: { name: row.employee_name, email: row.email, department: row.department },
    policyId: row.policy_id,
    leaveType: row.leave_type,
    leaveName: row.display_name,
    startDate: row.start_date,
    endDate: row.end_date,
    requestedDays: Number(row.requested_days),
    reason: row.reason,
    status: row.status,
    reviewedBy: row.reviewed_by_user_id ? { userId: row.reviewed_by_user_id, name: row.reviewer_name } : null,
    reviewedAt: row.reviewed_at,
    decisionNote: row.decision_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isIsoDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) &&
    new Date(`${value}T00:00:00.000Z`).toISOString().startsWith(value)
  );
}

async function finishDecision(
  client: PoolClient,
  requestId: string,
  reviewerId: string,
  status: 'approved' | 'rejected',
  decisionNote?: string,
) {
  const changed = await client.query<{ leave_request_id: string }>(
    `UPDATE leave_requests
     SET status = $3, reviewed_by_user_id = $2, reviewed_at = NOW(),
         decision_note = $4, updated_at = NOW()
     WHERE leave_request_id = $1 AND status = 'pending' AND user_id <> $2
     RETURNING leave_request_id`,
    [requestId, reviewerId, status, decisionNote?.trim() || null],
  );
  if (!changed.rows[0]) return undefined;
  const updated = await client.query<LeaveRequestRow>(`${leaveSelect} WHERE lr.leave_request_id = $1`, [
    changed.rows[0].leave_request_id,
  ]);
  return updated.rows[0];
}

export async function registerLeaveRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { status?: LeaveStatus; userId?: string; limit?: number; offset?: number } }>(
    '/leaves',
    {
      preHandler: authenticate,
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            status: { type: 'string', enum: [...leaveStatuses] },
            userId: { type: 'string', maxLength: 100 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
            offset: { type: 'integer', minimum: 0, default: 0 },
          },
        },
      },
    },
    async (request) => {
      const canViewAll = request.user.role === 'hr' || request.user.role === 'super_admin';
      const userId = canViewAll ? request.query.userId : request.user.sub;
      const limit = request.query.limit ?? 50;
      const offset = request.query.offset ?? 0;
      const result = await pool.query<LeaveRequestRow>(
        `${leaveSelect}
         WHERE ($1::text IS NULL OR lr.user_id = $1)
           AND ($2::text IS NULL OR lr.status = $2)
         ORDER BY lr.created_at DESC, lr.leave_request_id
         LIMIT $3 OFFSET $4`,
        [userId ?? null, request.query.status ?? null, limit, offset],
      );
      return { items: result.rows.map(formatLeave), limit, offset };
    },
  );

  app.get<{ Params: { leaveRequestId: string } }>(
    '/leaves/:leaveRequestId',
    {
      preHandler: authenticate,
      schema: {
        params: {
          type: 'object',
          required: ['leaveRequestId'],
          properties: { leaveRequestId: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const result = await pool.query<LeaveRequestRow>(`${leaveSelect} WHERE lr.leave_request_id = $1`, [
        request.params.leaveRequestId,
      ]);
      const leave = result.rows[0];
      if (!leave) return reply.code(404).send({ error: 'Leave request not found.' });
      if (request.user.role === 'employee' && leave.user_id !== request.user.sub) {
        return reply.code(404).send({ error: 'Leave request not found.' });
      }
      return { item: formatLeave(leave) };
    },
  );

  app.get('/leave-policies', { preHandler: authenticate }, async () => {
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
       WHERE effective_from <= CURRENT_DATE AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
       ORDER BY display_name`,
    );
    return {
      items: result.rows.map((policy) => ({
        policyId: policy.policy_id,
        leaveType: policy.leave_type,
        name: policy.display_name,
        annualAllowanceDays: policy.annual_allowance_days === null ? null : Number(policy.annual_allowance_days),
        maxConsecutiveDays: policy.max_consecutive_days === null ? null : Number(policy.max_consecutive_days),
        carryoverLimitDays: Number(policy.carryover_limit_days),
        isPaid: policy.is_paid,
        requiresDocumentation: policy.requires_documentation,
        effectiveFrom: policy.effective_from,
        effectiveTo: policy.effective_to,
      })),
    };
  });

  app.post<{ Body: CreateLeaveBody }>(
    '/leaves',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['policyId', 'startDate', 'endDate'],
          properties: {
            policyId: { type: 'string', format: 'uuid' },
            startDate: { type: 'string', format: 'date' },
            endDate: { type: 'string', format: 'date' },
            reason: { type: 'string', maxLength: 2000 },
          },
        },
      },
    },
    async (request, reply) => {
      const { policyId, startDate, endDate, reason } = request.body;
      if (!isIsoDate(startDate) || !isIsoDate(endDate) || endDate < startDate) {
        return reply.code(400).send({ error: 'Provide valid dates with endDate on or after startDate.' });
      }
      const today = new Date().toISOString().slice(0, 10);
      if (startDate < today) return reply.code(400).send({ error: 'Leave cannot start in the past.' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [request.user.sub]);

        const policyResult = await client.query<{
          leave_type: string;
          max_consecutive_days: string | null;
        }>(
          `SELECT leave_type, max_consecutive_days::text
           FROM leave_policies
           WHERE policy_id = $1 AND effective_from <= $2::date
             AND (effective_to IS NULL OR effective_to >= $3::date)
           FOR SHARE`,
          [policyId, startDate, endDate],
        );
        const policy = policyResult.rows[0];
        if (!policy) {
          await client.query('ROLLBACK');
          return reply.code(400).send({ error: 'No active leave policy covers the requested dates.' });
        }

        const requestedDays =
          Math.floor((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1;
        if (policy.max_consecutive_days !== null && requestedDays > Number(policy.max_consecutive_days)) {
          await client.query('ROLLBACK');
          return reply.code(400).send({ error: 'The request exceeds this policy’s maximum consecutive days.' });
        }

        const conflict = await client.query(
          `SELECT 1 FROM leave_requests
           WHERE user_id = $1 AND status IN ('pending', 'approved')
             AND start_date <= $3::date AND end_date >= $2::date
           LIMIT 1`,
          [request.user.sub, startDate, endDate],
        );
        if (conflict.rowCount) {
          await client.query('ROLLBACK');
          return reply.code(409).send({ error: 'These dates overlap an existing pending or approved leave request.' });
        }

        const inserted = await client.query<{ leave_request_id: string }>(
          `INSERT INTO leave_requests (user_id, policy_id, start_date, end_date, requested_days, reason)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING leave_request_id`,
          [request.user.sub, policyId, startDate, endDate, requestedDays, reason?.trim() || null],
        );
        await client.query('COMMIT');
        return reply.code(201).send({
          item: {
            leaveRequestId: inserted.rows[0]?.leave_request_id,
            userId: request.user.sub,
            policyId,
            leaveType: policy.leave_type,
            startDate,
            endDate,
            requestedDays,
            reason: reason?.trim() || null,
            status: 'pending',
          },
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  );

  const decisionSchema = {
    params: {
      type: 'object',
      required: ['leaveRequestId'],
      properties: { leaveRequestId: { type: 'string', format: 'uuid' } },
    },
    body: {
      type: 'object',
      additionalProperties: false,
      properties: { decisionNote: { type: 'string', maxLength: 2000 } },
    },
  } as const;

  app.post<{ Params: { leaveRequestId: string }; Body: DecisionBody }>(
    '/leaves/:leaveRequestId/approve',
    { preHandler: [authenticate, requireRoles('hr', 'super_admin')], schema: decisionSchema },
    async (request, reply) => decide(request, reply, 'approved'),
  );

  app.post<{ Params: { leaveRequestId: string }; Body: DecisionBody }>(
    '/leaves/:leaveRequestId/reject',
    { preHandler: [authenticate, requireRoles('hr', 'super_admin')], schema: decisionSchema },
    async (request, reply) => decide(request, reply, 'rejected'),
  );

  async function decide(
    request: { params: { leaveRequestId: string }; body: DecisionBody; user: { sub: string } },
    reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } },
    status: 'approved' | 'rejected',
  ) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await finishDecision(
        client,
        request.params.leaveRequestId,
        request.user.sub,
        status,
        request.body?.decisionNote,
      );
      if (!updated) {
        await client.query('ROLLBACK');
        const existing = await pool.query<{ user_id: string; status: string }>(
          'SELECT user_id, status FROM leave_requests WHERE leave_request_id = $1',
          [request.params.leaveRequestId],
        );
        if (!existing.rows[0]) return reply.code(404).send({ error: 'Leave request not found.' });
        if (existing.rows[0].user_id === request.user.sub)
          return reply.code(403).send({ error: 'You cannot review your own leave request.' });
        return reply.code(409).send({ error: 'Only pending leave requests can be reviewed.' });
      }
      await client.query('COMMIT');
      return { item: formatLeave(updated) };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
