import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { PDFParse } from 'pdf-parse';
import { authenticate, requireRoles } from '../auth/guards.js';
import { pool } from '../db/pool.js';
import { generateDocsEmbedding } from '../ai/embbeding.ai.js';
import { SearchCompanyDocuments } from '../ai/tools.util.js';

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const storageDirectory = resolve(process.env.COMPANY_DOCUMENTS_DIR ?? 'storage/company-documents');
const allowedTypes: Record<string, string> = {
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pdf': 'application/pdf',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.rtf': 'application/rtf',
  '.txt': 'text/plain',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

interface StoredDocument {
  id: string;
  name: string;
  size: number;
  contentType: string;
  uploadedAt: string;
  uploadedBy: string;
}

interface CompanyDocumentRow {
  id: string;
  name: string;
  size: string;
  contentType: string;
  uploadedAt: Date;
  uploadedBy: string;
}

function documentPath(id: string) {
  return resolve(storageDirectory, `${id}.bin`);
}

async function extractDocumentText(buffer: Buffer, extension: string) {
  if (extension !== '.pdf') return buffer.toString('utf8');

  const parser = new PDFParse({ data: buffer });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
}

function toStoredDocument(row: CompanyDocumentRow): StoredDocument {
  return {
    id: row.id,
    name: row.name,
    size: Number(row.size),
    contentType: row.contentType,
    uploadedAt: row.uploadedAt.toISOString(),
    uploadedBy: row.uploadedBy,
  };
}

async function insertDocumentChunks(
  client: PoolClient,
  documentId: string,
  chunks: Awaited<ReturnType<typeof generateDocsEmbedding>>,
) {
  const batchSize = 100;
  for (let start = 0; start < chunks.length; start += batchSize) {
    const batch = chunks.slice(start, start + batchSize);
    const values: string[] = [];
    const parameters: (string | number)[] = [];

    for (const [index, item] of batch.entries()) {
      const offset = parameters.length;
      parameters.push(documentId, start + index, item.chunk, `[${item.embedding.join(',')}]`);
      values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}::vector)`);
    }

    await client.query(
      `INSERT INTO company_document_chunks (document_id, chunk_index, chunk_text, embedding)
       VALUES ${values.join(', ')}`,
      parameters,
    );
  }
}

function encodeFilename(name: string) {
  return encodeURIComponent(name).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export async function registerCompanyDocumentRoutes(app: FastifyInstance) {
  app.get('/company-documents', { preHandler: authenticate }, async () => {
    const result = await pool.query<CompanyDocumentRow>(`
        SELECT
          document_id AS id,
          name,
          size::text AS size,
          content_type AS "contentType",
          uploaded_at AS "uploadedAt",
          uploaded_by_user_id AS "uploadedBy"
        FROM company_documents
        ORDER BY uploaded_at DESC
      `);
    return { items: result.rows.map(toStoredDocument) };
  });

  app.post(
    '/company-documents',
    { preHandler: [authenticate, requireRoles('hr', 'super_admin')] },
    async (request, reply) => {
      const file = await request.file({ limits: { files: 1, fields: 0, fileSize: MAX_FILE_SIZE } });
      if (!file) return reply.code(400).send({ error: 'Choose a document to upload.' });

      const originalName = file.filename.replace(/\\/g, '/').split('/').pop() ?? '';
      const extension = originalName.slice(originalName.lastIndexOf('.')).toLowerCase();
      const contentType = allowedTypes[extension];
      if (!contentType) {
        file.file.resume();
        return reply.code(400).send({ error: 'Upload a PDF, Office document, RTF, CSV, or plain-text file.' });
      }

      const id = randomUUID();
      const contentPath = documentPath(id);
      let size = 0;

      try {
        await mkdir(storageDirectory, { recursive: true });
        await pipeline(
          file.file,
          new Transform({
            transform(chunk: Buffer, _encoding, callback) {
              size += chunk.length;
              callback(null, chunk);
            },
          }),
          createWriteStream(contentPath, { flags: 'wx' }),
        );
        if (file.file.truncated) {
          await rm(contentPath, { force: true });
          return reply.code(413).send({ error: 'Documents must be 25 MB or smaller.' });
        }
        if (size === 0) {
          await rm(contentPath, { force: true });
          return reply.code(400).send({ error: 'The selected document is empty.' });
        }

        const buffer = await readFile(contentPath);
        const fileText = await extractDocumentText(buffer, extension);

        if (!fileText.trim()) {
          await rm(contentPath, { force: true });
          return reply.code(400).send({ error: 'No extractable text was found in the selected document.' });
        }

        const chunks = await generateDocsEmbedding(fileText);

        const name = originalName.replace(/[\u0000-\u001f\u007f]/g, '').slice(-180) || `document${extension}`;
        const client = await pool.connect();
        let row: CompanyDocumentRow | undefined;
        try {
          await client.query('BEGIN');
          const result = await client.query<CompanyDocumentRow>(
            `INSERT INTO company_documents (document_id, name, size, total_chunks, content_type, uploaded_by_user_id)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING
               document_id AS id,
               name,
               size::text AS size,
               content_type AS "contentType",
               uploaded_at AS "uploadedAt",
               uploaded_by_user_id AS "uploadedBy"`,
            [id, name, size, chunks.length, contentType, request.user.sub],
          );
          row = result.rows[0];
          if (!row) throw new Error('Company document metadata was not returned after upload.');

          await insertDocumentChunks(client, id, chunks);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }

        return reply.code(201).send({ item: toStoredDocument(row) });
      } catch (error) {
        await rm(contentPath, { force: true });
        throw error;
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    '/company-documents/:id',
    {
      preHandler: authenticate,
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const result = await pool.query<CompanyDocumentRow>(
        `SELECT
           document_id AS id,
           name,
           size::text AS size,
           content_type AS "contentType",
           uploaded_at AS "uploadedAt",
           uploaded_by_user_id AS "uploadedBy"
         FROM company_documents
         WHERE document_id = $1`,
        [request.params.id],
      );
      const row = result.rows[0];
      if (!row) return reply.code(404).send({ error: 'Document not found.' });
      const document = toStoredDocument(row);

      reply
        .header('Content-Type', 'application/octet-stream')
        .header('Content-Length', document.size)
        .header('X-Content-Type-Options', 'nosniff')
        .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeFilename(document.name)}`);
      return reply.send(createReadStream(documentPath(document.id)));
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/company-documents/:id',
    {
      preHandler: [authenticate, requireRoles('hr', 'super_admin')],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query<{ id: string }>(
          'DELETE FROM company_documents WHERE document_id = $1 RETURNING document_id AS id',
          [request.params.id],
        );
        const row = result.rows[0];
        if (!row) {
          await client.query('ROLLBACK');
          return reply.code(404).send({ error: 'Document not found.' });
        }

        await unlink(documentPath(row.id));
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      return reply.code(204).send();
    },
  );

  app.get<{ Params: { search: string } }>(
    '/search/:search',
    {
      // preHandler: [authenticate, requireRoles('hr', 'super_admin')],
      schema: {
        params: {
          type: 'object',
          required: ['search'],
          properties: { search: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      const results = await SearchCompanyDocuments(request.params.search);
      return reply.send({ items: results });
    },
  );
}
