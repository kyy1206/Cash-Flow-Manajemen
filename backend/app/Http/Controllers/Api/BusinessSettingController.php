<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Business;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BusinessSettingController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return response()->json([
            'data' => Business::query()->findOrFail($request->user()->business_id),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'business_name' => ['sometimes', 'required', 'string', 'max:255'],
            'approval_threshold' => ['sometimes', 'nullable', 'numeric', 'decimal:0,2', 'gt:0', 'max:9999999999999.99'],
        ]);

        DB::transaction(function () use ($request, $validated): void {
            $business = Business::query()->findOrFail($request->user()->business_id);
            $previousValues = [];
            foreach (array_keys($validated) as $key) {
                $previousValues[$key] = $business->getAttribute($key);
            }
            $business->fill($validated);
            $changedKeys = array_keys($business->getDirty());

            if ($changedKeys === []) {
                return;
            }

            $business->save();
            $newValues = [];
            foreach ($changedKeys as $key) {
                $newValues[$key] = $business->getAttribute($key);
            }
            AuditLog::create([
                'user_id' => $request->user()->id,
                'action' => 'business_setting.updated',
                'auditable_type' => Business::class,
                'auditable_id' => $business->id,
                'description' => 'Pengaturan usaha atau ambang approval diperbarui',
                'old_values' => array_intersect_key($previousValues, array_flip($changedKeys)),
                'new_values' => $newValues,
                'ip_address' => $request->ip(),
            ]);
        });

        return $this->show($request);
    }
}
