<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

class UserController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'data' => User::query()->orderBy('role')->orderBy('name')->get([
                'id',
                'name',
                'email',
                'role',
                'is_active',
                'created_at',
            ]),
        ]);
    }

    public function profile(Request $request): JsonResponse
    {
        return response()->json(['data' => $request->user()->load('business:id,business_name')]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'email' => [
                'sometimes',
                'required',
                'email',
                'max:255',
                Rule::unique('users', 'email')->ignore($request->user()->id),
            ],
            'current_password' => ['required_with:password', 'string'],
            'password' => ['sometimes', 'required', 'string', 'min:8', 'confirmed'],
        ]);

        if (isset($validated['password']) && ! Hash::check($validated['current_password'], $request->user()->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['Password saat ini tidak sesuai.'],
            ]);
        }

        unset($validated['current_password']);
        $request->user()->update($validated);

        return response()->json(['data' => $request->user()->fresh()->load('business:id,business_name')]);
    }

    public function sessions(Request $request): JsonResponse
    {
        $currentToken = $this->currentPersonalAccessToken($request);
        $sessions = $request->user()->tokens()
            ->latest('last_used_at')
            ->latest('created_at')
            ->get(['id', 'name', 'last_used_at', 'created_at', 'expires_at'])
            ->map(fn (PersonalAccessToken $token): array => [
                'id' => $token->id,
                'name' => $token->name,
                'last_used_at' => $token->last_used_at,
                'created_at' => $token->created_at,
                'expires_at' => $token->expires_at,
                'is_current' => $currentToken !== null && $token->is($currentToken),
            ]);

        return response()->json([
            'data' => $sessions,
            'current_session_available' => $currentToken !== null,
        ]);
    }

    public function revokeSession(Request $request, int $tokenId): JsonResponse
    {
        $currentToken = $this->currentPersonalAccessToken($request);
        if ($currentToken === null) {
            abort(409, 'Sesi saat ini tidak dapat diidentifikasi untuk mengelola sesi lain.');
        }

        $token = $request->user()->tokens()->findOrFail($tokenId);
        if ($token->is($currentToken)) {
            throw ValidationException::withMessages([
                'session' => ['Sesi yang sedang digunakan tidak dapat dicabut dari daftar ini.'],
            ]);
        }

        $token->delete();

        return response()->json(['message' => 'Sesi berhasil dicabut.']);
    }

    public function revokeOtherSessions(Request $request): JsonResponse
    {
        $currentToken = $this->currentPersonalAccessToken($request);
        if ($currentToken === null) {
            abort(409, 'Sesi saat ini tidak dapat diidentifikasi untuk mengelola sesi lain.');
        }

        $revokedCount = $request->user()->tokens()
            ->whereKeyNot($currentToken->getKey())
            ->delete();

        return response()->json([
            'message' => 'Sesi lain berhasil dicabut.',
            'revoked_count' => $revokedCount,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'role' => ['required', Rule::in(['supervisor', 'staff'])],
            'password' => ['required', 'string', 'min:8'],
        ]);

        $user = User::create($validated + ['is_active' => true]);
        $this->audit($request, 'user.created', $user, 'Owner membuat akun '.$user->role);

        return response()->json(['data' => $user], 201);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        abort_if($user->role === 'owner' || $user->is($request->user()), 403);

        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'email' => [
                'sometimes',
                'required',
                'email',
                'max:255',
                Rule::unique('users', 'email')->ignore($user->id),
            ],
            'role' => ['sometimes', 'required', Rule::in(['supervisor', 'staff'])],
            'is_active' => ['sometimes', 'required', 'boolean'],
            'password' => ['sometimes', 'required', 'string', 'min:8'],
        ]);

        $user->update($validated);
        $this->audit($request, 'user.updated', $user, 'Owner mengubah akun pengguna');

        return response()->json(['data' => $user]);
    }

    private function audit(Request $request, string $action, User $user, string $description): void
    {
        AuditLog::create([
            'user_id' => $request->user()->id,
            'action' => $action,
            'auditable_type' => User::class,
            'auditable_id' => $user->id,
            'description' => $description,
            'ip_address' => $request->ip(),
        ]);
    }

    private function currentPersonalAccessToken(Request $request): ?PersonalAccessToken
    {
        $token = $request->user()->currentAccessToken();

        return $token instanceof PersonalAccessToken ? $token : null;
    }
}
