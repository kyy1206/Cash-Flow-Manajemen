<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;

class AuditLogController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'data' => AuditLog::query()->with('user:id,name,role')->latest()->paginate(50),
        ]);
    }
}
