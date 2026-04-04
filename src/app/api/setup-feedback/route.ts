import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// One-time setup endpoint to create the agent_feedback table
// Hit this once, then delete this file
export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Create table using raw SQL via the Supabase client
  // Check if table exists by attempting a select
  const { error: testError } = await supabase
    .from("agent_feedback")
    .select("id")
    .limit(1);

  if (testError?.message?.includes("does not exist")) {
    return NextResponse.json({
      error: "Table does not exist. Please run this SQL in Supabase SQL Editor:",
      sql: `CREATE TABLE IF NOT EXISTS agent_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  agent_id TEXT NOT NULL,
  action TEXT NOT NULL,
  feedback_note TEXT,
  task_title TEXT,
  task_summary TEXT,
  attempt_number INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_agent_feedback_agent_id ON agent_feedback(agent_id);
CREATE INDEX idx_agent_feedback_task_id ON agent_feedback(task_id);
CREATE INDEX idx_agent_feedback_created ON agent_feedback(created_at DESC);

ALTER TABLE agent_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON agent_feedback
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for service role" ON agent_feedback
  FOR ALL TO service_role USING (true) WITH CHECK (true);`,
    }, { status: 200 });
  }

  return NextResponse.json({
    ok: true,
    message: "agent_feedback table already exists!",
    testError: testError?.message || null,
  });
}
