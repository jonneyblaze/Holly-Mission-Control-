# TOOLS.md — Holly's Infrastructure Reference

## Server (Naboo)
- **Host:** 10.0.1.100 (Unraid)
- **SSH:** ssh root@10.0.1.100 (key-based auth + password: opSNSA3OXad21y!)
- **OpenClaw:** Docker container "OpenClaw", port 18789
- **External URL:** https://openclaw.naboo.network (Cloudflare Tunnel)
- **Config:** /root/.openclaw/openclaw.json (auto-reloads on changes)

## BodyLytics Stack
- **Website:** https://bodylytics.coach (Next.js on Hostinger)
- **Live Events:** https://events.bodylytics.coach (Owncast)
- **Database:** Supabase project fykutrdsdzpagggpnyir (eu-central-1)
- **Payments:** Stripe (9 products configured)
- **Email:** Resend API (transactional), Google Workspace (admin@bodylytics.coach)
- **Email aliases:** support@, sean@ → admin@bodylytics.coach
- **Analytics:** GA4
- **GitHub:** https://github.com/jonneyblaze (Hostinger auto-deploys from main)

## Channels
- **Telegram:** Forum group with 7 topics (General, BodyLytics, Career, Personal, Finance, Parenting, Tech)
- **Telegram DM:** Paired with Sean's account
- **Control UI:** https://openclaw.naboo.network

## Browser
- **Chromium** (headless, in-container)
- **Playwright** installed for screenshots, PDFs, form filling
- **CDP port:** 18800 (loopback only)

## Memory
- **Backend:** QMD (semantic + keyword hybrid search)
- **Indexed:** 419+ files from workspace, agent-memory, and memory-store
- **Provider:** Local models (no API calls for search)

## Database Access
Credentials in workspace `.env` file.

### Supabase Edge Functions
Base URL: `https://fykutrdsdzpagggpnyir.supabase.co/functions/v1`

| Function | Purpose | Auth |
|---|---|---|
| `marketing-create-blog-post` | Create blog posts | Service Role Key |
| `support-create-kb-article` | Create KB articles | Service Role Key |
| `community-create-forum-post` | Create forum posts | Service Role Key |

Auth header: `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` (from .env)

### Restricted DB Roles (Supabase)
- **bodylytics_support_viewer** — read-only for Support + Community
- **bodylytics_analytics_viewer** — read-only for Marketing

## NotePlan
- Available via MCP (mcporter)
- Sean's second brain — Areas, Goals, Resources
- All planning uses 5 segments: Duracell, BodyLytics, DJing, Driving, General

## Key Dates
- **Duracell start:** April 8, 2026
- **PARO ends:** ~April 14, 2026
- **Holidays:** Turkey/Egypt May 12, UK July/Aug, Porto Sept 4
- **Peak productivity:** Tuesday 9-11am
- **Wednesday:** Creative/DJ block
