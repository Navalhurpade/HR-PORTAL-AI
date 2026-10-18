# HR Portal API

Fastify + TypeScript backend with PostgreSQL, bearer-token authentication, role-based leave APIs, and SQL migrations.

## Local setup

1. Install PostgreSQL and create a database named `hr_portal` (or choose another database name).
2. Copy `.env.example` to `.env` and set `DATABASE_URL`. For a hosted PostgreSQL provider, set `CA_CERT_PATH=./ca.pem` (or the PEM path provided by the provider); TLS certificate verification remains enabled.
3. Run `npm install`.
4. Run `npm run db:migrate` to create the schema.
5. Set `JWT_SECRET` to a random secret of at least 32 characters for stable tokens (required in production). Without it, local development generates an ephemeral secret on startup.
6. Set `GOOGLE_API_KEY` in `.env` for company-document embeddings. The key is used only by the server; never add it to the client or commit it.
7. Provision the initial administrator out-of-band with the secure user creation command below.
8. Run `npm run dev`; the API listens on `http://127.0.0.1:3001` by default.
9. The API checks PostgreSQL before listening and logs a successful connection. `GET /health` checks database availability.

`npm run build` type-checks and emits the production server to `dist/`; `npm start` runs that build.

## Initial account

Public registration creates employee accounts only. Provision HR and super-admin accounts from an interactive terminal, entering a password when prompted (input is not echoed):

`npm run db:create-user -- --user-id ADM-0001 --name "Jordan Lee" --email jordan@example.com --role super_admin --department Administration`

The command requires a password of at least 12 characters and stores only a bcrypt hash. Create a super admin first; use that account's authenticated, audited provisioning workflow (to be added) for subsequent accounts. Do not use the UI's demo role switch as an authorization mechanism.

## Authentication and authorization

- `POST /auth/register` — JSON `{ "name": "...", "email": "...", "department": "...", "password": "..." }`; creates an employee account and returns a 30-minute bearer access token. Password must be at least 12 characters; registration is rate-limited. Role, user ID, and manager assignment are not client-controlled.
- `POST /auth/login` — JSON `{ "email": "...", "password": "..." }`; returns a 30-minute bearer access token. Login is rate-limited; after 5 failed attempts the account is locked for 15 minutes.
- `GET /auth/me` — current active user's profile.
- Send the token as `Authorization: Bearer <accessToken>` for protected endpoints. The API reloads the active user and role from PostgreSQL on each request, so role changes/deactivation take effect immediately.
- HR/admin account provisioning and policy mutation APIs are not exposed.

## Leave API

- `GET /leave-policies` — active policies for signed-in users.
- `GET /leaves?status=pending&limit=50&offset=0` — employees only see their own requests; HR and super admins can list all requests and optionally filter with `userId`.
- `GET /leaves/:leaveRequestId` — employees can read only their own requests; HR/super admins can read any request.
- `POST /leaves` — creates a pending request for the authenticated user; validates dates and active policy, checks max consecutive days and overlapping pending/approved requests.
- `POST /leaves/:leaveRequestId/approve` and `/reject` — HR and super admins only; only pending requests can be decided; self-approval is prohibited. `decisionNote` is optional.

## Company documents

- `GET /company-documents` and `GET /company-documents/:id` — any signed-in user can list and download shared company documents.
- `POST /company-documents` and `DELETE /company-documents/:id` — HR and super admins only.
- Uploads accept PDF, Word, Excel, PowerPoint, RTF, CSV, and plain-text files up to 25 MB. File contents are stored in `storage/company-documents` under the server working directory by default; document metadata and each extracted text chunk with its 3,072-dimensional Gemini embedding are stored in PostgreSQL. Set `COMPANY_DOCUMENTS_DIR` to change the file location. Set `GOOGLE_API_KEY` to enable document embedding generation. The local storage directory is excluded from version control.

## Nori chat API

- `POST /chat` — requires a bearer token and is limited to 20 requests per minute.
- Request JSON: `{ "message": "...", "conversationId": "optional-uuid", "history": [{ "role": "user|assistant", "content": "..." }] }`. Messages are non-blank and at most 4,000 characters; history is limited to 12 turns/12,000 aggregate characters. Unknown fields (including client-supplied user IDs or roles) are rejected.
- Uses a LangChain agent with the OpenAI-compatible local model endpoint at `http://localhost:1234/v1` (LM Studio), using `meta-llama-3-8b-instruct`. The leave-data tools query records for the signed-in user.
- The system prompt includes the signed-in user's verified ID, role, and department; verified leave records are sent only when the user-scoped tool retrieves them. Name, email, and other employee data are not sent. Conversation history is currently held in the browser and sent with each message; it is not persisted in PostgreSQL. Do not treat the model as an approval/decision system or send sensitive HR/medical details in chat until provider data handling and retention are reviewed.
- Missing `GOOGLE_API_KEY` returns `503 AI_NOT_CONFIGURED`; provider/network failures return sanitized error codes and do not expose upstream response bodies or credentials.

## Live agent integration tests

The five Nori behavior tests use the real local chat model, a separate PostgreSQL test database, and the real leave/document tools. They are skipped unless explicitly enabled and do not install test doubles. The scenarios intend no HR mutations; keep the database disposable in case a faulty agent attempts an unexpected action.

1. Configure the server environment as above, start LM Studio at `http://localhost:1234/v1`, and load the model named `meta-llama-3-8b-instruct`.
2. Set `AI_AGENT_TEST_DATABASE_URL` to a separate, migrated, disposable test database containing active leave policies, an employee account, and company-document chunks. Its database name must include `test`, `sandbox`, or `integration`; the suite refuses to use `DATABASE_URL` as its test database. Do not run these tests against production data.
3. Set `AI_AGENT_TEST_USER_ID` to an active employee in that test database.
4. From `server`, set `AI_AGENT_INTEGRATION=1` and run `npm run test:agent`.

For PowerShell:

```powershell
$env:AI_AGENT_INTEGRATION = '1'
$env:AI_AGENT_TEST_USER_ID = 'your-test-employee-id'
npm run test:agent
```

The assertions derive leave balances and policy limits from the live database. The medical-insurance abstention case is skipped if the current document search results already contain room-rent text. The scenarios are based on current records, so the first and fifth tests require an earned-leave limit below 12 and 15 days respectively.

The API deliberately does not yet calculate business-day balances (weekends/holidays), enforce annual allowance, or support manager approval chains because those rules depend on company policy and location. The `requestedDays` value currently counts calendar days and should be revised once the policy is decided.

## Initial data model

- `users`: requested user fields (`user_id`, name, email, role, department, manager_id), plus active/timestamp and bcrypt password-hash/lockout fields. `manager_id` is a self-reference to another user.
- `leave_policies`: versioned rules by leave type, including allowance, max consecutive days, carryover, paid status, documentation requirement, and effective dates. No policy limits are seeded because they must be confirmed against company rules and location.
- `leave_requests`: request dates, requested day count, reason, status, and reviewer metadata. Each request references the exact policy version in force when it was submitted.

## Policy modeling recommendation

Start with the three tables above. Treat `leave_type` as a stable key on a versioned `leave_policies` row; do not store policy limits on the user or leave request. When a policy changes, insert a new policy version and close the previous `effective_to` date so old requests retain their original policy reference.

Compute balances from the applicable allowance and approved requests at first. If the business later needs accrual schedules, manual adjustments, carryover transactions, or an audit trail of balance changes, add a `leave_balance_transactions` ledger then; avoid a manually maintained balance number that can drift from approved requests.

Before implementing request endpoints, decide: whether entitlements vary by country/office, department, employment type, or seniority; whether leave is counted in working days and how public holidays are handled; carryover/accrual rules; whether medical leave is capped or requires documentation; and whether approvals are by manager, HR, or a multi-step chain. These determine the policy uniqueness/scope and request validation rules.

## Security notes

Public registration is unverified and should be paired with email verification or an invitation flow before production use. It only creates employee accounts; elevated roles remain operator-provisioned. Access tokens are short-lived, and the active role is reloaded from the database on each protected request. Add production-grade refresh/session revocation, audit logging, CSRF protections if cookies are adopted, and account recovery before broad deployment.
