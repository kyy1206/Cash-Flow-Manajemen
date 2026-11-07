<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Wallet;
use App\Services\WalletBalanceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WalletController extends Controller
{
    public function index(WalletBalanceService $balances): JsonResponse
    {
        $wallets = Wallet::query()->orderBy('name')->get();
        $walletBalances = $balances->balances($wallets);

        return response()->json([
            'data' => $wallets->map(fn (Wallet $wallet): array => [
                'id' => $wallet->id,
                'name' => $wallet->name,
                'type' => $wallet->type,
                'opening_balance' => (float) $wallet->opening_balance,
                'balance' => $walletBalances[$wallet->id],
                'is_active' => $wallet->is_active,
            ]),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'type' => ['required', 'in:cash,bank,other'],
            'opening_balance' => ['required', 'numeric', 'decimal:0,2', 'min:0', 'max:9999999999999.99'],
        ]);

        $wallet = Wallet::create($validated + [
            'created_by' => $request->user()->id,
            'is_active' => true,
        ]);
        $this->audit($request, 'wallet.created', $wallet->id, 'Sumber dana dibuat');

        return response()->json(['data' => $wallet], 201);
    }

    public function update(Request $request, Wallet $wallet): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'type' => ['sometimes', 'required', 'in:cash,bank,other'],
            'is_active' => ['sometimes', 'required', 'boolean'],
        ]);

        $wallet->update($validated);
        $this->audit($request, 'wallet.updated', $wallet->id, 'Sumber dana diperbarui');

        return response()->json(['data' => $wallet]);
    }

    private function audit(Request $request, string $action, int $id, string $description): void
    {
        AuditLog::create([
            'user_id' => $request->user()->id,
            'action' => $action,
            'auditable_type' => Wallet::class,
            'auditable_id' => $id,
            'description' => $description,
            'ip_address' => $request->ip(),
        ]);
    }
}
