-- ============================================================
--  QLINIC – Supabase Database Schema
--  Run this in Supabase → SQL Editor
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ── 1. HOSPITALS ──────────────────────────────────────────────
create table public.hospitals (
  id          text primary key default 'H_' || upper(substring(gen_random_uuid()::text, 1, 8)),
  name        text not null,
  city        text not null,
  status      text not null default 'active' check (status in ('active', 'inactive')),
  created_at  timestamptz not null default now()
);

-- ── 2. HOSPITAL ADMINS ────────────────────────────────────────
-- Links a Supabase auth user to a hospital admin role
create table public.hospital_admins (
  id            text primary key default 'A_' || upper(substring(gen_random_uuid()::text, 1, 8)),
  hospital_id   text not null references public.hospitals(id) on delete cascade,
  hospital_name text not null,
  username      text not null unique,
  name          text not null,
  auth_user_id  uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- ── 3. DOCTORS ────────────────────────────────────────────────
create table public.doctors (
  id          text primary key default 'D' || lpad((floor(random()*900)+100)::text, 3, '0'),
  hospital_id text not null references public.hospitals(id) on delete cascade,
  name        text not null,
  email       text not null unique,
  speciality  text not null,
  phone       text,
  available   boolean not null default true,
  auth_user_id uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ── 4. PATIENTS ───────────────────────────────────────────────
create table public.patients (
  id          text primary key default 'P' || lpad((floor(random()*900)+100)::text, 3, '0'),
  name        text not null,
  email       text not null unique,
  phone       text,
  dob         date,
  gender      text,
  auth_user_id uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ── 5. APPOINTMENTS ───────────────────────────────────────────
create table public.appointments (
  id           text primary key default 'A' || lpad((floor(random()*900)+100)::text, 3, '0'),
  hospital_id  text not null references public.hospitals(id) on delete cascade,
  patient_id   text not null references public.patients(id) on delete cascade,
  doctor_id    text not null references public.doctors(id) on delete cascade,
  date         date not null,
  time         text not null,
  token        integer not null,
  status       text not null default 'Pending' check (status in ('Pending', 'Confirmed', 'Completed', 'Cancelled')),
  prescription text default '',
  created_at   timestamptz not null default now()
);

-- ── 6. TOKEN COUNTERS (per doctor per day) ────────────────────
create table public.token_counters (
  doctor_id  text not null references public.doctors(id) on delete cascade,
  date       date not null,
  counter    integer not null default 0,
  primary key (doctor_id, date)
);

-- ── 7. SUPER ADMIN (single row, managed manually) ─────────────
create table public.super_admins (
  id           uuid primary key default gen_random_uuid(),
  username     text not null unique,
  auth_user_id uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- ============================================================
--  ROW LEVEL SECURITY (RLS)
-- ============================================================

alter table public.hospitals       enable row level security;
alter table public.hospital_admins enable row level security;
alter table public.doctors         enable row level security;
alter table public.patients        enable row level security;
alter table public.appointments    enable row level security;
alter table public.token_counters  enable row level security;
alter table public.super_admins    enable row level security;

-- Everyone can read hospitals (needed for patient booking flow)
create policy "hospitals_public_read"   on public.hospitals       for select using (true);
create policy "doctors_public_read"     on public.doctors         for select using (true);
create policy "token_counters_read"     on public.token_counters  for select using (true);

-- Patients can read/update their own row
create policy "patients_own"  on public.patients
  for all using (auth.uid() = auth_user_id);

-- Appointments: patient or doctor or admin of same hospital can see
create policy "appts_read"  on public.appointments
  for select using (
    exists (select 1 from public.patients  p where p.id = patient_id and p.auth_user_id = auth.uid())
    or exists (select 1 from public.doctors   d where d.id = doctor_id  and d.auth_user_id = auth.uid())
    or exists (select 1 from public.hospital_admins a where a.hospital_id = hospital_id and a.auth_user_id = auth.uid())
    or exists (select 1 from public.super_admins sa where sa.auth_user_id = auth.uid())
  );

create policy "appts_insert" on public.appointments
  for insert with check (
    exists (select 1 from public.patients p where p.id = patient_id and p.auth_user_id = auth.uid())
  );

create policy "appts_update" on public.appointments
  for update using (
    exists (select 1 from public.doctors   d where d.id = doctor_id  and d.auth_user_id = auth.uid())
    or exists (select 1 from public.hospital_admins a where a.hospital_id = hospital_id and a.auth_user_id = auth.uid())
    or exists (select 1 from public.super_admins sa where sa.auth_user_id = auth.uid())
  );

-- Hospital admins manage doctors in their hospital
create policy "doctors_admin_write" on public.doctors
  for all using (
    exists (select 1 from public.hospital_admins a where a.hospital_id = doctors.hospital_id and a.auth_user_id = auth.uid())
    or exists (select 1 from public.super_admins sa where sa.auth_user_id = auth.uid())
  );

-- Super admin full access
create policy "super_hospitals_write"  on public.hospitals        for all using (exists (select 1 from public.super_admins sa where sa.auth_user_id = auth.uid()));
create policy "super_admins_write"     on public.hospital_admins  for all using (exists (select 1 from public.super_admins sa where sa.auth_user_id = auth.uid()));
create policy "super_admins_read_self" on public.super_admins     for select using (auth.uid() = auth_user_id);

-- Token counter: any authenticated user can upsert (patient booking)
create policy "token_upsert" on public.token_counters
  for all using (auth.role() = 'authenticated');

-- ============================================================
--  SEED DEMO DATA (optional – remove in production)
-- ============================================================
insert into public.hospitals (id, name, city, status) values
  ('H_DEMO1', 'QLINIC City Hospital',    'Kozhikode, Kerala', 'active'),
  ('H_DEMO2', 'QLINIC General Hospital', 'Thrissur, Kerala',  'active')
on conflict do nothing;

-- NOTE: Demo doctors/patients/admins are created via Supabase Auth
-- after running the app. Passwords must be set via Auth → Users in
-- the Supabase dashboard, or via the signup flow in the app.
