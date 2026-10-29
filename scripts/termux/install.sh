#!/bin/sh
set -eu
pkg update -y
pkg install -y nodejs git
node -v
major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$major" -lt 22 ]; then
  printf '%s\n' 'Erro: o Host precisa de Node 22 ou superior (node:sqlite). Atualize o Termux/Node e tente novamente.' >&2
  exit 1
fi
corepack enable
# URL must be supplied explicitly; never embed credentials in it.
repo_dir=${AEROBOT_REPO_DIR:-"$HOME/Bot-Clan-MLBB"}
if [ -d "$repo_dir/.git" ]; then
  git -C "$repo_dir" pull --ff-only
else
  : "${AEROBOT_REPO_URL:?Defina AEROBOT_REPO_URL com a URL pública do repositório}"
  git clone -- "$AEROBOT_REPO_URL" "$repo_dir"
fi
cd "$repo_dir"
CI=true corepack pnpm install --frozen-lockfile
CI=true corepack pnpm build
