# Verification notes

Checked on 2026-09-13 (Asia/Shanghai), with Postgres/PGlite ranking work on 2026-09-14:

- `npm test`: API, snapshot boundary, AI/new-board filtering, verified subscription, combined daily digest, management, one-click unsubscribe, once-per-day delivery, discovery-plan rotation, and star-history → `daily_metrics` checks pass on PGlite.
- `npm run build`: production frontend builds. Vite reports harmless Radix `use client` directive notices.
- Browser checks at 1440px and 390px: dark/light layout, no horizontal overflow, demo growth line and top-five bars, board switch, footer language switch, subscription dialog.

Open items for production: configure a Postgres `DATABASE_URL`, a GitHub token for scheduled daily collection, SMTP/Resend delivery, `PUBLIC_URL`, and `ADMIN_TOKEN`. The first live collect expands 12 weeks of official Star history so day/week/month Star gains work immediately; Fork net gains remain unavailable until a second daily snapshot. Live email delivery and public deployment remain unverified.
