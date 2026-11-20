<?php

namespace Modules\Tasks\Contracts;

use App\Models\User;
use Modules\Tasks\Data\TaskStatus;
use Modules\Tasks\Models\Task;
use Modules\Tasks\Models\TaskEvent;

interface TracksTasks
{
    public function start(User $user, string $title, string $instructions): Task;

    /**
     * Append the next event in the task's timeline. Sequence numbers are
     * assigned here, never by the caller, so a reconnecting browser can
     * always replay from a gap-free sequence (docs/ARCHITECTURE.md).
     */
    public function recordEvent(Task $task, string $type, array $data): TaskEvent;

    public function transition(Task $task, TaskStatus $status): Task;
}
