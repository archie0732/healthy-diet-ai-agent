-- healthy-diet Supabase performance optimization
-- Generated on 2026-05-13
-- Run during low-traffic hours.
-- Note: CREATE INDEX CONCURRENTLY cannot run inside a transaction block.

-- 1) Cover FK and top-N query path on ai_consultations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_consultations_user_id_created_at
    ON public.ai_consultations (user_id, created_at DESC);

-- 2) Cover chat history room timeline reads and FK lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_diet_chat_history_user_id_room_id_created_at
    ON public.diet_chat_history (user_id, room_id, created_at);

-- 3) Cover FK lookup and user-scoped draft reads
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_diet_drafts_user_id_created_at
    ON public.diet_drafts (user_id, created_at DESC);

-- 4) Keep chat_rooms list endpoint fast (safe to re-run)
CREATE INDEX CONCURRENTLY IF NOT EXISTS chat_rooms_user_last_msg_idx
    ON public.chat_rooms (user_id, last_message_at DESC);

-- Optional cleanup candidates (validate over a longer observation window before dropping):
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_diet_drafts_items;
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_diet_chat_history_summary_not_null;
