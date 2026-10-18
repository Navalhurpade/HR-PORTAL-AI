# Nori API

The backend is a Fastify + TypeScript API for the Nori HR assistant and portal. It provides authenticated HR routes, company-document ingestion and retrieval, and a LangChain agent with configurable chat providers.

## Local setup

1. Install Node.js/npm and PostgreSQL with the pgvector extension available.
2. Copy `.env.example` to `.env` and configure `DATABASE_URL`, the selected AI provider's settings, and `GOOGLE_API_KEY` for document embeddings. Set `JWT_SECRET` to a unique random value of at least 32 characters for stable local tokens and production.
3. Install dependencies with `npm ci`.
4. Apply migrations with `npm run db:migrate`; verify connectivity with `npm run db:check`.
5. Provision a super-admin account from an interactive terminal using the command below.
6. Start the API with `npm run dev`; it listens on `http://127.0.0.1:3001` by default.

The API checks its PostgreSQL connection before listening. `GET /health` checks database availability. Use `npm run build` to type-check and emit `dist/`, then `npm start` to run the compiled API.

## Configuration

| Variable | Required | Purpose |
|---|---:|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string. |
| `AI_PROVIDER` | No | Chat provider: `google` (default), `groq`, `openai`, `nvidia`, or `lmstudio`. |
| `GOOGLE_API_KEY` | For Gemini chat and document embedding | Used by Gemini chat when `AI_PROVIDER=google` and always for Gemini document embeddings. |
| `GOOGLE_MODEL` | No | Gemini chat model; defaults to `gemini-3.1-flash-lite`. |
| `GROQ_API_KEY`, `OPENAI_API_KEY`, `NVIDIA_API_KEY` | For selected provider | API key for the corresponding chat provider. |
| `GROQ_MODEL`, `OPENAI_MODEL`, `NVIDIA_MODEL` | No | Optional model overrides for the corresponding chat provider. |
| `LM_STUDIO_BASE_URL`, `LM_STUDIO_MODEL` | No | Optional OpenAI-compatible LM Studio endpoint and model; defaults to `http://localhost:1234/v1`. |
| `JWT_SECRET` | Production | At least 32 characters. If omitted in development, a random in-memory secret is generated at startup. |
| `HOST`, `PORT` | No | API bind address and port; defaults to `127.0.0.1` and `3001`. |
| `CLIENT_ORIGIN` | No | Comma-separated browser origins allowed by CORS. |
| `CA_CERT_PATH` | No | Path to a provider CA PEM for verified TLS to hosted PostgreSQL. |
| `COMPANY_DOCUMENTS_DIR` | No | File storage location; defaults to `storage/company-documents` relative to the server working directory. |
| `LANGSMITH_TRACING`, `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT` | No | Optional LangSmith tracing configuration. |

Copy `.env.example` to `.env`; local credentials and certificates are not part of the repository. `DB_USER`, `DB_PASSWORD`, `DB_HOST`, and `DB_PORT` are not read independently by the current connection pool; configure `DATABASE_URL`.

## Provision an administrator

There is no public HR/admin registration endpoint. Create the initial super-admin out of band:

```powershell
npm run db:create-user -- --user-id ADM-0001 --name "Jordan Lee" --email jordan@example.com --role super_admin --department Administration
```

The command prompts for a password (minimum 12 characters) without echoing it and stores a bcrypt hash. Public registration, if enabled, creates employee accounts only. No demo accounts, company documents, or company-specific leave policy values are seeded automatically.

## API capabilities

- **Authentication:** `POST /auth/register`, `POST /auth/login`, and `GET /auth/me`. Tokens are short-lived bearer tokens. On protected requests the API reloads the active user's role from PostgreSQL.
- **Leave:** `GET /leave-policies`, `GET /leaves`, `GET /leaves/:leaveRequestId`, `POST /leaves`, and HR/admin-only approve/reject routes. Employees are restricted to their own requests; HR and super admins can review requests. Self-approval is prohibited.
- **People:** User listing is permission-guarded; the browser does not grant or select roles.
- **Company documents:** Signed-in users can list and download documents. HR and super admins can upload or delete documents. Uploads support PDF, Word, Excel, PowerPoint, RTF, CSV, and plain text, up to 25 MB. Extracted text chunks and 3,072-dimensional Gemini embeddings are stored in PostgreSQL; uploaded files are stored locally by default.
- **Nori chat:** `POST /chat` returns a complete response; `POST /chat/stream` sends source-status and completion events over server-sent events. Both require authentication and are rate-limited. The request accepts at most 4,000 characters per message, 12 prior turns, and 12,000 aggregate history characters.

The agent gets its user ID, role, and department from the authenticated request, not from client-supplied chat fields. Leave tools query the signed-in user's records. It can retrieve company-document passages and read live leave data; request creation or updates require an explicit user request and the required details. HR approval is performed through the role-guarded HR API, not by Nori.

## Retrieval and tracing

Document uploads are parsed into text chunks, embedded with `gemini-embedding-001` at 3,072 dimensions, and stored in the `company_document_chunks` pgvector column. At query time, the search tool embeds the query and ranks chunks by vector distance. Nori is instructed to use retrieved documents for policy claims, use authorized tools for live HR data, and abstain if the available evidence is insufficient.

When configured with LangSmith environment variables, LangChain tracing can capture model and tool runs. Traces may contain prompts, model responses, and retrieved HR/document data; use a test project and non-sensitive fixtures, and review provider data handling before enabling traces with real data.

## Live-agent integration tests

`npm test` invokes five live-agent scenarios; they are skipped unless `AI_AGENT_INTEGRATION=1` is set. They use the selected real chat provider, PostgreSQL database, and tools rather than test doubles.

To enable them, configure:

- `AI_AGENT_TEST_DATABASE_URL` to a separate, migrated, disposable PostgreSQL database. Its database name must include `test`, `sandbox`, or `integration`; it must not equal `DATABASE_URL`.
- `AI_AGENT_TEST_USER_ID` to an active employee account in that test database.
- The selected provider's chat credentials, `GOOGLE_API_KEY` for embeddings, plus test data including active leave policies and document chunks.
- `AI_AGENT_INTEGRATION=1`.

PowerShell example:

```powershell
$env:AI_AGENT_INTEGRATION = '1'
$env:AI_AGENT_TEST_DATABASE_URL = 'postgres://user:password@localhost:5432/hr_portal_integration'
$env:AI_AGENT_TEST_USER_ID = 'your-test-employee-id'
npm test
```

The scenarios check tool selection and evidence in answers combining balances with policies, document-based abstention when a limit is not supported, reporting multiple live balances and policy rules, asking for missing leave-request details without calling a mutation tool, and resisting an unverified role claim. Requirements are derived from fixture data; one missing-evidence scenario skips if the indexed documents already contain the answer. Keep the database disposable in case a model makes an unexpected tool call. Do not run these tests against production data.

## Known limitations

- Leave-day counts use calendar days. Business-day and holiday rules, annual allowance enforcement, and manager approval chains are not implemented.
- Public registration is unverified; add invitation/email verification and account recovery before broad deployment.
- There is no production-grade refresh-token/session-revocation or audit-log system.
- Chat history is client-held and is not persisted by the API.
- The model is instructed not to make unsupported claims or approve/reject HR requests, but model output is not a substitute for HR review or a correctness guarantee.
