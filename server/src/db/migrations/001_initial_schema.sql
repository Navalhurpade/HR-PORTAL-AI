-- Core HR records. Policy values are intentionally not seeded: they depend on
-- company rules, location, and applicable employment law.

CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('employee', 'hr', 'super_admin')),
    department TEXT NOT NULL,
    manager_id TEXT REFERENCES users(user_id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT users_name_not_blank CHECK (length(trim(name)) > 0),
    CONSTRAINT users_department_not_blank CHECK (length(trim(department)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_manager_id_idx ON users (manager_id);
CREATE INDEX IF NOT EXISTS users_department_idx ON users (department);

-- A policy row is a versioned rule set for one leave category. Leave requests
-- reference the exact policy that applied when the request was submitted.
CREATE TABLE IF NOT EXISTS leave_policies (
    policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    leave_type TEXT NOT NULL,
    display_name TEXT NOT NULL,
    annual_allowance_days NUMERIC(6, 2),
    max_consecutive_days NUMERIC(6, 2),
    carryover_limit_days NUMERIC(6, 2) NOT NULL DEFAULT 0,
    is_paid BOOLEAN NOT NULL DEFAULT TRUE,
    requires_documentation BOOLEAN NOT NULL DEFAULT FALSE,
    effective_from DATE NOT NULL,
    effective_to DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT leave_policies_type_not_blank CHECK (length(trim(leave_type)) > 0),
    CONSTRAINT leave_policies_name_not_blank CHECK (length(trim(display_name)) > 0),
    CONSTRAINT leave_policies_allowance_nonnegative CHECK (annual_allowance_days IS NULL OR annual_allowance_days >= 0),
    CONSTRAINT leave_policies_max_nonnegative CHECK (max_consecutive_days IS NULL OR max_consecutive_days > 0),
    CONSTRAINT leave_policies_carryover_nonnegative CHECK (carryover_limit_days >= 0),
    CONSTRAINT leave_policies_dates_valid CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT leave_policies_version_unique UNIQUE (leave_type, effective_from)
);

CREATE INDEX IF NOT EXISTS leave_policies_effective_idx ON leave_policies (leave_type, effective_from, effective_to);

CREATE TABLE IF NOT EXISTS leave_requests (
    leave_request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    policy_id UUID NOT NULL REFERENCES leave_policies(policy_id) ON DELETE RESTRICT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    requested_days NUMERIC(6, 2) NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    reviewed_by_user_id TEXT REFERENCES users(user_id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    decision_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT leave_requests_dates_valid CHECK (end_date >= start_date),
    CONSTRAINT leave_requests_days_positive CHECK (requested_days > 0),
    CONSTRAINT leave_requests_review_consistent CHECK (
        (status IN ('approved', 'rejected') AND reviewed_at IS NOT NULL)
        OR status NOT IN ('approved', 'rejected')
    )
);

CREATE INDEX IF NOT EXISTS leave_requests_user_created_idx ON leave_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS leave_requests_status_created_idx ON leave_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS leave_requests_dates_idx ON leave_requests (start_date, end_date);
