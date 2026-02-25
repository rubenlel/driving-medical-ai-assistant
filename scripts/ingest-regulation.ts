/**
 * Ingestion script — cleans PDF-extracted regulation text, chunks it, embeds it,
 * and stores it in Supabase pgvector.
 *
 * Usage:
 *   npx ts-node scripts/ingest-regulation.ts
 *
 * Options (env vars):
 *   CLEAR_TABLE=true   — deletes existing rows before ingestion
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 150;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
);

/**
 * Removes PDF noise: repeated page headers/footers, excess whitespace,
 * orphaned page numbers, and normalizes table formatting.
 */
function cleanPdfText(raw: string): string {
  let text = raw;

  // Remove repeated Journal Officiel headers/footers
  text = text.replace(
    /3\s*avril\s*2022\s+JOURNAL\s+OFFICIEL\s+DE\s+LA\s+RÉPUBLIQUE\s+FRANÇAISE\s+Texte\s+27\s+sur\s+92/g,
    '',
  );

  // Remove page markers like "-- 12 of 46 --"
  text = text.replace(/--\s*\d+\s+of\s+\d+\s*--/g, '');

  // Collapse runs of 3+ whitespace chars (preserving single newlines for paragraph breaks)
  text = text
    .split('\n')
    .map((line) => line.replace(/\s{3,}/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');

  // Collapse 3+ consecutive newlines into double newline (paragraph separator)
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/**
 * Detects section boundaries in the regulation text to avoid splitting
 * in the middle of a regulation entry.
 */
function findSectionBreak(text: string, position: number, searchWindow: number): number {
  const searchStart = Math.max(0, position - searchWindow);
  const searchSlice = text.slice(searchStart, position);

  // Prefer breaking at a double newline (paragraph boundary)
  const doubleNewline = searchSlice.lastIndexOf('\n\n');
  if (doubleNewline !== -1) return searchStart + doubleNewline + 2;

  // Fall back to single newline
  const singleNewline = searchSlice.lastIndexOf('\n');
  if (singleNewline !== -1) return searchStart + singleNewline + 1;

  // Fall back to sentence end
  const sentenceEnd = searchSlice.search(/[.;]\s+[A-ZÀ-Ü]/);
  if (sentenceEnd !== -1) return searchStart + sentenceEnd + 1;

  return position;
}

function chunkText(text: string, size: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + size, text.length);

    // Try to break at a natural boundary
    if (end < text.length) {
      end = findSectionBreak(text, end, Math.floor(size * 0.2));
    }

    const chunk = text.slice(start, end).trim();
    if (chunk.length > 50) {
      chunks.push(chunk);
    }

    const nextStart = end - overlap;
    start = nextStart <= start ? end : nextStart;
  }

  return chunks;
}

async function generateEmbedding(text: string): Promise<number[]> {
  const clean = text.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: clean,
  });
  return response.data[0].embedding;
}

async function main() {
  const textPath = path.join(__dirname, 'regulation-text.txt');

  if (!fs.existsSync(textPath)) {
    console.error(
      'Missing scripts/regulation-text.txt — paste the regulation plain-text there first.',
    );
    process.exit(1);
  }

  const rawText = fs.readFileSync(textPath, 'utf-8');
  console.log(`Raw text: ${rawText.length} chars`);

  const cleanedText = cleanPdfText(rawText);
  console.log(`Cleaned text: ${cleanedText.length} chars`);

  // Write cleaned version for inspection
  const cleanedPath = path.join(__dirname, 'regulation-text-cleaned.txt');
  fs.writeFileSync(cleanedPath, cleanedText, 'utf-8');
  console.log(`Cleaned text written to ${cleanedPath}`);

  const chunks = chunkText(cleanedText, CHUNK_SIZE, CHUNK_OVERLAP);
  console.log(`Split into ${chunks.length} chunks`);

  // Optionally clear existing data
  if (process.env.CLEAR_TABLE === 'true') {
    console.log('Clearing existing regulations...');
    const { error } = await supabase.from('regulations').delete().neq('id', 0);
    if (error) {
      console.error('Failed to clear table:', error.message);
      process.exit(1);
    }
    console.log('Table cleared');
  }

  let inserted = 0;

  for (let i = 0; i < chunks.length; i++) {
    try {
      const embedding = await generateEmbedding(chunks[i]);

      const { error } = await supabase.from('regulations').insert({
        content: chunks[i],
        metadata: {
          source: 'arrete_28_mars_2022',
          chunk_index: i,
          char_count: chunks[i].length,
        },
        embedding,
      });

      if (error) {
        console.error(`[${i}] Insert failed: ${error.message}`);
      } else {
        inserted++;
        console.log(
          `[${i + 1}/${chunks.length}] ✓ ${chunks[i].substring(0, 60).replace(/\n/g, ' ')}...`,
        );
      }
    } catch (err: any) {
      console.error(`[${i}] Embedding/insert error: ${err.message}`);
    }
  }

  console.log(`\nDone — ${inserted}/${chunks.length} chunks ingested.`);
}

main().catch(console.error);
