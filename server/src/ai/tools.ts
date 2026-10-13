import { pool } from '../db/pool.js';

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface GetLeavesDataFilters {
  status?: LeaveStatus;
  fromDate?: string;
  toDate?: string;
}

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

const validStatuses = new Set<LeaveStatus>(['pending', 'approved', 'rejected', 'cancelled']);

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/**
 * Fetch one user's latest leave requests. Optional date bounds filter periods
 * that overlap them. Free-text reasons and reviewer notes are omitted.
 */
export async function getLeavesData(userId: string, filters: GetLeavesDataFilters = {}): Promise<LeaveDataRecord[]> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) throw new TypeError('userId is required.');

  if (filters.status && !validStatuses.has(filters.status)) {
    throw new TypeError('status must be pending, approved, rejected, or cancelled.');
  }

  const fromDate = filters.fromDate ?? null;
  const toDate = filters.toDate ?? null;

  if (fromDate !== null && !isIsoDate(fromDate)) throw new TypeError('fromDate must be a valid YYYY-MM-DD date.');
  if (toDate !== null && !isIsoDate(toDate)) throw new TypeError('toDate must be a valid YYYY-MM-DD date.');
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
    [normalizedUserId, filters.status ?? null, fromDate, toDate],
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
