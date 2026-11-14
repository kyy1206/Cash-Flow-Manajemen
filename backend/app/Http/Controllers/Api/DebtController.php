<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Debt;
use App\Models\Transaction;
use App\Models\Wallet;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DebtController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'type' => ['sometimes', 'in:all,receivable,payable'],
            'status' => ['sometimes', 'in:all,open,settled'],
            'due_period' => ['sometimes', 'in:all,overdue,today,next_7,later,no_due'],
            'search' => ['sometimes', 'string', 'max:255'],
        ]);
        $today = CarbonImmutable::today();
        $nextSevenDays = $today->addDays(7);
        $baseQuery = Debt::query()
            ->when(
                $request->user()->isRole('staff'),
                fn ($query) => $query->where('created_by', $request->user()->id),
            );

        $summaryRow = (clone $baseQuery)->selectRaw(
            "COUNT(*) as total_count,
            COALESCE(SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END), 0) as open_count,
            COALESCE(SUM(CASE WHEN status = 'settled' THEN 1 ELSE 0 END), 0) as settled_count,
            COALESCE(SUM(CASE WHEN type = 'payable' AND status = 'open' THEN 1 ELSE 0 END), 0) as payable_open_count,
            COALESCE(SUM(CASE WHEN type = 'receivable' AND status = 'open' THEN 1 ELSE 0 END), 0) as receivable_open_count,
            COALESCE(SUM(CASE WHEN type = 'payable' AND status = 'open' THEN remaining_amount ELSE 0 END), 0) as payable_open_amount,
            COALESCE(SUM(CASE WHEN type = 'receivable' AND status = 'open' THEN remaining_amount ELSE 0 END), 0) as receivable_open_amount,
            COALESCE(SUM(CASE WHEN status = 'open' AND due_date < ? THEN 1 ELSE 0 END), 0) as overdue_count,
            COALESCE(SUM(CASE WHEN status = 'open' AND due_date >= ? AND due_date <= ? THEN 1 ELSE 0 END), 0) as due_next_7_count,
            COALESCE(SUM(CASE WHEN status = 'open' AND due_date < ? THEN remaining_amount ELSE 0 END), 0) as overdue_amount,
            COALESCE(SUM(CASE WHEN type = 'payable' AND status = 'open' AND due_date < ? THEN remaining_amount ELSE 0 END), 0) as payable_overdue_amount,
            COALESCE(SUM(CASE WHEN type = 'payable' AND status = 'open' AND due_date >= ? AND due_date <= ? THEN remaining_amount ELSE 0 END), 0) as payable_due_0_7_amount,
            COALESCE(SUM(CASE WHEN type = 'payable' AND status = 'open' AND due_date > ? AND due_date <= ? THEN remaining_amount ELSE 0 END), 0) as payable_due_8_14_amount,
            COALESCE(SUM(CASE WHEN type = 'payable' AND status = 'open' AND due_date > ? THEN remaining_amount ELSE 0 END), 0) as payable_due_15_plus_amount,
            COALESCE(SUM(CASE WHEN type = 'payable' AND status = 'open' AND due_date IS NULL THEN remaining_amount ELSE 0 END), 0) as payable_no_due_amount",
            [
                $today->toDateString(),
                $today->toDateString(), $nextSevenDays->toDateString(),
                $today->toDateString(),
                $today->toDateString(),
                $today->toDateString(), $nextSevenDays->toDateString(),
                $nextSevenDays->toDateString(), $today->addDays(14)->toDateString(),
                $today->addDays(14)->toDateString(),
            ],
        )->first();
        $summary = [
            'total_count' => (int) $summaryRow->total_count,
            'open_count' => (int) $summaryRow->open_count,
            'settled_count' => (int) $summaryRow->settled_count,
            'payable_open_count' => (int) $summaryRow->payable_open_count,
            'receivable_open_count' => (int) $summaryRow->receivable_open_count,
            'payable_open_amount' => (float) $summaryRow->payable_open_amount,
            'receivable_open_amount' => (float) $summaryRow->receivable_open_amount,
            'net_position' => (float) $summaryRow->receivable_open_amount - (float) $summaryRow->payable_open_amount,
            'overdue_count' => (int) $summaryRow->overdue_count,
            'due_next_7_count' => (int) $summaryRow->due_next_7_count,
            'overdue_amount' => (float) $summaryRow->overdue_amount,
            'payable_overdue_amount' => (float) $summaryRow->payable_overdue_amount,
            'payable_due_0_7_amount' => (float) $summaryRow->payable_due_0_7_amount,
            'payable_due_8_14_amount' => (float) $summaryRow->payable_due_8_14_amount,
            'payable_due_15_plus_amount' => (float) $summaryRow->payable_due_15_plus_amount,
            'payable_no_due_amount' => (float) $summaryRow->payable_no_due_amount,
        ];

        $query = (clone $baseQuery)
            ->with('creator:id,name')
            ->when(
                isset($validated['type']) && $validated['type'] !== 'all',
                fn ($query) => $query->where('type', $validated['type']),
            )
            ->when(
                isset($validated['status']) && $validated['status'] !== 'all',
                fn ($query) => $query->where('status', $validated['status']),
            )
            ->when(isset($validated['due_period']), function ($query) use ($validated, $today, $nextSevenDays): void {
                match ($validated['due_period']) {
                    'overdue' => $query->where('status', 'open')->whereDate('due_date', '<', $today),
                    'today' => $query->where('status', 'open')->whereDate('due_date', $today),
                    'next_7' => $query->where('status', 'open')
                        ->whereDate('due_date', '>=', $today)
                        ->whereDate('due_date', '<=', $nextSevenDays),
                    'later' => $query->where('status', 'open')->whereDate('due_date', '>', $nextSevenDays),
                    'no_due' => $query->where('status', 'open')->whereNull('due_date'),
                    default => null,
                };
            })
            ->when(isset($validated['search']), function ($query) use ($validated): void {
                $search = trim($validated['search']);
                if ($search === '') {
                    return;
                }

                $query->where(function ($query) use ($search): void {
                    $query->where('counterparty', 'like', '%'.$search.'%')
                        ->orWhere('description', 'like', '%'.$search.'%');

                    if (preg_match('/^(?:#?(?:DEBT|UTG|PTG)-?)?0*(\d+)$/i', $search, $matches) === 1) {
                        $query->orWhereKey((int) $matches[1]);
                    }
                });
            });

        $alerts = (clone $baseQuery)
            ->with('creator:id,name')
            ->where('status', 'open')
            ->whereNotNull('due_date')
            ->whereDate('due_date', '<=', $nextSevenDays)
            ->orderBy('due_date')
            ->limit(4)
            ->get();

        return response()->json([
            'data' => $query
                ->orderByRaw("CASE WHEN status = 'open' THEN 0 ELSE 1 END")
                ->orderByRaw('CASE WHEN due_date IS NULL THEN 1 ELSE 0 END')
                ->orderBy('due_date')
                ->latest('id')
                ->paginate(20),
            'summary' => $summary,
            'alerts' => $alerts,
        ]);
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
        abort_if(
            $request->user()->isRole('staff') && $debt->created_by !== $request->user()->id,
            404,
            'Utang/piutang tidak ditemukan.',
        );

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
