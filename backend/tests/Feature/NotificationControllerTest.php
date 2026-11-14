<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class NotificationControllerTest extends TestCase
{
    use LazilyRefreshDatabase;

    public function test_spending_thresholds_create_deduplicated_budget_notifications(): void
    {
        $this->travelTo('2026-10-17 10:00:00');
        $user = User::factory()->create(['role' => 'owner']);
        $category = $user->categories()->create(['name' => 'Makan']);
        $wallet = Wallet::create(['created_by' => $user->id, 'name' => 'Kas', 'type' => 'cash', 'opening_balance' => 0]);
        $plan = $user->monthlyPlans()->create([
            'month' => 10,
            'year' => 2026,
            'total_budget' => 100000,
        ]);
        $budget = $plan->budgets()->create(['category_id' => $category->id, 'amount' => 50000]);
        Sanctum::actingAs(User::factory()->create(['role' => 'supervisor']));

        $this->postJson('/api/transactions', [
            'transaction_type' => 'expense',
            'category_id' => $category->id,
            'wallet_id' => $wallet->id,
            'budget_id' => $budget->id,
            'amount' => 55000,
            'date' => '2026-10-17',
        ])->assertCreated();

        $this->assertDatabaseHas('notifications', [
            'user_id' => $user->id,
            'type' => 'budget_warning',
        ]);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $user->id,
            'type' => 'budget_critical',
        ]);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $user->id,
            'type' => 'budget_overbudget',
        ]);

        $this->postJson('/api/transactions', [
            'transaction_type' => 'expense',
            'category_id' => $category->id,
            'wallet_id' => $wallet->id,
            'budget_id' => $budget->id,
            'amount' => 1000,
            'date' => '2026-10-17',
        ])->assertCreated();

        $this->assertDatabaseCount('notifications', 4);
    }

    public function test_notification_history_creates_subscription_reminders_and_supports_read_actions(): void
    {
        $this->travelTo('2026-10-17 10:00:00');
        $user = User::factory()->create();
        $subscription = $user->subscriptions()->create([
            'name' => 'Internet',
            'category' => 'Lainnya',
            'amount' => 200000,
            'billing_cycle' => 'monthly',
            'due_date' => '2026-10-20',
            'status' => 'active',
        ]);
        Sanctum::actingAs($user);

        $response = $this->getJson('/api/notifications')->assertOk()
            ->assertJsonPath('unread_count', 1)
            ->assertJsonPath('data.data.0.type', 'subscription_due');
        $notificationId = $response->json('data.data.0.id');

        $this->postJson("/api/notifications/{$notificationId}/read")->assertOk()
            ->assertJsonPath('data.read_at', fn ($value) => $value !== null);
        $this->getJson('/api/notifications')->assertOk()->assertJsonPath('unread_count', 0);

        $this->assertDatabaseHas('notifications', [
            'user_id' => $user->id,
            'notification_key' => "subscription:{$subscription->id}:2026-10-20",
        ]);
    }

    public function test_users_can_only_read_their_own_notifications(): void
    {
        $owner = User::factory()->create();
        $otherUser = User::factory()->create();
        $notification = $owner->notifications()->create([
            'type' => 'budget_warning',
            'message' => 'Private notification',
        ]);
        Sanctum::actingAs($otherUser);

        $this->postJson("/api/notifications/{$notification->id}/read")->assertNotFound();
        $this->assertNull($notification->fresh()->read_at);
    }

    public function test_notification_feed_can_filter_owned_records_and_returns_unfiltered_summary(): void
    {
        $user = User::factory()->create(['role' => 'owner']);
        $otherUser = User::factory()->create();
        $user->notifications()->create([
            'type' => 'budget_warning',
            'message' => 'Anggaran mendekati batas',
        ]);
        $user->notifications()->create([
            'type' => 'budget_critical',
            'message' => 'Anggaran kritis',
        ]);
        $user->notifications()->create([
            'type' => 'subscription_due',
            'message' => 'Internet jatuh tempo',
        ]);
        $user->notifications()->create([
            'type' => 'budget_overbudget',
            'message' => 'Anggaran melewati batas',
            'read_at' => now(),
        ]);
        $otherUser->notifications()->create([
            'type' => 'budget_warning',
            'message' => 'Anggaran milik pengguna lain',
        ]);
        Sanctum::actingAs($user);

        $this->getJson('/api/notifications?category=budget&status=unread&search=Anggaran')->assertOk()
            ->assertJsonCount(2, 'data.data')
            ->assertJsonPath('data.total', 2)
            ->assertJsonPath('unread_count', 3)
            ->assertJsonPath('summary.total', 4)
            ->assertJsonPath('summary.budget_count', 3)
            ->assertJsonPath('summary.subscription_count', 1);

        $this->getJson('/api/notifications?status=read')->assertOk()
            ->assertJsonCount(1, 'data.data')
            ->assertJsonPath('data.data.0.type', 'budget_overbudget');
    }

    public function test_notification_feed_rejects_unknown_filter_values(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'owner']));

        $this->getJson('/api/notifications?category=fraud&status=resolved')
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['category', 'status']);
    }

    public function test_mark_all_notifications_as_read_only_updates_authenticated_users_rows(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $notification = $user->notifications()->create(['type' => 'test', 'message' => 'Unread']);
        $otherNotification = $otherUser->notifications()->create(['type' => 'test', 'message' => 'Other']);
        Sanctum::actingAs($user);

        $this->postJson('/api/notifications/read-all')->assertOk()->assertJsonPath('unread_count', 0);

        $this->assertNotNull($notification->fresh()->read_at);
        $this->assertNull($otherNotification->fresh()->read_at);
    }
}
