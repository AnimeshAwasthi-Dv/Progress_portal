#!/usr/bin/env bash
set -euo pipefail

# Install the reviewed configuration for this site's existing Certbot setup.
if [[ "$EUID" -ne 0 ]]; then
  echo "Run with sudo: sudo bash deploy/apply-nginx-performance.sh" >&2
  exit 1
fi
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
site_target="$(readlink -f /etc/nginx/sites-enabled/task-manager)"
if [[ ! -f "$site_target" || "$site_target" != /etc/nginx/* ]]; then
  echo "Expected an existing task-manager site under /etc/nginx." >&2
  exit 1
fi
nginx -t
install -d -m 0700 /etc/nginx/backups
backup_file="$(mktemp /etc/nginx/backups/task-manager.XXXXXX)"
cp -p -- "$site_target" "$backup_file"
rollback() {
  cp -p -- "$backup_file" "$site_target"
  echo "Restored original configuration from $backup_file" >&2
}
trap rollback ERR
install -m 0644 "$script_dir/nginx.https.conf.example" "$site_target"
nginx -t
systemctl reload nginx
trap - ERR
echo "Nginx reloaded. Original configuration: $backup_file"
