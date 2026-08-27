#!/usr/bin/env bash
# Create (or re-key) the API's mongo user on the VPS's existing mongod, and
# write the connection string into the systemd env file.
#
#   sudo ./pet-mongo-setup.sh
#
# The generated password is never printed. It goes from openssl into mongosh and
# into /etc/ai-english-pet.env, and nowhere else. The user it creates has
# readWrite on ai_english_pet only — it cannot see the other databases on this
# box.
set -euo pipefail

ENV_FILE=/etc/ai-english-pet.env
DB=ai_english_pet
APP_USER=pet

[ "$(id -u)" -eq 0 ] || { echo "run me with sudo" >&2; exit 1; }

read -rp  "mongo admin username: " ADMIN_USER
read -rsp "mongo admin password: " ADMIN_PW; echo

APP_PW="$(openssl rand -hex 24)"

mongosh --quiet \
  -u "$ADMIN_USER" -p "$ADMIN_PW" --authenticationDatabase admin \
  --eval "
    const db = db.getSiblingDB('$DB');
    const exists = db.getUser('$APP_USER');
    if (exists) {
      db.changeUserPassword('$APP_USER', '$APP_PW');
      print('user updated');
    } else {
      db.createUser({
        user: '$APP_USER',
        pwd: '$APP_PW',
        roles: [{ role: 'readWrite', db: '$DB' }],
      });
      print('user created');
    }
  "

URI="mongodb://$APP_USER:$APP_PW@127.0.0.1:27017/$DB?authSource=$DB"

touch "$ENV_FILE"
chmod 600 "$ENV_FILE"
if grep -q '^MONGODB_URI=' "$ENV_FILE"; then
  # The URI can contain / and &, so use a delimiter it cannot contain.
  python3 - "$ENV_FILE" "$URI" <<'PY'
import sys
path, uri = sys.argv[1], sys.argv[2]
lines = open(path).read().splitlines(True)
out = [f'MONGODB_URI={uri}\n' if l.startswith('MONGODB_URI=') else l for l in lines]
open(path, 'w').write(''.join(out))
PY
else
  printf 'MONGODB_URI=%s\n' "$URI" >> "$ENV_FILE"
fi

echo "MONGODB_URI written to $ENV_FILE"
