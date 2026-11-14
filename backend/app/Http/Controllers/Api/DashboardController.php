<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Debt;
use App\Models\ExpenseRequest;
use App\Models\MonthlyPlan;
use App\Models\Transaction;
use App\Models\Wallet;
use App\Services\WalletBalanceService;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
        $todayTransactions = Transaction::query()
            ->where('financial_status', 'posted')
            ->whereDate('date', $today->toDateString())
            ->when(
                $request->user()->isRole('staff'),
                fn (Builder $query) => $query->where('user_id', $request->user()->id),
            );

        $incomeTotal = (float) (clone $transactions)->where('transaction_type', 'income')->sum('amount');
        $expenseTotal = (float) (clone $transactions)->where('transaction_type', 'expense')->sum('amount');
        $ownerId = (int) ($request->user()->business?->owner_user_id ?? $request->user()->id);
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
        $pendingRequestsQuery = ExpenseRequest::query()->where('status', 'pending')
            ->when($request->user()->isRole('staff'), fn (Builder $query) => $query->where('requested_by', $request->user()->id));
        $pendingRequests = (clone $pendingRequestsQuery)->count();
        $pendingRequestsAmount = (float) (clone $pendingRequestsQuery)->sum('amount');
        $pendingRequestsPreview = (clone $pendingRequestsQuery)
            ->with(['requester:id,name', 'category:id,name', 'wallet:id,name'])
            ->latest()
            ->limit(4)
            ->get()
            ->map(fn (ExpenseRequest $expenseRequest): array => [
                'id' => $expenseRequest->id,
                'purpose' => $expenseRequest->purpose,
                'description' => $expenseRequest->description,
                'amount' => (float) $expenseRequest->amount,
                'created_at' => $expenseRequest->created_at,
                'requester' => $expenseRequest->requester?->name,
                'category' => $expenseRequest->category?->name,
                'wallet' => $expenseRequest->wallet?->name,
                'has_attachment' => $expenseRequest->has_attachment,
            ]);
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
        $dailyCashFlow = (clone $transactions)->whereIn('transaction_type', ['income', 'expense'])
            ->selectRaw("date, SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END) as income, SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END) as expense")
            ->groupBy('date')
            ->orderBy('date')
            ->get()
            ->map(fn ($row): array => [
                'date' => CarbonImmutable::parse($row->date)->toDateString(),
                'income' => (float) $row->income,
                'expense' => (float) $row->expense,
            ]);
        $obligationPeriod = [
            $today->toDateString(),
            CarbonImmutable::parse($today)->addDays(14)->toDateString(),
        ];
        $upcomingObligationsQuery = Debt::query()
            ->where('status', 'open')
            ->whereNotNull('due_date')
            ->whereBetween('due_date', $obligationPeriod)
            ->when(
                $request->user()->isRole('staff'),
                fn (Builder $query) => $query->where('created_by', $request->user()->id),
            );
        $receivableDue = (float) (clone $upcomingObligationsQuery)->where('type', 'receivable')->sum('remaining_amount');
        $payableDue = (float) (clone $upcomingObligationsQuery)->where('type', 'payable')->sum('remaining_amount');
        $upcomingObligations = (clone $upcomingObligationsQuery)
            ->orderBy('due_date')
            ->orderBy('id')
            ->limit(5)
            ->get(['id', 'type', 'counterparty', 'remaining_amount', 'due_date'])
            ->map(fn (Debt $debt): array => [
                'id' => $debt->id,
                'type' => $debt->type,
                'counterparty' => $debt->counterparty,
                'remaining_amount' => (float) $debt->remaining_amount,
                'due_date' => $debt->due_date?->toDateString(),
            ]);
        $upcomingObligationsCount = (clone $upcomingObligationsQuery)->count();

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
                    'income_today' => (float) (clone $todayTransactions)->where('transaction_type', 'income')->sum('amount'),
                    'expense_today' => (float) (clone $todayTransactions)->where('transaction_type', 'expense')->sum('amount'),
                    'net_flow' => $incomeTotal - $expenseTotal,
                    'total_balance' => array_sum($balances),
                    'pending_requests' => $pendingRequests,
                    'pending_requests_amount' => $pendingRequestsAmount,
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
                'pending_requests_preview' => $pendingRequestsPreview,
                'daily_spending' => $dailyExpense,
                'daily_cash_flow' => $dailyCashFlow,
                'upcoming_obligations' => [
                    'count' => $upcomingObligationsCount,
                    'receivable_total' => $receivableDue,
                    'payable_total' => $payableDue,
                    'net_total' => $receivableDue - $payableDue,
                    'items' => $upcomingObligations,
                ],
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
