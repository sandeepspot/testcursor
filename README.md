## Expense Journal

Simple web app to track daily expenses in INR with targets and alerts.

### Run locally

- Open `index.html` in a browser.
- Data is stored in your browser via `localStorage`.

### Enable cloud sync (Supabase)

1. Create a Supabase project and get the Project URL and anon key.
2. Update `config.js` with your values.
3. In Supabase, run this SQL to create tables and policies:

```
create table if not exists profiles (
  user_id uuid primary key,
  email text unique,
  role text not null default 'user',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists expenses (
  id uuid primary key,
  user_id uuid not null,
  date date not null,
  amount numeric not null,
  category text not null,
  description text
);

create table if not exists targets (
  user_id uuid not null,
  category text not null,
  amount numeric not null,
  primary key (user_id, category)
);

create table if not exists budgets (
  user_id uuid primary key,
  monthly numeric not null,
  alert_percent numeric not null
);

alter table expenses enable row level security;
alter table targets enable row level security;
alter table budgets enable row level security;
alter table profiles enable row level security;

create policy "Profiles are viewable by owner" on profiles
  for select using (auth.uid() = user_id);

create policy "Profiles admin read" on profiles
  for select using (exists (
    select 1 from profiles p where p.user_id = auth.uid() and p.role = 'admin'
  ));

create policy "Profiles insert by owner" on profiles
  for insert with check (auth.uid() = user_id and role = 'user' and active = true);

create policy "Profiles update by admin" on profiles
  for update using (exists (
    select 1 from profiles p where p.user_id = auth.uid() and p.role = 'admin'
  )) with check (exists (
    select 1 from profiles p where p.user_id = auth.uid() and p.role = 'admin'
  ));

create policy "Expenses are private" on expenses
  for all using (
    auth.uid() = user_id
    and exists (select 1 from profiles p where p.user_id = auth.uid() and p.active = true)
  ) with check (
    auth.uid() = user_id
    and exists (select 1 from profiles p where p.user_id = auth.uid() and p.active = true)
  );

create policy "Targets are private" on targets
  for all using (
    auth.uid() = user_id
    and exists (select 1 from profiles p where p.user_id = auth.uid() and p.active = true)
  ) with check (
    auth.uid() = user_id
    and exists (select 1 from profiles p where p.user_id = auth.uid() and p.active = true)
  );

create policy "Budgets are private" on budgets
  for all using (
    auth.uid() = user_id
    and exists (select 1 from profiles p where p.user_id = auth.uid() and p.active = true)
  ) with check (
    auth.uid() = user_id
    and exists (select 1 from profiles p where p.user_id = auth.uid() and p.active = true)
  );
```

4. Open the app and sign in using the login screen.
5. To make yourself admin, run:

```
update profiles set role = 'admin' where email = 'you@example.com';
```

### Enable email/password + OAuth logins

1. In Supabase, go to **Authentication → Providers**.
2. Enable **Email** and set the required confirmation settings.
3. Enable **Google**, **GitHub**, and/or **Microsoft (Azure)**.
4. Add `https://sandeepspot.github.io/testcursor/` to the redirect URLs.

### Enable 2FA (TOTP)

- Open the app and sign in.
- In the Cloud Sync section, click **Set Up 2FA**.
- Scan the QR code in your authenticator app and enter the 6-digit code to verify.
