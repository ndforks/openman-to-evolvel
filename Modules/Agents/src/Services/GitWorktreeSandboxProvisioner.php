<?php

namespace Modules\Agents\Services;

use Illuminate\Support\Facades\Process;
use Illuminate\Support\Str;
use Modules\Agents\Contracts\ProvisionsSandboxes;
use Modules\Agents\Data\SandboxStatus;
use Modules\Agents\Models\Sandbox;
use RuntimeException;
use Throwable;

class GitWorktreeSandboxProvisioner implements ProvisionsSandboxes
{
    public function __construct(
        private readonly string $worktreesBasePath,
    ) {}

    public function provision(int $taskId, string $repositoryPath): Sandbox
    {
        $branch = 'evolvel/task-'.$taskId.'-'.Str::random(6);
        $worktreePath = rtrim($this->worktreesBasePath, '/').'/'.$branch;

        $sandbox = Sandbox::create([
            'task_id' => $taskId,
            'repository_path' => $repositoryPath,
            'worktree_path' => $worktreePath,
            'branch' => $branch,
            'status' => SandboxStatus::Provisioning,
        ]);

        try {
            $result = Process::path($repositoryPath)
                ->run(['git', 'worktree', 'add', '-b', $branch, $worktreePath]);
        } catch (Throwable $exception) {
            $sandbox->update(['status' => SandboxStatus::Failed]);

            throw new RuntimeException(
                "Failed to provision a sandbox for task #{$taskId}: {$exception->getMessage()}",
                previous: $exception,
            );
        }

        if ($result->failed()) {
            $sandbox->update(['status' => SandboxStatus::Failed]);

            throw new RuntimeException(
                "Failed to provision a sandbox for task #{$taskId}: {$result->errorOutput()}"
            );
        }

        $sandbox->update(['status' => SandboxStatus::Ready]);

        return $sandbox->refresh();
    }

    public function destroy(Sandbox $sandbox): void
    {
        Process::path($sandbox->repository_path)
            ->run(['git', 'worktree', 'remove', '--force', $sandbox->worktree_path]);

        $sandbox->update(['status' => SandboxStatus::Destroyed]);
    }
}
