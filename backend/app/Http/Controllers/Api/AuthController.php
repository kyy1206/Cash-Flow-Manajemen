<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function setupStatus(): JsonResponse
    {
        return response()->json([
            'owner_setup_required' => DB::table('business_settings')
                ->where('id', 1)
                ->whereNull('owner_user_id')
                ->exists(),
        ]);
    }

    public function setupOwner(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
            'business_name' => ['required', 'string', 'max:255'],
        ]);

        $user = DB::transaction(function () use ($validated): User {
            $settings = DB::table('business_settings')->where('id', 1)->lockForUpdate()->first();
            abort_if($settings === null || $settings->owner_user_id !== null, 409, 'Owner sudah dibuat.');

            $owner = User::create([
                'name' => $validated['name'],
                'email' => $validated['email'],
                'password' => $validated['password'],
                'role' => 'owner',
                'is_active' => true,
            ]);

            DB::table('business_settings')->where('id', 1)->update([
                'owner_user_id' => $owner->id,
                'business_name' => $validated['business_name'],
                'updated_at' => now(),
            ]);

            Wallet::create([
                'created_by' => $owner->id,
                'name' => 'Kas Tunai',
                'type' => 'cash',
                'opening_balance' => 0,
            ]);

            foreach ([
                ['name' => 'Penjualan', 'type' => 'income'],
                ['name' => 'Pemasukan Lain', 'type' => 'income'],
                ['name' => 'Bahan Baku', 'type' => 'expense'],
                ['name' => 'Operasional', 'type' => 'expense'],
            ] as $category) {
                Category::create($category + [
                    'user_id' => $owner->id,
                    'icon' => 'tag',
                    'color' => '#4f46e5',
                ]);
            }

            return $owner;
        });

        return response()->json([
            'message' => 'Owner dan usaha berhasil disiapkan.',
            'user' => $user,
            'token' => $user->createToken('bocor-halus')->plainTextToken,
        ], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('email', $validated['email'])->first();

        if (! $user || ! $user->is_active || ! Hash::check($validated['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['Email atau password salah, atau akun tidak aktif.'],
            ]);
        }

        $token = $user->createToken('bocor-halus')->plainTextToken;

        return response()->json([
            'message' => 'Login berhasil.',
            'user' => $user,
            'token' => $token,
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json([
            'message' => 'Logout berhasil.',
        ]);
    }
}
