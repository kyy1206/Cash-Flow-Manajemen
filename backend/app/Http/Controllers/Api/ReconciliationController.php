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
        $query = Reconciliation::query()->with(['wallet:id,name', 'creator:id,name', 'reviewer:id,name'])->latest('reconciled_at');
        if ($request->user()->isRole('staff')) {
            $query->where('created_by', $request->user()->id);
        }

        return response()->json(['data' => $query->paginate(20)]);
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
