-- Performance indexes for chat-related workloads.
-- Run this in Supabase SQL Editor.

create index if not exists idx_diet_chat_history_user_id
on public.diet_chat_history(user_id);

create index if not exists idx_diet_chat_history_room_created_at
on public.diet_chat_history(room_id, created_at desc);

