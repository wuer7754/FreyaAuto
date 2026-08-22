# Freya Auto

Freya Auto is a private AI-assisted operations workspace for an Etsy furniture store. It brings listing management, AI copy workflows, scheduled description experiments, performance tracking, and role-based team access into one application.

The project demonstrates an end-to-end applied AI system rather than a standalone prompt demo: a React operations console, an Express API, Etsy OAuth and listing integrations, OpenAI-assisted rewriting, persistent automation state, and security controls for a small team.

## What it does

- Connects a shared Etsy shop through OAuth and reads live listing data.
- Generates editable listing-description previews with OpenAI before any write is approved.
- Publishes approved descriptions through the Etsy API.
- Rotates selected description templates on a configurable weekly schedule.
- Captures view-count baselines and subsequent snapshots after listing updates.
- Provides update history and performance views for ongoing experiments.
- Protects the workspace with private team accounts and role-based permissions.
- Supports light and dark themes in a responsive React interface.

## System design

```text
React + Vite operations console
             |
             v
Express API and authorization layer
      |                    |
      v                    v
Etsy OAuth/API       OpenAI API
      |                    |
      +---------+----------+
                v
     Rotation and performance services
                |
                v
      Private local runtime state
```

### Application layers

- **Client:** React 19, Vite, and Lucide icons.
- **API:** Express 5 routes and controllers.
- **Integrations:** Etsy OAuth/listing APIs and the OpenAI API.
- **Automation:** timezone-aware weekly description rotation with run history.
- **Analytics:** update baselines, daily view snapshots, and performance history.
- **Security:** scrypt password hashing, signed sessions, CSRF protection, role checks, login throttling, and audit logs.

## Human-in-the-loop AI workflow

Freya Auto keeps the model away from unsupervised publishing:

1. Fetch the current Etsy listing.
2. Generate a rewritten description preview from a selected template.
3. Let an authorized user review and edit the result.
4. Publish only after an explicit user action.
5. Record the update and its view-count baseline for later comparison.

Scheduled rotation is disabled by default and must be configured by an administrator.

## Local setup

Requirements: Node.js 20+ and Etsy/OpenAI developer credentials.

```bash
npm install
cp .env.example .env
```

Add secrets to `.env`, then create the first administrator:

```bash
npm run team:user -- admin admin "Admin"
npm run build:client
npm start
```

Open `http://localhost:3000/app/`.

See [TEAM_SETUP.md](TEAM_SETUP.md) for roles and production security notes.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `TEAM_SESSION_SECRET` | Signs private team sessions |
| `ETSY_CLIENT_ID` | Etsy OAuth application ID |
| `ETSY_CLIENT_SECRET` | Etsy OAuth secret |
| `ETSY_REDIRECT_URI` | Etsy OAuth callback URL |
| `OPENAI_API_KEY` | OpenAI API access |
| `ETSY_PROXY_URL` | Optional Etsy-specific outbound proxy |
| `OPENAI_PROXY_URL` | Optional OpenAI-specific outbound proxy |

Never commit `.env`, OAuth tokens, team-user records, or performance data. The repository's `.gitignore` excludes these runtime files.

## Quality checks

```bash
npm test
npm run build:client
```

The test suite covers authorization boundaries, CSRF enforcement, administrator-only actions, update-history persistence, performance snapshots, and weekly-rotation baselines.

## Portfolio notes

This repository contains the reusable application code and sanitized configuration examples. Store-specific credentials, customer data, listing data, team accounts, audit logs, and production runtime state are intentionally excluded.
