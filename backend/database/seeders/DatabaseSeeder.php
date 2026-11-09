<?php

namespace Database\Seeders;

use App\Models\Business;
use App\Models\Category;
use App\Models\ExpenseRequest;
use App\Models\Notification;
use App\Models\Reconciliation;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $today = CarbonImmutable::now();

        // 1. Owner & Business
        $owner = User::create([
            'name' => 'Budi Prasetyo (Owner)',
            'email' => 'owner@bocorhalus.test',
            'password' => Hash::make('password123'),
            'role' => 'owner',
            'is_active' => true,
        ]);

        $business = Business::create([
            'owner_user_id' => $owner->id,
            'business_name' => 'Bocor Halus Artisan Coffee & Eatery',
            'approval_threshold' => 100000,
        ]);
        $owner->forceFill(['business_id' => $business->id])->save();

        // 2. Supervisor & Staff
        $supervisor = User::create([
            'name' => 'Siti Supervisor',
            'email' => 'supervisor@bocorhalus.test',
            'password' => Hash::make('password123'),
            'role' => 'supervisor',
            'is_active' => true,
            'business_id' => $business->id,
        ]);

        $staff = User::create([
            'name' => 'Andi Kasir (Staff)',
            'email' => 'staff@bocorhalus.test',
            'password' => Hash::make('password123'),
            'role' => 'staff',
            'is_active' => true,
            'business_id' => $business->id,
        ]);

        // 3. Wallets
        $cashWallet = Wallet::create([
            'business_id' => $business->id,
            'created_by' => $owner->id,
            'name' => 'Laci Kasir Gerai',
            'type' => 'cash',
            'opening_balance' => 500000,
            'is_active' => true,
        ]);

        $bankWallet = Wallet::create([
            'business_id' => $business->id,
            'created_by' => $owner->id,
            'name' => 'BCA Operasional Usaha',
            'type' => 'bank',
            'opening_balance' => 8500000,
            'is_active' => true,
        ]);

        // 4. Categories
        $catPenjualan = Category::create([
            'business_id' => $business->id,
            'user_id' => $owner->id,
            'name' => 'Penjualan Kasir',
            'type' => 'income',
            'icon' => 'shopping-bag',
            'color' => '#059669',
        ]);

        $catBahanBaku = Category::create([
            'business_id' => $business->id,
            'user_id' => $owner->id,
            'name' => 'Bahan Baku & Dapur',
            'type' => 'expense',
            'icon' => 'coffee',
            'color' => '#d97706',
        ]);

        $catOperasional = Category::create([
            'business_id' => $business->id,
            'user_id' => $owner->id,
            'name' => 'Operasional & Utilitas',
            'type' => 'expense',
            'icon' => 'zap',
            'color' => '#dc2626',
        ]);

        $catPerlengkapan = Category::create([
            'business_id' => $business->id,
            'user_id' => $owner->id,
            'name' => 'Perlengkapan Kasir & Toko',
            'type' => 'expense',
            'icon' => 'archive',
            'color' => '#4f46e5',
        ]);

        // 5. Posted Transactions by Staff
        Transaction::create([
            'business_id' => $business->id,
            'user_id' => $staff->id,
            'wallet_id' => $cashWallet->id,
            'category_id' => $catPenjualan->id,
            'amount' => 450000,
            'transaction_type' => 'income',
            'financial_status' => 'posted',
            'status' => 'completed',
            'source' => 'manual',
            'date' => $today->toDateString(),
            'description' => 'Penjualan Shift Pagi Batch 1',
            'payment_method' => 'Tunai',
        ]);

        Transaction::create([
            'business_id' => $business->id,
            'user_id' => $staff->id,
            'wallet_id' => $cashWallet->id,
            'category_id' => $catPenjualan->id,
            'amount' => 320000,
            'transaction_type' => 'income',
            'financial_status' => 'posted',
            'status' => 'completed',
            'source' => 'manual',
            'date' => $today->toDateString(),
            'description' => 'Penjualan Makan Siang & Kopi Takeaway',
            'payment_method' => 'QRIS',
        ]);

        Transaction::create([
            'business_id' => $business->id,
            'user_id' => $staff->id,
            'wallet_id' => $cashWallet->id,
            'category_id' => $catOperasional->id,
            'amount' => 45000,
            'transaction_type' => 'expense',
            'financial_status' => 'posted',
            'status' => 'completed',
            'source' => 'manual',
            'date' => $today->toDateString(),
            'description' => 'Pembelian Es Batu Kristal & Air Galon Toko',
            'payment_method' => 'Tunai',
            'merchant' => 'Depo Es Segar',
        ]);

        // 6. Expense Requests for Staff testing
        // A. Approved request (ready for staff to click "Catat Sudah Dibayar"!)
        ExpenseRequest::create([
            'business_id' => $business->id,
            'requested_by' => $staff->id,
            'wallet_id' => $cashWallet->id,
            'category_id' => $catPerlengkapan->id,
            'amount' => 125000,
            'purpose' => 'Kertas Thermal Struk Kasir (10 Roll)',
            'description' => 'Stok kertas printer kasir gerai menipis',
            'status' => 'approved',
        ]);

        // B. Pending request (waiting for supervisor approval)
        ExpenseRequest::create([
            'business_id' => $business->id,
            'requested_by' => $staff->id,
            'wallet_id' => $bankWallet->id,
            'category_id' => $catOperasional->id,
            'amount' => 350000,
            'purpose' => 'Service & Kalibrasi Mesin Grinder Kopi',
            'description' => 'Grinder bar sering macet saat jam ramai',
            'status' => 'pending',
        ]);

        // C. Rejected request with supervisor note
        ExpenseRequest::create([
            'business_id' => $business->id,
            'requested_by' => $staff->id,
            'wallet_id' => $cashWallet->id,
            'category_id' => $catPerlengkapan->id,
            'amount' => 200000,
            'purpose' => 'Pembelian Lampu Hias Meja Kasir',
            'description' => 'Untuk dekorasi meja pemesanan',
            'status' => 'rejected',
            'decision_note' => 'Gunakan lampu cadangan yang masih ada di lemari inventaris.',
        ]);

        // 7. Reconciliation
        Reconciliation::create([
            'business_id' => $business->id,
            'wallet_id' => $cashWallet->id,
            'created_by' => $staff->id,
            'reconciled_at' => $today->toDateString(),
            'system_balance' => 1225000,
            'counted_balance' => 1225000,
            'difference' => 0,
            'notes' => 'Hitung fisik kasir pergantian shift pagi ke sore. Saldo pas.',
            'status' => 'reviewed',
            'reviewed_by' => $supervisor->id,
        ]);

        // 8. Notifications
        Notification::create([
            'business_id' => $business->id,
            'user_id' => $staff->id,
            'type' => 'expense_request_approved',
            'message' => 'Pengajuan "Kertas Thermal Struk Kasir" telah disetujui Supervisor. Silakan lakukan pembayaran.',
        ]);

        Notification::create([
            'business_id' => $business->id,
            'user_id' => $staff->id,
            'type' => 'expense_request_rejected',
            'message' => 'Pengajuan "Pembelian Lampu Hias Meja Kasir" ditolak oleh Supervisor.',
        ]);
    }
}
