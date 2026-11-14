<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BusinessSettingControllerTest extends TestCase
{
    use LazilyRefreshDatabase;

    public function test_owner_setting_changes_are_audited_with_before_and_after_values(): void
    {
        $owner = User::factory()->create(['role' => 'owner']);
        $previousName = $owner->business()->value('business_name');
        Sanctum::actingAs($owner);

        $this->putJson('/api/business-settings', [
            'business_name' => 'Kopi Nusantara',
            'approval_threshold' => 500000,
        ])
            ->assertOk()
            ->assertJsonPath('data.business_name', 'Kopi Nusantara')
            ->assertJsonPath('data.approval_threshold', '500000.00');

        $this->assertDatabaseHas('audit_logs', [
            'business_id' => $owner->business_id,
            'user_id' => $owner->id,
            'action' => 'business_setting.updated',
            'auditable_id' => $owner->business_id,
            'ip_address' => '127.0.0.1',
        ]);
        $this->assertDatabaseCount('audit_logs', 1);

        $this->putJson('/api/business-settings', [
            'business_name' => 'Kopi Nusantara',
            'approval_threshold' => 500000,
        ])->assertOk();

        $this->assertDatabaseCount('audit_logs', 1);
        $this->getJson('/api/audit-logs')
            ->assertOk()
            ->assertJsonPath('data.data.0.action', 'business_setting.updated')
            ->assertJsonPath('data.data.0.old_values.business_name', $previousName)
            ->assertJsonPath('data.data.0.new_values.approval_threshold', '500000.00');
    }

    public function test_non_owner_cannot_update_business_approval_settings(): void
    {
        $staff = User::factory()->create(['role' => 'staff']);
        Sanctum::actingAs($staff);

        $this->putJson('/api/business-settings', ['approval_threshold' => 100000])->assertForbidden();
    }
}
