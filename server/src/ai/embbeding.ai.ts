import { GoogleGenAI } from '@google/genai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSION = 3072;
const EMBEDDING_BATCH_SIZE = 100;
const apiKey = process.env.GOOGLE_API_KEY?.trim();

if (!apiKey) throw new Error('GOOGLE_API_KEY is required to generate document embeddings.');
const ai = new GoogleGenAI({ apiKey });

export const generateTextEmbedding = async (text: string) => {
  const response = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: {
      taskType: 'RETRIEVAL_QUERY',
      outputDimensionality: EMBEDDING_DIMENSION,
    },
  });
  const embedding = response.embeddings?.[0]?.values;
  if (
    !embedding ||
    embedding.length !== EMBEDDING_DIMENSION ||
    embedding.some((value) => !Number.isFinite(value))
  ) {
    throw new Error('The embedding service returned an invalid query vector.');
  }
  return embedding;
};

export interface DocumentChunkEmbedding {
  chunk: string;
  embedding: number[];
}

export const generateDocsEmbedding = async (fileText: string): Promise<DocumentChunkEmbedding[]> => {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 100,
  });
  const chunks = await splitter.splitText(fileText);
  if (chunks.length === 0) throw new Error('No text chunks were generated for embedding.');

  const chunkEmbeddings: DocumentChunkEmbedding[] = [];

  for (let start = 0; start < chunks.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(start, start + EMBEDDING_BATCH_SIZE);
    const response = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: batch,
      config: {
        taskType: 'RETRIEVAL_DOCUMENT',
        outputDimensionality: EMBEDDING_DIMENSION,
      },
    });

    if (!response.embeddings || response.embeddings.length !== batch.length) {
      throw new Error('The embedding service returned an incomplete result.');
    }

    for (const [index, result] of response.embeddings.entries()) {
      const vector = result.values;
      if (!vector || vector.length !== EMBEDDING_DIMENSION || vector.some((value) => !Number.isFinite(value))) {
        throw new Error('The embedding service returned an invalid vector.');
      }
      const chunk = batch[index];
      if (chunk === undefined) throw new Error('The embedding service returned an invalid result order.');
      chunkEmbeddings.push({ chunk, embedding: vector });
    }
  }

  return chunkEmbeddings;
};
