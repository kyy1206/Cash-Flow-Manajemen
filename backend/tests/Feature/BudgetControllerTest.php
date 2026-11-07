<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BudgetControllerTest extends TestCase
{
    use LazilyRefreshDatabase;

    public function test_category_budget_is_created_and_persisted(): void
    {
        $user = User::factory()->create();
        $category = $user->categories()->create(['name' => 'Transportasi']);
        $plan = $user->monthlyPlans()->create([
            'month' => 10,
            'year' => 2026,
            'total_budget' => 500000,
        ]);
        Sanctum::actingAs($user);

        $this->postJson('/api/budgets', [
            'monthly_plan_id' => $plan->id,
            'category_id' => $category->id,
            'amount' => 200000,
        ])->assertCreated()
            ->assertJsonPath('data.amount', '200000.00');

        $this->assertDatabaseHas('budgets', [
            'monthly_plan_id' => $plan->id,
            'category_id' => $category->id,
            'amount' => 200000,
        ]);
    }

    public function test_category_budget_cannot_exceed_the_monthly_plan_total(): void
    {
        $user = User::factory()->create();
        $category = $user->categories()->create(['name' => 'Makan']);
        $plan = $user->monthlyPlans()->create([
            'month' => 10,
            'year' => 2026,
            'total_budget' => 100000,
        ]);
        Sanctum::actingAs($user);

        $this->postJson('/api/budgets', [
            'monthly_plan_id' => $plan->id,
            'category_id' => $category->id,
            'amount' => 100001,
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('amount');

        $this->assertDatabaseCount('budgets', 0);
    }

    public function test_staff_cannot_change_the_shared_business_budget(): void
    {
        $owner = User::factory()->create();
        $otherUser = User::factory()->create(['role' => 'staff']);
        $category = $owner->categories()->create(['name' => 'Makan']);
        $plan = $owner->monthlyPlans()->create([
            'month' => 10,
            'year' => 2026,
            'total_budget' => 100000,
        ]);
        $budget = $plan->budgets()->create(['category_id' => $category->id, 'amount' => 50000]);
        Sanctum::actingAs($otherUser);

        $this->putJson("/api/budgets/{$budget->id}", ['amount' => 40000])->assertForbidden();
    }

    public function test_staff_cannot_monitor_the_shared_business_budget(): void
    {
        $owner = User::factory()->create();
        $otherUser = User::factory()->create(['role' => 'staff']);
        $category = $owner->categories()->create(['name' => 'Makan']);
        $plan = $owner->monthlyPlans()->create([
            'month' => 10,
            'year' => 2026,
            'total_budget' => 100000,
        ]);
        $plan->budgets()->create(['category_id' => $category->id, 'amount' => 50000]);
        Sanctum::actingAs($otherUser);

        $this->getJson("/api/budgets?monthly_plan_id={$plan->id}")->assertForbidden();
    }

    public function test_supervisor_can_monitor_but_cannot_change_the_shared_business_budget(): void
    {
        $owner = User::factory()->create();
        $supervisor = User::factory()->create(['role' => 'supervisor']);
        $category = $owner->categories()->create(['name' => 'Makan']);
        $plan = $owner->monthlyPlans()->create([
            'month' => 10,
            'year' => 2026,
            'total_budget' => 100000,
        ]);
        $budget = $plan->budgets()->create(['category_id' => $category->id, 'amount' => 50000]);
        Sanctum::actingAs($supervisor);

        $this->getJson("/api/budgets?monthly_plan_id={$plan->id}")->assertOk()
            ->assertJsonPath('data.0.amount', '50000.00');
        $this->putJson("/api/budgets/{$budget->id}", ['amount' => 40000])->assertForbidden();
    }

    public function test_budget_amount_rejects_more_than_two_decimal_places(): void
    {
        $user = User::factory()->create();
        $category = $user->categories()->create(['name' => 'Makan']);
        $plan = $user->monthlyPlans()->create([
            'month' => 10,
            'year' => 2026,
            'total_budget' => 100000,
        ]);
        Sanctum::actingAs($user);

        $this->postJson('/api/budgets', [
            'monthly_plan_id' => $plan->id,
            'category_id' => $category->id,
            'amount' => 10.001,
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('amount');

        $this->assertDatabaseCount('budgets', 0);
    }
}
