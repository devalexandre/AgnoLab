#!/bin/sh
set -eu

SECRET_KEY="${WPPCONNECT_SECRET_KEY:-agnolab_wppconnect_secret}"
HOST_VALUE="${WPPCONNECT_HOST:-http://localhost}"
PORT_VALUE="${WPPCONNECT_PORT:-21465}"

escape_sed() {
  printf '%s' "$1" | sed 's/[\\/&]/\\&/g'
}

CONFIG_TS="/opt/wppconnect-server/src/config.ts"
if [ -f "$CONFIG_TS" ]; then
  SECRET_ESCAPED="$(escape_sed "$SECRET_KEY")"
  HOST_ESCAPED="$(escape_sed "$HOST_VALUE")"
  PORT_ESCAPED="$(escape_sed "$PORT_VALUE")"

  sed -i "0,/secretKey: '.*',/s//secretKey: '${SECRET_ESCAPED}',/" "$CONFIG_TS"
  sed -i "0,/host: '.*',/s//host: '${HOST_ESCAPED}',/" "$CONFIG_TS"
  sed -i "0,/port: '.*',/s//port: '${PORT_ESCAPED}',/" "$CONFIG_TS"
fi

cat > /opt/wppconnect-server/config.json <<EOF
{
  "secretKey": "${SECRET_KEY}",
  "host": "${HOST_VALUE}",
  "port": "${PORT_VALUE}",
  "customUserDataDir": "./userDataDir/",
  "startAllSession": false,
  "webhook": null,
  "logLevel": "info"
}
EOF

exec npm run dev
