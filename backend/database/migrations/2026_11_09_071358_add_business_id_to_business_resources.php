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
        $tables = [
            'categories',
            'monthly_plans',
            'budgets',
            'transactions',
            'subscriptions',
            'notifications',
            'wallets',
            'expense_requests',
            'approval_logs',
            'audit_logs',
            'debts',
            'reconciliations',
        ];

        foreach ($tables as $tableName) {
            Schema::table($tableName, function (Blueprint $table): void {
                $table->foreignId('business_id')->nullable()->constrained('businesses')->restrictOnDelete();
            });
        }

        $ownerForeignKeys = [
            'categories' => ['users', 'user_id'],
            'monthly_plans' => ['users', 'user_id'],
            'transactions' => ['users', 'user_id'],
            'subscriptions' => ['users', 'user_id'],
            'notifications' => ['users', 'user_id'],
            'wallets' => ['users', 'created_by'],
            'expense_requests' => ['users', 'requested_by'],
            'audit_logs' => ['users', 'user_id'],
            'debts' => ['users', 'created_by'],
            'reconciliations' => ['users', 'created_by'],
            'budgets' => ['monthly_plans', 'monthly_plan_id'],
            'approval_logs' => ['expense_requests', 'expense_request_id'],
        ];

        foreach ($ownerForeignKeys as $tableName => [$parentTable, $foreignKey]) {
            DB::table($tableName)->whereNull('business_id')->update([
                'business_id' => DB::raw('(SELECT business_id FROM '.$parentTable.' WHERE '.$parentTable.'.id = '.$tableName.'.'.$foreignKey.')'),
            ]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        foreach ([
            'reconciliations',
            'debts',
            'audit_logs',
            'approval_logs',
            'expense_requests',
            'wallets',
            'notifications',
            'subscriptions',
            'transactions',
            'budgets',
            'monthly_plans',
            'categories',
        ] as $tableName) {
            Schema::table($tableName, function (Blueprint $table): void {
                $table->dropConstrainedForeignId('business_id');
            });
        }
    }
};
