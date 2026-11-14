<?php

namespace Tests\Feature;

use App\Models\Business;
use App\Models\Category;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthControllerTest extends TestCase
{
    use LazilyRefreshDatabase;

    public function test_initial_owner_setup_creates_a_hashed_password_and_token(): void
    {
        $this->postJson('/api/setup/owner', [
            'name' => 'Business Owner',
            'email' => 'owner@example.com',
            'business_name' => 'Toko Contoh',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ])->assertCreated()
            ->assertJsonPath('user.email', 'owner@example.com')
            ->assertJsonPath('user.role', 'owner')
            ->assertJsonPath('user.business.business_name', 'Toko Contoh')
            ->assertJsonMissingPath('user.password')
            ->assertJsonStructure(['token']);

        $this->postJson('/api/register', [
            'name' => 'Public User',
            'email' => 'public@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ])->assertNotFound();

        $user = User::where('email', 'owner@example.com')->firstOrFail();
        $this->assertTrue(Hash::check('password123', $user->password));
    }

    public function test_multiple_owners_can_register_independent_businesses(): void
    {
        foreach ([
            ['name' => 'Owner Satu', 'email' => 'owner-one@example.com', 'business_name' => 'Usaha Satu'],
            ['name' => 'Owner Dua', 'email' => 'owner-two@example.com', 'business_name' => 'Usaha Dua'],
        ] as $owner) {
            $this->postJson('/api/setup/owner', $owner + [
                'password' => 'password123',
                'password_confirmation' => 'password123',
            ])->assertCreated();
        }

        $this->assertDatabaseCount('users', 2);
        $this->assertDatabaseCount('businesses', 2);
    }

    public function test_owners_cannot_read_each_others_wallets_or_transactions(): void
    {
        $owners = [];
        foreach ([
            ['name' => 'Owner Satu', 'email' => 'owner-one@example.com', 'business_name' => 'Usaha Satu'],
            ['name' => 'Owner Dua', 'email' => 'owner-two@example.com', 'business_name' => 'Usaha Dua'],
        ] as $owner) {
            $owners[] = $this->postJson('/api/setup/owner', $owner + [
                'password' => 'password123',
                'password_confirmation' => 'password123',
            ])->assertCreated()->json('user.id');
        }

        $firstOwner = User::findOrFail($owners[0]);
        $secondOwner = User::findOrFail($owners[1]);
        $firstWallet = Wallet::where('created_by', $firstOwner->id)->firstOrFail();
        $firstCategory = Category::where('user_id', $firstOwner->id)->where('type', 'income')->firstOrFail();

        $staff = User::factory()->create(['role' => 'staff']);
        $this->actingAs($staff, 'sanctum')->postJson('/api/transactions', [
            'transaction_type' => 'income',
            'category_id' => $firstCategory->id,
            'wallet_id' => $firstWallet->id,
            'amount' => 100000,
            'date' => now()->toDateString(),
        ])->assertCreated();

        $transactionId = $this->getJson('/api/transactions')->json('data.data.0.id');
        $this->actingAs($secondOwner, 'sanctum');

        $this->getJson('/api/wallets')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/transactions')->assertOk()->assertJsonPath('data.total', 0);
        $this->getJson("/api/transactions/{$transactionId}")->assertNotFound();
    }

    public function test_staff_cannot_reference_another_business_wallet_or_category(): void
    {
        $owners = [];
        foreach ([
            ['name' => 'Owner Satu', 'email' => 'owner-one@example.com', 'business_name' => 'Usaha Satu'],
            ['name' => 'Owner Dua', 'email' => 'owner-two@example.com', 'business_name' => 'Usaha Dua'],
        ] as $owner) {
            $owners[] = $this->postJson('/api/setup/owner', $owner + [
                'password' => 'password123',
                'password_confirmation' => 'password123',
            ])->assertCreated()->json('user.id');
        }

        $foreignWallet = Wallet::where('created_by', $owners[1])->firstOrFail();
        $foreignCategory = Category::where('user_id', $owners[1])->where('type', 'expense')->firstOrFail();
        $staff = User::factory()->create(['role' => 'staff']);
        $this->actingAs($staff, 'sanctum')->postJson('/api/expense-requests', [
            'wallet_id' => $foreignWallet->id,
            'category_id' => $foreignCategory->id,
            'amount' => 10000,
            'purpose' => 'Pengajuan lintas usaha',
        ])->assertUnprocessable();

        $this->assertDatabaseCount('expense_requests', 0);
    }

    public function test_owner_can_create_staff_and_supervisor_inside_their_business(): void
    {
        $owner = User::factory()->create(['role' => 'owner']);
        $otherOwner = User::factory()->create(['role' => 'owner']);
        $createdUsers = [];

        $this->actingAs($owner, 'sanctum');
        foreach (['supervisor', 'staff'] as $role) {
            $createdUsers[] = $this->postJson('/api/users', [
                'name' => ucfirst($role).' Satu',
                'email' => $role.'-satu@example.com',
                'role' => $role,
                'password' => 'password123',
            ])->assertCreated()
                ->assertJsonPath('data.role', $role)
                ->assertJsonPath('data.business_id', $owner->business_id)
                ->json('data.id');
        }

        $this->getJson('/api/users')->assertOk()->assertJsonCount(3, 'data');
        $this->actingAs($otherOwner, 'sanctum');
        $this->getJson('/api/users')->assertOk()->assertJsonCount(1, 'data');
        $this->patchJson('/api/users/'.$createdUsers[0], ['is_active' => false])->assertNotFound();
    }

    public function test_login_returns_a_token_for_valid_credentials(): void
    {
        $user = User::factory()->create(['role' => 'owner', 'password' => 'password123']);
        $business = Business::create([
            'owner_user_id' => $user->id,
            'business_name' => 'Toko Contoh',
        ]);
        $user->update(['business_id' => $business->id]);

        $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'password123',
        ])->assertOk()
            ->assertJsonPath('user.id', $user->id)
            ->assertJsonPath('user.business.business_name', 'Toko Contoh')
            ->assertJsonStructure(['token']);
    }

    public function test_logout_revokes_the_current_token(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $this->withToken($token)->postJson('/api/logout')->assertOk();
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }
}
