# Verification notes

Checked on 2026-09-13 (Asia/Shanghai), with Postgres/PGlite ranking work on 2026-09-14:

- `npm test`: API, snapshot boundary, AI/new-board filtering, verified subscription, combined daily digest, management, one-click unsubscribe, once-per-day delivery, discovery-plan rotation, and star-history → `daily_metrics` checks pass on PGlite.
- `npm run build`: production frontend builds. Vite reports harmless Radix `use client` directive notices.
- Browser checks at 1440px and 390px: dark/light layout, no horizontal overflow, demo growth line and top-five bars, board switch, footer language switch, subscription dialog.
- Billing: admin settings require an HttpOnly admin session; secrets are encrypted and redacted; public plans expose one Pro tier with weekly/monthly cycles; unauthenticated checkout/portal requests fail; invalid plan keys fail; a signed `checkout.completed` event activates Pro once; duplicate events are harmless; Account opens Creem Customer Portal for its own customer only.
- Auth UI: after email verification or password sign-in, the header action changes from `Sign in` to the account email and the digest dialog displays that same email without a page reload.

Open items for production: configure Postgres, GitHub, email, `PUBLIC_URL`, `ADMIN_TOKEN`/`AUTH_SECRET`, then enter the real Creem production values and public contact/social links in Admin. The first live collect expands 12 weeks of official Star history so day/week/month Star gains work immediately; Fork net gains remain unavailable until a second daily snapshot. Live payment and email delivery remain unverified.
