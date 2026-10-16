#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

readonly project_name='lion-whatsapp-lab'
readonly compose_dir='/opt/lion-ai/slack-whatsapp/upstream/WhatsAppInSlack'
readonly backup_dir='/var/backups/lion-whatsapp-lab'
readonly image_name='lion-whatsapp-lab-app:latest'
readonly retention_days=14

install -d -o root -g root -m 0700 "$backup_dir"

container_id="$(docker compose \
  --project-name "$project_name" \
  --env-file "$compose_dir/.env" \
  --file "$compose_dir/docker-compose.yml" \
  ps --quiet app)"

if [[ -z "$container_id" || "$container_id" == *$'\n'* ]]; then
  echo 'Backup failed: expected exactly one running application container.' >&2
  exit 1
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
temporary_file="$backup_dir/.mock-state-$timestamp.tmp"
backup_file="$backup_dir/mock-state-$timestamp.json"
trap 'rm -f -- "$temporary_file"' EXIT

docker cp "$container_id:/data/mock-state.json" "$temporary_file"
chown root:root "$temporary_file"
chmod 0600 "$temporary_file"

# Parse the copied file with the application image without printing its contents.
docker run --rm \
  --network none \
  --read-only \
  --user 0:0 \
  --mount "type=bind,source=$temporary_file,target=/backup/mock-state.json,readonly" \
  --entrypoint node "$image_name" \
  -e 'const fs=require("node:fs"); const state=JSON.parse(fs.readFileSync("/backup/mock-state.json","utf8")); if(state.version!==1 || !Array.isArray(state.conversations) || !Array.isArray(state.messages)) process.exit(1);'

mv -- "$temporary_file" "$backup_file"
trap - EXIT
find "$backup_dir" -mindepth 1 -maxdepth 1 -type f \
  -name 'mock-state-*.json' -mtime "+$((retention_days - 1))" -delete

printf 'Backup created: %s (%s bytes)\n' "$(basename "$backup_file")" "$(stat -c '%s' "$backup_file")"
