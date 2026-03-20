#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-infra/.env}"
HOSTNAME_OVERRIDE="${2:-}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_PATH="$ROOT_DIR/infra/caddy-root.crt"

cd "$ROOT_DIR"

bash scripts/export_caddy_root_cert.sh "$ENV_FILE" "$CERT_PATH"

echo "Attempting to trust the Caddy root certificate in the login keychain..."
if security add-trusted-cert -d -r trustRoot -k "$HOME/Library/Keychains/login.keychain-db" "$CERT_PATH"; then
  echo "Trusted $CERT_PATH in the login keychain."
else
  echo "Automatic keychain trust did not complete. You may need to approve a macOS prompt or import $CERT_PATH manually." >&2
fi

CONTROL_PLANE_HOST="$(
  awk -F= '$1 == "CONTROL_PLANE_HOST" {print $2}' "$ENV_FILE" | tail -n 1
)"
CONTROL_PLANE_HOST="${HOSTNAME_OVERRIDE:-${CONTROL_PLANE_HOST:-studio-brain.local}}"

cat <<EOF

HTTPS endpoints:
- Local fallback: https://localhost
- Named host: https://$CONTROL_PLANE_HOST

If https://$CONTROL_PLANE_HOST does not resolve on this Mac yet, add a hosts entry:
  127.0.0.1 $CONTROL_PLANE_HOST

For other Macs on the LAN, point that hostname at the control-plane Mac's LAN IP in your router or /etc/hosts.
EOF
