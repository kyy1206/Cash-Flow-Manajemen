<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DashboardControllerTest extends TestCase
{
    use LazilyRefreshDatabase;

    public function test_dashboard_returns_real_period_totals_budget_status_and_daily_limit(): void
    {
        $this->travelTo('2026-10-16 12:00:00');
        $user = User::factory()->create();
        $category = $user->categories()->create(['name' => 'Makan']);
        $plan = $user->monthlyPlans()->create([
            'month' => 10,
            'year' => 2026,
            'total_budget' => 3000000,
        ]);
        $budget = $plan->budgets()->create(['category_id' => $category->id, 'amount' => 1200000]);
        $user->transactions()->create([
            'budget_id' => $budget->id,
            'category_id' => $category->id,
            'amount' => 900000,
            'date' => '2026-10-15',
            'description' => 'Groceries',
            'status' => 'completed',
        ]);
        $user->transactions()->create([
            'amount' => 950000,
            'date' => '2026-10-16',
            'description' => 'Other expense',
            'status' => 'completed',
        ]);
        $user->transactions()->create([
            'amount' => 1000000,
            'date' => '2026-10-16',
            'description' => 'Pending expense',
            'status' => 'pending',
            'financial_status' => 'draft',
        ]);
        Sanctum::actingAs($user);

        $this->getJson('/api/dashboard')->assertOk()
            ->assertJsonPath('data.plan.total_budget', 3000000)
            ->assertJsonPath('data.summary.budget_total', 3000000)
            ->assertJsonPath('data.summary.spent_total', 1850000)
            ->assertJsonPath('data.summary.expense_today', 950000)
            ->assertJsonPath('data.summary.remaining', 1150000)
            ->assertJsonPath('data.summary.percentage', 61.7)
            ->assertJsonPath('data.summary.status', 'waspada')
            ->assertJsonPath('data.summary.daily_limit', 71875)
            ->assertJsonPath('data.budget_categories.0.spent', 900000)
            ->assertJsonPath('data.budget_categories.0.status', 'waspada')
            ->assertJsonCount(2, 'data.daily_spending');
    }

    public function test_supervisor_dashboard_includes_pending_request_total_and_preview(): void
    {
        $this->travelTo('2026-10-16 12:00:00');
        Storage::fake('local');
        $owner = User::factory()->create(['role' => 'owner']);
        $staff = User::factory()->create(['role' => 'staff']);
        $supervisor = User::factory()->create(['role' => 'supervisor']);
        $wallet = $owner->wallets()->create([
            'name' => 'Kas Tunai',
            'type' => 'cash',
            'opening_balance' => 100000,
        ]);
        $category = $owner->categories()->create(['name' => 'Bahan Baku', 'type' => 'expense']);

        Sanctum::actingAs($staff);
        $this->postJson('/api/expense-requests', [
            'wallet_id' => $wallet->id,
            'category_id' => $category->id,
            'amount' => 380000,
            'purpose' => 'Beli bahan baku',
            'attachment' => UploadedFile::fake()->create('bukti.pdf', 100, 'application/pdf'),
        ])->assertCreated();

        Sanctum::actingAs($supervisor);
        $this->getJson('/api/dashboard')->assertOk()
            ->assertJsonPath('data.summary.pending_requests', 1)
            ->assertJsonPath('data.summary.pending_requests_amount', 380000)
            ->assertJsonPath('data.pending_requests_preview.0.purpose', 'Beli bahan baku')
            ->assertJsonPath('data.pending_requests_preview.0.requester', $staff->name)
            ->assertJsonPath('data.pending_requests_preview.0.has_attachment', true);
    }

    public function test_dashboard_limits_staff_activity_totals_to_their_own_transactions(): void
    {
        $this->travelTo('2026-10-16 12:00:00');
        $owner = User::factory()->create();
        $otherUser = User::factory()->create(['role' => 'staff']);
        $owner->monthlyPlans()->create([
            'month' => 10,
            'year' => 2026,
            'total_budget' => 5000000,
        ]);
        $owner->transactions()->create([
            'amount' => 400000,
            'date' => '2026-10-16',
            'status' => 'completed',
        ]);
        $otherUser->transactions()->create([
            'amount' => 100000,
            'date' => '2026-10-16',
            'status' => 'completed',
        ]);
        Sanctum::actingAs($otherUser);

        $this->getJson('/api/dashboard')->assertOk()
            ->assertJsonPath('data.summary.budget_total', 5000000)
            ->assertJsonPath('data.summary.spent_total', 100000)
            ->assertJsonCount(1, 'data.recent_transactions')
            ->assertJsonPath('data.recent_transactions.0.amount', 100000);
    }

    public function test_dashboard_marks_spending_over_the_plan_as_overbudget(): void
    {
        $this->travelTo('2026-10-16 12:00:00');
        $user = User::factory()->create();
        $user->monthlyPlans()->create([
            'month' => 10,
            'year' => 2026,
            'total_budget' => 100000,
        ]);
        $user->transactions()->create([
            'amount' => 120000,
            'date' => '2026-10-16',
            'status' => 'completed',
        ]);
        Sanctum::actingAs($user);

        $this->getJson('/api/dashboard')->assertOk()
            ->assertJsonPath('data.summary.status', 'overbudget')
            ->assertJsonPath('data.summary.remaining', -20000)
            ->assertJsonPath('data.summary.daily_limit', 0);
    }
}
