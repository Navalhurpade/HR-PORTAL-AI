BEGIN;

-- =========================================================
-- 1. USERS
-- Insert users first; manager relationships are assigned later.
-- =========================================================

INSERT INTO users
    (user_id, name, email, role, department, manager_id, is_active)
VALUES
    ('USR001', 'Aarav Sharma', 'aarav.sharma@example.com', 'super_admin', 'Administration', NULL, TRUE),
    ('USR002', 'Priya Deshmukh', 'priya.deshmukh@example.com', 'hr', 'Human Resources', NULL, TRUE),
    ('USR003', 'Rahul Mehta', 'rahul.mehta@example.com', 'hr', 'Human Resources', NULL, TRUE),

    ('USR004', 'Sneha Kulkarni', 'sneha.kulkarni@example.com', 'employee', 'Engineering', NULL, TRUE),
    ('USR005', 'Rohan Patil', 'rohan.patil@example.com', 'employee', 'Engineering', NULL, TRUE),
    ('USR006', 'Ananya Joshi', 'ananya.joshi@example.com', 'employee', 'Engineering', NULL, TRUE),
    ('USR007', 'Vikram Singh', 'vikram.singh@example.com', 'employee', 'Engineering', NULL, TRUE),
    ('USR008', 'Isha Shah', 'isha.shah@example.com', 'employee', 'Engineering', NULL, TRUE),

    ('USR009', 'Karan Malhotra', 'karan.malhotra@example.com', 'employee', 'Product', NULL, TRUE),
    ('USR010', 'Meera Nair', 'meera.nair@example.com', 'employee', 'Product', NULL, TRUE),
    ('USR011', 'Aditya Rao', 'aditya.rao@example.com', 'employee', 'Product', NULL, TRUE),

    ('USR012', 'Neha Verma', 'neha.verma@example.com', 'employee', 'Finance', NULL, TRUE),
    ('USR013', 'Arjun Gupta', 'arjun.gupta@example.com', 'employee', 'Finance', NULL, TRUE),

    ('USR014', 'Pooja Iyer', 'pooja.iyer@example.com', 'employee', 'Marketing', NULL, TRUE),
    ('USR015', 'Siddharth Jain', 'siddharth.jain@example.com', 'employee', 'Marketing', NULL, TRUE),

    ('USR016', 'Kavya Reddy', 'kavya.reddy@example.com', 'employee', 'Operations', NULL, TRUE),
    ('USR017', 'Amit Joshi', 'amit.joshi@example.com', 'employee', 'Operations', NULL, TRUE),

    ('USR018', 'Nikhil More', 'nikhil.more@example.com', 'employee', 'Engineering', NULL, TRUE),
    ('USR019', 'Tanya Kapoor', 'tanya.kapoor@example.com', 'employee', 'Engineering', NULL, FALSE),
    ('USR020', 'Devendra Pawar', 'devendra.pawar@example.com', 'employee', 'Operations', NULL, TRUE)

ON CONFLICT (user_id) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    department = EXCLUDED.department,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();


-- =========================================================
-- 2. MANAGER HIERARCHY
-- =========================================================

UPDATE users SET manager_id = 'USR004' WHERE user_id IN
    ('USR005', 'USR006', 'USR007', 'USR008', 'USR018', 'USR019');

UPDATE users SET manager_id = 'USR009' WHERE user_id IN
    ('USR010', 'USR011');

UPDATE users SET manager_id = 'USR012' WHERE user_id = 'USR013';

UPDATE users SET manager_id = 'USR014' WHERE user_id = 'USR015';

UPDATE users SET manager_id = 'USR016' WHERE user_id IN
    ('USR017', 'USR020');

-- =========================================================
-- 3. LEAVE POLICIES
-- Illustrative values only. Adjust to your actual policy.
-- =========================================================

INSERT INTO leave_policies (
    policy_id, leave_type, display_name,
    annual_allowance_days, max_consecutive_days,
    carryover_limit_days, is_paid, requires_documentation,
    effective_from, effective_to
)
VALUES
(
    '10000000-0000-4000-8000-000000000001',
    'casual', 'Casual Leave',
    12, 3, 0, TRUE, FALSE,
    '2026-01-01', NULL
),
(
    '10000000-0000-4000-8000-000000000002',
    'sick', 'Sick Leave',
    12, 5, 0, TRUE, TRUE,
    '2026-01-01', NULL
),
(
    '10000000-0000-4000-8000-000000000003',
    'earned', 'Earned Leave',
    18, 10, 5, TRUE, FALSE,
    '2026-01-01', NULL
),
(
    '10000000-0000-4000-8000-000000000004',
    'parental', 'Parental Leave',
    90, 90, 0, TRUE, TRUE,
    '2026-01-01', NULL
),
(
    '10000000-0000-4000-8000-000000000005',
    'earned', 'Earned Leave - Previous Policy',
    15, 10, 3, TRUE, FALSE,
    '2025-01-01', '2025-12-31'
)

ON CONFLICT (policy_id) DO UPDATE SET
    leave_type = EXCLUDED.leave_type,
    display_name = EXCLUDED.display_name,
    annual_allowance_days = EXCLUDED.annual_allowance_days,
    max_consecutive_days = EXCLUDED.max_consecutive_days,
    carryover_limit_days = EXCLUDED.carryover_limit_days,
    is_paid = EXCLUDED.is_paid,
    requires_documentation = EXCLUDED.requires_documentation,
    effective_from = EXCLUDED.effective_from,
    effective_to = EXCLUDED.effective_to;


-- =========================================================
-- 4. LEAVE REQUESTS
-- Approved/rejected requests have reviewer + review timestamp.
-- Pending/cancelled requests have no review timestamp.
-- =========================================================

INSERT INTO leave_requests (
    leave_request_id, user_id, policy_id,
    start_date, end_date, requested_days, reason,
    status, reviewed_by_user_id, reviewed_at, decision_note,
    created_at, updated_at
)
VALUES

-- Approved requests
('20000000-0000-4000-8000-000000000001',
 'USR005', '10000000-0000-4000-8000-000000000001',
 '2026-01-12', '2026-01-13', 2, 'Personal commitments',
 'approved', 'USR002', '2026-01-05 10:30:00+05:30',
 'Approved by HR', '2026-01-03 09:00:00+05:30', '2026-01-05 10:30:00+05:30'),

('20000000-0000-4000-8000-000000000002',
 'USR006', '10000000-0000-4000-8000-000000000002',
 '2026-02-10', '2026-02-11', 2, 'Seasonal illness',
 'approved', 'USR003', '2026-02-09 11:00:00+05:30',
 'Approved', '2026-02-08 10:00:00+05:30', '2026-02-09 11:00:00+05:30'),

('20000000-0000-4000-8000-000000000003',
 'USR007', '10000000-0000-4000-8000-000000000003',
 '2026-03-16', '2026-03-20', 5, 'Family vacation',
 'approved', 'USR002', '2026-03-05 14:00:00+05:30',
 'Approved as requested', '2026-03-03 12:00:00+05:30', '2026-03-05 14:00:00+05:30'),

('20000000-0000-4000-8000-000000000004',
 'USR010', '10000000-0000-4000-8000-000000000001',
 '2026-04-06', '2026-04-06', 1, 'Personal work',
 'approved', 'USR003', '2026-04-02 09:00:00+05:30',
 'Approved', '2026-04-01 15:00:00+05:30', '2026-04-02 09:00:00+05:30'),

('20000000-0000-4000-8000-000000000005',
 'USR011', '10000000-0000-4000-8000-000000000003',
 '2026-05-04', '2026-05-08', 5, 'Planned vacation',
 'approved', 'USR002', '2026-04-20 12:00:00+05:30',
 'Approved', '2026-04-18 10:00:00+05:30', '2026-04-20 12:00:00+05:30'),

('20000000-0000-4000-8000-000000000006',
 'USR013', '10000000-0000-4000-8000-000000000002',
 '2026-06-15', '2026-06-16', 2, 'Medical rest',
 'approved', 'USR003', '2026-06-14 10:00:00+05:30',
 'Documentation reviewed', '2026-06-13 09:00:00+05:30', '2026-06-14 10:00:00+05:30'),

('20000000-0000-4000-8000-000000000007',
 'USR015', '10000000-0000-4000-8000-000000000001',
 '2026-07-13', '2026-07-14', 2, 'Personal work',
 'approved', 'USR002', '2026-07-08 15:00:00+05:30',
 'Approved', '2026-07-07 11:00:00+05:30', '2026-07-08 15:00:00+05:30'),

('20000000-0000-4000-8000-000000000008',
 'USR017', '10000000-0000-4000-8000-000000000003',
 '2026-08-03', '2026-08-07', 5, 'Family trip',
 'approved', 'USR003', '2026-07-20 13:00:00+05:30',
 'Approved', '2026-07-19 09:30:00+05:30', '2026-07-20 13:00:00+05:30'),

('20000000-0000-4000-8000-000000000009',
 'USR008', '10000000-0000-4000-8000-000000000002',
 '2026-08-17', '2026-08-18', 2, 'Recovery',
 'approved', 'USR002', '2026-08-16 10:00:00+05:30',
 'Approved', '2026-08-15 09:00:00+05:30', '2026-08-16 10:00:00+05:30'),

('20000000-0000-4000-8000-000000000010',
 'USR020', '10000000-0000-4000-8000-000000000001',
 '2026-09-07', '2026-09-08', 2, 'Personal commitments',
 'approved', 'USR003', '2026-09-01 11:00:00+05:30',
 'Approved', '2026-08-31 10:00:00+05:30', '2026-09-01 11:00:00+05:30'),

-- Rejected requests
('20000000-0000-4000-8000-000000000011',
 'USR005', '10000000-0000-4000-8000-000000000003',
 '2026-04-13', '2026-04-17', 5, 'Vacation',
 'rejected', 'USR002', '2026-04-08 12:00:00+05:30',
 'Insufficient team coverage', '2026-04-06 10:00:00+05:30', '2026-04-08 12:00:00+05:30'),

('20000000-0000-4000-8000-000000000012',
 'USR010', '10000000-0000-4000-8000-000000000001',
 '2026-06-22', '2026-06-25', 4, 'Personal trip',
 'rejected', 'USR003', '2026-06-15 14:00:00+05:30',
 'Please choose alternate dates', '2026-06-14 09:00:00+05:30', '2026-06-15 14:00:00+05:30'),

('20000000-0000-4000-8000-000000000013',
 'USR014', '10000000-0000-4000-8000-000000000003',
 '2026-07-20', '2026-07-31', 12, 'Extended vacation',
 'rejected', 'USR002', '2026-07-10 16:00:00+05:30',
 'Exceeds illustrative consecutive-day limit', '2026-07-08 10:00:00+05:30', '2026-07-10 16:00:00+05:30'),

-- Pending requests for the HR queue
('20000000-0000-4000-8000-000000000014',
 'USR005', '10000000-0000-4000-8000-000000000001',
 '2026-10-19', '2026-10-20', 2, 'Personal work',
 'pending', NULL, NULL, NULL,
 '2026-10-10 09:00:00+05:30', '2026-10-10 09:00:00+05:30'),

('20000000-0000-4000-8000-000000000015',
 'USR006', '10000000-0000-4000-8000-000000000003',
 '2026-11-02', '2026-11-06', 5, 'Planned vacation',
 'pending', NULL, NULL, NULL,
 '2026-10-11 10:00:00+05:30', '2026-10-11 10:00:00+05:30'),

('20000000-0000-4000-8000-000000000016',
 'USR009', '10000000-0000-4000-8000-000000000001',
 '2026-10-26', '2026-10-27', 2, 'Family commitments',
 'pending', NULL, NULL, NULL,
 '2026-10-12 11:00:00+05:30', '2026-10-12 11:00:00+05:30'),

('20000000-0000-4000-8000-000000000017',
 'USR012', '10000000-0000-4000-8000-000000000002',
 '2026-10-14', '2026-10-15', 2, 'Medical appointment',
 'pending', NULL, NULL, NULL,
 '2026-10-12 14:00:00+05:30', '2026-10-12 14:00:00+05:30'),

('20000000-0000-4000-8000-000000000018',
 'USR017', '10000000-0000-4000-8000-000000000003',
 '2026-12-21', '2026-12-24', 4, 'Year-end vacation',
 'pending', NULL, NULL, NULL,
 '2026-10-12 15:00:00+05:30', '2026-10-12 15:00:00+05:30'),

('20000000-0000-4000-8000-000000000019',
 'USR018', '10000000-0000-4000-8000-000000000001',
 '2026-10-30', '2026-10-30', 1, 'Personal errand',
 'pending', NULL, NULL, NULL,
 '2026-10-12 16:00:00+05:30', '2026-10-12 16:00:00+05:30'),

-- Cancelled requests
('20000000-0000-4000-8000-000000000020',
 'USR007', '10000000-0000-4000-8000-000000000001',
 '2026-05-18', '2026-05-19', 2, 'Plans changed',
 'cancelled', NULL, NULL, NULL,
 '2026-05-10 09:00:00+05:30', '2026-05-12 10:00:00+05:30'),

('20000000-0000-4000-8000-000000000021',
 'USR011', '10000000-0000-4000-8000-000000000003',
 '2026-09-21', '2026-09-25', 5, 'Trip postponed',
 'cancelled', NULL, NULL, NULL,
 '2026-09-01 10:00:00+05:30', '2026-09-05 12:00:00+05:30'),

-- More approved requests
('20000000-0000-4000-8000-000000000022',
 'USR014', '10000000-0000-4000-8000-000000000002',
 '2026-01-20', '2026-01-20', 1, 'Medical rest',
 'approved', 'USR003', '2026-01-19 10:00:00+05:30',
 'Approved', '2026-01-18 09:00:00+05:30', '2026-01-19 10:00:00+05:30'),

('20000000-0000-4000-8000-000000000023',
 'USR016', '10000000-0000-4000-8000-000000000003',
 '2026-02-16', '2026-02-20', 5, 'Personal vacation',
 'approved', 'USR002', '2026-02-02 12:00:00+05:30',
 'Approved', '2026-02-01 10:00:00+05:30', '2026-02-02 12:00:00+05:30'),

('20000000-0000-4000-8000-000000000024',
 'USR004', '10000000-0000-4000-8000-000000000001',
 '2026-03-02', '2026-03-03', 2, 'Personal work',
 'approved', 'USR002', '2026-02-26 11:00:00+05:30',
 'Approved', '2026-02-25 09:00:00+05:30', '2026-02-26 11:00:00+05:30'),

('20000000-0000-4000-8000-000000000025',
 'USR009', '10000000-0000-4000-8000-000000000002',
 '2026-04-27', '2026-04-28', 2, 'Sick leave',
 'approved', 'USR003', '2026-04-26 10:00:00+05:30',
 'Approved', '2026-04-25 09:00:00+05:30', '2026-04-26 10:00:00+05:30'),

('20000000-0000-4000-8000-000000000026',
 'USR012', '10000000-0000-4000-8000-000000000001',
 '2026-05-11', '2026-05-12', 2, 'Personal commitments',
 'approved', 'USR002', '2026-05-07 10:00:00+05:30',
 'Approved', '2026-05-06 09:00:00+05:30', '2026-05-07 10:00:00+05:30'),

('20000000-0000-4000-8000-000000000027',
 'USR015', '10000000-0000-4000-8000-000000000003',
 '2026-06-01', '2026-06-05', 5, 'Family vacation',
 'approved', 'USR003', '2026-05-15 14:00:00+05:30',
 'Approved', '2026-05-14 10:00:00+05:30', '2026-05-15 14:00:00+05:30'),

('20000000-0000-4000-8000-000000000028',
 'USR020', '10000000-0000-4000-8000-000000000002',
 '2026-07-06', '2026-07-07', 2, 'Recovery',
 'approved', 'USR002', '2026-07-05 10:00:00+05:30',
 'Approved', '2026-07-04 09:00:00+05:30', '2026-07-05 10:00:00+05:30'),

-- More pending requests
('20000000-0000-4000-8000-000000000029',
 'USR008', '10000000-0000-4000-8000-000000000001',
 '2026-11-16', '2026-11-17', 2, 'Personal work',
 'pending', NULL, NULL, NULL,
 '2026-10-12 17:00:00+05:30', '2026-10-12 17:00:00+05:30'),

('20000000-0000-4000-8000-000000000030',
 'USR013', '10000000-0000-4000-8000-000000000003',
 '2026-12-07', '2026-12-11', 5, 'Year-end vacation',
 'pending', NULL, NULL, NULL,
 '2026-10-12 18:00:00+05:30', '2026-10-12 18:00:00+05:30')

ON CONFLICT (leave_request_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    policy_id = EXCLUDED.policy_id,
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date,
    requested_days = EXCLUDED.requested_days,
    reason = EXCLUDED.reason,
    status = EXCLUDED.status,
    reviewed_by_user_id = EXCLUDED.reviewed_by_user_id,
    reviewed_at = EXCLUDED.reviewed_at,
    decision_note = EXCLUDED.decision_note,
    created_at = EXCLUDED.created_at,
    updated_at = EXCLUDED.updated_at;

COMMIT;
