<?php

namespace Modules\Agents\Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Modules\Agents\Data\SandboxStatus;
use Modules\Agents\Services\GitWorktreeSandboxProvisioner;
use PHPUnit\Framework\Attributes\Test;
use RuntimeException;
use Tests\Support\CatchesThrowables;
use Tests\TestCase;

class GitWorktreeSandboxProvisionerTest extends TestCase
{
    use CatchesThrowables;
    use RefreshDatabase;

    private string $repositoryPath;

    private string $worktreesBasePath;

    protected function setUp(): void
    {
        parent::setUp();

        $this->repositoryPath = storage_path('framework/testing/sandbox-repo-'.uniqid());
        $this->worktreesBasePath = storage_path('framework/testing/sandbox-worktrees-'.uniqid());

        File::makeDirectory($this->repositoryPath, 0755, true);
        File::makeDirectory($this->worktreesBasePath, 0755, true);

        // A real, minimal git repository with one commit — worktrees cannot
        // be added to a repo with no commits.
        Process::path($this->repositoryPath)->run('git init -q');
        Process::path($this->repositoryPath)->run('git config user.email test@example.com');
        Process::path($this->repositoryPath)->run('git config user.name "Test"');
        File::put($this->repositoryPath.'/README.md', '# example');
        Process::path($this->repositoryPath)->run('git add README.md');
        Process::path($this->repositoryPath)->run('git commit -q -m "initial commit"');
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->repositoryPath);
        File::deleteDirectory($this->worktreesBasePath);

        parent::tearDown();
    }

    #[Test]
    public function it_creates_a_real_git_worktree_on_its_own_branch(): void
    {
        /* Arrange */
        $provisioner = new GitWorktreeSandboxProvisioner($this->worktreesBasePath);

        /* Act */
        $sandbox = $provisioner->provision(taskId: 42, repositoryPath: $this->repositoryPath);

        /* Assert */
        $this->assertSame(SandboxStatus::Ready, $sandbox->status);
        $this->assertDirectoryExists($sandbox->worktree_path);
        $this->assertFileExists($sandbox->worktree_path.'/README.md');
        $branches = Process::path($this->repositoryPath)->run('git branch --list '.$sandbox->branch)->output();
        $this->assertStringContainsString($sandbox->branch, $branches);
    }

    #[Test]
    public function it_marks_the_sandbox_failed_when_the_repository_path_does_not_exist(): void
    {
        /* Arrange */
        $provisioner = new GitWorktreeSandboxProvisioner($this->worktreesBasePath);

        /* Act */
        $thrown = $this->catchThrowable(
            fn () => $provisioner->provision(taskId: 7, repositoryPath: '/does/not/exist')
        );

        /* Assert */
        $this->assertInstanceOf(RuntimeException::class, $thrown);
        $this->assertDatabaseHas('sandboxes', ['task_id' => 7, 'status' => 'failed']);
    }

    #[Test]
    public function it_removes_the_worktree_on_disk_when_destroyed(): void
    {
        /* Arrange */
        $provisioner = new GitWorktreeSandboxProvisioner($this->worktreesBasePath);
        $sandbox = $provisioner->provision(taskId: 9, repositoryPath: $this->repositoryPath);

        /* Act */
        $provisioner->destroy($sandbox);

        /* Assert */
        $this->assertDirectoryDoesNotExist($sandbox->worktree_path);
        $this->assertDatabaseHas('sandboxes', ['id' => $sandbox->id, 'status' => 'destroyed']);
    }

    #[Test]
    public function it_gives_each_provisioned_sandbox_its_own_branch_name(): void
    {
        /* Arrange */
        $provisioner = new GitWorktreeSandboxProvisioner($this->worktreesBasePath);

        /* Act */
        $first = $provisioner->provision(taskId: 101, repositoryPath: $this->repositoryPath);
        $second = $provisioner->provision(taskId: 102, repositoryPath: $this->repositoryPath);

        /* Assert */
        $this->assertNotSame($first->branch, $second->branch);
        $this->assertStringContainsString('task-101', $first->branch);
        $this->assertStringContainsString('task-102', $second->branch);
    }

    #[Test]
    public function it_leaves_the_repositorys_own_working_copy_untouched(): void
    {
        /* Arrange */
        $provisioner = new GitWorktreeSandboxProvisioner($this->worktreesBasePath);

        /* Act */
        $provisioner->provision(taskId: 200, repositoryPath: $this->repositoryPath);

        /* Assert */
        $currentBranch = trim(Process::path($this->repositoryPath)->run('git rev-parse --abbrev-ref HEAD')->output());
        $this->assertNotSame('evolvel/task-200', $currentBranch);
        $this->assertFileExists($this->repositoryPath.'/README.md');
    }
}
