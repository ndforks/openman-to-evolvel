<?php

namespace Modules\Tasks\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use LogicException;
use Modules\Tasks\Contracts\TracksTasks;
use Modules\Tasks\Data\TaskStatus;
use Modules\Tasks\Models\Task;
use Modules\Tasks\Models\TaskEvent;

class TaskService implements TracksTasks
{
    public function start(User $user, string $title, string $instructions): Task
    {
        return Task::create([
            'user_id' => $user->id,
            'title' => $title,
            'instructions' => $instructions,
            'status' => TaskStatus::Queued,
        ]);
    }

    public function recordEvent(Task $task, string $type, array $data): TaskEvent
    {
        return DB::transaction(function () use ($task, $type, $data) {
            // Lock the task row so two concurrent events for it can never be
            // assigned the same sequence number.
            $locked = Task::query()->lockForUpdate()->find($task->id);

            $nextSequence = (int) ($locked->events()->max('sequence') ?? 0) + 1;

            return $locked->events()->create([
                'type' => $type,
                'data' => $data,
                'sequence' => $nextSequence,
            ]);
        });
    }

    public function transition(Task $task, TaskStatus $status): Task
    {
        if ($task->status->isTerminal()) {
            throw new LogicException(
                "Task #{$task->id} is already {$task->status->value} and cannot move to {$status->value}."
            );
        }

        $attributes = ['status' => $status];

        if ($status === TaskStatus::Running && $task->started_at === null) {
            $attributes['started_at'] = now();
        }

        if ($status->isTerminal()) {
            $attributes['completed_at'] = now();
        }

        $task->update($attributes);

        return $task->refresh();
    }
}
