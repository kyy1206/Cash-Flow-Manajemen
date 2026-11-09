<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MonthlyPlan;
use App\Models\Transaction;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
        $selectedStart = CarbonImmutable::create($year, $month, 1)->toDateString();
        $selectedEnd = CarbonImmutable::create($year, $month, 1)->endOfMonth()->toDateString();

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

        $categorySpending = Transaction::query()
            ->leftJoin('categories', 'transactions.category_id', '=', 'categories.id')
            ->leftJoin('budgets', 'transactions.budget_id', '=', 'budgets.id')
            ->leftJoin('categories as budget_categories', 'budgets.category_id', '=', 'budget_categories.id')
            ->where('transactions.financial_status', 'posted')
            ->where('transactions.transaction_type', 'expense')
            ->whereBetween('transactions.date', [$selectedStart, $selectedEnd])
            ->when($staffId !== null, fn ($query) => $query->where('transactions.user_id', $staffId))
            ->selectRaw("COALESCE(categories.name, budget_categories.name, 'Tanpa kategori') as category, SUM(transactions.amount) as total")
            ->groupBy('categories.name', 'budget_categories.name')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($row): array => [
                'category' => $row->category,
                'total' => (float) $row->total,
            ]);

        $dailySpending = Transaction::query()
            ->where('financial_status', 'posted')
            ->where('transaction_type', 'expense')
            ->whereBetween('date', [$selectedStart, $selectedEnd])
            ->when($staffId !== null, fn ($query) => $query->where('user_id', $staffId))
            ->selectRaw('date, SUM(amount) as total')
            ->groupBy('date')
            ->orderBy('date')
            ->get()
            ->map(fn ($row): array => [
                'date' => CarbonImmutable::parse($row->date)->toDateString(),
                'total' => (float) $row->total,
            ]);

        $yearTotal = (float) $monthlySpending->sum('spent');
        $yearIncome = (float) $monthlySpending->sum('income');
        $selectedTotal = (float) $categorySpending->sum('total');
        $selectedBudget = (float) ($monthlySpending->firstWhere('month', $month)['budget'] ?? 0);

        return response()->json([
            'data' => [
                'period' => ['year' => $year, 'month' => $month],
                'scope' => $staffId === null ? 'business' : 'own_activity',
                'summary' => [
                    'year_total' => $yearTotal,
                    'year_income' => $yearIncome,
                    'year_net_flow' => $yearIncome - $yearTotal,
                    'monthly_average' => round($yearTotal / 12, 2),
                    'selected_month_total' => $selectedTotal,
                    'selected_month_budget' => $selectedBudget,
                    'budget_variance' => $selectedBudget - $selectedTotal,
                    'category_count' => $categorySpending->count(),
                ],
                'monthly_spending' => $monthlySpending,
                'category_spending' => $categorySpending,
                'daily_spending' => $dailySpending,
            ],
        ]);
    }
}
