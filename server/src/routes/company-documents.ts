import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { authenticate, requireRoles } from '../auth/guards.js';

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

function documentPath(id: string, extension: 'json' | 'bin') {
  return resolve(storageDirectory, `${id}.${extension}`);
}

function encodeFilename(name: string) {
  return encodeURIComponent(name).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function isStoredDocument(value: unknown): value is StoredDocument {
  if (typeof value !== 'object' || value === null) return false;
  const document = value as Partial<StoredDocument>;
  return (
    typeof document.id === 'string' &&
    /^[0-9a-f-]{36}$/i.test(document.id) &&
    typeof document.name === 'string' &&
    typeof document.size === 'number' &&
    typeof document.contentType === 'string' &&
    typeof document.uploadedAt === 'string' &&
    typeof document.uploadedBy === 'string'
  );
}

async function readStoredDocument(id: string): Promise<StoredDocument | undefined> {
  try {
    const value: unknown = JSON.parse(await readFile(documentPath(id, 'json'), 'utf8'));
    if (!isStoredDocument(value) || value.id !== id) {
      throw new Error(`Invalid company document metadata for ${id}.`);
    }
    return value;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

export async function registerCompanyDocumentRoutes(app: FastifyInstance) {
  app.get(
    '/company-documents',
    { preHandler: authenticate },
    async () => {
      await mkdir(storageDirectory, { recursive: true });
      const entries = await readdir(storageDirectory, { withFileTypes: true });
      const documents: StoredDocument[] = [];

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
        const id = entry.name.slice(0, -5);
        const document = await readStoredDocument(id);
        if (document) documents.push(document);
      }
      documents.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
      return { items: documents };
    },
  );

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
      const contentPath = documentPath(id, 'bin');
      const metadataPath = documentPath(id, 'json');
      const temporaryMetadataPath = `${metadataPath}.tmp`;
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

        const document: StoredDocument = {
          id,
          name: originalName.replace(/[\u0000-\u001f\u007f]/g, '').slice(-180) || `document${extension}`,
          size,
          contentType,
          uploadedAt: new Date().toISOString(),
          uploadedBy: request.user.sub,
        };
        await writeFile(temporaryMetadataPath, JSON.stringify(document), { flag: 'wx' });
        await rename(temporaryMetadataPath, metadataPath);
        return reply.code(201).send({ item: document });
      } catch (error) {
        await Promise.allSettled([
          rm(contentPath, { force: true }),
          rm(temporaryMetadataPath, { force: true }),
          rm(metadataPath, { force: true }),
        ]);
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
      const document = await readStoredDocument(request.params.id);
      if (!document) return reply.code(404).send({ error: 'Document not found.' });

      reply
        .header('Content-Type', 'application/octet-stream')
        .header('Content-Length', document.size)
        .header('X-Content-Type-Options', 'nosniff')
        .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeFilename(document.name)}`);
      return reply.send(createReadStream(documentPath(document.id, 'bin')));
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
      const document = await readStoredDocument(request.params.id);
      if (!document) return reply.code(404).send({ error: 'Document not found.' });

      await unlink(documentPath(document.id, 'bin'));
      await unlink(documentPath(document.id, 'json'));
      return reply.code(204).send();
    },
  );
}
