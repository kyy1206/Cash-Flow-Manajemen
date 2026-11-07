<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Debt;
use App\Models\Transaction;
use App\Models\Wallet;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DebtController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Debt::query()->with('creator:id,name')->latest();
        if ($request->user()->isRole('staff')) {
            $query->where('created_by', $request->user()->id);
        }

        return response()->json(['data' => $query->paginate(20)]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'type' => ['required', 'in:receivable,payable'],
            'counterparty' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:500'],
            'amount' => ['required', 'numeric', 'decimal:0,2', 'gt:0', 'max:9999999999999.99'],
            'due_date' => ['nullable', 'date_format:Y-m-d'],
        ]);

        $debt = Debt::create([
            'created_by' => $request->user()->id,
            'type' => $validated['type'],
            'counterparty' => $validated['counterparty'],
            'description' => $validated['description'] ?? null,
            'original_amount' => $validated['amount'],
            'remaining_amount' => $validated['amount'],
            'due_date' => $validated['due_date'] ?? null,
            'status' => 'open',
        ]);

        $this->audit($request, 'debt.created', $debt, 'Utang/piutang dicatat');

        return response()->json(['data' => $debt], 201);
    }

    public function settle(Request $request, Debt $debt): JsonResponse
    {
        $validated = $request->validate([
            'wallet_id' => ['required', 'integer', 'exists:wallets,id'],
            'amount' => ['required', 'numeric', 'decimal:0,2', 'gt:0', 'max:9999999999999.99'],
            'date' => ['required', 'date_format:Y-m-d'],
            'description' => ['nullable', 'string', 'max:2000'],
        ]);

        $transaction = DB::transaction(function () use ($request, $debt, $validated): Transaction {
            $lockedDebt = Debt::query()->lockForUpdate()->findOrFail($debt->id);
            abort_unless($lockedDebt->status === 'open', 409, 'Utang/piutang ini sudah lunas.');
            abort_if((float) $validated['amount'] > (float) $lockedDebt->remaining_amount, 422, 'Pembayaran melebihi sisa utang/piutang.');

            $wallet = Wallet::query()->whereKey($validated['wallet_id'])->where('is_active', true)->first();
            abort_if($wallet === null, 422, 'Sumber dana tidak aktif.');

            $remaining = round((float) $lockedDebt->remaining_amount - (float) $validated['amount'], 2);
            $lockedDebt->update([
                'remaining_amount' => $remaining,
                'status' => $remaining === 0.0 ? 'settled' : 'open',
            ]);

            return Transaction::create([
                'user_id' => $request->user()->id,
                'wallet_id' => $wallet->id,
                'amount' => $validated['amount'],
                'description' => $validated['description'] ?? (($lockedDebt->type === 'receivable' ? 'Penerimaan piutang dari ' : 'Pembayaran utang kepada ').$lockedDebt->counterparty),
                'date' => $validated['date'],
                'transaction_type' => $lockedDebt->type === 'receivable' ? 'income' : 'expense',
                'financial_status' => 'posted',
                'status' => 'completed',
                'source' => 'manual',
            ]);
        });

        $this->audit($request, 'debt.settled', $debt, 'Pembayaran utang/piutang dicatat');

        return response()->json(['data' => $transaction], 201);
    }

    private function audit(Request $request, string $action, Debt $debt, string $description): void
    {
        AuditLog::create([
            'user_id' => $request->user()->id,
            'action' => $action,
            'auditable_type' => Debt::class,
            'auditable_id' => $debt->id,
            'description' => $description,
            'ip_address' => $request->ip(),
        ]);
    }
}
