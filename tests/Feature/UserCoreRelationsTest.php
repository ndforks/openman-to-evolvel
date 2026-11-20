<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Core\Models\Account;
use Modules\Core\Models\ApiKey;
use Modules\Core\Models\Notification;
use Modules\Core\Models\Setting;
use Modules\Core\Models\Webhook;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The one place application code reaches into a module's models directly
 * (AGENTS.md): App\Models\User's relations into Modules\Core. Covered here,
 * at the application level, rather than inside the Core module itself.
 */
class UserCoreRelationsTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function it_resolves_the_users_account_through_the_account_relation(): void
    {
        /* Arrange */
        $user = User::factory()->create();
        $account = Account::factory()->for($user)->create();

        /* Act */
        $resolved = $user->account;

        /* Assert */
        $this->assertTrue($resolved->is($account));
    }

    #[Test]
    public function it_lists_only_this_users_api_keys(): void
    {
        /* Arrange */
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $ownKey = ApiKey::factory()->for($user)->create();
        ApiKey::factory()->for($otherUser)->create();

        /* Act */
        $keys = $user->apiKeys;

        /* Assert */
        $this->assertCount(1, $keys);
        $this->assertTrue($keys->first()->is($ownKey));
    }

    #[Test]
    public function it_lists_only_this_users_settings(): void
    {
        /* Arrange */
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        Setting::factory()->for($user)->create(['key' => 'theme']);
        Setting::factory()->for($otherUser)->create(['key' => 'theme']);

        /* Act */
        $settings = $user->settings;

        /* Assert */
        $this->assertCount(1, $settings);
        $this->assertSame($user->id, $settings->first()->user_id);
    }

    #[Test]
    public function it_lists_only_this_users_notifications(): void
    {
        /* Arrange */
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        Notification::factory()->for($user)->count(2)->create();
        Notification::factory()->for($otherUser)->create();

        /* Act */
        $notifications = $user->coreNotifications;

        /* Assert */
        $this->assertCount(2, $notifications);
    }

    #[Test]
    public function it_lists_only_this_users_webhooks(): void
    {
        /* Arrange */
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $ownWebhook = Webhook::factory()->for($user)->create();
        Webhook::factory()->for($otherUser)->create();

        /* Act */
        $webhooks = $user->webhooks;

        /* Assert */
        $this->assertCount(1, $webhooks);
        $this->assertTrue($webhooks->first()->is($ownWebhook));
    }

    #[Test]
    public function it_can_authenticate_an_api_request_with_a_sanctum_personal_access_token(): void
    {
        /* Arrange */
        $user = User::factory()->create();
        $token = $user->createToken('test-token')->plainTextToken;

        /* Act */
        $response = $this->withHeader('Authorization', "Bearer {$token}")->getJson('/api/user');

        /* Assert */
        $response->assertOk();
        $response->assertJsonPath('id', $user->id);
    }
}
