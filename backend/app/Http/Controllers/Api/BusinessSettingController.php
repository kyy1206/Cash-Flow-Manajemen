<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BusinessSettingController extends Controller
{
    public function show(): JsonResponse
    {
        return response()->json([
            'data' => DB::table('business_settings')->where('id', 1)->first(),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'business_name' => ['sometimes', 'required', 'string', 'max:255'],
            'approval_threshold' => ['sometimes', 'nullable', 'numeric', 'decimal:0,2', 'gt:0', 'max:9999999999999.99'],
        ]);

        DB::table('business_settings')->where('id', 1)->update($validated + ['updated_at' => now()]);

        return $this->show();
    }
}
