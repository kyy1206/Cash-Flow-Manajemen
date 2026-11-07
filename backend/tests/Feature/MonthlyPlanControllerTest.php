<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MonthlyPlanControllerTest extends TestCase
{
    use LazilyRefreshDatabase;

    public function test_unauthenticated_requests_receive_401(): void
    {
        $this->getJson('/api/monthly-plans')->assertUnauthorized();
    }

    public function test_monthly_plan_is_created_and_updated_for_the_same_period(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/monthly-plans', [
            'month' => 10,
            'year' => 2026,
            'total_budget' => 3000000,
        ])->assertCreated()
            ->assertJsonPath('data.total_budget', '3000000.00');

        $this->postJson('/api/monthly-plans', [
            'month' => 10,
            'year' => 2026,
            'total_budget' => 3500000,
        ])->assertOk()
            ->assertJsonPath('data.total_budget', '3500000.00');

        $this->assertDatabaseCount('monthly_plans', 1);
        $this->assertDatabaseHas('monthly_plans', [
            'user_id' => $user->id,
            'month' => 10,
            'year' => 2026,
            'total_budget' => 3500000,
        ]);
    }

    public function test_staff_cannot_read_the_shared_business_monthly_plan(): void
    {
        $owner = User::factory()->create();
        $otherUser = User::factory()->create(['role' => 'staff']);
        $plan = $owner->monthlyPlans()->create([
            'month' => 10,
            'year' => 2026,
            'total_budget' => 1000000,
        ]);
        Sanctum::actingAs($otherUser);

        $this->getJson("/api/monthly-plans/{$plan->id}")->assertForbidden();
    }

    public function test_plan_target_cannot_be_lowered_below_category_allocations(): void
    {
        $user = User::factory()->create();
        $category = $user->categories()->create(['name' => 'Makan']);
        $plan = $user->monthlyPlans()->create([
            'month' => 10,
            'year' => 2026,
            'total_budget' => 1000000,
        ]);
        $plan->budgets()->create(['category_id' => $category->id, 'amount' => 800000]);
        Sanctum::actingAs($user);

        $this->putJson("/api/monthly-plans/{$plan->id}", [
            'total_budget' => 700000,
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('total_budget');

        $this->assertDatabaseHas('monthly_plans', [
            'id' => $plan->id,
            'total_budget' => 1000000,
        ]);
    }

    public function test_monthly_target_rejects_more_than_two_decimal_places(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/monthly-plans', [
            'month' => 10,
            'year' => 2026,
            'total_budget' => 10.001,
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('total_budget');

        $this->assertDatabaseCount('monthly_plans', 0);
    }
}
