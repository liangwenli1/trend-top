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
  source TEXT NOT NULL DEFAULT 'github'
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

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  locale TEXT NOT NULL,
  boards JSONB NOT NULL,
  language TEXT,
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

CREATE TABLE IF NOT EXISTS deliveries (
  id SERIAL PRIMARY KEY,
  subscription_id TEXT NOT NULL,
  local_date TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
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
CREATE INDEX IF NOT EXISTS assets_type_idx ON assets (type);
CREATE INDEX IF NOT EXISTS assets_category_idx ON assets (type, category);
CREATE INDEX IF NOT EXISTS assets_cluster_idx ON assets (cluster_id);
CREATE INDEX IF NOT EXISTS asset_daily_day_idx ON asset_daily (day);
