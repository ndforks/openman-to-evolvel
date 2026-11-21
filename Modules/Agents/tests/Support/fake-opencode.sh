#!/usr/bin/env bash
# A stand-in for the real `opencode` CLI, used only by tests. It records the
# arguments it was called with (so a test can assert the adapter built the
# right command line) and then behaves like a long-running agent run until
# it is asked to stop.
#
# `exec sleep 30` replaces this bash process with `sleep` itself (same PID,
# no child process left behind) so that sending the PID SIGTERM terminates
# the "run" immediately via sleep's default signal handling — the same
# single-process shape the real opencode CLI has, and the shape the
# adapter's stop() is written against.
printf '%s\n' "$@" > received-args.txt
exec sleep 30
