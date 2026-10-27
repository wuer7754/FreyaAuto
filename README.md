# Freya Auto

Freya Auto is a private AI-assisted operations workspace for an Etsy furniture store. It brings listing management, AI copy workflows, scheduled description experiments, performance tracking, and role-based team access into one application.

The project demonstrates an end-to-end applied AI system rather than a standalone prompt demo: a React operations console, an Express API, Etsy OAuth and listing integrations, OpenAI-assisted rewriting, persistent automation state, and security controls for a small team.

## What it does

- Connects a shared Etsy shop through OAuth and reads live listing data.
- Generates editable listing-description previews with OpenAI before any write is approved.
- Publishes approved descriptions through the Etsy API.
- Rotates selected description templates on a configurable weekly schedule.
- Captures view-count baselines and subsequent snapshots after listing updates.
- Samples public Etsy search results to compare repeated competitor tags and visible discounts.
- Lets editors review and publish an Etsy-compliant set of up to 13 listing tags.
- Prepares listing-level promotion plans and hands final sale creation to Etsy Shop Manager.
- Publishes reviewed Etsy product images to Buffer-connected Instagram and Facebook channels.
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
| `ETSY_MARKET_COUNTRY` | Buyer country used for public discount-price research (default `US`) |
| `ETSY_MARKET_CURRENCY` | Currency used for public market-price research (default `USD`) |
| `OPENAI_API_KEY` | OpenAI API access |
| `ETSY_PROXY_URL` | Optional Etsy-specific outbound proxy |
| `OPENAI_PROXY_URL` | Optional OpenAI-specific outbound proxy |
| `BUFFER_API_KEY` | Personal API key from Buffer Settings → API |
| `BUFFER_ORGANIZATION_ID` | Optional Buffer workspace override; the first workspace is used by default |
| `BUFFER_INSTAGRAM_CHANNEL_ID` | Optional Instagram channel override when Buffer has multiple Instagram accounts |
| `BUFFER_FACEBOOK_CHANNEL_ID` | Optional Facebook Page channel override when Buffer has multiple Facebook Pages |
| `BUFFER_PINTEREST_CHANNEL_ID` | Optional Pinterest channel override when Buffer has multiple Pinterest accounts |
| `BUFFER_PINTEREST_BOARD_ID` | Optional default Pinterest board service ID |
| `SOCIAL_MEDIA_PUBLIC_BASE_URL` | Public HTTPS origin Buffer uses to retrieve images uploaded from the computer |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | Cloudflare R2 credentials and bucket for uploaded social images |

Never commit `.env`, OAuth tokens, team-user records, or performance data. The repository's `.gitignore` excludes these runtime files.

Etsy's public API does not expose a shop's private search-term traffic report or an endpoint for creating sales and coupons. The Search & Promotions workspace therefore labels public result frequency as a relevance signal—not search volume—and sends promotion plans to Etsy Shop Manager for final review.

The Social Publisher sends public Etsy images or images uploaded from the computer through Buffer's API to Instagram and Facebook. One post can contain up to 10 images, and the seven-day planner can batch-upload images into editable date/time slots before scheduling them in Buffer. Uploaded images are validated as JPG, PNG, or WebP, limited to 10 MB each, and stored in Cloudflare R2 before Buffer receives their public URL. Connect the social accounts in Buffer first, then create a personal API key in Buffer Settings → API. It creates organic posts only; it does not create paid campaigns, assign audiences, set budgets, or access billing.

## Quality checks

```bash
npm test
npm run build:client
```

The test suite covers authorization boundaries, CSRF enforcement, administrator-only actions, update-history persistence, performance snapshots, and weekly-rotation baselines.

## Portfolio notes

This repository contains the reusable application code and sanitized configuration examples. Store-specific credentials, customer data, listing data, team accounts, audit logs, and production runtime state are intentionally excluded.
