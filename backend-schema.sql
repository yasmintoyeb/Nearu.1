-- Run this full script in the Supabase SQL Editor before using the live rental features.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists full_name text;
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

grant select, insert on public.profiles to authenticated;

create table if not exists public.rental_listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  owner_name text not null default 'NearU landlord',
  title text not null,
  price numeric(10, 2) not null check (price > 0),
  location text not null,
  university text not null,
  property_type text not null,
  amenities text[] not null default '{}',
  image_urls text[] not null default '{}',
  description text not null default '',
  latitude double precision,
  longitude double precision,
  distance_km numeric(5, 2),
  status text not null default 'published' check (status in ('pending', 'published', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists rental_listings_public_order
  on public.rental_listings (created_at desc)
  where status = 'published';

alter table public.rental_listings
  alter column status set default 'published';

update public.rental_listings
set status = 'published'
where status = 'pending';

alter table public.rental_listings enable row level security;

drop policy if exists "Published rentals are readable by everyone" on public.rental_listings;
create policy "Published rentals are readable by everyone"
  on public.rental_listings
  for select
  to anon, authenticated
  using (status = 'published' or owner_id = (select auth.uid()));

drop policy if exists "Users can submit their own rentals for review" on public.rental_listings;
drop policy if exists "Users can publish their own rentals" on public.rental_listings;
create policy "Users can publish their own rentals"
  on public.rental_listings
  for insert
  to authenticated
  with check (owner_id = (select auth.uid()) and status = 'published');

grant select on public.rental_listings to anon, authenticated;
grant insert on public.rental_listings to authenticated;

create table if not exists public.rental_inquiries (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rental_listings (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  message text not null check (length(trim(message)) > 0),
  created_at timestamptz not null default now()
);

alter table public.rental_inquiries enable row level security;

drop policy if exists "Users can send inquiries" on public.rental_inquiries;
create policy "Users can send inquiries"
  on public.rental_inquiries
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.rental_listings
      where id = rental_id and status = 'published'
    )
  );

drop policy if exists "Landlords can read rental inquiries" on public.rental_inquiries;
create policy "Landlords can read rental inquiries"
  on public.rental_inquiries
  for select
  to authenticated
  using (
    exists (
      select 1 from public.rental_listings
      where id = rental_id and owner_id = (select auth.uid())
    )
  );

grant insert, select on public.rental_inquiries to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rental-images', 'rental-images', true, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can view rental photos" on storage.objects;
create policy "Anyone can view rental photos"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'rental-images');

drop policy if exists "Users can upload photos to their own folder" on storage.objects;
create policy "Users can upload photos to their own folder"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'rental-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

notify pgrst, 'reload schema';
