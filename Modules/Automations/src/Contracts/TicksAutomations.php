<?php

namespace Modules\Automations\Contracts;

interface TicksAutomations
{
    /**
     * Fire every automation whose `next_run_at` has passed, queue a run for
     * each, and advance its `next_run_at` from its cron expression. Safe to
     * call concurrently (OpenMan's `scripts/worker.mjs` requirement: "ticks
     * are safe to run concurrently") — each automation is locked before it
     * is fired, so two overlapping ticks can never queue the same run twice.
     *
     * @return int how many automations fired this tick
     */
    public function tick(): int;
}
