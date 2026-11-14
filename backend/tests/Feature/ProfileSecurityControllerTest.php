<?php

namespace Tests\Feature;

use App\Models\Business;
use App\Models\User;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ProfileSecurityControllerTest extends TestCase
{
    use LazilyRefreshDatabase;

    public function test_profile_returns_business_identity_and_updates_credentials_safely(): void
    {
        $user = User::factory()->create([
            'role' => 'owner',
            'password' => 'current-password',
        ]);
        $business = Business::create([
            'owner_user_id' => $user->id,
            'business_name' => 'Kedai Contoh',
        ]);
        $user->update(['business_id' => $business->id]);
        $token = $user->createToken('profile-test');

        $this->withToken($token->plainTextToken)->getJson('/api/profile')->assertOk()
            ->assertJsonPath('data.business.business_name', 'Kedai Contoh')
            ->assertJsonMissingPath('data.password');

        $this->withToken($token->plainTextToken)->patchJson('/api/profile', [
            'name' => 'Nama Baru',
            'email' => 'new@example.com',
            'current_password' => 'current-password',
            'password' => 'replacement-password',
            'password_confirmation' => 'replacement-password',
        ])->assertOk()
            ->assertJsonPath('data.name', 'Nama Baru')
            ->assertJsonPath('data.email', 'new@example.com');

        $this->assertTrue(Hash::check('replacement-password', $user->fresh()->password));
    }

    public function test_profile_update_cannot_change_role_business_or_account_status(): void
    {
        $user = User::factory()->create(['role' => 'owner']);
        $otherBusinessUser = User::factory()->create();
        $business = Business::create([
            'owner_user_id' => $user->id,
            'business_name' => 'Usaha Owner',
        ]);
        $otherBusiness = Business::create([
            'owner_user_id' => $otherBusinessUser->id,
            'business_name' => 'Usaha Lain',
        ]);
        $user->update(['business_id' => $business->id]);
        $otherBusinessUser->update(['business_id' => $otherBusiness->id]);
        $originalBusinessId = $user->business_id;
        $token = $user->createToken('profile-boundary-test');

        $this->withToken($token->plainTextToken)->patchJson('/api/profile', [
            'name' => 'Owner Diperbarui',
            'role' => 'staff',
            'business_id' => $otherBusiness->id,
            'is_active' => false,
        ])->assertOk()
            ->assertJsonPath('data.name', 'Owner Diperbarui')
            ->assertJsonPath('data.role', 'owner')
            ->assertJsonPath('data.is_active', true);

        $this->assertSame($originalBusinessId, $user->fresh()->business_id);
    }

    public function test_session_list_marks_current_token_and_revokes_other_owned_tokens(): void
    {
        $user = User::factory()->create();
        $current = $user->createToken('current-browser');
        $other = $user->createToken('another-browser');

        $response = $this->withToken($current->plainTextToken)->getJson('/api/profile/sessions')->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('current_session_available', true);

        $sessions = collect($response->json('data'));
        $this->assertTrue($sessions->firstWhere('id', $current->accessToken->id)['is_current']);
        $this->assertFalse($sessions->firstWhere('id', $other->accessToken->id)['is_current']);

        $this->withToken($current->plainTextToken)->postJson('/api/profile/sessions/revoke-others')
            ->assertOk()
            ->assertJsonPath('revoked_count', 1);

        $this->assertDatabaseHas('personal_access_tokens', ['id' => $current->accessToken->id]);
        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $other->accessToken->id]);
    }

    public function test_user_cannot_revoke_current_or_another_users_session(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $current = $user->createToken('current-browser');
        $otherSession = $user->createToken('another-browser');
        $foreignSession = $otherUser->createToken('foreign-browser');

        $this->withToken($current->plainTextToken)
            ->deleteJson("/api/profile/sessions/{$current->accessToken->id}")
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['session']);

        $this->withToken($current->plainTextToken)
            ->deleteJson("/api/profile/sessions/{$foreignSession->accessToken->id}")
            ->assertNotFound();

        $this->assertDatabaseHas('personal_access_tokens', ['id' => $otherSession->accessToken->id]);
        $this->assertDatabaseHas('personal_access_tokens', ['id' => $foreignSession->accessToken->id]);
    }
}
