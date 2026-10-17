CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS company_documents (
    document_id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    size BIGINT NOT NULL CHECK (size > 0),
    total_chunks INT NOT NULL,
    content_type TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    uploaded_by_user_id TEXT NOT NULL REFERENCES users (user_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS company_documents_uploaded_at_idx ON company_documents (uploaded_at DESC);