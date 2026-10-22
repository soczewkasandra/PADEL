-- Apply once, in a test Supabase project first. No customer data or coach identity seeded.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.coach (
 singleton boolean primary key default true check (singleton),
 user_id uuid not null unique references auth.users(id) on delete cascade
);
create table public.slots (
 id uuid primary key default gen_random_uuid(),
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 blocked boolean not null default false,
 created_at timestamptz not null default now(),
 constraint sixty_minutes check (ends_at = starts_at + interval '60 minutes')
);
-- Prevent overlapping hours too, without relying on the UI or btree_gist.
alter table public.slots add constraint no_overlapping_slots exclude using gist
 (tstzrange(starts_at,ends_at,'[)') with &&);
create table public.customers (
 id uuid primary key default gen_random_uuid(),
 first_name text not null check (length(btrim(first_name)) between 1 and 60),
 last_name text not null check (length(btrim(last_name)) between 1 and 80),
 phone text not null check (phone ~ '^\+?[0-9]{9,15}$'),
 created_at timestamptz not null default now()
);
create table public.bookings (
 id uuid primary key default gen_random_uuid(),
 slot_id uuid not null references public.slots(id),
 customer_id uuid not null references public.customers(id),
 status text not null default 'pending' check (status in ('pending','approved','rejected')),
 token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index one_active_booking_per_slot on public.bookings(slot_id)
 where status in ('pending','approved');
create table private.rate_limits (
 bucket text not null, kind text not null, window_start timestamptz not null,
 attempts integer not null, primary key (bucket,kind,window_start)
);
alter table public.slots enable row level security;
alter table public.customers enable row level security;
alter table public.bookings enable row level security;
alter table private.coach enable row level security;
alter table private.rate_limits enable row level security;
create function public.is_coach() returns boolean language sql stable security definer
 set search_path = '' as $$
 select exists(select 1 from private.coach where user_id = (select auth.uid()));
$$;
revoke all on function public.is_coach() from public, anon, authenticated;
grant execute on function public.is_coach() to authenticated;
revoke all on public.slots,public.customers,public.bookings from anon,authenticated;
grant select on public.slots,public.customers,public.bookings to authenticated;
create policy coach_slots on public.slots for select to authenticated using ((select public.is_coach()));
create policy coach_customers on public.customers for select to authenticated using ((select public.is_coach()));
create policy coach_bookings on public.bookings for select to authenticated using ((select public.is_coach()));

create function public.available_slots() returns table(id uuid,starts_at timestamptz,ends_at timestamptz)
 language sql stable security definer set search_path = '' as $$
 select s.id,s.starts_at,s.ends_at from public.slots s
 where not s.blocked and s.starts_at > now() and s.starts_at < now()+interval '180 days'
 and not exists(select 1 from public.bookings b where b.slot_id=s.id and b.status in ('pending','approved'))
 order by s.starts_at;
$$;
revoke all on function public.available_slots() from public,anon,authenticated;
grant execute on function public.available_slots() to anon,authenticated;

-- Only the verified Edge Function can invoke this transaction. Never expose service_role to the browser.
create function public.create_booking(p_slot uuid,p_first text,p_last text,p_phone text,p_token_hash text)
 returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.slots; customer uuid; booking uuid;
begin
 select * into s from public.slots where id=p_slot for update;
 if not found or s.blocked or s.starts_at <= now() or s.starts_at >= now()+interval '180 days' then
  raise exception 'SLOT_UNAVAILABLE' using errcode='P0001';
 end if;
 if exists(select 1 from public.bookings where slot_id=p_slot and status in ('pending','approved')) then
  raise exception 'SLOT_UNAVAILABLE' using errcode='P0001';
 end if;
 insert into public.customers(first_name,last_name,phone) values(btrim(p_first),btrim(p_last),p_phone) returning id into customer;
 insert into public.bookings(slot_id,customer_id,token_hash) values(p_slot,customer,p_token_hash) returning id into booking;
 return booking;
end; $$;
revoke all on function public.create_booking(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.create_booking(uuid,text,text,text,text) to service_role;

create function public.booking_status(p_token_hash text)
 returns table(status text,starts_at timestamptz,ends_at timestamptz)
 language sql stable security definer set search_path = '' as $$
 select b.status,s.starts_at,s.ends_at from public.bookings b join public.slots s on s.id=b.slot_id
 where b.token_hash=p_token_hash and s.ends_at > now()-interval '90 days';
$$;
revoke all on function public.booking_status(text) from public,anon,authenticated;
grant execute on function public.booking_status(text) to service_role;

create function public.add_slot(p_start timestamptz) returns uuid
 language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
 if not public.is_coach() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_start <= now() or p_start >= now()+interval '180 days' then raise exception 'INVALID_DATE'; end if;
 insert into public.slots(starts_at,ends_at) values(p_start,p_start+interval '60 minutes') returning id into result;
 return result;
end; $$;
create function public.set_slot_blocked(p_slot uuid,p_blocked boolean) returns void
 language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_coach() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 perform 1 from public.slots where id=p_slot for update;
 if not found then raise exception 'SLOT_NOT_FOUND'; end if;
 if exists(select 1 from public.bookings where slot_id=p_slot and status in ('pending','approved')) then raise exception 'SLOT_OCCUPIED'; end if;
 update public.slots set blocked=p_blocked where id=p_slot;
end; $$;
create function public.set_booking_status(p_booking uuid,p_status text) returns void
 language plpgsql security definer set search_path = '' as $$
declare slot uuid; current_status text;
begin
 if not public.is_coach() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select slot_id into slot from public.bookings where id=p_booking;
 if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
 -- Same lock order as creation/blocking, so rejecting and rebooking are serialized.
 perform 1 from public.slots where id=slot for update;
 select status into current_status from public.bookings where id=p_booking for update;
 if p_status is null or p_status not in ('approved','rejected') or current_status='rejected'
 or (current_status='approved' and p_status<>'rejected') then raise exception 'INVALID_TRANSITION'; end if;
 update public.bookings set status=p_status,updated_at=now() where id=p_booking;
end; $$;
revoke all on function public.add_slot(timestamptz),public.set_slot_blocked(uuid,boolean),public.set_booking_status(uuid,text) from public,anon,authenticated;
grant execute on function public.add_slot(timestamptz),public.set_slot_blocked(uuid,boolean),public.set_booking_status(uuid,text) to authenticated;

-- Atomic shared limits across all Edge instances. Buckets are HMAC hashes, never raw IP/phone.
create function public.consume_rate_limit(p_bucket text,p_kind text) returns boolean
 language plpgsql security definer set search_path = '' as $$
declare win timestamptz; max_attempts integer; count_attempts integer;
begin
 if p_bucket !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_BUCKET'; end if;
 case p_kind
 when 'global-book' then win:=date_bin(interval '10 minutes',now(),'2020-01-01'::timestamptz); max_attempts:=30;
 when 'global-status' then win:=date_bin(interval '10 minutes',now(),'2020-01-01'::timestamptz); max_attempts:=300;
 when 'ip-book' then win:=date_bin(interval '10 minutes',now(),'2020-01-01'::timestamptz); max_attempts:=5;
 when 'ip-status' then win:=date_bin(interval '10 minutes',now(),'2020-01-01'::timestamptz); max_attempts:=30;
 when 'phone-book' then win:=date_bin(interval '1 day',now(),'2020-01-01'::timestamptz); max_attempts:=3;
 else raise exception 'INVALID_LIMIT_KIND'; end case;
 insert into private.rate_limits(bucket,kind,window_start,attempts) values(p_bucket,p_kind,win,1)
 on conflict(bucket,kind,window_start) do update set attempts=private.rate_limits.attempts+1
 returning attempts into count_attempts;
 delete from private.rate_limits where window_start < now()-interval '2 days';
 return count_attempts <= max_attempts;
end; $$;
revoke all on function public.consume_rate_limit(text,text) from public,anon,authenticated;
grant execute on function public.consume_rate_limit(text,text) to service_role;
commit;
