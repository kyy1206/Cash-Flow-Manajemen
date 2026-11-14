<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AuditLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'search' => ['sometimes', 'nullable', 'string', 'max:100'],
            'action' => ['sometimes', 'nullable', 'string', 'max:100'],
            'date_from' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'date_to' => ['sometimes', 'nullable', 'date_format:Y-m-d', 'after_or_equal:date_from'],
            'per_page' => ['sometimes', 'integer', 'between:1,100'],
        ]);

        $recentLogs = AuditLog::query()->where('created_at', '>=', now()->subDays(30));
        $actionCounts = (clone $recentLogs)
            ->selectRaw('action, COUNT(*) as total')
            ->groupBy('action')
            ->get();
        $modules = $actionCounts
            ->groupBy(fn ($item) => Str::before($item->action, '.'))
            ->map(fn ($items, $module) => [
                'module' => $module,
                'label' => $this->moduleLabel($module),
                'count' => (int) $items->sum('total'),
            ])
            ->sortByDesc('count')
            ->values();

        return response()->json([
            'data' => $this->filteredQuery($validated)
                ->orderByDesc('created_at')
                ->orderByDesc('id')
                ->paginate($validated['per_page'] ?? 20)
                ->withQueryString(),
            'summary' => [
                'total_count' => AuditLog::query()->count(),
                'last_30_days' => (clone $recentLogs)->count(),
                'actors_last_30_days' => (clone $recentLogs)->whereNotNull('user_id')->distinct('user_id')->count('user_id'),
                'modules_last_30_days' => $modules->count(),
                'modules' => $modules,
            ],
            'action_options' => AuditLog::query()->distinct()->orderBy('action')->pluck('action'),
        ]);
    }

    public function export(Request $request): StreamedResponse
    {
        $validated = $request->validate([
            'search' => ['sometimes', 'nullable', 'string', 'max:100'],
            'action' => ['sometimes', 'nullable', 'string', 'max:100'],
            'date_from' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'date_to' => ['sometimes', 'nullable', 'date_format:Y-m-d', 'after_or_equal:date_from'],
            'format' => ['required', 'in:csv,json'],
        ]);
        $format = $validated['format'];
        $query = $this->filteredQuery($validated)->with('user:id,name,role');
        $filename = 'audit-trail-'.now()->format('Ymd-His').'.'.$format;

        return response()->streamDownload(function () use ($query, $format): void {
            $isFirstJsonRow = true;
            $output = $format === 'csv' ? fopen('php://output', 'wb') : null;

            if ($format === 'csv') {
                fputcsv($output, [
                    'ID',
                    'Waktu',
                    'Aktor',
                    'Peran',
                    'Aksi',
                    'Tipe Data',
                    'ID Data',
                    'Deskripsi',
                    'Alamat IP',
                    'Nilai Sebelum',
                    'Nilai Sesudah',
                ]);
            } else {
                echo '[';
            }

            $query->chunkById(500, function ($logs) use ($format, $output, &$isFirstJsonRow): void {
                foreach ($logs as $log) {
                    if ($format === 'csv') {
                        fputcsv($output, array_map($this->safeCsvCell(...), [
                            $log->id,
                            $log->created_at?->toISOString(),
                            $log->user?->name ?? 'Sistem / akun tidak tersedia',
                            $log->user?->role ?? '',
                            $log->action,
                            $log->auditable_type,
                            $log->auditable_id,
                            $log->description,
                            $log->ip_address,
                            $log->old_values === null ? '' : json_encode($log->old_values, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                            $log->new_values === null ? '' : json_encode($log->new_values, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                        ]));

                        continue;
                    }

                    if (! $isFirstJsonRow) {
                        echo ',';
                    }
                    echo json_encode($log, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                    $isFirstJsonRow = false;
                }
            });

            if ($format === 'csv') {
                fclose($output);
            } else {
                echo ']';
            }
        }, $filename, [
            'Content-Type' => $format === 'csv' ? 'text/csv; charset=UTF-8' : 'application/json; charset=UTF-8',
            'Cache-Control' => 'no-store, private',
        ]);
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    private function filteredQuery(array $filters): Builder
    {
        $query = AuditLog::query()->with('user:id,name,role');

        if (! empty($filters['action'])) {
            $query->where('action', $filters['action']);
        }

        if (! empty($filters['search'])) {
            $search = trim($filters['search']);
            $query->where(function (Builder $builder) use ($search): void {
                $builder->where('action', 'like', '%'.$search.'%')
                    ->orWhere('description', 'like', '%'.$search.'%')
                    ->orWhere('ip_address', 'like', '%'.$search.'%')
                    ->orWhereHas('user', function (Builder $userQuery) use ($search): void {
                        $userQuery->where('name', 'like', '%'.$search.'%')
                            ->orWhere('role', 'like', '%'.$search.'%');
                    });
            });
        }

        if (! empty($filters['date_from'])) {
            $query->where('created_at', '>=', $filters['date_from'].' 00:00:00');
        }

        if (! empty($filters['date_to'])) {
            $query->where('created_at', '<=', $filters['date_to'].' 23:59:59.999999');
        }

        return $query;
    }

    private function safeCsvCell(mixed $value): string
    {
        $cell = (string) ($value ?? '');

        return preg_match('/^[\s]*[=+\-@]/u', $cell) === 1 ? "'".$cell : $cell;
    }

    private function moduleLabel(string $module): string
    {
        return match ($module) {
            'transaction' => 'Transaksi',
            'expense_request' => 'Pengajuan & approval',
            'wallet' => 'Kas & rekening',
            'debt' => 'Utang & piutang',
            'reconciliation' => 'Rekonsiliasi',
            'user' => 'Pengguna',
            'business_setting' => 'Pengaturan usaha',
            default => 'Aktivitas lainnya',
        };
    }
}
