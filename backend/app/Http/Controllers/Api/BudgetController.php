<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Budget;
use App\Models\Category;
use App\Models\MonthlyPlan;
use App\Models\Transaction;
use App\Services\NotificationService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class BudgetController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'monthly_plan_id' => ['required', 'integer'],
        ]);

        $ownerId = (int) ($request->user()->business?->owner_user_id ?? $request->user()->id);
        $plan = MonthlyPlan::query()->where('user_id', $ownerId)->findOrFail($validated['monthly_plan_id']);
        $start = sprintf('%04d-%02d-01', $plan->year, $plan->month);
        $end = date('Y-m-t', strtotime($start));

        $budgets = $plan->budgets()->with('category')->get()->map(function (Budget $budget) use ($start, $end): array {
            $spent = (float) Transaction::query()
                ->where('category_id', $budget->category_id)
                ->where('transaction_type', 'expense')
                ->where('financial_status', 'posted')
                ->whereBetween('date', [$start, $end])
                ->sum('amount');

            return $budget->toArray() + ['spent_amount' => $spent];
        });

        return response()->json(['data' => $budgets]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'monthly_plan_id' => ['required', 'integer'],
            'category_id' => ['required', 'integer'],
            'amount' => ['required', 'numeric', 'decimal:0,2', 'gt:0', 'max:9999999999999.99'],
        ]);

        $plan = $request->user()->monthlyPlans()->findOrFail($validated['monthly_plan_id']);
        $category = Category::query()->findOrFail($validated['category_id']);

        if ($plan->budgets()->where('category_id', $category->id)->exists()) {
            throw ValidationException::withMessages([
                'category_id' => ['Kategori sudah memiliki alokasi pada rencana ini.'],
            ]);
        }

        $this->ensureWithinPlan($plan->budgets()->sum('amount'), (float) $validated['amount'], (float) $plan->total_budget);

        $budget = $plan->budgets()->create([
            'category_id' => $category->id,
            'amount' => $validated['amount'],
        ]);
        app(NotificationService::class)->syncBudgetAlertsForPeriod($request->user(), $plan->year, $plan->month);

        return response()->json([
            'message' => 'Budget kategori berhasil ditambahkan.',
            'data' => $budget->load('category'),
        ], 201);
    }

    public function update(Request $request, Budget $budget): JsonResponse
    {
        $budget = $this->ownedBudget($request, $budget);
        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'decimal:0,2', 'gt:0', 'max:9999999999999.99'],
        ]);

        $otherAllocations = $budget->monthlyPlan->budgets()
            ->where('id', '!=', $budget->id)
            ->sum('amount');

        $this->ensureWithinPlan(
            (float) $otherAllocations,
            (float) $validated['amount'],
            (float) $budget->monthlyPlan->total_budget,
        );

        $budget->update(['amount' => $validated['amount']]);
        app(NotificationService::class)->syncBudgetAlertsForPeriod(
            $request->user(),
            $budget->monthlyPlan->year,
            $budget->monthlyPlan->month,
        );

        return response()->json([
            'message' => 'Budget kategori berhasil diperbarui.',
            'data' => $budget->load('category'),
        ]);
    }

    public function destroy(Request $request, Budget $budget): JsonResponse
    {
        $budget = $this->ownedBudget($request, $budget);
        $budget->delete();

        return response()->json(['message' => 'Budget kategori berhasil dihapus.']);
    }

    private function ownedBudget(Request $request, Budget $budget): Budget
    {
        return Budget::query()
            ->whereKey($budget->id)
            ->whereHas('monthlyPlan', fn (Builder $query) => $query->where('user_id', (int) ($request->user()->business?->owner_user_id ?? $request->user()->id)))
            ->firstOrFail();
    }

    private function ensureWithinPlan(float $currentAllocation, float $newAmount, float $totalBudget): void
    {
        if ($currentAllocation + $newAmount > $totalBudget) {
            throw ValidationException::withMessages([
                'amount' => ['Total alokasi budget kategori tidak boleh melebihi target bulanan.'],
            ]);
        }
    }
}
