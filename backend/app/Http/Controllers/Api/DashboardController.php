<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ExpenseRequest;
use App\Models\MonthlyPlan;
use App\Models\Transaction;
use App\Models\Wallet;
use App\Services\WalletBalanceService;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function __invoke(Request $request, WalletBalanceService $walletBalances): JsonResponse
    {
        $validated = $request->validate([
            'month' => ['sometimes', 'integer', 'between:1,12'],
            'year' => ['sometimes', 'integer', 'between:2000,2100'],
        ]);

        $today = now();
        $month = (int) ($validated['month'] ?? $today->month);
        $year = (int) ($validated['year'] ?? $today->year);
        $start = CarbonImmutable::create($year, $month, 1)->startOfDay();
        $end = $start->endOfMonth();
        $transactions = Transaction::query()
            ->where('financial_status', 'posted')
            ->whereBetween('date', [$start->toDateString(), $end->toDateString()])
            ->when(
                $request->user()->isRole('staff'),
                fn (Builder $query) => $query->where('user_id', $request->user()->id),
            );

        $incomeTotal = (float) (clone $transactions)->where('transaction_type', 'income')->sum('amount');
        $expenseTotal = (float) (clone $transactions)->where('transaction_type', 'expense')->sum('amount');
        $ownerId = (int) DB::table('business_settings')->where('id', 1)->value('owner_user_id');
        $plan = MonthlyPlan::query()->where('user_id', $ownerId)->where('month', $month)->where('year', $year)
            ->with('budgets.category')->first();
        $budgetCategories = $plan?->budgets->map(function ($budget) use ($start, $end, $request): array {
            $spent = (float) Transaction::query()
                ->where('category_id', $budget->category_id)
                ->where('transaction_type', 'expense')
                ->where('financial_status', 'posted')
                ->whereBetween('date', [$start->toDateString(), $end->toDateString()])
                ->when(
                    $request->user()->isRole('staff'),
                    fn (Builder $query) => $query->where('user_id', $request->user()->id),
                )
                ->sum('amount');

            return [
                'category' => $budget->category?->name ?? 'Kategori',
                'amount' => (float) $budget->amount,
                'spent' => $spent,
                'remaining' => (float) $budget->amount - $spent,
                'percentage' => (float) $budget->amount > 0 ? round(($spent / (float) $budget->amount) * 100, 1) : 0,
                'status' => $this->statusFor((float) $budget->amount > 0 ? ($spent / (float) $budget->amount) * 100 : 0),
            ];
        }) ?? collect();
        $wallets = Wallet::query()->where('is_active', true)->orderBy('name')->get();
        $balances = $walletBalances->balances($wallets);
        $pendingRequests = ExpenseRequest::query()->where('status', 'pending')
            ->when($request->user()->isRole('staff'), fn (Builder $query) => $query->where('requested_by', $request->user()->id))
            ->count();
        $budgetTotal = (float) ($plan?->total_budget ?? 0);
        $remaining = $budgetTotal - $expenseTotal;
        $percentage = $budgetTotal > 0
            ? round(($expenseTotal / $budgetTotal) * 100, 1)
            : ($expenseTotal > 0 ? 100.0 : 0.0);
        $isCurrentPeriod = $month === $today->month && $year === $today->year;
        $daysRemaining = $isCurrentPeriod ? $end->day - $today->day + 1 : 0;
        $dailyLimit = $daysRemaining > 0 ? round(max(0, $remaining) / $daysRemaining, 2) : 0;

        $recentTransactions = (clone $transactions)->with(['category:id,name', 'wallet:id,name'])
            ->orderByDesc('date')->orderByDesc('id')->limit(8)->get()
            ->map(fn (Transaction $transaction): array => [
                'id' => $transaction->id,
                'date' => $transaction->date->toDateString(),
                'description' => $transaction->description,
                'merchant' => $transaction->merchant,
                'amount' => (float) $transaction->amount,
                'transaction_type' => $transaction->transaction_type,
                'category' => $transaction->category?->name,
                'wallet' => $transaction->wallet?->name,
            ]);

        $dailyExpense = (clone $transactions)->where('transaction_type', 'expense')
            ->selectRaw('date, SUM(amount) as total')
            ->groupBy('date')
            ->orderBy('date')
            ->get()
            ->map(fn ($row): array => [
                'date' => CarbonImmutable::parse($row->date)->toDateString(),
                'amount' => (float) $row->total,
            ]);

        return response()->json([
            'data' => [
                'period' => ['month' => $month, 'year' => $year],
                'plan' => $plan === null ? null : [
                    'id' => $plan->id,
                    'total_budget' => $budgetTotal,
                ],
                'summary' => [
                    'income_total' => $incomeTotal,
                    'expense_total' => $expenseTotal,
                    'net_flow' => $incomeTotal - $expenseTotal,
                    'total_balance' => array_sum($balances),
                    'pending_requests' => $pendingRequests,
                    'wallet_count' => $wallets->count(),
                    'budget_total' => $budgetTotal,
                    'spent_total' => $expenseTotal,
                    'remaining' => $remaining,
                    'percentage' => $percentage,
                    'status' => $this->statusFor($percentage),
                    'daily_limit' => $dailyLimit,
                    'days_remaining' => $daysRemaining,
                ],
                'budget_categories' => $budgetCategories,
                'wallets' => $wallets->map(fn (Wallet $wallet): array => [
                    'id' => $wallet->id,
                    'name' => $wallet->name,
                    'type' => $wallet->type,
                    'balance' => $balances[$wallet->id],
                ]),
                'recent_transactions' => $recentTransactions,
                'daily_spending' => $dailyExpense,
            ],
        ]);
    }

    private function statusFor(float $percentage): string
    {
        return match (true) {
            $percentage > 100 => 'overbudget',
            $percentage >= 80 => 'kritis',
            $percentage >= 50 => 'waspada',
            default => 'aman',
        };
    }
}
