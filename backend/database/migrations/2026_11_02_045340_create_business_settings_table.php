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
        Schema::create('business_settings', function (Blueprint $table) {
            $table->unsignedTinyInteger('id')->primary();
            $table->foreignId('owner_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('business_name')->default('Usaha Saya');
            $table->decimal('approval_threshold', 15, 2)->nullable();
            $table->timestamps();
        });

        DB::table('business_settings')->insert([
            'id' => 1,
            'owner_user_id' => DB::table('users')->where('role', 'owner')->orderBy('id')->value('id'),
            'business_name' => 'Usaha Saya',
            'approval_threshold' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('business_settings');
    }
};
