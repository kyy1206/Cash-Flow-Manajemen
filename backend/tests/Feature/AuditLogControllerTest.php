<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AuditLogControllerTest extends TestCase
{
    use LazilyRefreshDatabase;

    public function test_owner_can_filter_business_audit_logs_and_receive_real_summaries(): void
    {
        $owner = User::factory()->create(['role' => 'owner']);
        $staff = User::factory()->create(['role' => 'staff', 'business_id' => $owner->business_id]);
        $otherOwner = User::factory()->create(['role' => 'owner']);

        Sanctum::actingAs($owner);
        AuditLog::create([
            'user_id' => $staff->id,
            'action' => 'expense_request.paid',
            'description' => 'Pengajuan bahan baku dibayar',
            'ip_address' => '192.0.2.10',
            'created_at' => now()->subDays(3),
        ]);
        AuditLog::create([
            'user_id' => $owner->id,
            'action' => 'transaction.reversed',
            'description' => 'Koreksi transaksi',
            'created_at' => now(),
        ]);

        Sanctum::actingAs($otherOwner);
        AuditLog::create([
            'user_id' => $otherOwner->id,
            'action' => 'wallet.created',
            'description' => 'Sumber dana dibuat',
        ]);

        Sanctum::actingAs($owner);
        $this->getJson('/api/audit-logs?search=Pengajuan&action=expense_request.paid&date_from='
            .now()->subDays(7)->toDateString().'&date_to='.now()->toDateString())
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.data.0.user.id', $staff->id)
            ->assertJsonPath('summary.total_count', 2)
            ->assertJsonPath('summary.last_30_days', 2)
            ->assertJsonPath('summary.actors_last_30_days', 2);
    }

    public function test_non_owner_cannot_view_or_export_audit_logs(): void
    {
        $staff = User::factory()->create(['role' => 'staff']);
        Sanctum::actingAs($staff);

        $this->getJson('/api/audit-logs')->assertForbidden();
        $this->get('/api/audit-logs/export?format=csv')->assertForbidden();
    }

    public function test_audit_exports_are_filtered_and_csv_text_is_safe_for_spreadsheets(): void
    {
        $owner = User::factory()->create(['role' => 'owner']);
        Sanctum::actingAs($owner);
        AuditLog::create([
            'user_id' => $owner->id,
            'action' => 'user.updated',
            'description' => '=HYPERLINK("https://example.test")',
            'new_values' => ['role' => 'staff'],
        ]);
        AuditLog::create([
            'user_id' => $owner->id,
            'action' => 'wallet.created',
            'description' => 'Sumber dana dibuat',
        ]);

        $csv = $this->get('/api/audit-logs/export?format=csv&action=user.updated')
            ->assertOk()
            ->streamedContent();

        $this->assertStringContainsString("'=HYPERLINK", $csv);
        $this->assertStringNotContainsString('Sumber dana dibuat', $csv);

        $json = $this->get('/api/audit-logs/export?format=json&action=user.updated')
            ->assertOk()
            ->streamedContent();
        $this->assertSame('user.updated', json_decode($json, true, flags: JSON_THROW_ON_ERROR)[0]['action']);
    }
}
