# Andor Learning System — Supabase Setup

## One-Time Setup

1. Go to https://supabase.com → Create new project
2. Name it `andor-learning`
3. Choose a strong database password (save it!)
4. Wait for project to provision (~2 minutes)

## Run SQL Files IN THIS ORDER:

Open Supabase SQL Editor and run each file:

1. `schema.sql`   → Creates all tables
2. `indexes.sql`  → Adds performance indexes
3. `rls.sql`      → Adds security policies
4. `functions.sql`→ Adds triggers and functions
5. `seed.sql`     → Adds initial recommendations

## Get Your Keys

Go to Project Settings → API:
- Copy `Project URL` → this is your SUPABASE_URL
- Copy `anon public` key → this is your SUPABASE_ANON_KEY

## Add to Andor

Users add these in Andor settings panel (optional).
Or you can hardcode them for the public shared instance in `src/learning/SupabaseClient.ts`.

## Privacy

- Row Level Security is enabled on all tables
- Anonymous users can only INSERT, never SELECT individual rows
- model_performance and model_recommendations are public (aggregate only)
- No personal data, no code, no file paths are ever stored
- Session IDs rotate every 7 days — no long-term tracking possible

## Refresh Recommendations

Run this periodically (or set up a Supabase cron job):

```sql
SELECT refresh_model_recommendations();
```
