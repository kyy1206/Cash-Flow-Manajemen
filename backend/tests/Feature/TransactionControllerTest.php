<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TransactionControllerTest extends TestCase
{
    use LazilyRefreshDatabase;

    public function test_transaction_is_created_for_the_authenticated_user(): void
    {
        $owner = User::factory()->create(['role' => 'owner']);
        $user = User::factory()->create(['role' => 'supervisor']);
        $category = $owner->categories()->create(['name' => 'Makan']);
        $wallet = Wallet::create(['created_by' => $owner->id, 'name' => 'Kas', 'type' => 'cash', 'opening_balance' => 100000]);
        $plan = $owner->monthlyPlans()->create([
            'month' => 10,
            'year' => 2026,
            'total_budget' => 100000,
        ]);
        $budget = $plan->budgets()->create(['category_id' => $category->id, 'amount' => 100000]);
        Sanctum::actingAs($user);

        $this->postJson('/api/transactions', [
            'transaction_type' => 'expense',
            'category_id' => $category->id,
            'wallet_id' => $wallet->id,
            'budget_id' => $budget->id,
            'amount' => 25000,
            'description' => 'Makan siang',
            'date' => '2026-10-16',
            'merchant' => 'Warteg',
            'payment_method' => 'Cash',
        ])->assertCreated()
            ->assertJsonPath('data.amount', '25000.00')
            ->assertJsonPath('data.status', 'completed');

        $this->assertDatabaseHas('transactions', [
            'user_id' => $user->id,
            'budget_id' => $budget->id,
            'amount' => 25000,
            'description' => 'Makan siang',
            'source' => 'manual',
            'status' => 'completed',
        ]);
    }

    public function test_owner_cannot_record_a_transaction_directly(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'owner']));

        $this->postJson('/api/transactions', [])->assertForbidden();
        $this->assertDatabaseCount('transactions', 0);
    }

    public function test_ocr_transactions_keep_their_recording_source(): void
    {
        $user = User::factory()->create(['role' => 'staff']);
        $category = $user->categories()->create(['name' => 'Lainnya']);
        $wallet = Wallet::create(['created_by' => $user->id, 'name' => 'Kas', 'type' => 'cash', 'opening_balance' => 0]);
        Sanctum::actingAs($user);

        $this->postJson('/api/transactions', [
            'transaction_type' => 'expense',
            'category_id' => $category->id,
            'wallet_id' => $wallet->id,
            'amount' => 28000,
            'date' => '2026-10-17',
            'source' => 'ocr',
        ])->assertCreated()
            ->assertJsonPath('data.source', 'ocr');

        $this->assertDatabaseHas('transactions', [
            'user_id' => $user->id,
            'source' => 'ocr',
        ]);
    }

    public function test_staff_can_use_the_shared_business_budget_for_direct_expenses(): void
    {
        $owner = User::factory()->create();
        $otherUser = User::factory()->create(['role' => 'staff']);
        $wallet = Wallet::create(['created_by' => $owner->id, 'name' => 'Kas', 'type' => 'cash', 'opening_balance' => 0]);
        $category = $owner->categories()->create(['name' => 'Makan']);
        $plan = $owner->monthlyPlans()->create([
            'month' => 10,
            'year' => 2026,
            'total_budget' => 100000,
        ]);
        $budget = $plan->budgets()->create(['category_id' => $category->id, 'amount' => 100000]);
        Sanctum::actingAs($otherUser);

        $this->postJson('/api/transactions', [
            'transaction_type' => 'expense',
            'category_id' => $category->id,
            'wallet_id' => $wallet->id,
            'budget_id' => $budget->id,
            'amount' => 25000,
            'date' => '2026-10-16',
        ])->assertCreated();

        $this->assertDatabaseHas('transactions', [
            'user_id' => $otherUser->id,
            'budget_id' => $budget->id,
            'financial_status' => 'posted',
        ]);
    }

    public function test_transaction_date_must_match_the_selected_budget_period(): void
    {
        $owner = User::factory()->create(['role' => 'owner']);
        $supervisor = User::factory()->create(['role' => 'supervisor']);
        $category = $owner->categories()->create(['name' => 'Makan']);
        $wallet = Wallet::create(['created_by' => $owner->id, 'name' => 'Kas', 'type' => 'cash', 'opening_balance' => 0]);
        $plan = $owner->monthlyPlans()->create([
            'month' => 10,
            'year' => 2026,
            'total_budget' => 100000,
        ]);
        $budget = $plan->budgets()->create(['category_id' => $category->id, 'amount' => 100000]);
        Sanctum::actingAs($supervisor);

        $this->postJson('/api/transactions', [
            'transaction_type' => 'expense',
            'category_id' => $category->id,
            'wallet_id' => $wallet->id,
            'budget_id' => $budget->id,
            'amount' => 25000,
            'date' => '2026-09-30',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('date');

        $this->assertDatabaseCount('transactions', 0);
    }

    public function test_supervisors_can_view_transactions_from_all_users_in_the_single_business(): void
    {
        $owner = User::factory()->create();
        $supervisor = User::factory()->create(['role' => 'supervisor']);
        $transaction = $owner->transactions()->create([
            'amount' => 25000,
            'date' => '2026-10-16',
            'description' => 'Private transaction',
            'status' => 'completed',
        ]);
        Sanctum::actingAs($supervisor);

        $this->getJson("/api/transactions/{$transaction->id}")->assertOk();
        $this->getJson('/api/transactions')->assertOk()
            ->assertJsonPath('data.total', 1);
    }

    public function test_staff_can_only_view_transactions_they_recorded(): void
    {
        $owner = User::factory()->create();
        $staff = User::factory()->create(['role' => 'staff']);
        $ownerTransaction = $owner->transactions()->create([
            'amount' => 25000,
            'date' => '2026-10-16',
            'description' => 'Owner transaction',
            'status' => 'completed',
        ]);
        $staffTransaction = $staff->transactions()->create([
            'amount' => 15000,
            'date' => '2026-10-16',
            'description' => 'Staff transaction',
            'status' => 'completed',
        ]);
        Sanctum::actingAs($staff);

        $this->getJson('/api/transactions')->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.data.0.id', $staffTransaction->id);
        $this->getJson("/api/transactions/{$ownerTransaction->id}")->assertNotFound();
        $this->getJson("/api/transactions/{$staffTransaction->id}")->assertOk();
    }

    public function test_unauthenticated_transaction_requests_receive_401(): void
    {
        $this->postJson('/api/transactions', [])->assertUnauthorized();
    }

    public function test_transaction_list_filters_by_category_and_allows_a_date_to_only_filter(): void
    {
        $user = User::factory()->create();
        $food = $user->categories()->create(['name' => 'Makan']);
        $transport = $user->categories()->create(['name' => 'Transportasi']);
        $wallet = Wallet::create(['created_by' => $user->id, 'name' => 'Kas', 'type' => 'cash', 'opening_balance' => 0]);
        $plan = $user->monthlyPlans()->create([
            'month' => 10,
            'year' => 2026,
            'total_budget' => 200000,
        ]);
        $foodBudget = $plan->budgets()->create(['category_id' => $food->id, 'amount' => 100000]);
        $transportBudget = $plan->budgets()->create(['category_id' => $transport->id, 'amount' => 100000]);
        $user->transactions()->create([
            'budget_id' => $foodBudget->id,
            'category_id' => $food->id,
            'wallet_id' => $wallet->id,
            'transaction_type' => 'expense',
            'amount' => 25000,
            'date' => '2026-10-15',
            'description' => 'Lunch',
            'status' => 'completed',
        ]);
        $user->transactions()->create([
            'budget_id' => $transportBudget->id,
            'category_id' => $transport->id,
            'wallet_id' => $wallet->id,
            'transaction_type' => 'expense',
            'amount' => 15000,
            'date' => '2026-10-16',
            'description' => 'Bus',
            'status' => 'completed',
        ]);
        Sanctum::actingAs($user);

        $this->getJson("/api/transactions?category_id={$food->id}&date_to=2026-10-15")
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.data.0.category.name', 'Makan');
    }

    public function test_transaction_list_returns_unpaginated_type_totals_and_filters_correction_history(): void
    {
        $user = User::factory()->create();
        $income = $user->transactions()->create([
            'amount' => 100000,
            'date' => '2026-10-16',
            'transaction_type' => 'income',
            'financial_status' => 'posted',
            'status' => 'completed',
        ]);
        $user->transactions()->create([
            'amount' => 100000,
            'date' => '2026-10-17',
            'transaction_type' => 'expense',
            'financial_status' => 'posted',
            'status' => 'completed',
            'reversal_of_id' => $income->id,
        ]);
        $user->transactions()->create([
            'amount' => 25000,
            'date' => '2026-10-18',
            'transaction_type' => 'expense',
            'financial_status' => 'posted',
            'status' => 'completed',
        ]);
        $user->transactions()->create([
            'amount' => 50000,
            'date' => '2026-10-19',
            'transaction_type' => 'transfer',
            'financial_status' => 'posted',
            'status' => 'completed',
        ]);
        Sanctum::actingAs($user);

        $this->getJson('/api/transactions?transaction_type=income')
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('summary.total_count', 4)
            ->assertJsonPath('summary.income_count', 1)
            ->assertJsonPath('summary.expense_count', 2)
            ->assertJsonPath('summary.transfer_count', 1)
            ->assertJsonPath('summary.income_total', 100000)
            ->assertJsonPath('summary.expense_total', 125000)
            ->assertJsonPath('summary.transfer_total', 50000)
            ->assertJsonPath('summary.attention_count', 2);

        $this->getJson('/api/transactions?attention=1')
            ->assertOk()
            ->assertJsonPath('data.total', 2);

        $reference = 'TRX-'.str_pad((string) $income->id, 8, '0', STR_PAD_LEFT);
        $this->getJson('/api/transactions?search='.$reference)
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.data.0.id', $income->id);
    }

    public function test_transaction_search_matches_the_recording_users_name(): void
    {
        $cashier = User::factory()->create(['name' => 'Rani Kasir', 'role' => 'staff']);
        $supervisor = User::factory()->create(['role' => 'supervisor']);
        $transaction = $cashier->transactions()->create([
            'amount' => 25000,
            'date' => '2026-10-16',
            'transaction_type' => 'expense',
            'financial_status' => 'posted',
            'status' => 'completed',
        ]);
        Sanctum::actingAs($supervisor);

        $this->getJson('/api/transactions?search=Rani')
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.data.0.id', $transaction->id);
    }

    public function test_transaction_amount_rejects_more_than_two_decimal_places(): void
    {
        $user = User::factory()->create(['role' => 'staff']);
        Sanctum::actingAs($user);

        $this->postJson('/api/transactions', [
            'amount' => 10.001,
            'date' => '2026-10-16',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('amount');

        $this->assertDatabaseCount('transactions', 0);
    }
}
