CREATE TABLE IF NOT EXISTS repos (
  id BIGINT PRIMARY KEY,
  full_name TEXT NOT NULL UNIQUE,
  description TEXT,
  language TEXT,
  topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  stars INTEGER NOT NULL,
  forks INTEGER NOT NULL,
  created_at TIMESTAMPTZ,
  pushed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  deleted BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT NOT NULL DEFAULT 'github',
  last_seen_at TIMESTAMPTZ,
  source_query TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  missed_runs INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS snapshots (
  repo_id BIGINT NOT NULL,
  sampled_at TIMESTAMPTZ NOT NULL,
  stars INTEGER NOT NULL,
  forks INTEGER NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (repo_id, sampled_at)
);

CREATE TABLE IF NOT EXISTS star_history (
  repo_id BIGINT NOT NULL,
  week_start BIGINT NOT NULL,
  total INTEGER NOT NULL,
  days_json JSONB NOT NULL,
  sampled_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (repo_id, week_start)
);

CREATE TABLE IF NOT EXISTS daily_metrics (
  repo_id BIGINT NOT NULL,
  day DATE NOT NULL,
  source TEXT NOT NULL,
  stars INTEGER,
  forks INTEGER,
  star_created INTEGER,
  PRIMARY KEY (repo_id, day, source)
);

CREATE TABLE IF NOT EXISTS period_metrics (
  repo_id BIGINT NOT NULL,
  period TEXT NOT NULL,
  source TEXT NOT NULL,
  window_start DATE NOT NULL,
  window_end DATE NOT NULL,
  gain INTEGER,
  fork_gain INTEGER,
  prev_gain INTEGER,
  anomaly BOOLEAN NOT NULL DEFAULT FALSE,
  sampled_at TIMESTAMPTZ,
  PRIMARY KEY (repo_id, period, source)
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  category_zh TEXT,
  category_en TEXT,
  official BOOLEAN NOT NULL DEFAULT FALSE,
  official_evidence TEXT,
  cluster_id TEXT,
  url TEXT,
  install TEXT,
  language TEXT,
  topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  stars INTEGER NOT NULL DEFAULT 0,
  forks INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ,
  pushed_at TIMESTAMPTZ,
  recommend_rank INTEGER,
  recommend_note_zh TEXT,
  recommend_note_en TEXT,
  website_url TEXT,
  source_repo_url TEXT,
  favicon_url TEXT,
  last_fetched_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  source_query TEXT,
  entity_key TEXT,
  ranking_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  missed_runs INTEGER NOT NULL DEFAULT 0,
  UNIQUE (type, slug)
);

CREATE TABLE IF NOT EXISTS asset_daily (
  asset_id TEXT NOT NULL,
  day DATE NOT NULL,
  star_created INTEGER,
  stars INTEGER,
  PRIMARY KEY (asset_id, day)
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  found INTEGER NOT NULL DEFAULT 0,
  sampled INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

CREATE TABLE IF NOT EXISTS sync_query_stats (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL,
  collection_type TEXT NOT NULL,
  family TEXT NOT NULL,
  query_text TEXT NOT NULL,
  requested INTEGER NOT NULL DEFAULT 0,
  returned INTEGER NOT NULL DEFAULT 0,
  unique_count INTEGER NOT NULL DEFAULT 0,
  accepted INTEGER NOT NULL DEFAULT 0,
  rate_limited BOOLEAN NOT NULL DEFAULT FALSE,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS website_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  source_repo_url TEXT,
  collection_method TEXT NOT NULL DEFAULT 'page',
  frequency_hours INTEGER NOT NULL DEFAULT 24,
  trust_level TEXT NOT NULL DEFAULT 'community',
  topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_fetched_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS catalog_candidates (
  id SERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  submitted_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  reviewed_at TIMESTAMPTZ,
  UNIQUE (url, type)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  user_id TEXT,
  locale TEXT NOT NULL,
  types JSONB NOT NULL DEFAULT '["github-repo"]'::jsonb,
  boards JSONB NOT NULL,
  language TEXT,
  languages JSONB NOT NULL DEFAULT '[]'::jsonb,
  topic TEXT,
  topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  send_hour INTEGER NOT NULL,
  timezone TEXT NOT NULL,
  status TEXT NOT NULL,
  verify_hash TEXT,
  manage_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  locale TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_codes (
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  password_hash TEXT,
  locale TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (email, purpose)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_identities (
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (provider, subject),
  UNIQUE (provider, user_id)
);

CREATE TABLE IF NOT EXISTS auth_oauth_states (
  state_hash TEXT PRIMARY KEY,
  browser_hash TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  next_path TEXT NOT NULL,
  locale TEXT NOT NULL,
  link_user_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL
);

-- Paid plans are kept separate from the free email digest in `subscriptions`.
CREATE TABLE IF NOT EXISTS billing_customers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  creem_customer_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  mode TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS billing_checkouts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  request_id TEXT NOT NULL UNIQUE,
  creem_checkout_id TEXT UNIQUE,
  plan_key TEXT NOT NULL,
  creem_product_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  creem_customer_id TEXT,
  creem_subscription_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  creem_subscription_id TEXT NOT NULL UNIQUE,
  creem_customer_id TEXT NOT NULL,
  creem_product_id TEXT NOT NULL,
  plan_key TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  units INTEGER NOT NULL DEFAULT 1,
  price INTEGER,
  currency TEXT,
  current_period_start_at TIMESTAMPTZ,
  current_period_end_at TIMESTAMPTZ,
  next_transaction_at TIMESTAMPTZ,
  last_transaction_id TEXT,
  last_transaction_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  cancel_requested_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS billing_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  creem_transaction_id TEXT NOT NULL UNIQUE,
  creem_order_id TEXT,
  creem_subscription_id TEXT,
  creem_customer_id TEXT,
  amount INTEGER,
  tax_amount INTEGER,
  refunded_amount INTEGER,
  currency TEXT,
  status TEXT,
  mode TEXT NOT NULL,
  provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS creem_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  mode TEXT,
  payload JSONB NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  received_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS billing_refund_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  transaction_id TEXT NOT NULL UNIQUE REFERENCES billing_transactions(id),
  mode TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL,
  admin_note TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT,
  provider_refund_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS user_entitlements (
  user_id TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  plan_key TEXT,
  state TEXT NOT NULL,
  source_sub_id TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, feature_key)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  public_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  secret_data TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS deliveries (
  id SERIAL PRIMARY KEY,
  subscription_id TEXT NOT NULL,
  local_date TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  snapshot JSONB,
  UNIQUE (subscription_id, local_date)
);

CREATE TABLE IF NOT EXISTS outbox (
  id SERIAL PRIMARY KEY,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  text TEXT NOT NULL,
  html TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS classification_reports (
  id SERIAL PRIMARY KEY,
  repo_id BIGINT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS repos_source_alive_idx ON repos (source, deleted, archived);
CREATE INDEX IF NOT EXISTS repos_language_idx ON repos (language);
CREATE INDEX IF NOT EXISTS snapshots_source_sampled_idx ON snapshots (source, sampled_at);
CREATE INDEX IF NOT EXISTS daily_metrics_source_day_idx ON daily_metrics (source, day);
CREATE INDEX IF NOT EXISTS period_metrics_source_period_idx ON period_metrics (source, period);
CREATE INDEX IF NOT EXISTS deliveries_sub_date_idx ON deliveries (subscription_id, local_date);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS billing_checkouts_user_idx ON billing_checkouts (user_id, created_at);
CREATE INDEX IF NOT EXISTS billing_subscriptions_user_idx ON billing_subscriptions (user_id, updated_at);
CREATE INDEX IF NOT EXISTS billing_transactions_user_idx ON billing_transactions (user_id, created_at);
CREATE INDEX IF NOT EXISTS creem_webhook_status_idx ON creem_webhook_events (status, received_at);
CREATE INDEX IF NOT EXISTS admin_sessions_expires_idx ON admin_sessions (expires_at);
CREATE INDEX IF NOT EXISTS assets_type_idx ON assets (type);
CREATE INDEX IF NOT EXISTS assets_category_idx ON assets (type, category);
CREATE INDEX IF NOT EXISTS assets_cluster_idx ON assets (cluster_id);
CREATE INDEX IF NOT EXISTS asset_daily_day_idx ON asset_daily (day);
CREATE INDEX IF NOT EXISTS sync_query_stats_run_idx ON sync_query_stats (run_id, collection_type);
CREATE INDEX IF NOT EXISTS website_sources_due_idx ON website_sources (active, last_fetched_at);
CREATE INDEX IF NOT EXISTS catalog_candidates_status_idx ON catalog_candidates (status, created_at);
