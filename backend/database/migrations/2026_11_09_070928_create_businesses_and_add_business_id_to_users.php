<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('businesses', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('owner_user_id')->constrained('users')->restrictOnDelete()->unique();
            $table->string('business_name');
            $table->decimal('approval_threshold', 15, 2)->nullable();
            $table->timestamps();
        });

        $legacySettings = DB::table('business_settings')->whereNotNull('owner_user_id')->first();
        $legacyBusinessId = null;

        if ($legacySettings !== null) {
            $legacyBusinessId = DB::table('businesses')->insertGetId([
                'owner_user_id' => $legacySettings->owner_user_id,
                'business_name' => $legacySettings->business_name,
                'approval_threshold' => $legacySettings->approval_threshold,
                'created_at' => $legacySettings->created_at,
                'updated_at' => $legacySettings->updated_at,
            ]);
        }

        Schema::table('users', function (Blueprint $table): void {
            $table->foreignId('business_id')->nullable()->after('role')->constrained('businesses')->nullOnDelete();
        });

        if ($legacyBusinessId !== null) {
            DB::table('users')->update(['business_id' => $legacyBusinessId]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('business_id');
        });

        Schema::dropIfExists('businesses');
    }
};
