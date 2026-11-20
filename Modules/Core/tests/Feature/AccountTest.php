<?php

namespace Modules\Core\Tests\Feature;

use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Core\Models\Account;
use PHPUnit\Framework\Attributes\Test;
use Tests\Support\CatchesThrowables;
use Tests\TestCase;

class AccountTest extends TestCase
{
    use CatchesThrowables;
    use RefreshDatabase;

    #[Test]
    public function it_belongs_to_the_user_it_was_created_for(): void
    {
        /* Arrange */
        $user = User::factory()->create();
        $account = Account::factory()->for($user)->create();

        /* Act */
        $resolvedUser = $account->user;

        /* Assert */
        $this->assertTrue($resolvedUser->is($user));
    }

    #[Test]
    public function it_defaults_a_new_account_to_the_free_plan(): void
    {
        /* Arrange */
        $user = User::factory()->create();

        /* Act */
        $account = Account::factory()->for($user)->create();

        /* Assert */
        $this->assertSame('free', $account->plan);
    }

    #[Test]
    public function it_refuses_a_second_account_for_the_same_user(): void
    {
        /* Arrange */
        $user = User::factory()->create();
        Account::factory()->for($user)->create();

        /* Act */
        $thrown = $this->catchThrowable(fn () => Account::factory()->for($user)->create());

        /* Assert */
        $this->assertInstanceOf(QueryException::class, $thrown);
        $this->assertDatabaseCount('accounts', 1);
    }

    #[Test]
    public function it_never_exposes_the_sealed_credential_when_serialized(): void
    {
        /* Arrange */
        $account = Account::factory()->create(['sealed_credential' => encrypt('super-secret-token')]);

        /* Act */
        $array = $account->toArray();

        /* Assert */
        $this->assertArrayNotHasKey('sealed_credential', $array);
    }
}
