-- Patch: support unified agent-side rag document responses
-- Apply this after the existing knowledge ingestion tables are present.

alter table if exists public.knowledge_documents
  add column if not exists embedding_model text,
  add column if not exists error_message text;
