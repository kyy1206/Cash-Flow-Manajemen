<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Reconciliation extends Model
{
    protected $fillable = [
        'wallet_id',
        'created_by',
        'reviewed_by',
        'reconciled_at',
        'system_balance',
        'counted_balance',
        'difference',
        'notes',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'reconciled_at' => 'date',
            'system_balance' => 'decimal:2',
            'counted_balance' => 'decimal:2',
            'difference' => 'decimal:2',
        ];
    }

    public function wallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
