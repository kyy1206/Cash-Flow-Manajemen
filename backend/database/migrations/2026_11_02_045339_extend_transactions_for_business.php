<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('transactions', function (Blueprint $table): void {
            $table->string('transaction_type', 20)->default('expense');
            $table->string('financial_status', 20)->default('posted');
            $table->foreignId('category_id')->nullable()->after('user_id')->constrained()->nullOnDelete();
            $table->foreignId('wallet_id')->nullable()->constrained()->restrictOnDelete();
            $table->foreignId('destination_wallet_id')->nullable()->constrained('wallets')->restrictOnDelete();
            $table->foreignId('expense_request_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('reversal_of_id')->nullable()->constrained('transactions')->nullOnDelete();
            $table->index(['financial_status', 'transaction_type', 'date']);
        });

        DB::table('transactions')->where('status', 'pending')->update(['financial_status' => 'draft']);
        DB::table('transactions')->where('status', 'failed')->update(['financial_status' => 'voided']);

        foreach (DB::table('users')->orderBy('id')->get(['id', 'name']) as $user) {
            $hasTransactions = DB::table('transactions')->where('user_id', $user->id)->exists();
            if (! $hasTransactions && DB::table('users')->where('id', $user->id)->value('role') !== 'owner') {
                continue;
            }

            $walletId = DB::table('wallets')->insertGetId([
                'created_by' => $user->id,
                'name' => 'Kas Tunai'.($user->name ? ' - '.$user->name : ''),
                'type' => 'cash',
                'opening_balance' => 0,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            foreach (DB::table('transactions')->where('user_id', $user->id)->get(['id', 'budget_id']) as $transaction) {
                $categoryId = $transaction->budget_id === null
                    ? null
                    : DB::table('budgets')->where('id', $transaction->budget_id)->value('category_id');
                DB::table('transactions')->where('id', $transaction->id)->update([
                    'wallet_id' => $walletId,
                    'category_id' => $categoryId,
                ]);
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('transactions', function (Blueprint $table): void {
            $table->dropIndex(['financial_status', 'transaction_type', 'date']);
            $table->dropConstrainedForeignId('category_id');
            $table->dropConstrainedForeignId('wallet_id');
            $table->dropConstrainedForeignId('destination_wallet_id');
            $table->dropConstrainedForeignId('expense_request_id');
            $table->dropConstrainedForeignId('reversal_of_id');
            $table->dropColumn(['transaction_type', 'financial_status']);
        });
    }
};
