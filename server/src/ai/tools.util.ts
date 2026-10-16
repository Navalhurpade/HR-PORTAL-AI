import { z } from 'zod';
import { pool } from '../db/pool.js';

export const leaveStatusSchema = z.enum(['pending', 'approved', 'rejected', 'cancelled']);

export type LeaveStatus = z.infer<typeof leaveStatusSchema>;

export const getLeavesDataFiltersSchema = z
  .object({
    status: leaveStatusSchema.optional(),
    fromDate: z.iso.date().optional(),
    toDate: z.iso.date().optional(),
  })
  .strict();

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
