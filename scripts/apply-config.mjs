#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const path = process.env.CONFIG_PATH?.trim() || resolve(process.cwd(), 'config.json');
if (!existsSync(path)) {
  console.error(`[config] missing ${path}`);
  process.exit(1);
}

const config = JSON.parse(readFileSync(path, 'utf8'));
const database = config.database ?? {};
const site = config.site ?? {};
const github = config.github ?? {};
const admin = config.admin ?? {};
const smtp = config.smtp ?? {};
const host = process.env.DATABASE_HOST || database.host || 'db';
const user = encodeURIComponent(database.user || 'trend_top');
const password = encodeURIComponent(database.password || '');
const dbPort = database.port || 5432;
const name = database.name || 'trend_top';
const origin = String(site.origin || '').replace(/\/$/, '');

const env = {
  ...process.env,
  NODE_ENV: 'production',
  DATA_MODE: 'live',
  DATABASE_URL: `postgres://${user}:${password}@${host}:${dbPort}/${name}`,
  PUBLIC_URL: origin || process.env.PUBLIC_URL || '',
  PORT: process.env.PORT || '3001',
  HOST: process.env.HOST || '0.0.0.0',
  GITHUB_TOKEN: github.token || process.env.GITHUB_TOKEN || '',
  ADMIN_TOKEN: admin.token || process.env.ADMIN_TOKEN || '',
  ADMIN_EMAILS: (Array.isArray(admin.emails) ? admin.emails.join(',') : admin.emails) || process.env.ADMIN_EMAILS || '',
  CONFIG_PATH: path
};

if (smtp.host && smtp.fromEmail) {
  env.SMTP_HOST = smtp.host;
  env.SMTP_PORT = String(smtp.port || 465);
  env.SMTP_USER = smtp.username || '';
  env.SMTP_PASS = smtp.password || '';
  env.SMTP_FROM = smtp.fromName ? `${smtp.fromName} <${smtp.fromEmail}>` : smtp.fromEmail;
}

const args = process.argv.slice(2);
if (args.length === 0) {
  process.stdout.write(`POSTGRES_PASSWORD=${database.password || ''}\n`);
  process.stdout.write(`APP_PORT=${site.port || 3010}\n`);
  process.exit(0);
}

const child = spawn(args[0], args.slice(1), { stdio: 'inherit', env });
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});
