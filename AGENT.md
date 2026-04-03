# Holly — Mission Control Agent Instructions

## Overview

Mission Control is the live dashboard for all Holly agent outputs. Instead of writing static markdown files, **all agents POST their results to the Mission Control webhook**. This feeds the dashboard in real-time via Supabase Realtime subscriptions.

**Dashboard URL:** https://holly-mission-control-backend.vercel.app
**Ingest Endpoint:** https://holly-mission-control-backend.vercel.app/api/ingest

---

## Authentication

Every request to `/api/ingest` requires a Bearer token:

```
Authorization: Bearer <INGEST_API_KEY>
```

The `INGEST_API_KEY` is stored as an environment variable in Vercel and must match what agents send.

---

## Agent Roster

| Agent ID | Name | Emoji | Role |
|----------|------|-------|------|
| `holly` | Holly | 🤖 | Orchestrator — delegates, monitors, reports |
| `bl-marketing` | Marketing | 📈 | SEO audits, blog posts, campaigns |
| `bl-social` | Social | 📱 | Social media content, scheduling |
| `bl-content` | Content | ✍️ | Blog writing, lesson reports, content audits |
| `bl-support` | Support | 🎧 | Ticket triage, auto-replies, KB articles |
| `bl-community` | Community | 🤝 | Community engagement, reviews, NPS |
| `bl-qa` | QA | 🧪 | Testing, quality checks, bug reports |
| `infra` | Infrastructure | 🏗️ | Server health, container monitoring, alerts |
| `devops` | DevOps | ⚙️ | Deployments, CI/CD, edge functions |
| `duracell-prep` | Duracell Prep | 💼 | Meeting prep, talking points, research |
| `lead-gen` | Lead Gen | 🎯 | Prospect research, outreach drafts |

---

## Ingest API Reference

### Endpoint

```
POST https://holly-mission-control-backend.vercel.app/api/ingest
Content-Type: application/json
Authorization: Bearer <INGEST_API_KEY>
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `agent_id` | string | Which agent is reporting (from roster above) |
| `activity_type` | string | Type of output (see types below) |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Short title for the activity |
| `summary` | string | 1-2 sentence summary |
| `full_content` | string | Full markdown content (reports, articles, etc.) |
| `metadata` | object | Flexible JSON — varies by activity type |
| `workflow` | string | Which workflow produced this output |

---

## Activity Types

Every POST is logged to `agent_activity` (visible on Dashboard, Agents, Reports pages). Some types also route to specialised tables:

### Standard Types (agent_activity only)

| Type | Used By | Description |
|------|---------|-------------|
| `report` | Any agent | General reports (SEO audit, weekly summary, etc.) |
| `content` | bl-content, bl-marketing | Blog posts, articles, lesson reports |
| `alert` | infra, devops, holly | System alerts, warnings |
| `ticket` | bl-support | Support ticket updates |
| `kb_article` | bl-support | Knowledge base article drafts |
| `review` | bl-community | Customer review summaries |
| `feedback` | bl-community | NPS data, satisfaction reports |
| `campaign` | bl-marketing | Campaign results, A/B test reports |
| `deployment` | devops | Deployment status updates |
| `meeting_prep` | duracell-prep | Meeting briefs, talking points |
| `prospect` | lead-gen | New prospect research, outreach drafts |

### Special Types (routed to dedicated tables)

#### `task` → tasks table (Kanban board)
```json
{
  "agent_id": "bl-marketing",
  "activity_type": "task",
  "title": "Write blog post about micro-expressions",
  "full_content": "Research latest studies on micro-expression detection accuracy...",
  "workflow": "content-pipeline-weekly",
  "metadata": {
    "priority": "high",
    "segment": "bodylytics",
    "due_date": "2026-04-10"
  }
}
```

#### `social_post` → social_posts table (Social Calendar)
```json
{
  "agent_id": "bl-social",
  "activity_type": "social_post",
  "title": "LinkedIn carousel: 5 deception cues",
  "full_content": "Did you know that 93% of communication is non-verbal? Here are 5 deception cues...",
  "workflow": "social-content-weekly",
  "metadata": {
    "platform": "linkedin",
    "scheduled_date": "2026-04-07",
    "scheduled_time": "09:00"
  }
}
```
Posts arrive as **drafts**. Sean approves them on the dashboard → Buffer API publishes.

#### `infra_snapshot` → infra_snapshots table (Infrastructure page)
```json
{
  "agent_id": "infra",
  "activity_type": "infra_snapshot",
  "title": "Infrastructure health check",
  "summary": "All 12 containers healthy. Disk at 62%.",
  "workflow": "infra-health-6h",
  "metadata": {
    "containers": [
      { "name": "bodylytics-nextjs", "status": "running", "uptime": "14d 3h", "memory": "256MB", "cpu": "2.1%" },
      { "name": "supabase-db", "status": "running", "uptime": "30d", "memory": "512MB", "cpu": "5.3%" },
      { "name": "openclaw-gateway", "status": "running", "uptime": "7d 12h", "memory": "384MB", "cpu": "3.8%" }
    ],
    "disk_usage": { "total": "500GB", "used": "310GB", "percent": 62 },
    "memory_usage": { "total": "32GB", "used": "22.7GB", "percent": 71 },
    "alerts": [],
    "edge_functions": [
      { "name": "send-welcome-email", "status": "active", "last_invoked": "2026-04-03T14:30:00Z" },
      { "name": "process-webhook", "status": "active", "last_invoked": "2026-04-03T15:00:00Z" }
    ]
  }
}
```

#### `goal_snapshot` → goal_snapshots table (Goals + Finance pages)
```json
{
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
      "revenue_mtd": 2340,
      "revenue_target": 5000,
      "projected_mrr": 4200,
      "avg_deal_value": 450,
      "closed_deals": 6,
      "active_students": 127,
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
      { "kpi": "revenue", "action": "Launch flash sale on advanced courses", "agent": "bl-marketing", "status": "pending" }
    ]
  }
}
```

#### `lead_snapshot` → lead_snapshots table (Pipeline page)
```json
{
  "agent_id": "lead-gen",
  "activity_type": "lead_snapshot",
  "title": "Weekly pipeline snapshot",
  "summary": "142 total leads. Pipeline value: $24,500.",
  "workflow": "pipeline-snapshot-weekly",
  "metadata": {
    "snapshot_date": "2026-04-03",
    "total_leads": 142,
    "by_status": { "lead": 45, "prospect": 38, "customer": 52, "inactive": 7 },
    "by_source": { "inbound": 67, "outbound": 42, "referral": 33 },
    "deals_pipeline": {
      "lead": { "count": 23, "value": 10350 },
      "prospect": { "count": 15, "value": 6750 },
      "proposal": { "count": 8, "value": 3600 },
      "negotiation": { "count": 4, "value": 1800 },
      "won": { "count": 6, "value": 2700 }
    },
    "total_pipeline_value": 24500
  }
}
```

#### `kb_gap` → kb_gaps table (Support page)
```json
{
  "agent_id": "bl-support",
  "activity_type": "kb_gap",
  "title": "Certificate download troubleshooting",
  "summary": "3 tickets this week about certificate downloads failing on Safari",
  "workflow": "support-triage-daily",
  "metadata": {
    "occurrence_count": 3,
    "source_tickets": ["TK-441", "TK-445", "TK-448"]
  }
}
```

---

## Example: Standard Report

```json
{
  "agent_id": "bl-marketing",
  "activity_type": "report",
  "title": "Weekly SEO Audit — April Week 1",
  "summary": "Checked 45 blog posts. 3 missing meta descriptions. Avg position improved 2.3 spots.",
  "full_content": "# SEO Audit Report\n\n## Overview\nAudited 45 published blog posts...\n\n## Issues Found\n- 3 posts missing meta descriptions\n- 2 posts with duplicate title tags\n\n## Recommendations\n1. Add meta descriptions to...",
  "workflow": "seo-audit-weekly",
  "metadata": {
    "posts_checked": 45,
    "issues_found": 5,
    "avg_position_change": 2.3
  }
}
```

---

## Workflow → Activity Type Mapping

| Workflow | Agent | Activity Type | Frequency |
|----------|-------|---------------|-----------|
| `goal-check-wednesday` | holly | `goal_snapshot` | Weekly (Wed) |
| `infra-health-6h` | infra | `infra_snapshot` | Every 6 hours |
| `seo-audit-weekly` | bl-marketing | `report` | Weekly (Mon) |
| `content-pipeline-weekly` | bl-content | `task` + `content` | Weekly |
| `social-content-weekly` | bl-social | `social_post` | Weekly (creates 5-7 drafts) |
| `support-triage-daily` | bl-support | `ticket` + `kb_gap` | Daily |
| `community-pulse-weekly` | bl-community | `feedback` + `review` | Weekly |
| `pipeline-snapshot-weekly` | lead-gen | `lead_snapshot` | Weekly |
| `duracell-prep-adhoc` | duracell-prep | `meeting_prep` | On demand |
| `deploy-notify` | devops | `deployment` | On deploy |

---

## Response Format

### Success (201)
```json
{ "ok": true, "id": "uuid-of-activity-record" }
```

### Error (400/401/500)
```json
{ "error": "Missing required fields: activity_type, agent_id" }
```

---

## Rules for Agents

1. **Always POST to Mission Control** — never write static markdown files
2. **Use the correct `agent_id`** from the roster — this drives the agent status cards
3. **Use the correct `activity_type`** — special types route to dedicated tables
4. **Include `workflow`** when the output comes from a scheduled workflow
5. **Include `full_content`** for reports and articles — these render as markdown on the Reports page
6. **Include `metadata`** with structured data — the dashboard uses this for charts and metrics
7. **Social posts arrive as drafts** — Sean approves them before they publish to Buffer
8. **Tasks arrive in "todo" status** — Sean can drag them across the Kanban board
9. **KB gaps auto-aggregate** — if the same topic is reported multiple times, increment the count
10. **Goal snapshots should include all KPIs** — partial snapshots will show gaps on the Goals page
