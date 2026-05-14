-- Taskly Enterprise Schema
-- Consolidates migrations v1 through v8

-- Enable Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT, -- Optional for OAuth users
    google_id TEXT UNIQUE, -- For SSO
    created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Workspaces Table
CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL REFERENCES users(id),
    plan TEXT NOT NULL DEFAULT 'FREE', -- FREE, PRO, ENTERPRISE
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    subscription_status TEXT, -- active, trialing, canceled
    created_at TIMESTAMP DEFAULT NOW()
);

-- System Audit Logs (SOC2)
CREATE TABLE IF NOT EXISTS system_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT REFERENCES users(id),
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL, -- LOGIN, LOGOUT, ROLE_CHANGE, WORKSPACE_DELETED
    details JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Workspace Members Table
CREATE TABLE IF NOT EXISTS workspace_members (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'MEMBER', -- ADMIN, MEMBER
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (workspace_id, user_id)
);

-- 3. Tasks Table
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'TODO',
    priority TEXT NOT NULL DEFAULT 'MEDIUM',
    due_date TIMESTAMP,
    tags TEXT[] DEFAULT '{}',
    position FLOAT NOT NULL,
    embedding vector(1536), -- For OpenAI text-embedding-3-small
    search_vector tsvector, -- For Full-Text Search
    metadata JSONB DEFAULT '{}', -- For Custom Fields (Enterprise)
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Full-Text Search Trigger
CREATE OR REPLACE FUNCTION tasks_search_trigger() RETURNS trigger AS $$
BEGIN
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.description, '')), 'B');
  RETURN new;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tsvectorupdate ON tasks;
CREATE TRIGGER tsvectorupdate BEFORE INSERT OR UPDATE
ON tasks FOR EACH ROW EXECUTE FUNCTION tasks_search_trigger();

-- Search Indexes
CREATE INDEX IF NOT EXISTS tasks_search_idx ON tasks USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS tasks_embedding_idx ON tasks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 4. Task Events (Audit Log / Event Sourcing)
CREATE TABLE IF NOT EXISTS task_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id),
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- CREATED, STATUS_CHANGED, EDITED, DELETED, REORDERED
    old_payload JSONB,
    new_payload JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 5. Task Dependencies (DAG)
CREATE TABLE IF NOT EXISTS task_dependencies (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    depends_on_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (task_id, depends_on_id)
);

-- 6. Webhooks Table
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    event_types TEXT[] DEFAULT '{task.created, task.updated, task.deleted}',
    secret TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ─── Row-Level Security (RLS) ──────────────────────────────

-- Enable RLS on all sensitive tables
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;

-- Workspaces Policy: Users can only see workspaces they are part of
-- (Note: In a real system, you'd have a workspace_members table. 
-- For this MVP, we assume owner access or shared context.)
DROP POLICY IF EXISTS workspaces_isolation ON workspaces;
CREATE POLICY workspaces_isolation ON workspaces FOR ALL USING (owner_id = current_setting('app.current_user_id', true) OR id = current_setting('app.current_workspace_id', true));

-- Workspace Members Policy
DROP POLICY IF EXISTS workspace_members_isolation ON workspace_members;
CREATE POLICY workspace_members_isolation ON workspace_members FOR ALL USING (user_id = current_setting('app.current_user_id', true));

-- Tasks Policy
DROP POLICY IF EXISTS tasks_workspace_isolation ON tasks;
CREATE POLICY tasks_workspace_isolation ON tasks FOR ALL USING (workspace_id = current_setting('app.current_workspace_id', true));

-- Events Policy
DROP POLICY IF EXISTS task_events_workspace_isolation ON task_events;
CREATE POLICY task_events_workspace_isolation ON task_events FOR ALL USING (workspace_id = current_setting('app.current_workspace_id', true));

-- Dependencies Policy
DROP POLICY IF EXISTS task_dependencies_workspace_isolation ON task_dependencies;
CREATE POLICY task_dependencies_workspace_isolation ON task_dependencies FOR ALL USING (workspace_id = current_setting('app.current_workspace_id', true));

-- Webhooks Policy
DROP POLICY IF EXISTS webhooks_workspace_isolation ON webhooks;
CREATE POLICY webhooks_workspace_isolation ON webhooks FOR ALL USING (workspace_id = current_setting('app.current_workspace_id', true));

-- 7. Task Attachments
CREATE TABLE IF NOT EXISTS task_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_key TEXT NOT NULL, -- S3 Key
    file_size BIGINT,
    mime_type TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE task_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attachments_workspace_isolation ON task_attachments;
CREATE POLICY attachments_workspace_isolation ON task_attachments FOR ALL USING (workspace_id = current_setting('app.current_workspace_id', true));

-- 8. Task Comments
CREATE TABLE IF NOT EXISTS task_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    mentions TEXT[] DEFAULT '{}', -- Array of user IDs
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comments_workspace_isolation ON task_comments;
CREATE POLICY comments_workspace_isolation ON task_comments FOR ALL USING (workspace_id = current_setting('app.current_workspace_id', true));

-- 9. Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- MENTION, TASK_ASSIGNED, etc.
    title TEXT NOT NULL,
    body TEXT,
    link TEXT,
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_user_isolation ON notifications;
CREATE POLICY notifications_user_isolation ON notifications FOR ALL USING (user_id = current_setting('app.current_user_id', true));


-- ─── Migrations ──────────────────────────────────────────────
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='google_id') THEN
        ALTER TABLE users ADD COLUMN google_id TEXT UNIQUE;
        ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
    END IF;
END $$;
