<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ApprovalLog;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\ExpenseRequest;
use App\Models\Notification;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ExpenseRequestController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['sometimes', 'in:pending,approved,rejected,paid'],
            'category_id' => ['sometimes', 'integer'],
            'wallet_id' => ['sometimes', 'integer'],
            'amount_min' => ['sometimes', 'numeric', 'min:0'],
            'amount_max' => ['sometimes', 'numeric', 'min:0', 'gte:amount_min'],
            'date_from' => ['sometimes', 'date_format:Y-m-d'],
            'date_to' => ['sometimes', 'date_format:Y-m-d', 'after_or_equal:date_from'],
            'search' => ['sometimes', 'string', 'max:255'],
        ]);

        $baseQuery = ExpenseRequest::query()
            ->with([
                'requester:id,name,role',
                'decider:id,name,role',
                'category:id,name',
                'wallet:id,name',
                'transaction',
            ])
            ->when(
                $request->user()->isRole('staff'),
                fn ($query) => $query->where('requested_by', $request->user()->id),
            )
            ->when(isset($validated['category_id']), fn ($query) => $query->where('category_id', $validated['category_id']))
            ->when(isset($validated['wallet_id']), fn ($query) => $query->where('wallet_id', $validated['wallet_id']))
            ->when(isset($validated['amount_min']), fn ($query) => $query->where('amount', '>=', $validated['amount_min']))
            ->when(isset($validated['amount_max']), fn ($query) => $query->where('amount', '<=', $validated['amount_max']))
            ->when(isset($validated['date_from']), fn ($query) => $query->whereDate('created_at', '>=', $validated['date_from']))
            ->when(isset($validated['date_to']), fn ($query) => $query->whereDate('created_at', '<=', $validated['date_to']))
            ->when(isset($validated['search']), function ($query) use ($validated): void {
                $search = trim($validated['search']);
                $query->where(function ($query) use ($search): void {
                    $query->where('purpose', 'like', '%'.$search.'%')
                        ->orWhere('description', 'like', '%'.$search.'%')
                        ->orWhereHas('requester', fn ($userQuery) => $userQuery->where('name', 'like', '%'.$search.'%'))
                        ->orWhereHas('category', fn ($categoryQuery) => $categoryQuery->where('name', 'like', '%'.$search.'%'))
                        ->orWhereHas('wallet', fn ($walletQuery) => $walletQuery->where('name', 'like', '%'.$search.'%'));

                    if (preg_match('/^(?:#?REQ-)?0*(\d+)$/i', $search, $matches) === 1) {
                        $query->orWhereKey((int) $matches[1]);
                    }
                });
            });

        $summary = [
            'total_count' => (clone $baseQuery)->count(),
            'total_amount' => (clone $baseQuery)->sum('amount'),
            'pending_count' => (clone $baseQuery)->where('status', 'pending')->count(),
            'pending_amount' => (clone $baseQuery)->where('status', 'pending')->sum('amount'),
            'approved_count' => (clone $baseQuery)->where('status', 'approved')->count(),
            'approved_amount' => (clone $baseQuery)->where('status', 'approved')->sum('amount'),
            'rejected_count' => (clone $baseQuery)->where('status', 'rejected')->count(),
            'rejected_amount' => (clone $baseQuery)->where('status', 'rejected')->sum('amount'),
            'paid_count' => (clone $baseQuery)->where('status', 'paid')->count(),
            'paid_amount' => (clone $baseQuery)->where('status', 'paid')->sum('amount'),
        ];

        $requests = (clone $baseQuery)
            ->when(isset($validated['status']), fn ($query) => $query->where('status', $validated['status']))
            ->latest()
            ->latest('id')
            ->paginate(20);

        return response()->json(['data' => $requests, 'summary' => $summary]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'category_id' => ['nullable', 'integer', 'exists:categories,id'],
            'wallet_id' => ['required', 'integer', 'exists:wallets,id'],
            'amount' => ['required', 'numeric', 'decimal:0,2', 'gt:0', 'max:9999999999999.99'],
            'purpose' => ['required', 'string', 'max:500'],
            'description' => ['nullable', 'string', 'max:2000'],
            'attachment' => ['nullable', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:5120'],
        ]);

        $walletIsActive = Wallet::query()
            ->whereKey($validated['wallet_id'])
            ->where('is_active', true)
            ->exists();
        abort_unless($walletIsActive, 422, 'Sumber dana tidak aktif.');

        if (isset($validated['category_id'])) {
            $categoryIsExpense = Category::query()
                ->whereKey($validated['category_id'])
                ->where('type', 'expense')
                ->exists();
            abort_unless($categoryIsExpense, 422, 'Kategori harus bertipe pengeluaran.');
        }

        $attachmentPath = isset($validated['attachment'])
            ? $validated['attachment']->store('expense-request-evidence', 'local')
            : null;
        abort_if(isset($validated['attachment']) && $attachmentPath === false, 500, 'Bukti pengeluaran gagal disimpan.');

        unset($validated['attachment']);
        $expenseRequest = ExpenseRequest::create($validated + [
            'requested_by' => $request->user()->id,
            'status' => 'pending',
            'attachment_path' => $attachmentPath,
        ]);

        $this->audit($request, 'expense_request.created', $expenseRequest, 'Pengajuan pengeluaran dibuat');
        User::query()->where('role', 'supervisor')->where('is_active', true)->each(
            fn (User $supervisor) => Notification::create([
                'user_id' => $supervisor->id,
                'type' => 'expense_request_pending',
                'message' => 'Pengajuan pengeluaran baru menunggu persetujuan.',
            ]),
        );

        return response()->json(['data' => $expenseRequest->load(['requester', 'category', 'wallet'])], 201);
    }

    public function downloadEvidence(Request $request, ExpenseRequest $expenseRequest): StreamedResponse
    {
        abort_unless(
            $request->user()->isRole('owner', 'supervisor')
                || $expenseRequest->requested_by === $request->user()->id,
            403,
        );
        abort_if($expenseRequest->attachment_path === null, 404);
        abort_unless(Storage::disk('local')->exists($expenseRequest->attachment_path), 404);

        return Storage::disk('local')->download($expenseRequest->attachment_path);
    }

    public function approve(Request $request, ExpenseRequest $expenseRequest): JsonResponse
    {
        return $this->decide($request, $expenseRequest, 'approved');
    }

    public function reject(Request $request, ExpenseRequest $expenseRequest): JsonResponse
    {
        return $this->decide($request, $expenseRequest, 'rejected');
    }

    public function pay(Request $request, ExpenseRequest $expenseRequest): JsonResponse
    {
        abort_unless($expenseRequest->requested_by === $request->user()->id, 403);
        abort_unless($expenseRequest->status === 'approved', 409, 'Hanya pengajuan yang disetujui yang dapat dicatat sebagai pembayaran.');

        $validated = $request->validate([
            'date' => ['required', 'date_format:Y-m-d'],
            'merchant' => ['nullable', 'string', 'max:255'],
            'payment_method' => ['nullable', 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:2000'],
        ]);

        $transaction = DB::transaction(function () use ($request, $expenseRequest, $validated): Transaction {
            $lockedRequest = ExpenseRequest::query()->lockForUpdate()->findOrFail($expenseRequest->id);
            abort_unless($lockedRequest->status === 'approved', 409, 'Status pengajuan sudah berubah.');

            $transaction = Transaction::create([
                'user_id' => $request->user()->id,
                'category_id' => $lockedRequest->category_id,
                'wallet_id' => $lockedRequest->wallet_id,
                'expense_request_id' => $lockedRequest->id,
                'amount' => $lockedRequest->amount,
                'description' => $validated['description'] ?? $lockedRequest->description ?? $lockedRequest->purpose,
                'merchant' => $validated['merchant'] ?? null,
                'payment_method' => $validated['payment_method'] ?? null,
                'date' => $validated['date'],
                'transaction_type' => 'expense',
                'financial_status' => 'posted',
                'status' => 'completed',
                'source' => 'manual',
            ]);

            $lockedRequest->update([
                'status' => 'paid',
                'transaction_id' => $transaction->id,
            ]);

            return $transaction;
        });

        $this->audit($request, 'expense_request.paid', $expenseRequest, 'Pembayaran pengajuan dicatat');

        return response()->json([
            'message' => 'Pengeluaran dibukukan dan saldo diperbarui.',
            'data' => $transaction->load(['category', 'wallet']),
        ], 201);
    }

    private function decide(Request $request, ExpenseRequest $expenseRequest, string $decision): JsonResponse
    {
        abort_unless($expenseRequest->requested_by !== $request->user()->id, 403, 'Pengajuan sendiri tidak dapat disetujui.');

        $validated = $request->validate([
            'note' => [$decision === 'rejected' ? 'required' : 'nullable', 'string', 'max:2000'],
        ]);

        DB::transaction(function () use ($request, $expenseRequest, $decision, $validated): void {
            $lockedRequest = ExpenseRequest::query()->lockForUpdate()->findOrFail($expenseRequest->id);
            abort_unless($lockedRequest->status === 'pending', 409, 'Pengajuan sudah diputuskan.');

            $lockedRequest->update([
                'status' => $decision,
                'decided_by' => $request->user()->id,
                'decided_at' => now(),
                'decision_note' => $validated['note'] ?? null,
            ]);

            ApprovalLog::create([
                'expense_request_id' => $lockedRequest->id,
                'approver_id' => $request->user()->id,
                'decision' => $decision,
                'note' => $validated['note'] ?? null,
                'decided_at' => now(),
            ]);

            Notification::create([
                'user_id' => $lockedRequest->requested_by,
                'type' => 'expense_request_'.$decision,
                'message' => $decision === 'approved'
                    ? 'Pengajuan "'.$lockedRequest->purpose.'" disetujui. Catat transaksi setelah pembayaran dilakukan.'
                    : 'Pengajuan "'.$lockedRequest->purpose.'" ditolak: '.$validated['note'],
            ]);
        });

        $this->audit($request, 'expense_request.'.$decision, $expenseRequest, 'Pengajuan pengeluaran '.$decision);

        return response()->json(['data' => $expenseRequest->fresh()->load(['requester', 'category', 'wallet'])]);
    }

    private function audit(Request $request, string $action, ExpenseRequest $expenseRequest, string $description): void
    {
        AuditLog::create([
            'user_id' => $request->user()->id,
            'action' => $action,
            'auditable_type' => ExpenseRequest::class,
            'auditable_id' => $expenseRequest->id,
            'description' => $description,
            'ip_address' => $request->ip(),
        ]);
    }
}
