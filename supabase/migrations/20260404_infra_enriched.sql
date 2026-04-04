-- Enrich infra_snapshots with additional monitoring data
ALTER TABLE infra_snapshots ADD COLUMN IF NOT EXISTS cpu_usage JSONB;
ALTER TABLE infra_snapshots ADD COLUMN IF NOT EXISTS array_disk_usage JSONB;
ALTER TABLE infra_snapshots ADD COLUMN IF NOT EXISTS health_status TEXT DEFAULT 'unknown';
ALTER TABLE infra_snapshots ADD COLUMN IF NOT EXISTS system_uptime TEXT;
ALTER TABLE infra_snapshots ADD COLUMN IF NOT EXISTS prometheus_up BOOLEAN DEFAULT false;
ALTER TABLE infra_snapshots ADD COLUMN IF NOT EXISTS alertmanager_up BOOLEAN DEFAULT false;
ALTER TABLE infra_snapshots ADD COLUMN IF NOT EXISTS prometheus JSONB DEFAULT '{}';
