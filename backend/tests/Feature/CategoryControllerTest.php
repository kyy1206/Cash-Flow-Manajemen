<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CategoryControllerTest extends TestCase
{
    use LazilyRefreshDatabase;

    public function test_staff_can_read_business_categories_but_cannot_manage_them(): void
    {
        $owner = User::factory()->create();
        $otherUser = User::factory()->create(['role' => 'staff']);
        $category = $owner->categories()->create(['name' => 'Private category']);
        Sanctum::actingAs($otherUser);

        $this->getJson("/api/categories/{$category->id}")->assertOk();
        $this->putJson("/api/categories/{$category->id}", ['name' => 'Changed'])->assertForbidden();
        $this->deleteJson("/api/categories/{$category->id}")->assertForbidden();

        $this->assertDatabaseHas('categories', [
            'id' => $category->id,
            'user_id' => $owner->id,
            'name' => 'Private category',
        ]);
    }

    public function test_category_can_be_created_and_updated_with_visual_metadata(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/categories', [
            'name' => 'Transportasi',
            'icon' => 'car',
            'color' => '#0f766e',
            'description' => 'Biaya perjalanan harian',
            'type' => 'expense',
        ])->assertCreated()
            ->assertJsonPath('data.icon', 'car')
            ->assertJsonPath('data.color', '#0f766e');

        $category = $user->categories()->firstOrFail();
        $this->putJson("/api/categories/{$category->id}", [
            'name' => 'Transport',
            'icon' => 'bus',
            'color' => '#14b8a6',
        ])->assertOk()
            ->assertJsonPath('data.name', 'Transport')
            ->assertJsonPath('data.icon', 'bus');
    }

    public function test_category_name_must_be_unique_for_the_business(): void
    {
        $user = User::factory()->create();
        $user->categories()->create(['name' => 'Makan']);
        Sanctum::actingAs($user);

        $this->postJson('/api/categories', ['name' => 'Makan', 'type' => 'expense'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('name');
    }

    public function test_category_in_use_by_a_budget_cannot_be_deleted(): void
    {
        $user = User::factory()->create();
        $category = $user->categories()->create(['name' => 'Makan']);
        $plan = $user->monthlyPlans()->create([
            'month' => 10,
            'year' => 2026,
            'total_budget' => 500000,
        ]);
        $plan->budgets()->create(['category_id' => $category->id, 'amount' => 200000]);
        Sanctum::actingAs($user);

        $this->deleteJson("/api/categories/{$category->id}")->assertStatus(409);

        $this->assertDatabaseHas('categories', ['id' => $category->id]);
    }

    public function test_category_rejects_an_invalid_color_value(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/categories', [
            'name' => 'Custom',
            'type' => 'expense',
            'color' => 'red; background:url(x)',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('color');

        $this->assertDatabaseCount('categories', 0);
    }
}
