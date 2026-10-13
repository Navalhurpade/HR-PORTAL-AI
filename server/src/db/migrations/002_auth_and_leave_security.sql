ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
  ADD CONSTRAINT users_failed_login_attempts_nonnegative CHECK (failed_login_attempts >= 0);

ALTER TABLE leave_requests
  ADD CONSTRAINT leave_requests_reviewer_not_self CHECK (
    reviewed_by_user_id IS NULL OR reviewed_by_user_id <> user_id
  );

CREATE INDEX IF NOT EXISTS leave_requests_reviewer_idx ON leave_requests (reviewed_by_user_id, reviewed_at DESC);