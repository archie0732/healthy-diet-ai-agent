-- 1) Create chat_rooms table (summary is a JSON array)
create table if not exists public.chat_rooms (
    room_id text not null,
    user_id uuid not null references public.users(id) on delete cascade,
    title text,
    summary jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    last_message_at timestamptz not null default now(),
    constraint chat_rooms_pkey primary key (room_id, user_id),
    constraint chat_rooms_summary_is_array check (jsonb_typeof(summary) = 'array')
);

create index if not exists chat_rooms_user_last_msg_idx
    on public.chat_rooms (user_id, last_message_at desc);

-- Optional trigger to auto-update updated_at on updates
create or replace function public.set_current_timestamp_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists set_chat_rooms_updated_at on public.chat_rooms;
create trigger set_chat_rooms_updated_at
before update on public.chat_rooms
for each row
execute function public.set_current_timestamp_updated_at();

-- 2) If your existing history table does not yet have image_path/title/summary columns, add them
alter table if exists public.diet_chat_history
    add column if not exists image_path text,
    add column if not exists title text,
    add column if not exists summary text,
    add column if not exists summary_updated_at timestamptz;

-- 3) Force FK to use public.users(id), not auth.users(id)
-- Drop any existing FK on chat_rooms.user_id
do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.chat_rooms'::regclass
      and contype = 'f'
      and conkey = array[
        (select attnum from pg_attribute
         where attrelid = 'public.chat_rooms'::regclass
           and attname = 'user_id')
      ]
  loop
    execute format('alter table public.chat_rooms drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.chat_rooms
    add constraint chat_rooms_user_id_fkey
    foreign key (user_id) references public.users(id) on delete cascade;

-- Drop any existing FK on diet_chat_history.user_id
do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.diet_chat_history'::regclass
      and contype = 'f'
      and conkey = array[
        (select attnum from pg_attribute
         where attrelid = 'public.diet_chat_history'::regclass
           and attname = 'user_id')
      ]
  loop
    execute format('alter table public.diet_chat_history drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.diet_chat_history
    add constraint diet_chat_history_user_id_fkey
    foreign key (user_id) references public.users(id) on delete cascade;

-- 4) Helpful helper SQL for appending a new summary item (JSON object) into summary array
-- update public.chat_rooms
-- set summary = coalesce(summary, '[]'::jsonb) || jsonb_build_array(
--     jsonb_build_object(
--         'at', now(),
--         'content', 'new summary entry'
--     )
-- ),
-- last_message_at = now()
-- where room_id = 'ROOM_ID' and user_id = 'USER_UUID';
