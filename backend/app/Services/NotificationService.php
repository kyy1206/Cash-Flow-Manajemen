<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\Transaction;
use App\Models\User;
use Carbon\CarbonImmutable;

class NotificationService
{
    public function syncBudgetAlertsForPeriod(User $user, int $year, int $month): void
    {
        $plan = $user->monthlyPlans()
            ->where('year', $year)
            ->where('month', $month)
            ->first();

        if ($plan === null) {
            return;
        }

        $start = CarbonImmutable::create($year, $month, 1)->toDateString();
        $end = CarbonImmutable::create($year, $month, 1)->endOfMonth()->toDateString();
        $spent = (float) Transaction::query()
            ->where('financial_status', 'posted')
            ->where('transaction_type', 'expense')
            ->whereBetween('date', [$start, $end])
            ->sum('amount');

        $this->createThresholdAlerts(
            $user,
            "plan:{$plan->id}:{$year}-{$month}",
            'target bulanan',
            $spent,
            (float) $plan->total_budget,
        );

        $budgets = $plan->budgets()->with('category')->get();

        foreach ($budgets as $budget) {
            $spentAmount = (float) Transaction::query()
                ->where('category_id', $budget->category_id)
                ->where('financial_status', 'posted')
                ->where('transaction_type', 'expense')
                ->whereBetween('date', [$start, $end])
                ->sum('amount');
            $this->createThresholdAlerts(
                $user,
                "budget:{$budget->id}:{$year}-{$month}",
                $budget->category->name,
                $spentAmount,
                (float) $budget->amount,
            );
        }
    }

    public function syncUpcomingSubscriptionReminders(User $user): void
    {
        $today = CarbonImmutable::today();
        $dueLimit = $today->addDays(7);
        $subscriptions = $user->subscriptions()
            ->where('status', 'active')
            ->whereBetween('due_date', [$today->toDateString(), $dueLimit->toDateString()])
            ->get();

        foreach ($subscriptions as $subscription) {
            $dueDate = $subscription->due_date->toDateString();
            $this->createOnce(
                $user,
                "subscription:{$subscription->id}:{$dueDate}",
                'subscription_due',
                "{$subscription->name} jatuh tempo pada ".$subscription->due_date->format('d M Y').'.',
            );
        }
    }

    private function createThresholdAlerts(
        User $user,
        string $keyPrefix,
        string $label,
        float $spent,
        float $limit,
    ): void {
        if ($limit <= 0) {
            return;
        }

        $percentage = ($spent / $limit) * 100;
        $thresholds = [
            50 => ['type' => 'budget_warning', 'label' => 'Waspada', 'key' => '50'],
            80 => ['type' => 'budget_critical', 'label' => 'Kritis', 'key' => '80'],
            100 => ['type' => 'budget_overbudget', 'label' => 'Melebihi budget', 'key' => '100'],
        ];

        foreach ($thresholds as $threshold => $alert) {
            if ($percentage < $threshold || ($threshold === 100 && $percentage <= 100)) {
                continue;
            }

            $this->createOnce(
                $user,
                "{$keyPrefix}:{$alert['key']}",
                $alert['type'],
                "Pengeluaran {$label} mencapai ".round($percentage, 1).'% dari budget (Rp '.number_format($spent, 0, ',', '.').' / Rp '.number_format($limit, 0, ',', '.').').',
            );
        }
    }

    private function createOnce(User $user, string $key, string $type, string $message): void
    {
        Notification::query()->firstOrCreate(
            ['user_id' => $user->id, 'notification_key' => $key],
            ['type' => $type, 'message' => $message],
        );
    }
}
