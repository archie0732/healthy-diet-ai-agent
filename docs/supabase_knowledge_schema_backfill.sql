-- Backfill patch: align existing knowledge tables with current server code.
-- Run this in Supabase SQL Editor.
-- Safe to re-run because every change uses IF NOT EXISTS.

alter table if exists public.knowledge_documents
  add column if not exists parsed_md_path text,
  add column if not exists parse_method text,
  add column if not exists parsed_char_count integer,
  add column if not exists embedding_model text,
  add column if not exists error_message text;

alter table if exists public.knowledge_ingestion_jobs
  add column if not exists parsed_md_path text,
  add column if not exists parse_method text;

create index if not exists idx_knowledge_documents_parsed_md_path
  on public.knowledge_documents(parsed_md_path);

create index if not exists idx_knowledge_ingestion_jobs_parsed_md_path
  on public.knowledge_ingestion_jobs(parsed_md_path);
