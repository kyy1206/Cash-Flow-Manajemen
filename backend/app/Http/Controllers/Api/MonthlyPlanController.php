<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MonthlyPlan;
use App\Services\NotificationService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class MonthlyPlanController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'month' => ['sometimes', 'integer', 'between:1,12'],
            'year' => ['sometimes', 'integer', 'between:2000,2100'],
        ]);

        $ownerId = (int) DB::table('business_settings')->where('id', 1)->value('owner_user_id');
        $plans = MonthlyPlan::query()
            ->where('user_id', $ownerId)
            ->with('budgets.category')
            ->when(isset($validated['month']), fn (Builder $query) => $query->where('month', $validated['month']))
            ->when(isset($validated['year']), fn (Builder $query) => $query->where('year', $validated['year']))
            ->orderByDesc('year')
            ->orderByDesc('month')
            ->get();

        return response()->json(['data' => $plans]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'month' => ['required', 'integer', 'between:1,12'],
            'year' => ['required', 'integer', 'between:2000,2100'],
            'total_budget' => ['required', 'numeric', 'decimal:0,2', 'min:0', 'max:9999999999999.99'],
        ]);

        $ownerId = (int) DB::table('business_settings')->where('id', 1)->value('owner_user_id');
        $plan = MonthlyPlan::query()
            ->where('user_id', $ownerId)
            ->where('month', $validated['month'])
            ->where('year', $validated['year'])
            ->first();

        $allocated = $plan?->budgets()->sum('amount') ?? 0;

        if ((float) $validated['total_budget'] < (float) $allocated) {
            throw ValidationException::withMessages([
                'total_budget' => ['Target tidak boleh lebih kecil dari total alokasi budget kategori.'],
            ]);
        }

        $plan = $request->user()->monthlyPlans()->updateOrCreate(
            ['month' => $validated['month'], 'year' => $validated['year']],
            ['total_budget' => $validated['total_budget']],
        );
        app(NotificationService::class)->syncBudgetAlertsForPeriod($request->user(), $plan->year, $plan->month);

        return response()->json([
            'message' => 'Rencana bulanan berhasil disimpan.',
            'data' => $plan->load('budgets.category'),
        ], $plan->wasRecentlyCreated ? 201 : 200);
    }

    public function show(Request $request, MonthlyPlan $monthlyPlan): JsonResponse
    {
        $ownerId = (int) DB::table('business_settings')->where('id', 1)->value('owner_user_id');
        $plan = MonthlyPlan::query()
            ->where('user_id', $ownerId)
            ->with('budgets.category')
            ->findOrFail($monthlyPlan->id);

        return response()->json(['data' => $plan]);
    }

    public function update(Request $request, MonthlyPlan $monthlyPlan): JsonResponse
    {
        $plan = $request->user()->monthlyPlans()->findOrFail($monthlyPlan->id);

        $validated = $request->validate([
            'total_budget' => ['required', 'numeric', 'decimal:0,2', 'min:0', 'max:9999999999999.99'],
        ]);

        $allocated = $plan->budgets()->sum('amount');

        if ((float) $validated['total_budget'] < (float) $allocated) {
            throw ValidationException::withMessages([
                'total_budget' => ['Target tidak boleh lebih kecil dari total alokasi budget kategori.'],
            ]);
        }

        $plan->update(['total_budget' => $validated['total_budget']]);
        app(NotificationService::class)->syncBudgetAlertsForPeriod($request->user(), $plan->year, $plan->month);

        return response()->json([
            'message' => 'Rencana bulanan berhasil diperbarui.',
            'data' => $plan->load('budgets.category'),
        ]);
    }

    public function destroy(Request $request, MonthlyPlan $monthlyPlan): JsonResponse
    {
        $plan = $request->user()->monthlyPlans()->findOrFail($monthlyPlan->id);
        $plan->delete();

        return response()->json(['message' => 'Rencana bulanan berhasil dihapus.']);
    }
}
