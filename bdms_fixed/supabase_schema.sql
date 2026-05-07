-- ============================================================
-- BDMS - Blood Donation Management System
-- Run this entire file in Supabase → SQL Editor → New Query
-- ============================================================

-- USERS TABLE
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  password text not null,
  role text not null default 'donor',
  blood_group text,
  phone text,
  location text,
  available boolean default true,
  donation_count integer default 0,
  rating numeric(3,1) default 0,
  rating_count integer default 0,
  created_at timestamptz default now()
);

-- BLOOD REQUESTS TABLE
create table if not exists blood_requests (
  id uuid primary key default gen_random_uuid(),
  patient_name text not null,
  blood_group text not null,
  location text not null,
  urgency text default 'normal',
  units integer default 1,
  contact_phone text,
  description text,
  status text default 'open',
  recipient_id uuid references users(id) on delete set null,
  donor_id uuid references users(id) on delete set null,
  created_at timestamptz default now()
);

-- FEEDBACK TABLE
create table if not exists feedbacks (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid references users(id) on delete cascade,
  recipient_id uuid references users(id) on delete set null,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz default now()
);

-- ORGANIZATIONS TABLE
create table if not exists organizations (
  id serial primary key,
  name text not null,
  address text,
  phone text,
  type text default 'hospital'
);

-- ============================================================
-- SEED: Admin + Demo Donors
-- ============================================================

-- Admin (password: admin123)
insert into users (name, email, password, role, blood_group, phone, location, available, donation_count, rating, rating_count)
values (
  'Admin User', 'admin@bdms.com',
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'admin', 'O+', '01700000000', 'Dhaka', true, 0, 5.0, 1
) on conflict (email) do nothing;

-- Donors (password: pass123)
insert into users (name, email, password, role, blood_group, phone, location, available, donation_count, rating, rating_count) values
('Rahim Uddin',   'rahim@example.com',   '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'donor', 'A+',  '01711111111', 'Mirpur, Dhaka',    true,  5,  4.5, 4),
('Karim Hossain', 'karim@example.com',   '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'donor', 'B-',  '01722222222', 'Gulshan, Dhaka',   true,  3,  4.8, 5),
('Fatima Begum',  'fatima@example.com',  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'donor', 'AB+', '01733333333', 'Dhanmondi, Dhaka', false, 8,  4.9, 10),
('Nasir Ahmed',   'nasir@example.com',   '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'donor', 'O-',  '01744444444', 'Uttara, Dhaka',    true,  12, 5.0, 8),
('Sumaiya Islam', 'sumaiya@example.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'donor', 'AB-', '01755555555', 'Banani, Dhaka',    true,  2,  4.2, 3)
on conflict (email) do nothing;

-- Sample Blood Requests
insert into blood_requests (patient_name, blood_group, location, urgency, units, contact_phone, status, description) values
('Shahid Hasan',  'A+', 'Dhaka Medical College', 'urgent', 2, '01766666666', 'open', 'Need blood urgently for surgery'),
('Rokeya Khatun', 'O-', 'Square Hospital, Dhaka', 'normal', 1, '01777777777', 'open', 'Scheduled surgery next week');

-- Organizations
insert into organizations (name, address, phone, type) values
('Dhaka Medical College Hospital', 'Bakshibazar, Dhaka',                        '02-55165087',  'hospital'),
('Square Hospital',                '18/F Bir Uttam Qazi Nuruzzaman Sarak, Dhaka','10616',        'hospital'),
('Evercare Hospital',              'Plot 81, Block E, Bashundhara, Dhaka',       '10678',        'hospital'),
('Sandhani Blood Bank',            'Dhaka Medical College, Dhaka',               '01715101010',  'blood_bank'),
('Quantum Blood Bank',             'Siddeswari, Dhaka',                          '01911000700',  'blood_bank'),
('Red Crescent Society',           'Motijheel, Dhaka',                           '02-9555074',   'organization'),
('Badhan Blood Bank (BUET)',        'BUET Campus, Dhaka',                         '01711223344',  'organization')
on conflict do nothing;

-- ============================================================
-- Row Level Security (disable for simplicity, API key handles auth)
-- ============================================================
alter table users         disable row level security;
alter table blood_requests disable row level security;
alter table feedbacks     disable row level security;
alter table organizations  disable row level security;
