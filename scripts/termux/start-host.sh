#!/bin/sh
set -eu
# Disable tracing before loading secrets, even when invoked with sh -x.
set +x
umask 077
repo_dir=$(CDPATH='' cd -P "$(dirname "$0")/../.." && pwd -P)
export AEROBOT_SESSION_DIR="$HOME/aerobot-sessao"
export AEROBOT_CONTROL_PORT=8787
export AEROBOT_CONTROL_HOST=127.0.0.1
mkdir -p "$AEROBOT_SESSION_DIR"
chmod 700 "$AEROBOT_SESSION_DIR"
session_dir=$(CDPATH='' cd -P "$AEROBOT_SESSION_DIR" && pwd -P)
case "$session_dir/" in
  "$repo_dir/"*) printf '%s\n' 'Erro: a sessão e a senha devem ficar fora do repositório.' >&2; exit 1 ;;
esac
password_file="$AEROBOT_SESSION_DIR/senha-admin.txt"
if [ ! -f "$password_file" ] || [ -L "$password_file" ]; then
  printf '%s\n' 'Crie um arquivo privado em $HOME/aerobot-sessao/senha-admin.txt antes de iniciar.' >&2
  exit 1
fi
chmod 600 "$password_file"
AEROBOT_ADMIN_PASSWORD=$(cat "$password_file")
if [ -z "$AEROBOT_ADMIN_PASSWORD" ]; then
  printf '%s\n' 'Erro: o arquivo de senha está vazio.' >&2
  exit 1
fi
export AEROBOT_ADMIN_PASSWORD
termux-wake-lock
child_pid=''
stopping=0
cleanup() {
  stopping=1
  if [ -n "$child_pid" ]; then
    kill -TERM "$child_pid" 2>/dev/null || :
    wait "$child_pid" || :
    child_pid=''
  fi
  termux-wake-unlock || :
}
trap cleanup 0
trap 'cleanup; exit 0' INT TERM
cd "$repo_dir"
# Five restarts per invocation, ten seconds apart; intentional clean exit does not restart.
restarts=0
while [ "$stopping" -eq 0 ]; do
  node packages/whatsapp-baileys/dist/run.js &
  child_pid=$!
  result=0
  wait "$child_pid" || result=$?
  child_pid=''
  [ "$result" -eq 0 ] && break
  if [ "$restarts" -ge 5 ]; then
    printf '%s\n' 'Limite de cinco reinícios atingido. Verifique o Host antes de iniciar novamente.' >&2
    exit "$result"
  fi
  restarts=$((restarts + 1))
  printf 'Host interrompido. Reinício %s/5 em 10 segundos.\n' "$restarts" >&2
  sleep 10
done
