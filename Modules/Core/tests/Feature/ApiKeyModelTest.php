<?php

namespace Modules\Core\Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Core\Models\ApiKey;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class ApiKeyModelTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function it_reports_a_fresh_key_as_not_revoked(): void
    {
        /* Arrange */
        $apiKey = ApiKey::factory()->create();

        /* Act */
        $isRevoked = $apiKey->isRevoked();

        /* Assert */
        $this->assertFalse($isRevoked);
    }

    #[Test]
    public function it_reports_a_revoked_key_as_revoked(): void
    {
        /* Arrange */
        $apiKey = ApiKey::factory()->revoked()->create();

        /* Act */
        $isRevoked = $apiKey->isRevoked();

        /* Assert */
        $this->assertTrue($isRevoked);
    }

    #[Test]
    public function it_belongs_to_the_user_it_was_issued_to(): void
    {
        /* Arrange */
        $user = User::factory()->create();
        $apiKey = ApiKey::factory()->for($user)->create();

        /* Act */
        $resolvedUser = $apiKey->user;

        /* Assert */
        $this->assertTrue($resolvedUser->is($user));
    }

    #[Test]
    public function it_casts_abilities_to_an_array(): void
    {
        /* Arrange */
        $apiKey = ApiKey::factory()->create(['abilities' => ['tasks:read', 'tasks:write']]);

        /* Act */
        $fresh = $apiKey->refresh();

        /* Assert */
        $this->assertSame(['tasks:read', 'tasks:write'], $fresh->abilities);
    }

    #[Test]
    public function it_never_exposes_the_hash_when_serialized(): void
    {
        /* Arrange */
        $apiKey = ApiKey::factory()->create();

        /* Act */
        $array = $apiKey->toArray();

        /* Assert */
        $this->assertArrayNotHasKey('hash', $array);
    }
}
