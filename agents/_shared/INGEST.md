# Mission Control Ingest Instructions

## How to Report Your Work

Every time you complete a task, generate content, produce a report, or have something to communicate — POST it to Mission Control. Never write static markdown files.

## Endpoint

```
POST https://holly-mission-control-backend.vercel.app/api/ingest
```

## Headers

```
Content-Type: application/json
Authorization: Bearer {{INGEST_API_KEY}}
```

The `INGEST_API_KEY` is available in your environment. Use `web_fetch` to make the POST request.

## Request Format

```json
{
  "agent_id": "YOUR_AGENT_ID",
  "activity_type": "report|content|task|social_post|infra_snapshot|goal_snapshot|lead_snapshot|kb_gap|ticket|alert|feedback|review|campaign|deployment|meeting_prep|prospect",
  "title": "Short descriptive title",
  "summary": "1-2 sentence summary of what you did",
  "full_content": "Full markdown content (for reports, articles, etc.)",
  "workflow": "workflow-name-if-applicable",
  "metadata": {}
}
```

## Rules

1. Always use your correct `agent_id`
2. Always include `activity_type` — it determines where the data appears on the dashboard
3. Include `full_content` for anything Sean might want to read in detail
4. Include `metadata` with structured data when applicable
5. Social posts arrive as drafts — Sean approves them before they go to Buffer
6. Tasks arrive in "todo" status on the Kanban board
7. If your `web_fetch` to the ingest endpoint fails, retry once. If it fails again, log the error and continue your work.

## Success Response

```json
{ "ok": true, "id": "uuid" }
```
