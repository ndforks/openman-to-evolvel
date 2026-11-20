<?php

namespace Modules\Core\Tests\Feature;

use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Core\Models\Setting;
use PHPUnit\Framework\Attributes\Test;
use Tests\Support\CatchesThrowables;
use Tests\TestCase;

class SettingTest extends TestCase
{
    use CatchesThrowables;
    use RefreshDatabase;

    #[Test]
    public function it_rejects_a_duplicate_key_for_the_same_user(): void
    {
        /* Arrange */
        $user = User::factory()->create();
        Setting::factory()->for($user)->create(['key' => 'theme']);

        /* Act */
        $thrown = $this->catchThrowable(
            fn () => Setting::factory()->for($user)->create(['key' => 'theme'])
        );

        /* Assert */
        $this->assertInstanceOf(QueryException::class, $thrown);
        $this->assertDatabaseCount('settings', 1);
    }

    #[Test]
    public function it_allows_the_same_key_for_two_different_users(): void
    {
        /* Arrange */
        $first = User::factory()->create();
        $second = User::factory()->create();
        Setting::factory()->for($first)->create(['key' => 'theme', 'value' => ['mode' => 'dark']]);

        /* Act */
        $setting = Setting::factory()->for($second)->create(['key' => 'theme', 'value' => ['mode' => 'light']]);

        /* Assert */
        $this->assertDatabaseCount('settings', 2);
        $this->assertSame('light', $setting->refresh()->value['mode']);
    }
}
