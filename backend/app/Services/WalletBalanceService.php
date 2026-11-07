<?php

namespace App\Services;

use App\Models\Transaction;
use App\Models\Wallet;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

class WalletBalanceService
{
    /**
     * @param  Collection<int, Wallet>  $wallets
     * @return array<int, float>
     */
    public function balances(Collection $wallets, ?string $throughDate = null): array
    {
        $income = $this->totals('income', 'wallet_id', $throughDate);
        $expenses = $this->totals('expense', 'wallet_id', $throughDate);
        $transferOut = $this->totals('transfer', 'wallet_id', $throughDate);
        $transferIn = $this->totals('transfer', 'destination_wallet_id', $throughDate);

        return $wallets->mapWithKeys(fn (Wallet $wallet): array => [
            $wallet->id => (float) $wallet->opening_balance
                + (float) ($income[$wallet->id] ?? 0)
                - (float) ($expenses[$wallet->id] ?? 0)
                - (float) ($transferOut[$wallet->id] ?? 0)
                + (float) ($transferIn[$wallet->id] ?? 0),
        ])->all();
    }

    /**
     * @return Collection<int, float>
     */
    private function totals(string $type, string $walletColumn, ?string $throughDate): Collection
    {
        return Transaction::query()
            ->where('financial_status', 'posted')
            ->where('transaction_type', $type)
            ->when($throughDate !== null, fn (Builder $query) => $query->whereDate('date', '<=', $throughDate))
            ->selectRaw($walletColumn.', SUM(amount) as total')
            ->groupBy($walletColumn)
            ->pluck('total', $walletColumn);
    }
}
