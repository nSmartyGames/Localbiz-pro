#!/bin/bash
# Double-click this (or let it run automatically via a Login Item) to start
# the Douglas scrape bridge that the Sync dashboard talks to at
# http://localhost:5391. Runs in a real Terminal window on purpose — a
# background launchd job spawned outside Terminal gets silently blocked by
# macOS from reading files under ~/Documents (TCC), while a normal Terminal
# window already has that access.
cd "$(dirname "$0")"
if lsof -nP -iTCP:5391 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Douglas bridge already running on :5391."
  sleep 2
  exit 0
fi
npm run bridge
