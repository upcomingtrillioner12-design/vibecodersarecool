-- ============================================================
-- Vibehouse Supabase Schema
-- Run this in Supabase → SQL Editor → New query
-- ============================================================

-- Profiles (extends auth.users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  avatar_letter text,
  bio text default 'Vibe coder.',
  tools_count int default 0,
  karma int default 0,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

-- Products
create table if not exists public.products (
  id text primary key,
  name text not null,
  type text,
  category text,
  price text,
  price_value numeric default 0,
  desc text,
  long_desc text,
  owner text,
  owner_id text,
  owner_role text,
  owner_bio text,
  tags text[] default '{}',
  features text[] default '{}',
  intro text,
  status text default 'live',
  users int default 0,
  rating numeric default 0,
  launched date,
  created_at timestamptz default now()
);

alter table public.products enable row level security;

create policy "Products are public"
  on public.products for select using (true);

-- Waitlist
create table if not exists public.waitlist (
  id bigserial primary key,
  product_id text not null,
  user_id uuid references auth.users on delete cascade,
  created_at timestamptz default now(),
  unique(product_id, user_id)
);

alter table public.waitlist enable row level security;

create policy "Users manage own waitlist"
  on public.waitlist for all using (auth.uid() = user_id);

-- Submissions (Launch form)
create table if not exists public.submissions (
  id bigserial primary key,
  name text not null,
  description text,
  category text,
  url text,
  email text,
  status text default 'pending',
  created_at timestamptz default now()
);

alter table public.submissions enable row level security;

create policy "Anyone can submit"
  on public.submissions for insert with check (true);

create policy "Only authenticated can read submissions"
  on public.submissions for select using (auth.role() = 'authenticated');

-- Tasks
create table if not exists public.tasks (
  id text primary key,
  user_id uuid references auth.users on delete cascade,
  title text not null,
  done boolean default false,
  due date,
  created_at timestamptz default now()
);

alter table public.tasks enable row level security;

create policy "Users manage own tasks"
  on public.tasks for all using (auth.uid() = user_id);

-- Optional: auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_letter)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    upper(left(coalesce(new.raw_user_meta_data->>'full_name', new.email), 1))
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- Storage buckets for avatars & product logos
-- Run in Supabase SQL Editor (or create via Dashboard → Storage)
-- ============================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

-- Allow public read
create policy "Public read avatars"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Public read logos"
  on storage.objects for select
  using (bucket_id = 'logos');

-- Authenticated users can upload their own avatar
create policy "Users upload own avatar"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.role() = 'authenticated');

create policy "Users update own avatar"
  on storage.objects for update
  using (bucket_id = 'avatars' and auth.role() = 'authenticated');

create policy "Users upload logos"
  on storage.objects for insert
  with check (bucket_id = 'logos' and auth.role() = 'authenticated');

-- Extra columns if not present
alter table public.profiles add column if not exists avatar_url text;
alter table public.products add column if not exists logo_url text;
alter table public.submissions add column if not exists logo_url text;

-- ============================================================
-- Hub: listings (web app / AI agent / AI model / mobile app / APK link),
-- live counters, contact messages.   Safe to re-run.
-- ============================================================
create table if not exists public.listings (
  id text primary key, name text not null, created_at timestamptz default now()
);
alter table public.listings add column if not exists type text;
alter table public.listings add column if not exists type_key text default 'webapp';
alter table public.listings add column if not exists category text;
alter table public.listings add column if not exists description text;
alter table public.listings add column if not exists long_desc text;
alter table public.listings add column if not exists url text;            -- primary link (live URL / service / HF / App Store / site)
alter table public.listings add column if not exists url2 text;           -- optional Google Play link
alter table public.listings add column if not exists cta text;            -- button text
alter table public.listings add column if not exists owner text;
alter table public.listings add column if not exists owner_id text;
alter table public.listings add column if not exists owner_email text;
alter table public.listings add column if not exists pricing text default 'Free';
alter table public.listings add column if not exists price text default 'Free';
alter table public.listings add column if not exists logo_url text;
alter table public.listings add column if not exists twitter text;
alter table public.listings add column if not exists status text default 'live';

alter table public.listings drop constraint if exists listings_url_https;
alter table public.listings add constraint listings_url_https check (url is null or url ~* '^https://');
alter table public.listings drop constraint if exists listings_type_key_ok;
alter table public.listings add constraint listings_type_key_ok check (type_key in ('webapp','agent','model','mobile','apk'));
create unique index if not exists listings_url_uq on public.listings (lower(url));

alter table public.listings enable row level security;
drop policy if exists "Listings are public" on public.listings;
drop policy if exists "Anyone can launch" on public.listings;
drop policy if exists "Owners launch" on public.listings;
drop policy if exists "Owners edit" on public.listings;
drop policy if exists "Owners delete" on public.listings;
create policy "Listings are public" on public.listings for select using (true);
create policy "Owners launch" on public.listings for insert with check (auth.uid()::text = owner_id);
create policy "Owners edit"   on public.listings for update using (auth.uid()::text = owner_id) with check (auth.uid()::text = owner_id);
create policy "Owners delete" on public.listings for delete using (auth.uid()::text = owner_id);

create table if not exists public.listing_stats (
  id text primary key, views bigint default 0, clicks bigint default 0, downloads bigint default 0
);
alter table public.listing_stats enable row level security;
drop policy if exists "Stats are public" on public.listing_stats;
create policy "Stats are public" on public.listing_stats for select using (true);

create or replace function public.track_event(p_id text, p_kind text)
returns void language plpgsql security definer as $$
begin
  if not exists (select 1 from public.listings where id = p_id) then return; end if;
  insert into public.listing_stats (id) values (p_id) on conflict (id) do nothing;
  if p_kind = 'views' then update public.listing_stats set views = views + 1 where id = p_id;
  elsif p_kind = 'clicks' then update public.listing_stats set clicks = clicks + 1 where id = p_id;
  end if;
end $$;
grant execute on function public.track_event(text, text) to anon, authenticated;

create table if not exists public.contacts (
  id bigserial primary key, name text, email text, topic text, message text, at timestamptz default now()
);
alter table public.contacts enable row level security;
drop policy if exists "Anyone can contact" on public.contacts;
create policy "Anyone can contact" on public.contacts for insert with check (true);

alter table public.profiles add column if not exists followers int default 0;

-- Follows (followers count in the top bar and on maker profiles)
create table if not exists public.follows (
  follower_id uuid references auth.users on delete cascade,
  maker_id text not null,
  created_at timestamptz default now(),
  primary key (follower_id, maker_id)
);
alter table public.follows enable row level security;
drop policy if exists "Follows are public" on public.follows;
drop policy if exists "Users follow" on public.follows;
drop policy if exists "Users unfollow" on public.follows;
create policy "Follows are public" on public.follows for select using (true);
create policy "Users follow" on public.follows for insert with check (auth.uid() = follower_id);
create policy "Users unfollow" on public.follows for delete using (auth.uid() = follower_id);

-- Real profiles: username, headline, website, X/Twitter
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists headline text;
alter table public.profiles add column if not exists website text;
alter table public.profiles add column if not exists twitter text;
alter table public.profiles drop constraint if exists profiles_username_ok;
alter table public.profiles add constraint profiles_username_ok check (username is null or username ~ '^[a-z0-9_]{3,20}$');
create unique index if not exists profiles_username_uq on public.profiles (lower(username)) where username is not null;

-- Emails stay private: only you can read your own profile row;
-- everyone else reads safe fields through this view.
drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles for select using (auth.uid() = id);
create or replace view public.public_profiles as
  select id, full_name, username, avatar_url, bio, headline, website, twitter, created_at from public.profiles;
grant select on public.public_profiles to anon, authenticated;

-- ============================================================
-- Real launch media: screenshots, demo video, features, inputs
-- (safe to re-run)
-- ============================================================
alter table public.listings add column if not exists screenshots text[] default '{}';
alter table public.listings add column if not exists video_url text;
alter table public.listings add column if not exists features text[] default '{}';
alter table public.listings add column if not exists inputs text[] default '{}';
alter table public.listings add column if not exists pricing_details text;
alter table public.listings add column if not exists version text;
alter table public.listings add column if not exists release_notes text;
alter table public.listings add column if not exists github text;
alter table public.listings add column if not exists featured_requested boolean default false;
alter table public.listings add column if not exists featured boolean default false;

-- One public bucket for logos, screenshots and demo videos (50 MB per file)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-media', 'listing-media', true, 52428800,
        array['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set public = true, file_size_limit = 52428800,
  allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm','video/quicktime'];

drop policy if exists "Public read listing media" on storage.objects;
drop policy if exists "Makers upload own listing media" on storage.objects;
drop policy if exists "Makers delete own listing media" on storage.objects;
create policy "Public read listing media" on storage.objects for select using (bucket_id = 'listing-media');
-- files live in a folder named after the maker's user id: <uid>/<file>
create policy "Makers upload own listing media" on storage.objects for insert to authenticated
  with check (bucket_id = 'listing-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Makers delete own listing media" on storage.objects for delete to authenticated
  using (bucket_id = 'listing-media' and (storage.foldername(name))[1] = auth.uid()::text);
