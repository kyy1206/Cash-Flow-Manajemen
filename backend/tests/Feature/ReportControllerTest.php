<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReportControllerTest extends TestCase
{
    use LazilyRefreshDatabase;

    public function test_report_returns_business_cash_flow_category_and_daily_expenses(): void
    {
        $user = User::factory()->create();
        $category = $user->categories()->create(['name' => 'Makan']);
        $plan = $user->monthlyPlans()->create([
            'month' => 10,
            'year' => 2026,
            'total_budget' => 500000,
        ]);
        $budget = $plan->budgets()->create(['category_id' => $category->id, 'amount' => 400000]);
        $user->transactions()->create([
            'budget_id' => $budget->id,
            'amount' => 120000,
            'date' => '2026-10-15',
            'status' => 'completed',
        ]);
        $user->transactions()->create([
            'amount' => 30000,
            'date' => '2026-10-15',
            'status' => 'completed',
        ]);
        $user->transactions()->create([
            'amount' => 90000,
            'date' => '2026-10-16',
            'status' => 'pending',
            'financial_status' => 'draft',
        ]);
        Sanctum::actingAs($user);

        $this->getJson('/api/reports?year=2026&month=10')->assertOk()
            ->assertJsonPath('data.summary.year_total', 150000)
            ->assertJsonPath('data.summary.selected_month_total', 150000)
            ->assertJsonPath('data.summary.selected_month_budget', 500000)
            ->assertJsonPath('data.summary.budget_variance', 350000)
            ->assertJsonCount(12, 'data.monthly_spending')
            ->assertJsonPath('data.category_spending.0.category', 'Makan')
            ->assertJsonPath('data.category_spending.1.category', 'Tanpa kategori')
            ->assertJsonCount(1, 'data.daily_spending');
    }

    public function test_report_includes_all_business_users_transactions_for_supervisors(): void
    {
        $owner = User::factory()->create();
        $supervisor = User::factory()->create(['role' => 'supervisor']);
        $staff = User::factory()->create(['role' => 'staff']);
        $owner->transactions()->create([
            'amount' => 100000,
            'date' => '2026-10-15',
            'status' => 'completed',
        ]);
        $staff->transactions()->create([
            'amount' => 50000,
            'date' => '2026-10-16',
            'status' => 'completed',
        ]);
        Sanctum::actingAs($supervisor);

        $this->getJson('/api/reports?year=2026&month=10')->assertOk()
            ->assertJsonPath('data.scope', 'business')
            ->assertJsonPath('data.summary.year_total', 150000)
            ->assertJsonPath('data.summary.selected_month_total', 150000);
    }

    public function test_staff_report_contains_only_their_own_transactions(): void
    {
        $owner = User::factory()->create();
        $staff = User::factory()->create(['role' => 'staff']);
        $owner->transactions()->create([
            'amount' => 100000,
            'date' => '2026-10-15',
            'status' => 'completed',
        ]);
        $staff->transactions()->create([
            'amount' => 25000,
            'date' => '2026-10-16',
            'status' => 'completed',
        ]);
        Sanctum::actingAs($staff);

        $this->getJson('/api/reports?year=2026&month=10')->assertOk()
            ->assertJsonPath('data.scope', 'own_activity')
            ->assertJsonPath('data.summary.year_total', 25000)
            ->assertJsonPath('data.summary.selected_month_total', 25000);
    }

    public function test_report_rejects_invalid_month_and_year(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/reports?year=1999&month=13')->assertUnprocessable()
            ->assertJsonValidationErrors(['year', 'month']);
    }
}
