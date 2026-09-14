#!/bin/sh
set -eu
echo "[trend-top] starting"
exec node scripts/apply-config.mjs node server/index.js
