#!/bin/bash
# Test script for Mission Control ingest webhook
# Usage: INGEST_API_KEY=your-key ./scripts/test-ingest.sh

MC_URL="${MC_URL:-https://holly-mission-control-backend.vercel.app}"
API_KEY="${INGEST_API_KEY:?Set INGEST_API_KEY env var}"

echo "🚀 Testing Mission Control ingest at $MC_URL/api/ingest"
echo ""

# 1. Standard report
echo "1️⃣  Sending a report from bl-marketing..."
curl -s -X POST "$MC_URL/api/ingest" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "agent_id": "bl-marketing",
    "activity_type": "report",
    "title": "Weekly SEO Audit — Test",
    "summary": "Checked 45 blog posts. 3 missing meta descriptions.",
    "full_content": "# SEO Audit Report\n\nAudited 45 published blog posts.\n\n## Issues Found\n- 3 posts missing meta descriptions\n- 2 posts with duplicate title tags",
    "workflow": "seo-audit-weekly",
    "metadata": { "posts_checked": 45, "issues_found": 5 }
  }' | python3 -m json.tool
echo ""

# 2. Task creation
echo "2️⃣  Creating a task from bl-content..."
curl -s -X POST "$MC_URL/api/ingest" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "agent_id": "bl-content",
    "activity_type": "task",
    "title": "Write blog post: Reading micro-expressions in video calls",
    "full_content": "Research latest studies on micro-expression detection in remote settings...",
    "workflow": "content-pipeline-weekly",
    "metadata": { "priority": "high", "segment": "bodylytics" }
  }' | python3 -m json.tool
echo ""

# 3. Social post draft
echo "3️⃣  Creating a social post draft from bl-social..."
curl -s -X POST "$MC_URL/api/ingest" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "agent_id": "bl-social",
    "activity_type": "social_post",
    "title": "LinkedIn post: 5 deception cues",
    "full_content": "Did you know that 93% of communication is non-verbal? Here are 5 subtle deception cues that most people miss... 🧠\n\n1. Asymmetric expressions\n2. Delayed emotional responses\n3. Micro-expression leakage\n4. Increased blink rate\n5. Incongruent gestures\n\n#BodyLanguage #DeceptionDetection #BodyLytics",
    "workflow": "social-content-weekly",
    "metadata": { "platform": "linkedin", "scheduled_date": "2026-04-07", "scheduled_time": "09:00" }
  }' | python3 -m json.tool
echo ""

# 4. Infrastructure snapshot
echo "4️⃣  Sending infra snapshot from infra agent..."
curl -s -X POST "$MC_URL/api/ingest" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "agent_id": "infra",
    "activity_type": "infra_snapshot",
    "title": "Infrastructure health check",
    "summary": "All containers healthy. Disk at 62%.",
    "workflow": "infra-health-6h",
    "metadata": {
      "containers": [
        { "name": "bodylytics-nextjs", "status": "running", "uptime": "14d 3h", "memory": "256MB", "cpu": "2.1%" },
        { "name": "supabase-db", "status": "running", "uptime": "30d 1h", "memory": "512MB", "cpu": "5.3%" },
        { "name": "openclaw-gateway", "status": "running", "uptime": "7d 12h", "memory": "384MB", "cpu": "3.8%" },
        { "name": "prometheus", "status": "running", "uptime": "14d 3h", "memory": "192MB", "cpu": "1.2%" },
        { "name": "grafana", "status": "running", "uptime": "14d 3h", "memory": "128MB", "cpu": "0.8%" },
        { "name": "alertmanager", "status": "running", "uptime": "14d 3h", "memory": "64MB", "cpu": "0.3%" },
        { "name": "filebrowser", "status": "running", "uptime": "7d 5h", "memory": "48MB", "cpu": "0.1%" },
        { "name": "redis", "status": "running", "uptime": "30d 1h", "memory": "96MB", "cpu": "0.5%" },
        { "name": "nginx-proxy", "status": "running", "uptime": "30d 1h", "memory": "32MB", "cpu": "0.2%" }
      ],
      "disk_usage": { "total": "500GB", "used": "310GB", "percent": 62 },
      "memory_usage": { "total": "32GB", "used": "22.7GB", "percent": 71 },
      "alerts": [],
      "edge_functions": [
        { "name": "send-welcome-email", "status": "active", "last_invoked": "2026-04-03T14:30:00Z" },
        { "name": "process-webhook", "status": "active", "last_invoked": "2026-04-03T15:00:00Z" },
        { "name": "certificate-generator", "status": "active", "last_invoked": "2026-04-03T12:00:00Z" }
      ]
    }
  }' | python3 -m json.tool
echo ""

# 5. Goal snapshot
echo "5️⃣  Sending goal snapshot from holly..."
curl -s -X POST "$MC_URL/api/ingest" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "agent_id": "holly",
    "activity_type": "goal_snapshot",
    "title": "Weekly goal check",
    "summary": "Revenue at 47% of monthly target. Enrollments on track.",
    "workflow": "goal-check-wednesday",
    "metadata": {
      "snapshot_date": "2026-04-03",
      "period_type": "monthly",
      "metrics": {
        "revenue": { "target": 5000, "actual": 2340, "pace": 47 },
        "enrollments": { "target": 50, "actual": 34, "pace": 68 },
        "nps": { "target": 70, "actual": 72, "pace": 103 },
        "support_response_time": { "target": 2, "actual": 1.8, "pace": 111 },
        "blog_posts": { "target": 8, "actual": 5, "pace": 63 },
        "social_engagement": { "target": 500, "actual": 380, "pace": 76 },
        "course_completion": { "target": 85, "actual": 78, "pace": 92 },
        "active_students": { "target": 150, "actual": 127, "pace": 85 },
        "revenue_mtd": 2340,
        "revenue_target": 5000,
        "projected_mrr": 4200,
        "avg_deal_value": 450,
        "closed_deals": 6,
        "active_students_count": 127,
        "pipeline": [
          { "stage": "Lead", "count": 23, "value": 10350 },
          { "stage": "Prospect", "count": 15, "value": 6750 },
          { "stage": "Proposal", "count": 8, "value": 3600 },
          { "stage": "Negotiation", "count": 4, "value": 1800 },
          { "stage": "Won", "count": 6, "value": 2700 }
        ]
      },
      "alerts": [
        { "kpi": "revenue", "message": "Revenue at 47% with 60% of month elapsed", "severity": "warning" }
      ],
      "corrective_actions": [
        { "kpi": "revenue", "action": "Launch flash sale on advanced courses", "agent": "bl-marketing", "status": "pending" },
        { "kpi": "blog_posts", "action": "Prioritise 3 draft posts for publication", "agent": "bl-content", "status": "pending" }
      ]
    }
  }' | python3 -m json.tool
echo ""

# 6. KB gap
echo "6️⃣  Reporting a KB gap from bl-support..."
curl -s -X POST "$MC_URL/api/ingest" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "agent_id": "bl-support",
    "activity_type": "kb_gap",
    "title": "Certificate download troubleshooting",
    "summary": "3 tickets this week about certificate downloads failing on Safari",
    "workflow": "support-triage-daily",
    "metadata": {
      "occurrence_count": 3,
      "source_tickets": ["TK-441", "TK-445", "TK-448"]
    }
  }' | python3 -m json.tool
echo ""

echo "✅ Done! Check your dashboard at $MC_URL"
echo "   - Dashboard: activity feed should show new entries"
echo "   - Tasks: new task in To Do column"
echo "   - Social: new draft post on calendar"
echo "   - Infrastructure: container grid with real data"
echo "   - Goals: gauges with actual vs target"
echo "   - Support: KB gap entry"
echo "   - Reports: SEO audit report with full markdown"
