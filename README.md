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

create policy "Expenses are private" on expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Targets are private" on targets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Budgets are private" on budgets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

4. Open the app and sign in from the Cloud Sync panel.
