#!/bin/sh
set -eu
cd "$(dirname "$0")"

CONFIG_FILE="${CONFIG_FILE:-/opt/trend-top/config.json}"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "Missing $CONFIG_FILE"
  echo "Put the real config at /opt/trend-top/config.json (the repo copy is placeholders only)."
  exit 1
fi

export POSTGRES_PASSWORD="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['database']['password'], end='')" "$CONFIG_FILE")"
export APP_PORT="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('site',{}).get('port',3010), end='')" "$CONFIG_FILE")"

case "$POSTGRES_PASSWORD" in
  "" | CHANGE_ME*)
    echo "Fill the CHANGE_ME_* fields in $CONFIG_FILE first."
    exit 1
    ;;
esac

if [ "${1:-}" = "collect" ]; then
  exec docker compose exec app node scripts/apply-config.mjs node server/jobs.js collect
fi

exec docker compose up "$@"
