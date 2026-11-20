<?php

namespace Modules\Core\Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Core\Contracts\IssuesApiKeys;
use Modules\Core\Models\ApiKey;
use PHPUnit\Framework\Attributes\Test;
use Tests\Support\CatchesThrowables;
use Tests\TestCase;

class ApiKeyServiceTest extends TestCase
{
    use CatchesThrowables;
    use RefreshDatabase;

    #[Test]
    public function it_issues_a_key_whose_plaintext_is_never_persisted(): void
    {
        /* Arrange */
        $user = User::factory()->create();
        $service = $this->app->make(IssuesApiKeys::class);

        /* Act */
        $issued = $service->issue($user, 'CI token');

        /* Assert */
        $this->assertDatabaseHas('api_keys', [
            'user_id' => $user->id,
            'name' => 'CI token',
            'hash' => hash('sha256', $issued->plaintextToken),
        ]);
        $this->assertDatabaseMissing('api_keys', [
            'hash' => $issued->plaintextToken,
        ]);
    }

    #[Test]
    public function it_resolves_a_presented_token_back_to_its_key(): void
    {
        /* Arrange */
        $user = User::factory()->create();
        $service = $this->app->make(IssuesApiKeys::class);
        $issued = $service->issue($user, 'resolvable token');

        /* Act */
        $resolved = $service->resolve($issued->plaintextToken);

        /* Assert */
        $this->assertNotNull($resolved);
        $this->assertSame($issued->apiKey->id, $resolved->id);
    }

    #[Test]
    public function it_refuses_a_token_that_does_not_match_any_key(): void
    {
        /* Arrange */
        $service = $this->app->make(IssuesApiKeys::class);

        /* Act */
        $resolved = $service->resolve('ev_not-a-real-token');

        /* Assert */
        $this->assertNull($resolved);
    }

    #[Test]
    public function it_refuses_a_revoked_key_even_with_the_right_token(): void
    {
        /* Arrange */
        $user = User::factory()->create();
        $service = $this->app->make(IssuesApiKeys::class);
        $issued = $service->issue($user, 'about to be revoked');

        /* Act */
        $service->revoke($issued->apiKey);
        $resolved = $service->resolve($issued->plaintextToken);

        /* Assert */
        $this->assertNull($resolved);
        $this->assertDatabaseHas('api_keys', [
            'id' => $issued->apiKey->id,
        ]);
        $this->assertNotNull(ApiKey::find($issued->apiKey->id)->revoked_at);
    }
}
