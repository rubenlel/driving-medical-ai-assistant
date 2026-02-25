-- Fix: drop the IVFFlat index that causes empty results on small datasets
DROP INDEX IF EXISTS regulations_embedding_idx;

-- Replace with HNSW — works correctly regardless of dataset size
CREATE INDEX regulations_embedding_idx
  ON regulations
  USING hnsw (embedding vector_cosine_ops);

-- Recreate the RPC function (unchanged, just ensuring it's up to date)
CREATE OR REPLACE FUNCTION match_regulation(
  query_embedding vector(1536),
  match_count int default 5
)
RETURNS TABLE (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
    SELECT
      r.id,
      r.content,
      r.metadata,
      1 - (r.embedding <=> query_embedding) AS similarity
    FROM regulations r
    ORDER BY r.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
