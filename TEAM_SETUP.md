# Freya Auto private team setup

Freya Auto now supports one shared Etsy shop with private team accounts.

## 1. Add a session secret

Generate a random secret:

```bash
openssl rand -hex 48
```

Add the result to `.env`:

```text
TEAM_SESSION_SECRET=the-generated-value
```

Do not share or commit this value. Changing it signs every team member out.

## 2. Create team members

Run this command from the `FreyaAuto` directory:

```bash
npm run team:user -- <username> <role> "<display name>"
```

The command asks for a password without displaying it. Passwords must contain at
least 12 characters and are stored as salted scrypt hashes.

Examples:

```bash
npm run team:user -- freya-admin admin "Freya Admin"
npm run team:user -- copywriter editor "Copywriter"
npm run team:user -- analyst viewer "Analyst"
```

Running the command again with the same username changes that account's password,
display name, and role.

Roles:

- `admin`: manage Etsy connection, listings, and weekly automation.
- `editor`: view listings, generate previews, and publish approved descriptions.
- `viewer`: view listings, performance, history, and automation settings.

## 3. Build and run

```bash
npm run build:client
npm start
```

Open `http://localhost:3000/app/` locally or
`https://api.freya-auto.com/app/` through the configured Cloudflare tunnel.

## Security notes

- Keep `.env`, `src/config/team-users.json`, `src/config/token.json`, and audit
  logs private. They are ignored by Git.
- Keep HTTPS enabled when sharing the application.
- Team sessions last 12 hours.
- Five failed logins from one address trigger a ten-minute lockout.
- Successful writes are appended to `src/config/team-audit.jsonl` without request
  bodies or secrets.
- This version intentionally connects every team member to the same Etsy shop.
