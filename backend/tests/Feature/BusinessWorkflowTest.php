<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BusinessWorkflowTest extends TestCase
{
    use LazilyRefreshDatabase;

    public function test_owner_setup_is_one_time_and_public_registration_is_unavailable(): void
    {
        $payload = [
            'name' => 'Business Owner',
            'email' => 'owner@example.test',
            'business_name' => 'Toko Contoh',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ];

        $this->getJson('/api/setup/status')->assertOk()->assertJsonPath('owner_setup_required', true);
        $this->postJson('/api/setup/owner', $payload)
            ->assertCreated()
            ->assertJsonPath('user.role', 'owner');
        $this->getJson('/api/setup/status')->assertOk()->assertJsonPath('owner_setup_required', false);
        $this->postJson('/api/register', $payload)->assertNotFound();
        $this->postJson('/api/setup/owner', [
            ...$payload,
            'email' => 'another-owner@example.test',
        ])->assertStatus(409);

        $this->assertDatabaseCount('wallets', 1);
        $this->assertDatabaseCount('categories', 4);
    }

    public function test_approval_does_not_change_balance_until_staff_records_payment(): void
    {
        [$owner, $wallet, $category] = $this->business();
        $supervisor = User::factory()->create(['role' => 'supervisor']);
        $staff = User::factory()->create(['role' => 'staff']);
        $this->assertSame('staff', $staff->role);
        $this->assertTrue($staff->is_active);
        DB::table('business_settings')->where('id', 1)->update(['approval_threshold' => 50000]);

        Sanctum::actingAs($staff);
        $request = $this->postJson('/api/expense-requests', [
            'category_id' => $category->id,
            'wallet_id' => $wallet->id,
            'amount' => 75000,
            'purpose' => 'Beli bahan baku',
        ])->assertCreated()->assertJsonPath('data.status', 'pending');

        $requestId = $request->json('data.id');
        $this->getJson('/api/wallets')->assertOk()->assertJsonPath('data.0.balance', 200000);
        $this->assertDatabaseCount('transactions', 0);

        Sanctum::actingAs($supervisor);
        $this->postJson("/api/expense-requests/{$requestId}/approve", ['note' => 'Disetujui'])
            ->assertOk()->assertJsonPath('data.status', 'approved');
        $this->getJson('/api/wallets')->assertJsonPath('data.0.balance', 200000);
        $this->assertDatabaseCount('transactions', 0);

        Sanctum::actingAs($staff);
        $this->postJson("/api/expense-requests/{$requestId}/pay", [
            'date' => '2026-11-02',
            'description' => 'Bahan baku telah dibayar',
        ])->assertCreated()->assertJsonPath('data.financial_status', 'posted');

        $this->getJson('/api/wallets')->assertJsonPath('data.0.balance', 125000);
        $this->assertDatabaseHas('expense_requests', ['id' => $requestId, 'status' => 'paid']);
        $this->assertDatabaseHas('approval_logs', ['expense_request_id' => $requestId, 'approver_id' => $supervisor->id]);
        $this->assertDatabaseHas('audit_logs', ['user_id' => $staff->id, 'action' => 'expense_request.paid']);
    }

    public function test_staff_cannot_approve_their_own_request_or_directly_post_required_expenses(): void
    {
        [, $wallet, $category] = $this->business();
        $staff = User::factory()->create(['role' => 'staff']);
        $category->update(['requires_approval' => true]);
        Sanctum::actingAs($staff);

        $this->postJson('/api/transactions', [
            'transaction_type' => 'expense',
            'category_id' => $category->id,
            'wallet_id' => $wallet->id,
            'amount' => 10000,
            'date' => '2026-11-02',
        ])->assertUnprocessable()->assertJsonValidationErrors('amount');

        $response = $this->postJson('/api/expense-requests', [
            'category_id' => $category->id,
            'wallet_id' => $wallet->id,
            'amount' => 10000,
            'purpose' => 'Biaya operasional',
        ])->assertCreated();
        $requestId = $response->json('data.id');

        $this->postJson("/api/expense-requests/{$requestId}/approve")->assertForbidden();
        $this->getJson('/api/wallets')->assertJsonPath('data.0.balance', 200000);
        $this->assertDatabaseCount('transactions', 0);
    }

    public function test_expense_request_evidence_is_private_and_available_to_authorized_users(): void
    {
        [, $wallet, $category] = $this->business();
        Storage::fake('local');
        $staff = User::factory()->create(['role' => 'staff']);
        $supervisor = User::factory()->create(['role' => 'supervisor']);

        Sanctum::actingAs($staff);
        $response = $this->post('/api/expense-requests', [
            'category_id' => $category->id,
            'wallet_id' => $wallet->id,
            'amount' => 10000,
            'purpose' => 'Pembelian perlengkapan',
            'attachment' => UploadedFile::fake()->create('bukti.pdf', 100, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertCreated()->assertJsonPath('data.has_attachment', true);

        $requestId = $response->json('data.id');
        $path = DB::table('expense_requests')->where('id', $requestId)->value('attachment_path');
        Storage::disk('local')->assertExists($path);
        $this->get("/api/expense-requests/{$requestId}/evidence")->assertOk();

        Sanctum::actingAs($supervisor);
        $this->get("/api/expense-requests/{$requestId}/evidence")->assertOk();

        Sanctum::actingAs(User::factory()->create(['role' => 'staff']));
        $this->getJson("/api/expense-requests/{$requestId}/evidence")->assertForbidden();
    }

    public function test_staff_can_post_a_reviewed_ocr_receipt_into_the_shared_ledger(): void
    {
        [, $wallet, $category] = $this->business();
        config()->set('services.receipt_ocr.api_key', 'test-ocr-space-api-key');
        Http::fake([
            'api.ocr.space/*' => Http::response([
                'ParsedResults' => [[
                    'ParsedText' => "TOKO CONTOH\nBahan baku\n17/10/2026\nTOTAL Rp 28.000\nQRIS",
                ]],
                'IsErroredOnProcessing' => false,
            ]),
        ]);
        $staff = User::factory()->create(['role' => 'staff']);
        Sanctum::actingAs($staff);

        $extracted = $this->postJson('/api/receipt-extractions', [
            'receipt' => UploadedFile::fake()->image('struk.jpg'),
        ])->assertOk()->json('data');

        $transaction = $this->postJson('/api/transactions', [
            'transaction_type' => 'expense',
            'category_id' => $category->id,
            'wallet_id' => $wallet->id,
            'amount' => $extracted['amount'],
            'date' => $extracted['date'],
            'merchant' => $extracted['merchant'],
            'payment_method' => $extracted['payment_method'],
            'description' => $extracted['description'],
            'source' => 'ocr',
        ])->assertCreated()
            ->assertJsonPath('data.source', 'ocr')
            ->assertJsonPath('data.merchant', 'TOKO CONTOH');

        $this->getJson('/api/wallets')->assertJsonPath('data.0.balance', 172000);
        $this->assertDatabaseHas('transactions', [
            'id' => $transaction->json('data.id'),
            'user_id' => $staff->id,
            'source' => 'ocr',
            'transaction_type' => 'expense',
        ]);
    }

    public function test_transfer_moves_balance_without_becoming_income_or_expense(): void
    {
        [$owner, $firstWallet] = $this->business();
        $secondWallet = Wallet::create([
            'created_by' => $owner->id,
            'name' => 'Rekening Bank',
            'type' => 'bank',
            'opening_balance' => 100000,
        ]);
        Sanctum::actingAs($owner);

        $this->postJson('/api/transactions', [
            'transaction_type' => 'transfer',
            'wallet_id' => $firstWallet->id,
            'destination_wallet_id' => $secondWallet->id,
            'amount' => 25000,
            'date' => '2026-11-02',
            'description' => 'Setor kas',
        ])->assertCreated();

        $this->getJson('/api/wallets')->assertJsonPath('data.0.balance', 175000)
            ->assertJsonPath('data.1.balance', 125000);
        $this->getJson('/api/dashboard')
            ->assertJsonPath('data.summary.income_total', 0)
            ->assertJsonPath('data.summary.expense_total', 0);
    }

    public function test_posted_transaction_cannot_be_deleted_and_can_only_be_reversed_once(): void
    {
        [$owner, $wallet] = $this->business();
        $incomeCategory = Category::create([
            'user_id' => $owner->id,
            'name' => 'Penjualan',
            'type' => 'income',
        ]);
        Sanctum::actingAs($owner);
        $transaction = $this->postJson('/api/transactions', [
            'transaction_type' => 'income',
            'category_id' => $incomeCategory->id,
            'wallet_id' => $wallet->id,
            'amount' => 50000,
            'date' => '2026-11-02',
        ])->assertCreated()->json('data.id');

        $this->deleteJson("/api/transactions/{$transaction}")->assertStatus(409);
        $this->postJson("/api/transactions/{$transaction}/reverse", ['reason' => 'Nominal salah'])->assertCreated();
        $this->getJson('/api/wallets')->assertJsonPath('data.0.balance', 200000);
        $this->postJson("/api/transactions/{$transaction}/reverse", ['reason' => 'Duplikat'])->assertStatus(409);
    }

    private function business(): array
    {
        $owner = User::factory()->create(['role' => 'owner']);
        DB::table('business_settings')->where('id', 1)->update(['owner_user_id' => $owner->id]);
        $wallet = Wallet::create([
            'created_by' => $owner->id,
            'name' => 'Kas Tunai',
            'type' => 'cash',
            'opening_balance' => 200000,
        ]);
        $category = Category::create([
            'user_id' => $owner->id,
            'name' => 'Bahan Baku',
            'type' => 'expense',
        ]);

        return [$owner, $wallet, $category];
    }
}
