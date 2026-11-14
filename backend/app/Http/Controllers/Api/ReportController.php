<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MonthlyPlan;
use App\Models\Transaction;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

class ReportController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'year' => ['sometimes', 'integer', 'between:2000,2100'],
            'month' => ['sometimes', 'integer', 'between:1,12'],
        ]);

        $year = (int) ($validated['year'] ?? now()->year);
        $month = (int) ($validated['month'] ?? now()->month);
        $selectedStart = CarbonImmutable::create($year, $month, 1);
        $selectedEnd = $selectedStart->endOfMonth();
        $previousStart = $selectedStart->subMonth();
        $previousEnd = $previousStart->endOfMonth();

        $ownerId = (int) ($request->user()->business?->owner_user_id ?? $request->user()->id);
        $staffId = $request->user()->isRole('staff') ? $request->user()->id : null;
        $monthlySpending = collect(range(1, 12))->map(function (int $monthNumber) use ($year, $ownerId, $staffId): array {
            $start = CarbonImmutable::create($year, $monthNumber, 1);
            $end = $start->endOfMonth();
            $budget = MonthlyPlan::query()
                ->where('user_id', $ownerId)
                ->where('year', $year)
                ->where('month', $monthNumber)
                ->value('total_budget');
            $periodTransactions = Transaction::query()
                ->where('financial_status', 'posted')
                ->whereBetween('date', [$start->toDateString(), $end->toDateString()])
                ->when($staffId !== null, fn ($query) => $query->where('user_id', $staffId))
                ->get(['transaction_type', 'amount']);
            $income = (float) $periodTransactions->where('transaction_type', 'income')->sum('amount');
            $spent = (float) $periodTransactions->where('transaction_type', 'expense')->sum('amount');

            return [
                'month' => $monthNumber,
                'label' => $start->translatedFormat('M'),
                'income' => $income,
                'spent' => $spent,
                'budget' => (float) ($budget ?? 0),
                'cash_flow' => $income - $spent,
            ];
        });

        $categoryTotalsForPeriod = function (CarbonImmutable $start, CarbonImmutable $end) use ($staffId): Collection {
            return Transaction::query()
                ->leftJoin('categories', 'transactions.category_id', '=', 'categories.id')
                ->leftJoin('budgets', 'transactions.budget_id', '=', 'budgets.id')
                ->leftJoin('categories as budget_categories', 'budgets.category_id', '=', 'budget_categories.id')
                ->where('transactions.financial_status', 'posted')
                ->whereIn('transactions.transaction_type', ['income', 'expense'])
                ->whereBetween('transactions.date', [$start->toDateString(), $end->toDateString()])
                ->when($staffId !== null, fn ($query) => $query->where('transactions.user_id', $staffId))
                ->selectRaw("transactions.transaction_type, COALESCE(categories.name, budget_categories.name, 'Tanpa kategori') as category, SUM(transactions.amount) as total")
                ->groupBy('transactions.transaction_type', 'categories.name', 'budget_categories.name')
                ->orderByDesc('total')
                ->get();
        };
        $mapCategoryTotals = static fn (Collection $rows, string $type): Collection => $rows
            ->where('transaction_type', $type)
            ->map(fn ($row): array => [
                'category' => $row->category,
                'total' => (float) $row->total,
            ])->values();
        $selectedCategoryTotals = $categoryTotalsForPeriod($selectedStart, $selectedEnd);
        $previousCategoryTotals = $categoryTotalsForPeriod($previousStart, $previousEnd);
        $categoryIncome = $mapCategoryTotals($selectedCategoryTotals, 'income');
        $categorySpending = $mapCategoryTotals($selectedCategoryTotals, 'expense');
        $previousCategoryIncome = $mapCategoryTotals($previousCategoryTotals, 'income');
        $previousCategorySpending = $mapCategoryTotals($previousCategoryTotals, 'expense');

        $dailySpending = Transaction::query()
            ->where('financial_status', 'posted')
            ->where('transaction_type', 'expense')
            ->whereBetween('date', [$selectedStart->toDateString(), $selectedEnd->toDateString()])
            ->when($staffId !== null, fn ($query) => $query->where('user_id', $staffId))
            ->selectRaw('date, SUM(amount) as total')
            ->groupBy('date')
            ->orderBy('date')
            ->get()
            ->map(fn ($row): array => [
                'date' => CarbonImmutable::parse($row->date)->toDateString(),
                'total' => (float) $row->total,
            ]);

        $dailyFlowRows = Transaction::query()
            ->where('financial_status', 'posted')
            ->whereIn('transaction_type', ['income', 'expense'])
            ->whereBetween('date', [$selectedStart->toDateString(), $selectedEnd->toDateString()])
            ->when($staffId !== null, fn ($query) => $query->where('user_id', $staffId))
            ->selectRaw('date, transaction_type, SUM(amount) as total')
            ->groupBy('date', 'transaction_type')
            ->orderBy('date')
            ->get();
        $dailyCashFlow = $dailyFlowRows
            ->groupBy(fn ($row): string => CarbonImmutable::parse($row->date)->toDateString())
            ->map(function (Collection $rows, string $date): array {
                $income = (float) ($rows->firstWhere('transaction_type', 'income')->total ?? 0);
                $expense = (float) ($rows->firstWhere('transaction_type', 'expense')->total ?? 0);

                return [
                    'date' => $date,
                    'income' => $income,
                    'expense' => $expense,
                    'net_flow' => $income - $expense,
                ];
            })->values();

        $selectedTransactionCount = Transaction::query()
            ->where('financial_status', 'posted')
            ->whereIn('transaction_type', ['income', 'expense'])
            ->whereBetween('date', [$selectedStart->toDateString(), $selectedEnd->toDateString()])
            ->when($staffId !== null, fn ($query) => $query->where('user_id', $staffId))
            ->count();

        $yearTotal = (float) $monthlySpending->sum('spent');
        $yearIncome = (float) $monthlySpending->sum('income');
        $selectedTotal = (float) $categorySpending->sum('total');
        $selectedIncome = (float) $categoryIncome->sum('total');
        $previousTotal = (float) $previousCategorySpending->sum('total');
        $previousIncome = (float) $previousCategoryIncome->sum('total');
        $selectedBudget = (float) ($monthlySpending->firstWhere('month', $month)['budget'] ?? 0);
        $previousBudget = (float) (MonthlyPlan::query()
            ->where('user_id', $ownerId)
            ->where('year', $previousStart->year)
            ->where('month', $previousStart->month)
            ->value('total_budget') ?? 0);

        return response()->json([
            'data' => [
                'period' => ['year' => $year, 'month' => $month],
                'previous_period' => [
                    'year' => $previousStart->year,
                    'month' => $previousStart->month,
                    'label' => $previousStart->translatedFormat('F Y'),
                ],
                'scope' => $staffId === null ? 'business' : 'own_activity',
                'summary' => [
                    'year_total' => $yearTotal,
                    'year_income' => $yearIncome,
                    'year_net_flow' => $yearIncome - $yearTotal,
                    'monthly_average' => round($yearTotal / 12, 2),
                    'selected_month_total' => $selectedTotal,
                    'selected_month_income' => $selectedIncome,
                    'selected_month_net_flow' => $selectedIncome - $selectedTotal,
                    'selected_month_transaction_count' => $selectedTransactionCount,
                    'selected_month_budget' => $selectedBudget,
                    'budget_variance' => $selectedBudget - $selectedTotal,
                    'category_count' => $categorySpending->count(),
                    'previous_month_total' => $previousTotal,
                    'previous_month_income' => $previousIncome,
                    'previous_month_net_flow' => $previousIncome - $previousTotal,
                    'previous_month_budget' => $previousBudget,
                ],
                'monthly_spending' => $monthlySpending,
                'category_income' => $categoryIncome,
                'category_spending' => $categorySpending,
                'previous_category_income' => $previousCategoryIncome,
                'previous_category_spending' => $previousCategorySpending,
                'daily_spending' => $dailySpending,
                'daily_cash_flow' => $dailyCashFlow,
            ],
        ]);
    }
}
