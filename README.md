# Trend Top

A runnable bilingual discovery site for open-source skills, plugins, agents, components, websites, and GitHub repositories, with daily verified email digests. The default is **DEMO mode**: metadata and 33 days of metrics are illustrative synthetic samples. The interface and API label them as demo data. They are not GitHub's current rankings.

The site stores metrics in **PostgreSQL** when `DATABASE_URL` is set, and falls back to embedded **PGlite** for local demo and tests. Rankings are computed in SQL from pre-aggregated `period_metrics`. The first live collect expands 12 weeks of official Star history into daily rows, so day/week/month Star gains work immediately. Fork net still needs a second daily snapshot.

## Run locally

Requires Node 22+.

```bash
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173/en/home` for the English default, or use `/zh/home` for Chinese. The API runs on port 3001. Build and serve one production-style process with `npm run build` then `npm start` at `http://localhost:3001/`. The homepage introduces the product with a six-type collection snapshot, a repository growth example from the chart API, and a short guide before the type picker. The first discovery layer is asset type: `/en/skill`, `/en/plugin`, `/en/agent`, `/en/components`, `/en/website`, and `/en/github-repo`, each with `/ranking`, `/charts`, `/official`, `/c/:category`, `/compare`, and item detail. Legacy `/en/ranking` and `/en/charts` redirect to the repository type. Language and topic filters load from `GET /api/{type}/filters`.

Register or sign in at `http://localhost:5173/en/account`. Registration sends a six-digit email code; in demo mode, read it from `http://localhost:5173/api/demo-outbox`. A verified account can select any of the six content types, boards, programming languages, topics, delivery time, and time zone. Leave language or topic empty to include all. Change, pause, resume, or unsubscribe from the account page. Run `npm run digest -- --force` to produce a sample daily digest and inspect the outbox again. `--force` bypasses the send hour only, not the once-per-local-day rule. The email includes compact growth charts and a sign-in link; it does not send when no selected board has data.

Login state is shared across the header, account page, and digest dialog. After registration or sign-in, the black header action shows the verified email address and the digest dialog identifies the same account without a reload.

## Creem billing

The paid product is one **Pro** tier with separate weekly and monthly recurring products. Public plans live at `/en/pricing` and `/zh/pricing`; account billing is shown separately from the free daily digest. Checkout, Customer Portal, signed webhook processing, idempotent provider events, local billing records, and the `pro` entitlement are implemented with Creem's REST API.

Open `/en/admin` or `/zh/admin` while signed in with an administrator account. Administrators are ordinary accounts whose email is listed in `ADMIN_EMAILS` (or `admin.emails` in `config.json`); the default is `zhangyuge.ghs@gmail.com`. There is no separate token sign-in. The administrator page controls checkout availability, mode, currency, weekly/monthly amounts, both Creem product IDs, API base URL, API key, webhook secret, support email, and X/Facebook/Telegram links. Creem credentials are encrypted in `app_settings` using `AUTH_SECRET` (falling back to `ADMIN_TOKEN`) and are never returned to the browser. Keep that encryption secret stable across deployments. Environment variables in `.env.example` are optional bootstrap/fallback values.

In Creem Test Mode, create two recurring products for the same Pro feature set: one weekly and one monthly. Save their IDs and test credentials in Admin, then register this webhook URL in Creem:

```text
https://YOUR_DOMAIN/api/webhooks/creem
```

The webhook route is registered before `express.json()` so its HMAC-SHA256 signature is checked against the exact raw request body. Provider events are deduplicated in `creem_webhook_events`; failed events can be retried, and older subscription payloads do not overwrite newer provider state. Redirect query parameters never grant access.

Switching to production requires production products, API key, webhook secret, `mode=prod`, `https://api.creem.io`, an HTTPS `PUBLIC_URL`, and a real end-to-end payment test. Prices use the smallest currency unit in Admin: for USD, `900` displays as `$9.00`.

## Live data and mail

Use PostgreSQL in production (`DATABASE_URL=postgres://...`). Leave it unset to keep the embedded PGlite database under `./data/pglite`. Set `DATA_MODE=live`, `GITHUB_TOKEN`, `PUBLIC_URL`, and long random `ADMIN_TOKEN` and `AUTH_SECRET` values in `.env`. For email, set `RESEND_API_KEY` and `RESEND_FROM` using an address on a [verified Resend domain](https://resend.com/docs/api-reference/emails/send-email), or configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM`. Resend takes priority when both providers are configured. Never expose these values to the frontend. `ADMIN_TOKEN` also encrypts unsubscribe links at rest; retain it across restarts.

Live registration and email subscriptions require a working provider and a public `PUBLIC_URL` so recipients can receive verification codes and open the account or unsubscribe links. A Resend API key alone is insufficient: `RESEND_FROM` must use a verified sender domain. The demo outbox supports full local registration and digest testing without external mail. Existing subscriptions are adopted by a newly verified account with the same email address.

Run `npm run collect` at about 02:00 UTC daily with a system scheduler. Run `npm run digest` hourly. After a schema change or a restore, `npm run backfill` rebuilds `daily_metrics` and `period_metrics`. The collector paginates GitHub search, rotates languages and topics each day, lowers the star floor to catch newcomers, caps mega-repos, refreshes up to 250 known repositories per run (50 without a token), stores current snapshots, fetches the last 12 weekly Star-history buckets, expands those buckets into daily Star-created rows, and rebuilds period metrics in SQL. `npm run history` refreshes official Star history without running discovery. The sample is a bounded candidate universe (up to 2,000 repositories and 400 assets per type), not all of GitHub. `GET /api/admin` and `POST /api/admin/collect`, `/digest`, or `/backfill` require an administrator account session (the same cookie as the account page) for status and manual reruns; use `./deploy.sh collect` from the server shell instead of curl.

For example, in a cron-compatible scheduler (UTC):

```text
0 2 * * * cd /path/to/site && npm run collect
5 * * * * cd /path/to/site && npm run digest
```

Database tables migrate automatically on startup. Keep the Postgres volume (or `data/pglite`) on persistent storage. Email delivery failures are recorded and retried up to three times. Resend digest requests use a stable idempotency key to avoid duplicate sends during retries within Resend's 24-hour window. A delivery is claimed atomically before send, so overlapping workers cannot both send it. If a worker crashes during send, the record remains `sending` for operator review rather than risking an automatic duplicate.

## Docker

Same layout as meridian-travel-guide: secrets live in `/opt/trend-top/config.json`, not in git. Host port **3010** and an internal Postgres (not published) avoid the existing 3000 / 5432 / 8000 bindings.

On the VPS:

```bash
sudo mkdir -p /opt/trend-top
sudo cp config.json /opt/trend-top/config.json
sudo nano /opt/trend-top/config.json   # fill every CHANGE_ME_* field
./deploy.sh -d --build
./deploy.sh collect
```

`deploy.sh` reads the config, exports `POSTGRES_PASSWORD` and `APP_PORT`, then runs `docker compose up`. The app is published on port **3010** (all interfaces). Optional `deploy/nginx.conf` proxies that port. The scheduler collects at 02:00 UTC and sends the digest each hour.

## Ranking methodology

`hot` = 45% log-scaled period Star gain + 20% Star gain divided by starting Stars plus 100 + 15% log-scaled Fork gain + 20% recent push recency. Each input is percentile-normalized against the filtered candidate set in SQL (`period_metrics` + window functions). In live mode, Star gain is **new Stars created** in GitHub's official history day buckets, expanded into `daily_metrics` on collect so 1/7/30-day windows are complete after the first run. This is not the net difference in total Stars and its day boundaries may differ from UTC. Fork gain remains a net difference between our daily snapshots. While Fork gain is unavailable, its 15% component is omitted and the remaining weights are renormalized. Demo mode uses synthetic snapshot net changes for both. The period can be 1, 7, or 30 days; snapshot boundaries require a match within 6 hours. Anomalous gains over three times a previous comparable period (and over 100 Stars) get no hot score pending review. `rising` sorts absolute gain; `new` limits age to 90 days and minimum 20 Stars; `ai` filters by published topic keyword evidence before hot ranking; `stars` and `forks` sort current cumulative totals. Search, language, topic, age and pagination act on these result sets. Without complete history, gains and score are null, shown as “数据不足 / Insufficient data.”

The activity component is **push recency**, a proxy, not PR/issue/release activity. Scores are relative to the sampled candidate universe and selected filters. API sampling is approximate, delayed, and subject to GitHub limits. The site says “recently trending,” not “real-time.” The live cumulative and daily charts use official new-Star history for the leading repository; the demo charts show synthetic net changes. Bars compare the top five using the same metric and window. The donut groups programming languages in the first 50 repositories of the selected ranking and filters, with remaining languages combined as Other. When a selected live board lacks usable history, Stars/Forks total boards show current totals instead. Charts are rendered with [Recharts](https://recharts.github.io/en-US/).

## Design and component provenance

`DESIGN.md` combines the [Wired guide in awesome-design-md](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/wired/DESIGN.md) for high-contrast editorial typography, a black footer band, and square controls with the [Apple guide's](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/apple/DESIGN.md) viewport-sized section rhythm and single-color emphasis. Trend Top uses its own restrained blue for chart series and active navigation. Scroll snapping and fade/slide transitions are implemented for this site; no brand artwork was copied.

Three adapted 21st.dev component patterns are integrated in `src/components.jsx`: [float_ui Radix tabs](https://21st.dev/community/components/float_ui/tabs-2/tabs-with-background-color) for board navigation, [float_ui Radix dialog](https://21st.dev/community/components/float_ui/modal-dialog/modal-with-newsletter) for subscription, and [HextaUI clearable input](https://21st.dev/community/components/preetsuthar17/input) for search. All dropdowns now use [Radix Select](https://www.radix-ui.com/primitives/docs/components/select) with a shared visual treatment; the menu, selected row, and focus state are rendered by the app instead of the operating system. No preview assets or branding were copied. Credits remain here in the developer README rather than in the user-facing interface. The components use keyboard-operable Radix primitives, proper labels and focus styles; mobile layouts are checked separately.

## Roadmap

Next: add current PR/release signals for a separate maintenance board; use GitHub issue labels for contribution opportunities; add release alerts; enhance anti-manipulation review and administrator controls. These are not currently claimed as implemented.
