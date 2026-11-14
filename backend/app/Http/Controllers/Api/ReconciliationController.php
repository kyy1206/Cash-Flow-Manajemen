<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Reconciliation;
use App\Models\Wallet;
use App\Services\WalletBalanceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReconciliationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['sometimes', 'in:pending,reviewed'],
            'wallet_id' => ['sometimes', 'integer'],
            'date_from' => ['sometimes', 'date_format:Y-m-d'],
            'date_to' => ['sometimes', 'date_format:Y-m-d', 'after_or_equal:date_from'],
            'search' => ['sometimes', 'string', 'max:255'],
        ]);

        $baseQuery = Reconciliation::query()
            ->with(['wallet:id,name', 'creator:id,name', 'reviewer:id,name'])
            ->when(
                $request->user()->isRole('staff'),
                fn ($query) => $query->where('created_by', $request->user()->id),
            )
            ->when(isset($validated['wallet_id']), fn ($query) => $query->where('wallet_id', $validated['wallet_id']))
            ->when(isset($validated['date_from']), fn ($query) => $query->whereDate('reconciled_at', '>=', $validated['date_from']))
            ->when(isset($validated['date_to']), fn ($query) => $query->whereDate('reconciled_at', '<=', $validated['date_to']))
            ->when(isset($validated['search']), function ($query) use ($validated): void {
                $search = trim($validated['search']);
                $query->where(function ($query) use ($search): void {
                    $query->where('notes', 'like', '%'.$search.'%')
                        ->orWhereHas('wallet', fn ($walletQuery) => $walletQuery->where('name', 'like', '%'.$search.'%'))
                        ->orWhereHas('creator', fn ($userQuery) => $userQuery->where('name', 'like', '%'.$search.'%'))
                        ->orWhereHas('reviewer', fn ($userQuery) => $userQuery->where('name', 'like', '%'.$search.'%'));

                    if (preg_match('/^(?:#?REC-)?0*(\d+)$/i', $search, $matches) === 1) {
                        $query->orWhereKey((int) $matches[1]);
                    }
                });
            });

        $summary = [
            'total_count' => (clone $baseQuery)->count(),
            'pending_count' => (clone $baseQuery)->where('status', 'pending')->count(),
            'reviewed_count' => (clone $baseQuery)->where('status', 'reviewed')->count(),
            'matched_count' => (clone $baseQuery)->where('difference', 0)->count(),
            'shortage_count' => (clone $baseQuery)->where('difference', '<', 0)->count(),
            'surplus_count' => (clone $baseQuery)->where('difference', '>', 0)->count(),
            'net_difference' => (clone $baseQuery)->sum('difference'),
            'total_absolute_difference' => (clone $baseQuery)->selectRaw('COALESCE(SUM(ABS(difference)), 0) as aggregate')->value('aggregate'),
        ];

        $reconciliations = (clone $baseQuery)
            ->when(isset($validated['status']), fn ($query) => $query->where('status', $validated['status']))
            ->latest('reconciled_at')
            ->latest('id')
            ->paginate(20);

        return response()->json(['data' => $reconciliations, 'summary' => $summary]);
    }

    public function store(Request $request, WalletBalanceService $walletBalances): JsonResponse
    {
        $validated = $request->validate([
            'wallet_id' => ['required', 'integer', 'exists:wallets,id'],
            'reconciled_at' => ['required', 'date_format:Y-m-d'],
            'counted_balance' => ['required', 'numeric', 'min:0', 'decimal:0,2', 'max:9999999999999.99'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $wallet = Wallet::query()->whereKey($validated['wallet_id'])->where('is_active', true)->first();
        abort_if($wallet === null, 422, 'Sumber dana tidak aktif.');

        $systemBalance = $walletBalances->balances(collect([$wallet]), $validated['reconciled_at'])[$wallet->id];

        $reconciliation = Reconciliation::create([
            'wallet_id' => $wallet->id,
            'created_by' => $request->user()->id,
            'reconciled_at' => $validated['reconciled_at'],
            'system_balance' => $systemBalance,
            'counted_balance' => $validated['counted_balance'],
            'difference' => round((float) $validated['counted_balance'] - $systemBalance, 2),
            'notes' => $validated['notes'] ?? null,
            'status' => 'pending',
        ]);

        $this->audit($request, 'reconciliation.created', $reconciliation, 'Rekonsiliasi kas diajukan');

        return response()->json(['data' => $reconciliation->load('wallet:id,name')], 201);
    }

    public function review(Request $request, Reconciliation $reconciliation): JsonResponse
    {
        abort_unless($reconciliation->status === 'pending', 409, 'Rekonsiliasi sudah direview.');
        $validated = $request->validate(['notes' => ['nullable', 'string', 'max:2000']]);

        $reconciliation->update([
            'reviewed_by' => $request->user()->id,
            'status' => 'reviewed',
            'notes' => $validated['notes'] ?? $reconciliation->notes,
        ]);
        $this->audit($request, 'reconciliation.reviewed', $reconciliation, 'Rekonsiliasi direview Supervisor');

        return response()->json(['data' => $reconciliation->fresh()->load(['wallet:id,name', 'reviewer:id,name'])]);
    }

    private function audit(Request $request, string $action, Reconciliation $reconciliation, string $description): void
    {
        AuditLog::create([
            'user_id' => $request->user()->id,
            'action' => $action,
            'auditable_type' => Reconciliation::class,
            'auditable_id' => $reconciliation->id,
            'description' => $description,
            'ip_address' => $request->ip(),
        ]);
    }
}
