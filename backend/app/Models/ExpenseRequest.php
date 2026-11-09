<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ExpenseRequest extends Model
{
    use BelongsToBusiness;

    protected $hidden = ['attachment_path'];

    protected $appends = ['has_attachment'];

    protected $fillable = [
        'requested_by',
        'category_id',
        'wallet_id',
        'amount',
        'purpose',
        'description',
        'status',
        'decided_by',
        'decided_at',
        'decision_note',
        'attachment_path',
        'transaction_id',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'decided_at' => 'datetime',
        ];
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function wallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class);
    }

    public function transaction(): BelongsTo
    {
        return $this->belongsTo(Transaction::class);
    }

    public function getHasAttachmentAttribute(): bool
    {
        return $this->attachment_path !== null;
    }
}
