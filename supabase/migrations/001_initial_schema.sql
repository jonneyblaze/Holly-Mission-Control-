-- Mission Control Database Schema
-- Run this in your Supabase SQL Editor at:
-- https://supabase.com/dashboard/project/gjdgqtbjenmnjamgyocp/sql

-- Tasks (Kanban board)
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT DEFAULT 'medium',
  segment TEXT,
  assigned_agent TEXT,
  source TEXT DEFAULT 'manual',
  source_workflow TEXT,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Agent activity log
CREATE TABLE agent_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  full_content TEXT,
  metadata JSONB DEFAULT '{}',
  workflow TEXT,
  status TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Social media calendar
CREATE TABLE social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  content TEXT NOT NULL,
  media_url TEXT,
  scheduled_date DATE,
  scheduled_time TIME,
  status TEXT DEFAULT 'draft',
  buffer_id TEXT,
  buffer_profile_id TEXT,
  agent_id TEXT,
  blog_post_id TEXT,
  notes TEXT,
  analytics JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Business goal snapshots
CREATE TABLE goal_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  period_type TEXT NOT NULL,
  metrics JSONB NOT NULL,
  alerts JSONB DEFAULT '[]',
  corrective_actions JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Infrastructure snapshots
CREATE TABLE infra_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_at TIMESTAMPTZ DEFAULT now(),
  containers JSONB NOT NULL,
  disk_usage JSONB,
  memory_usage JSONB,
  alerts JSONB DEFAULT '[]',
  edge_functions JSONB DEFAULT '[]'
);

-- KB gap tracker
CREATE TABLE kb_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,
  occurrence_count INT DEFAULT 1,
  source_tickets TEXT[],
  draft_article_id TEXT,
  status TEXT DEFAULT 'identified',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Lead pipeline snapshots
CREATE TABLE lead_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  total_leads INT,
  by_status JSONB,
  by_source JSONB,
  deals_pipeline JSONB,
  total_pipeline_value DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_agent_activity_agent ON agent_activity(agent_id);
CREATE INDEX idx_agent_activity_type ON agent_activity(activity_type);
CREATE INDEX idx_agent_activity_created ON agent_activity(created_at DESC);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_segment ON tasks(segment);
CREATE INDEX idx_social_posts_date ON social_posts(scheduled_date);
CREATE INDEX idx_social_posts_status ON social_posts(status);
CREATE INDEX idx_goal_snapshots_date ON goal_snapshots(snapshot_date DESC);
CREATE INDEX idx_infra_snapshots_at ON infra_snapshots(snapshot_at DESC);

-- Enable Realtime on key tables
ALTER PUBLICATION supabase_realtime ADD TABLE agent_activity;
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE social_posts;

-- RLS (simple: all authenticated users can read/write — Sean-only app)
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE infra_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_gaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_snapshots ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access (Sean-only app)
CREATE POLICY "Authenticated full access" ON tasks FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access" ON agent_activity FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access" ON social_posts FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access" ON goal_snapshots FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access" ON infra_snapshots FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access" ON kb_gaps FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access" ON lead_snapshots FOR ALL USING (auth.role() = 'authenticated');

-- Allow service role (for agent ingest) to bypass RLS
-- This is automatic with service_role key, no policy needed
