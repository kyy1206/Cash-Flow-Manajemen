<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;

trait BelongsToBusiness
{
    protected static function bootBelongsToBusiness(): void
    {
        static::addGlobalScope('business', function (Builder $builder): void {
            $user = Auth::user();
            if ($user !== null) {
                $builder->where($builder->getModel()->qualifyColumn('business_id'), $user->business_id);
            }
        });

        static::creating(function (Model $model): void {
            if ($model->getAttribute('business_id') === null) {
                $businessId = Auth::user()?->business_id;

                if ($businessId === null && ! $model instanceof User) {
                    $businessId = $model->resolveBusinessIdFromParent();
                }

                if ($businessId !== null) {
                    $model->setAttribute('business_id', $businessId);
                }
            }
        });
    }

    private function resolveBusinessIdFromParent(): ?int
    {
        foreach (['user_id', 'created_by', 'requested_by', 'approver_id', 'reviewed_by'] as $foreignKey) {
            $userId = $this->getAttribute($foreignKey);
            if ($userId !== null) {
                return User::withoutGlobalScope('business')->whereKey($userId)->value('business_id');
            }
        }

        if ($monthlyPlanId = $this->getAttribute('monthly_plan_id')) {
            return MonthlyPlan::withoutGlobalScope('business')->whereKey($monthlyPlanId)->value('business_id');
        }

        if ($expenseRequestId = $this->getAttribute('expense_request_id')) {
            return ExpenseRequest::withoutGlobalScope('business')->whereKey($expenseRequestId)->value('business_id');
        }

        return null;
    }
}
