<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Debt;
use App\Models\ExpenseRequest;
use App\Models\Reconciliation;
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

    public function test_each_owner_can_set_up_a_separate_business(): void
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
        $this->getJson('/api/setup/status')->assertOk()->assertJsonPath('owner_setup_required', true);
        $this->postJson('/api/register', $payload)->assertNotFound();
        $this->postJson('/api/setup/owner', [
            ...$payload,
            'email' => 'another-owner@example.test',
            'business_name' => 'Usaha Kedua',
        ])->assertCreated();

        $this->assertDatabaseCount('businesses', 2);
        $this->assertDatabaseCount('wallets', 2);
        $this->assertDatabaseCount('categories', 8);
    }

    public function test_approval_does_not_change_balance_until_staff_records_payment(): void
    {
        [$owner, $wallet, $category] = $this->business();
        $supervisor = User::factory()->create(['role' => 'supervisor']);
        $staff = User::factory()->create(['role' => 'staff']);
        $this->assertSame('staff', $staff->role);
        $this->assertTrue($staff->is_active);
        $owner->business()->update(['approval_threshold' => 50000]);

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

    public function test_supervisor_can_reject_an_expense_request_with_a_reason(): void
    {
        [, $wallet, $category] = $this->business();
        $staff = User::factory()->create(['role' => 'staff']);
        $supervisor = User::factory()->create(['role' => 'supervisor']);

        Sanctum::actingAs($staff);
        $request = $this->postJson('/api/expense-requests', [
            'category_id' => $category->id,
            'wallet_id' => $wallet->id,
            'amount' => 25000,
            'purpose' => 'Pembelian perlengkapan',
        ])->assertCreated();
        $requestId = $request->json('data.id');

        Sanctum::actingAs($supervisor);
        $this->postJson("/api/expense-requests/{$requestId}/reject", ['note' => 'Tidak sesuai kebutuhan usaha'])
            ->assertOk()
            ->assertJsonPath('data.status', 'rejected')
            ->assertJsonPath('data.decision_note', 'Tidak sesuai kebutuhan usaha');

        $this->assertDatabaseHas('approval_logs', [
            'expense_request_id' => $requestId,
            'approver_id' => $supervisor->id,
            'decision' => 'rejected',
            'note' => 'Tidak sesuai kebutuhan usaha',
        ]);
        $this->assertDatabaseCount('transactions', 0);
    }

    public function test_expense_request_list_filters_requests_and_summarizes_all_statuses(): void
    {
        [$owner, $wallet, $category] = $this->business();
        $staff = User::factory()->create(['role' => 'staff']);
        $otherStaff = User::factory()->create(['role' => 'staff']);
        $supervisor = User::factory()->create(['role' => 'supervisor']);

        $records = [
            ['requested_by' => $staff->id, 'amount' => 10000, 'purpose' => 'Susu harian', 'status' => 'pending'],
            ['requested_by' => $staff->id, 'amount' => 20000, 'purpose' => 'Biji kopi', 'status' => 'approved'],
            ['requested_by' => $staff->id, 'amount' => 30000, 'purpose' => 'Perbaikan grinder', 'status' => 'rejected'],
            ['requested_by' => $staff->id, 'amount' => 40000, 'purpose' => 'Kertas kasir', 'status' => 'paid'],
            ['requested_by' => $otherStaff->id, 'amount' => 15000, 'purpose' => 'Stok gelas', 'status' => 'pending'],
        ];

        foreach ($records as $record) {
            ExpenseRequest::create($record + [
                'category_id' => $category->id,
                'wallet_id' => $wallet->id,
                'decided_by' => $record['status'] === 'pending' ? null : $supervisor->id,
                'decided_at' => $record['status'] === 'pending' ? null : now(),
                'decision_note' => $record['status'] === 'rejected' ? 'Belum prioritas' : null,
            ]);
        }

        Sanctum::actingAs($owner);
        $this->getJson('/api/expense-requests?status=pending')
            ->assertOk()
            ->assertJsonPath('data.total', 2)
            ->assertJsonPath('summary.total_count', 5)
            ->assertJsonPath('summary.total_amount', 115000)
            ->assertJsonPath('summary.pending_count', 2)
            ->assertJsonPath('summary.pending_amount', 25000)
            ->assertJsonPath('summary.approved_count', 1)
            ->assertJsonPath('summary.rejected_count', 1)
            ->assertJsonPath('summary.paid_count', 1);

        $approvedId = ExpenseRequest::query()->where('purpose', 'Biji kopi')->value('id');
        $reference = 'REQ-'.str_pad((string) $approvedId, 4, '0', STR_PAD_LEFT);
        $this->getJson('/api/expense-requests?search='.$reference
            .'&amount_min=20000&amount_max=20000&category_id='.$category->id.'&wallet_id='.$wallet->id
            .'&date_from='.now()->toDateString().'&date_to='.now()->toDateString())
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.data.0.decider.id', $supervisor->id);

        Sanctum::actingAs($staff);
        $this->getJson('/api/expense-requests')
            ->assertOk()
            ->assertJsonPath('data.total', 4)
            ->assertJsonPath('summary.total_count', 4);
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
        $supervisor = User::factory()->create(['role' => 'supervisor']);
        Sanctum::actingAs($supervisor);

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

    public function test_owner_can_manage_wallets_without_erasing_their_recorded_balance(): void
    {
        [$owner] = $this->business();
        Sanctum::actingAs($owner);

        $created = $this->postJson('/api/wallets', [
            'name' => 'Rekening Cadangan',
            'type' => 'bank',
            'opening_balance' => 250000,
        ])->assertCreated()
            ->assertJsonPath('data.name', 'Rekening Cadangan');
        $walletId = $created->json('data.id');

        $this->patchJson("/api/wallets/{$walletId}", [
            'name' => 'Rekening Cadangan Lama',
            'is_active' => false,
        ])->assertOk();

        $wallets = collect($this->getJson('/api/wallets')->assertOk()->json('data'))->keyBy('id');
        $wallet = $wallets->get($walletId);
        $this->assertNotNull($wallet);
        $this->assertFalse($wallet['is_active']);
        $this->assertEquals(250000, $wallet['balance']);
        $this->assertDatabaseHas('audit_logs', [
            'user_id' => $owner->id,
            'action' => 'wallet.created',
            'auditable_id' => $walletId,
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'user_id' => $owner->id,
            'action' => 'wallet.updated',
            'auditable_id' => $walletId,
        ]);

        Sanctum::actingAs(User::factory()->create(['role' => 'supervisor']));
        $this->postJson('/api/wallets', [
            'name' => 'Tidak Diizinkan',
            'type' => 'cash',
            'opening_balance' => 0,
        ])->assertForbidden();
    }

    public function test_reconciliation_list_loads_creator_and_reviewer_and_only_supervisor_can_review(): void
    {
        [$owner, $wallet] = $this->business();
        $supervisor = User::factory()->create(['role' => 'supervisor']);

        Sanctum::actingAs($owner);
        $created = $this->postJson('/api/reconciliations', [
            'wallet_id' => $wallet->id,
            'reconciled_at' => '2026-11-08',
            'counted_balance' => 210000,
            'notes' => 'Perhitungan kas harian',
        ])->assertCreated();
        $reconciliationId = $created->json('data.id');

        $this->getJson('/api/reconciliations')
            ->assertOk()
            ->assertJsonPath('data.data.0.creator.id', $owner->id)
            ->assertJsonPath('data.data.0.reviewer', null);

        $this->postJson("/api/reconciliations/{$reconciliationId}/review")->assertForbidden();

        Sanctum::actingAs($supervisor);
        $this->postJson("/api/reconciliations/{$reconciliationId}/review")
            ->assertOk()
            ->assertJsonPath('data.reviewer.id', $supervisor->id);

        $this->getJson('/api/reconciliations')
            ->assertOk()
            ->assertJsonPath('data.data.0.reviewer.id', $supervisor->id);
    }

    public function test_reconciliation_filters_and_summaries_cover_all_matching_records(): void
    {
        [$owner, $wallet] = $this->business();
        $supervisor = User::factory()->create(['role' => 'supervisor']);

        Sanctum::actingAs($owner);
        $matched = $this->postJson('/api/reconciliations', [
            'wallet_id' => $wallet->id,
            'reconciled_at' => '2026-11-10',
            'counted_balance' => 200000,
            'notes' => 'Opname kas sesuai',
        ])->assertCreated()->json('data.id');
        $difference = $this->postJson('/api/reconciliations', [
            'wallet_id' => $wallet->id,
            'reconciled_at' => '2026-11-12',
            'counted_balance' => 190000,
            'notes' => 'Selisih kas malam',
        ])->assertCreated()->json('data.id');

        Sanctum::actingAs($supervisor);
        $this->postJson("/api/reconciliations/{$matched}/review")->assertOk();

        Sanctum::actingAs($owner);
        $this->getJson('/api/reconciliations?wallet_id='.$wallet->id.'&date_from=2026-11-10&date_to=2026-11-12')
            ->assertOk()
            ->assertJsonPath('data.total', 2)
            ->assertJsonPath('summary.total_count', 2)
            ->assertJsonPath('summary.pending_count', 1)
            ->assertJsonPath('summary.reviewed_count', 1)
            ->assertJsonPath('summary.matched_count', 1)
            ->assertJsonPath('summary.shortage_count', 1)
            ->assertJsonPath('summary.surplus_count', 0);

        $this->getJson('/api/reconciliations?date_to=2026-11-10')
            ->assertOk()
            ->assertJsonPath('summary.total_count', 1);

        $differenceResponse = $this->getJson('/api/reconciliations?search=REC-'.$difference.'&status=pending')
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.data.0.id', $difference)
            ->assertJsonPath('summary.total_count', 1);
        $this->assertEquals(-10000, $differenceResponse->json('summary.net_difference'));
        $this->assertEquals(10000, $differenceResponse->json('summary.total_absolute_difference'));

        Sanctum::actingAs(User::factory()->create(['role' => 'staff']));
        Reconciliation::create([
            'wallet_id' => $wallet->id,
            'created_by' => auth()->id(),
            'reconciled_at' => '2026-11-13',
            'system_balance' => 200000,
            'counted_balance' => 200000,
            'difference' => 0,
            'status' => 'pending',
        ]);
        $this->getJson('/api/reconciliations')
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('summary.total_count', 1);
    }

    public function test_debt_filters_summaries_and_partial_settlements_are_consistent(): void
    {
        [$owner, $wallet] = $this->business();
        Sanctum::actingAs($owner);

        $payable = $this->postJson('/api/debts', [
            'type' => 'payable',
            'counterparty' => 'Supplier Bahan',
            'description' => 'Tepung dan mentega',
            'amount' => 100000,
            'due_date' => now()->addDays(2)->toDateString(),
        ])->assertCreated()->json('data.id');
        $receivable = $this->postJson('/api/debts', [
            'type' => 'receivable',
            'counterparty' => 'Klien Katering',
            'amount' => 50000,
            'due_date' => now()->subDay()->toDateString(),
        ])->assertCreated()->json('data.id');
        $this->postJson('/api/debts', [
            'type' => 'payable',
            'counterparty' => 'Supplier Tanpa Tempo',
            'amount' => 20000,
        ])->assertCreated();
        Debt::create([
            'created_by' => $owner->id,
            'type' => 'receivable',
            'counterparty' => 'Tagihan Lunas',
            'original_amount' => 10000,
            'remaining_amount' => 0,
            'status' => 'settled',
        ]);

        $filtered = $this->getJson('/api/debts?type=payable&status=open&search=Supplier%20Bahan')
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.data.0.id', $payable)
            ->assertJsonPath('summary.total_count', 4)
            ->assertJsonPath('summary.open_count', 3)
            ->assertJsonPath('summary.settled_count', 1)
            ->assertJsonPath('summary.payable_open_count', 2)
            ->assertJsonPath('summary.receivable_open_count', 1)
            ->assertJsonPath('summary.overdue_count', 1)
            ->assertJsonPath('summary.due_next_7_count', 1);
        $this->assertEquals(120000, $filtered->json('summary.payable_open_amount'));
        $this->assertEquals(50000, $filtered->json('summary.receivable_open_amount'));
        $this->assertEquals(-70000, $filtered->json('summary.net_position'));
        $this->assertEquals(100000, $filtered->json('summary.payable_due_0_7_amount'));
        $this->assertEquals(20000, $filtered->json('summary.payable_no_due_amount'));
        $this->assertCount(2, $filtered->json('alerts'));

        $this->getJson('/api/debts?due_period=overdue')
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.data.0.counterparty', 'Klien Katering');
        $this->getJson('/api/debts?due_period=no_due')
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.data.0.counterparty', 'Supplier Tanpa Tempo');
        $this->getJson('/api/debts?search=UTG-'.str_pad((string) $payable, 4, '0', STR_PAD_LEFT))
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.data.0.id', $payable);

        $this->postJson("/api/debts/{$payable}/settle", [
            'wallet_id' => $wallet->id,
            'amount' => 25000,
            'date' => now()->toDateString(),
        ])->assertCreated()->assertJsonPath('data.transaction_type', 'expense');
        $this->assertDatabaseHas('debts', ['id' => $payable, 'remaining_amount' => 75000, 'status' => 'open']);
        $this->getJson('/api/wallets')->assertJsonPath('data.0.balance', 175000);
        $this->postJson("/api/debts/{$payable}/settle", [
            'wallet_id' => $wallet->id,
            'amount' => 75001,
            'date' => now()->toDateString(),
        ])->assertUnprocessable();
        $this->getJson('/api/wallets')->assertJsonPath('data.0.balance', 175000);

        $this->postJson("/api/debts/{$payable}/settle", [
            'wallet_id' => $wallet->id,
            'amount' => 75000,
            'date' => now()->toDateString(),
        ])->assertCreated();
        $this->assertDatabaseHas('debts', ['id' => $payable, 'remaining_amount' => 0, 'status' => 'settled']);
        $this->getJson('/api/wallets')->assertJsonPath('data.0.balance', 100000);

        $this->postJson("/api/debts/{$receivable}/settle", [
            'wallet_id' => $wallet->id,
            'amount' => 10000,
            'date' => now()->toDateString(),
        ])->assertCreated()->assertJsonPath('data.transaction_type', 'income');
        $this->assertDatabaseHas('debts', ['id' => $receivable, 'remaining_amount' => 40000, 'status' => 'open']);
        $this->getJson('/api/wallets')->assertJsonPath('data.0.balance', 110000);
    }

    public function test_staff_only_lists_and_settles_debts_they_created(): void
    {
        [$owner, $wallet] = $this->business();
        Sanctum::actingAs($owner);
        $ownerDebt = $this->postJson('/api/debts', [
            'type' => 'payable',
            'counterparty' => 'Private supplier record',
            'amount' => 25000,
        ])->assertCreated()->json('data.id');

        $staff = User::factory()->create(['role' => 'staff', 'business_id' => $owner->business_id]);
        Sanctum::actingAs($staff);
        $this->getJson('/api/debts')
            ->assertOk()
            ->assertJsonPath('data.total', 0)
            ->assertJsonPath('summary.total_count', 0);
        $this->postJson("/api/debts/{$ownerDebt}/settle", [
            'wallet_id' => $wallet->id,
            'amount' => 25000,
            'date' => now()->toDateString(),
        ])->assertNotFound();

        $this->postJson('/api/debts', [
            'type' => 'receivable',
            'counterparty' => 'Staff-created receivable',
            'amount' => 10000,
        ])->assertCreated();
        $this->getJson('/api/debts')->assertJsonPath('data.total', 1);
    }

    public function test_posted_transaction_cannot_be_deleted_and_can_only_be_reversed_once(): void
    {
        [$owner, $wallet] = $this->business();
        $incomeCategory = Category::create([
            'user_id' => $owner->id,
            'name' => 'Penjualan',
            'type' => 'income',
        ]);
        $staff = User::factory()->create(['role' => 'staff']);
        Sanctum::actingAs($staff);
        $transaction = $this->postJson('/api/transactions', [
            'transaction_type' => 'income',
            'category_id' => $incomeCategory->id,
            'wallet_id' => $wallet->id,
            'amount' => 50000,
            'date' => '2026-11-02',
        ])->assertCreated()->json('data.id');

        Sanctum::actingAs($owner);
        $this->deleteJson("/api/transactions/{$transaction}")->assertStatus(409);
        $this->postJson("/api/transactions/{$transaction}/reverse", ['reason' => 'Nominal salah'])->assertCreated();
        $this->getJson('/api/wallets')->assertJsonPath('data.0.balance', 200000);
        $this->postJson("/api/transactions/{$transaction}/reverse", ['reason' => 'Duplikat'])->assertStatus(409);
    }

    private function business(): array
    {
        $owner = User::factory()->create(['role' => 'owner']);
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
