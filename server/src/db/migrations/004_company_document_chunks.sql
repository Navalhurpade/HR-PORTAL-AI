CREATE TABLE IF NOT EXISTS company_document_chunks (
    document_id UUID NOT NULL REFERENCES company_documents (document_id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
    chunk_text TEXT NOT NULL CHECK (length(trim(chunk_text)) > 0),
    embedding vector (3072) NOT NULL,
    PRIMARY KEY (document_id, chunk_index)
);
