# Taskly — Simple Tasks App (Frontend + Supabase Backend)

Taskly is a minimal full-stack task manager with user authentication, personal task lists, task status updates, summary counters, and basic logging.  
The backend is powered by Supabase (Postgres + Auth) and the frontend is a Vite + React SPA deployed on Vercel.

## 🚀 A. How to Run (Local + Production)
### 1. Clone the repo
```bash
git clone https://github.com/Brahamanbtp/taskly.git
cd taskly
```

## Backend (Supabase)

Taskly uses Supabase as the backend:

- Postgres database

- Supabase Auth (email/password)

- RLS Policies for row-level isolation (each user sees only their tasks)

- Supabase JS client on frontend

#### Setup Steps

1. Create a Supabase project — https://supabase.com

2. Go to SQL Editor → run the tables and policies:

#### Tables
```bash
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'TODO',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS logs (
  id BIGSERIAL PRIMARY KEY,
  method TEXT,
  path TEXT,
  user_id UUID,
  body JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

#### Foreign Key → Supabase Auth
```bash
ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_user_id_fkey;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users (id)
  ON DELETE CASCADE;
```

#### RLS Policies
```bash
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Insert own tasks" ON tasks
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Select own tasks" ON tasks
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Update own tasks" ON tasks
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Delete own tasks" ON tasks
  FOR DELETE
  USING (auth.uid() = user_id);
```

## Frontend (React + Vite)
### 2. Create frontend `.env`

Inside `/frontend`, create:
```bash
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-public-key>
```

### 3. Install deps + run
```bash
cd frontend
npm install
npm run dev
```

---

Then open:
➡ http://localhost:5173

### Production Deployment (Vercel)

1. Push repo to GitHub

2. Import the frontend folder on Vercel

3. Add env vars:
   ```bash
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```


4. Deploy

    Vercel builds automatically.

---

### 🎯 B. What is Done / Not Done
#### ✅ Completed

- Fully working signup/login using Supabase Auth

- Secure row-level isolation: each user sees only their tasks

- Tasks CRUD:

    - Create task
 
    - List tasks

    - Update task status (TODO → IN_PROGRESS → DONE)

    - Edit/Delete (optional but implemented in code structure)

- Summary counts (TODO / IN_PROGRESS / DONE)

- UI with clean design

- Server-side logging (insert logs into `logs` table / or console)

- Frontend caching (Supabase client’s built-in cache + UI-level caching)

- Deployment-ready frontend (Vercel)

- Deployment-ready backend (Supabase)

#### ❌ Not Done / Partially Done

- Server-side 30-second DB caching (not needed with Supabase; but if required, can be emulated with Edge Functions)

- No email-confirmation feature (disabled for demo)

- No complex role-based authorization (only RLS)
---

### 🏗 C. Architecture in My Own Words

Taskly is split into two parts:

#### Authentication

I use Supabase Auth.  
When a user signs up or logs in, Supabase returns a session token stored automatically in the browser.   
The frontend reads this token and automatically attaches it to all DB queries.

#### Task Storage  
Tasks are stored in a Postgres table `tasks` inside Supabase.   
Each row has a `user_id` that references `auth.users(id)`.   
RLS (Row-Level Security) ensures tasks are only visible to the correct user.

#### Fetching Tasks

The frontend uses the Supabase JS client:
```bash
supabase.from("tasks").select("*")
```

Supabase automatically enforces:    
- authenticated user only

- correct `user_id` via RLS

- pagination, filtering

#### Caching

For caching:

- the frontend temporarily stores tasks in component state

- Supabase client also caches responses internally
This avoids unnecessary re-fetching for fast UI.

#### Logging

Every task action calls:
```bash
INSERT INTO logs (...)
```

Or logs to the console.  
I log:

- Method

- Path

- Timestamp

- User ID

---

### ✍️ D. Short Reflections

#### 1. Caching

Caching is done in two layers:

- React state keeps the tasks list so re-renders don’t hit DB

- Supabase client caches requests internally
If I had time, I would add a Supabase Edge Function with a 30-second in-memory Map per user.

#### 2. Security

Supabase Row Level Security policies ensure:

- `auth.uid()` must match `tasks.user_id`

- Only the owner can read/write their tasks
This is safer than manually checking tokens.

#### 3. Bug Faced

I initially got:
❌ `"insert or update on tasks violates foreign key constrai0nt"`   
Reason: tasks.user_id was referencing my own users table instead of `auth.users`.    
Fix: Dropped old FK and added FK to `auth.users(id)`.

#### 4. If I had 1 more hour

I would add:

- 30-second server cache via Edge Functions

- Edit/Delete task UI

- Activity timeline per user

- Better email-based onboarding

---

### 📦 Folder Structure
```bash
taskly/
│
├── backend/
│   ├── server.js
│   ├── server-pg.js
│   ├── migrate.js
│   ├── db.sql
│   ├── data.sqlite
│   ├── Dockerfile
│   ├── .env
│   └── package.json
│
├── frontend/
│   ├── src/
│   ├── Dockerfile
│   ├── .env
│   └── package.json
│
├── docker-compose.yml
└── README.md
```
---


### 📄 License

MIT (free to use)
---