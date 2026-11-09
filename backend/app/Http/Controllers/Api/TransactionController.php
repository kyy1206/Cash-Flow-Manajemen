<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Budget;
use App\Models\Category;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Services\NotificationService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class TransactionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'date_from' => ['sometimes', 'date_format:Y-m-d'],
            'date_to' => ['sometimes', 'date_format:Y-m-d', 'after_or_equal:date_from'],
            'transaction_type' => ['sometimes', 'in:income,expense,transfer'],
            'category_id' => ['sometimes', 'integer'],
            'wallet_id' => ['sometimes', 'integer'],
            'search' => ['sometimes', 'string', 'max:255'],
        ]);

        $transactions = Transaction::query()
            ->with(['user:id,name,role', 'category:id,name,type', 'wallet:id,name', 'destinationWallet:id,name', 'reversal:id,reversal_of_id'])
            ->where('financial_status', 'posted')
            ->when(
                $request->user()->isRole('staff'),
                fn (Builder $query) => $query->where('user_id', $request->user()->id),
            )
            ->when(isset($validated['date_from']), fn (Builder $query) => $query->whereDate('date', '>=', $validated['date_from']))
            ->when(isset($validated['date_to']), fn (Builder $query) => $query->whereDate('date', '<=', $validated['date_to']))
            ->when(isset($validated['transaction_type']), fn (Builder $query) => $query->where('transaction_type', $validated['transaction_type']))
            ->when(isset($validated['category_id']), fn (Builder $query) => $query->where('category_id', $validated['category_id']))
            ->when(isset($validated['wallet_id']), fn (Builder $query) => $query->where(function (Builder $query) use ($validated): void {
                $query->where('wallet_id', $validated['wallet_id'])
                    ->orWhere('destination_wallet_id', $validated['wallet_id']);
            }))
            ->when(isset($validated['search']), fn (Builder $query) => $query->where(function (Builder $query) use ($validated): void {
                $query->where('description', 'like', '%'.$validated['search'].'%')
                    ->orWhere('merchant', 'like', '%'.$validated['search'].'%');
            }))
            ->orderByDesc('date')
            ->orderByDesc('id')
            ->paginate(20);

        return response()->json(['data' => $transactions]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'transaction_type' => ['required', 'in:income,expense,transfer'],
            'category_id' => ['nullable', 'integer', 'exists:categories,id'],
            'wallet_id' => ['required', 'integer', 'exists:wallets,id'],
            'destination_wallet_id' => ['nullable', 'integer', 'different:wallet_id', 'exists:wallets,id'],
            'budget_id' => ['nullable', 'integer', 'exists:budgets,id'],
            'amount' => ['required', 'numeric', 'decimal:0,2', 'gt:0', 'max:9999999999999.99'],
            'description' => ['nullable', 'string', 'max:2000'],
            'date' => ['required', 'date_format:Y-m-d'],
            'merchant' => ['nullable', 'string', 'max:255'],
            'payment_method' => ['nullable', 'string', 'max:100'],
            'source' => ['sometimes', 'in:manual,ocr'],
        ]);

        $wallet = Wallet::query()->whereKey($validated['wallet_id'])->where('is_active', true)->first();
        if ($wallet === null) {
            throw ValidationException::withMessages(['wallet_id' => ['Sumber dana tidak aktif atau tidak ditemukan.']]);
        }

        $destinationWallet = null;
        if (isset($validated['budget_id'])) {
            $ownerId = (int) ($request->user()->business?->owner_user_id ?? $request->user()->id);
            $budget = Budget::query()
                ->whereKey($validated['budget_id'])
                ->whereHas('monthlyPlan', fn (Builder $query) => $query->where('user_id', $ownerId))
                ->with('monthlyPlan')
                ->first();

            if ($budget === null) {
                throw ValidationException::withMessages(['budget_id' => ['Anggaran usaha tidak ditemukan.']]);
            }

            if ($budget->monthlyPlan->year !== (int) substr($validated['date'], 0, 4)
                || $budget->monthlyPlan->month !== (int) substr($validated['date'], 5, 2)) {
                throw ValidationException::withMessages(['date' => ['Tanggal transaksi harus berada pada periode anggaran yang dipilih.']]);
            }

            if (isset($validated['category_id']) && $validated['category_id'] !== $budget->category_id) {
                throw ValidationException::withMessages(['category_id' => ['Kategori harus sesuai dengan anggaran yang dipilih.']]);
            }

            $validated['category_id'] ??= $budget->category_id;
        }

        if ($validated['transaction_type'] === 'transfer') {
            if ($request->user()->isRole('staff')) {
                abort(403, 'Staff tidak memiliki kewenangan melakukan transfer antar rekening.');
            }

            if (empty($validated['destination_wallet_id'])) {
                throw ValidationException::withMessages(['destination_wallet_id' => ['Tujuan transfer wajib dipilih.']]);
            }

            $destinationWallet = Wallet::query()->whereKey($validated['destination_wallet_id'])
                ->where('is_active', true)->first();
            if ($destinationWallet === null) {
                throw ValidationException::withMessages(['destination_wallet_id' => ['Sumber dana tujuan tidak aktif.']]);
            }

            if (isset($validated['category_id'])) {
                throw ValidationException::withMessages(['category_id' => ['Transfer internal tidak menggunakan kategori pemasukan atau pengeluaran.']]);
            }
        }

        if ($validated['transaction_type'] !== 'transfer') {
            if (empty($validated['category_id'])) {
                throw ValidationException::withMessages(['category_id' => ['Kategori wajib dipilih.']]);
            }

            $category = Category::query()->whereKey($validated['category_id'])
                ->where('type', $validated['transaction_type'])->first();
            if ($category === null) {
                throw ValidationException::withMessages(['category_id' => ['Kategori tidak sesuai dengan jenis transaksi.']]);
            }

            if ($request->user()->isRole('staff') && $validated['transaction_type'] === 'expense'
                && $this->requiresApproval(
                    $category,
                    (float) $validated['amount'],
                    $request->user()->business?->approval_threshold,
                )) {
                throw ValidationException::withMessages([
                    'amount' => ['Pengeluaran ini harus diajukan kepada Supervisor sebelum dibayarkan.'],
                ]);
            }
        }

        if ($request->user()->isRole('staff') && $validated['transaction_type'] === 'transfer') {
            abort(403);
        }

        $transaction = DB::transaction(fn (): Transaction => Transaction::create([
            'user_id' => $request->user()->id,
            'category_id' => $validated['category_id'] ?? null,
            'budget_id' => $validated['budget_id'] ?? null,
            'wallet_id' => $wallet->id,
            'destination_wallet_id' => $destinationWallet?->id,
            'amount' => $validated['amount'],
            'description' => $validated['description'] ?? null,
            'date' => $validated['date'],
            'merchant' => $validated['merchant'] ?? null,
            'payment_method' => $validated['payment_method'] ?? null,
            'source' => $validated['source'] ?? 'manual',
            'status' => 'completed',
            'transaction_type' => $validated['transaction_type'],
            'financial_status' => 'posted',
        ]));

        $this->audit($request, 'transaction.posted', $transaction, 'Transaksi '.$transaction->transaction_type.' diposting');
        $ownerId = (int) ($request->user()->business?->owner_user_id ?? $request->user()->id);
        app(NotificationService::class)->syncBudgetAlertsForPeriod(
            User::query()->findOrFail($ownerId),
            (int) substr($validated['date'], 0, 4),
            (int) substr($validated['date'], 5, 2),
        );

        return response()->json([
            'message' => 'Transaksi berhasil dicatat dan saldo diperbarui.',
            'data' => $transaction->load(['category', 'wallet', 'destinationWallet', 'user:id,name']),
        ], 201);
    }

    public function show(Request $request, Transaction $transaction): JsonResponse
    {
        abort_unless($transaction->financial_status === 'posted', 404);
        abort_unless(
            ! $request->user()->isRole('staff') || $transaction->user_id === $request->user()->id,
            404,
        );

        return response()->json([
            'data' => $transaction->load(['category', 'wallet', 'destinationWallet', 'user:id,name']),
        ]);
    }

    public function update(Request $request, Transaction $transaction): JsonResponse
    {
        abort_if($transaction->financial_status === 'posted', 409, 'Transaksi Posted tidak dapat diedit. Buat transaksi koreksi agar jejak audit tetap utuh.');

        return response()->json(['message' => 'Hanya transaksi Draft yang dapat diperbarui.'], 409);
    }

    public function destroy(Transaction $transaction): JsonResponse
    {
        abort_if($transaction->financial_status === 'posted', 409, 'Transaksi Posted tidak dapat dihapus. Gunakan mekanisme koreksi.');

        return response()->json(['message' => 'Transaksi Draft tidak tersedia untuk dihapus melalui endpoint ini.'], 409);
    }

    public function reverse(Request $request, Transaction $transaction): JsonResponse
    {
        $validated = $request->validate([
            'reason' => ['required', 'string', 'max:500'],
        ]);

        $reversal = DB::transaction(function () use ($request, $transaction, $validated): Transaction {
            $original = Transaction::query()->lockForUpdate()->findOrFail($transaction->id);
            abort_unless($original->financial_status === 'posted', 409, 'Hanya transaksi Posted yang dapat dikoreksi.');
            abort_if(
                Transaction::query()->where('reversal_of_id', $original->id)->exists(),
                409,
                'Transaksi ini sudah dikoreksi.',
            );

            $isTransfer = $original->transaction_type === 'transfer';
            $type = match ($original->transaction_type) {
                'income' => 'expense',
                'expense' => 'income',
                default => 'transfer',
            };

            return Transaction::create([
                'user_id' => $request->user()->id,
                'category_id' => $isTransfer || $type !== $original->transaction_type ? null : $original->category_id,
                'wallet_id' => $isTransfer ? $original->destination_wallet_id : $original->wallet_id,
                'destination_wallet_id' => $isTransfer ? $original->wallet_id : null,
                'amount' => $original->amount,
                'description' => 'Koreksi transaksi #'.$original->id.': '.$validated['reason'],
                'date' => now()->toDateString(),
                'transaction_type' => $type,
                'financial_status' => 'posted',
                'status' => 'completed',
                'source' => 'manual',
                'reversal_of_id' => $original->id,
            ]);
        });

        $this->audit($request, 'transaction.reversed', $reversal, 'Transaksi #'.$transaction->id.' dikoreksi');

        return response()->json(['data' => $reversal], 201);
    }

    private function requiresApproval(Category $category, float $amount, ?float $threshold): bool
    {
        return $category->requires_approval || ($threshold !== null && $amount >= (float) $threshold);
    }

    private function audit(Request $request, string $action, Transaction $transaction, string $description): void
    {
        AuditLog::create([
            'user_id' => $request->user()->id,
            'action' => $action,
            'auditable_type' => Transaction::class,
            'auditable_id' => $transaction->id,
            'description' => $description,
            'new_values' => $transaction->only(['transaction_type', 'amount', 'wallet_id', 'category_id', 'date']),
            'ip_address' => $request->ip(),
        ]);
    }
}
