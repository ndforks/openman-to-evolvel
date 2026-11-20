<?php

namespace Modules\Core\Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Core\Models\Setting;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class SettingModelTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function it_casts_its_value_to_an_array(): void
    {
        /* Arrange */
        $setting = Setting::factory()->create(['key' => 'notifications', 'value' => ['email' => false]]);

        /* Act */
        $fresh = $setting->refresh();

        /* Assert */
        $this->assertSame(['email' => false], $fresh->value);
    }

    #[Test]
    public function it_belongs_to_the_user_it_was_set_for(): void
    {
        /* Arrange */
        $user = User::factory()->create();
        $setting = Setting::factory()->for($user)->create();

        /* Act */
        $resolvedUser = $setting->user;

        /* Assert */
        $this->assertTrue($resolvedUser->is($user));
    }
}
