-- Agent feedback table: stores every approve/reject with context for agent learning
CREATE TABLE IF NOT EXISTS agent_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  agent_id TEXT NOT NULL,
  action TEXT NOT NULL,              -- 'approved' or 'rejected'
  feedback_note TEXT,                -- human's note (what needs fixing / what was good)
  task_title TEXT,                   -- snapshot of task title at time of feedback
  task_summary TEXT,                 -- snapshot of agent's output summary
  attempt_number INT DEFAULT 1,      -- which attempt this was (increments on rejection)
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for quick lookups by agent (for learning context)
CREATE INDEX idx_agent_feedback_agent_id ON agent_feedback(agent_id);
CREATE INDEX idx_agent_feedback_task_id ON agent_feedback(task_id);
CREATE INDEX idx_agent_feedback_created ON agent_feedback(created_at DESC);

-- Enable RLS
ALTER TABLE agent_feedback ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access
CREATE POLICY "Allow all for authenticated" ON agent_feedback
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow service role full access
CREATE POLICY "Allow all for service role" ON agent_feedback
  FOR ALL TO service_role USING (true) WITH CHECK (true);
