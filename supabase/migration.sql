-- Enable pgvector extension
create extension if not exists vector;

-- Table storing regulation text chunks with embeddings
create table if not exists regulations (
  id bigserial primary key,
  content text not null,
  metadata jsonb default '{}'::jsonb,
  embedding vector(1536),
  created_at timestamptz default now()
);

-- HNSW index — works well at any dataset size (no empty-list problem like IVFFlat)
create index if not exists regulations_embedding_idx
  on regulations
  using hnsw (embedding vector_cosine_ops);

-- RPC function for vector similarity search
create or replace function match_regulation(
  query_embedding vector(1536),
  match_count int default 5
)
returns table (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
    select
      r.id,
      r.content,
      r.metadata,
      1 - (r.embedding <=> query_embedding) as similarity
    from regulations r
    order by r.embedding <=> query_embedding
    limit match_count;
end;
$$;
