<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Business;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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

        Business::query()->findOrFail($request->user()->business_id)->update($validated);

        return $this->show($request);
    }
}
