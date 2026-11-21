#!/usr/bin/env bash
# Same stand-in as fake-opencode.sh, but exits immediately — used to test
# that stopping an already-finished run is a safe no-op.
printf '%s\n' "$@" > received-args.txt
exit 0
