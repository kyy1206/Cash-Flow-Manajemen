<?php

use App\Http\Controllers\Api\AuditLogController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BudgetController;
use App\Http\Controllers\Api\BusinessSettingController;
use App\Http\Controllers\Api\CategoryController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DebtController;
use App\Http\Controllers\Api\ExpenseRequestController;
use App\Http\Controllers\Api\MonthlyPlanController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\ReceiptExtractionController;
use App\Http\Controllers\Api\ReconciliationController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\SubscriptionController;
use App\Http\Controllers\Api\TransactionController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\WalletController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/setup/status', [AuthController::class, 'setupStatus']);
Route::post('/setup/owner', [AuthController::class, 'setupOwner'])->middleware('throttle:5,1');
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:5,1');

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/user', function (Request $request) {
        return $request->user();
    });

    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/profile', [UserController::class, 'profile']);
    Route::patch('/profile', [UserController::class, 'updateProfile']);
    Route::get('/profile/sessions', [UserController::class, 'sessions']);
    Route::post('/profile/sessions/revoke-others', [UserController::class, 'revokeOtherSessions']);
    Route::delete('/profile/sessions/{tokenId}', [UserController::class, 'revokeSession'])->whereNumber('tokenId');

    Route::middleware('role:owner')->group(function () {
        Route::apiResource('users', UserController::class)->only(['index', 'store', 'update']);
        Route::get('/business-settings', [BusinessSettingController::class, 'show']);
        Route::put('/business-settings', [BusinessSettingController::class, 'update']);
        Route::post('/wallets', [WalletController::class, 'store']);
        Route::patch('/wallets/{wallet}', [WalletController::class, 'update']);
        Route::post('/categories', [CategoryController::class, 'store']);
        Route::put('/categories/{category}', [CategoryController::class, 'update']);
        Route::patch('/categories/{category}', [CategoryController::class, 'update']);
        Route::delete('/categories/{category}', [CategoryController::class, 'destroy']);
        Route::post('/transactions/{transaction}/reverse', [TransactionController::class, 'reverse']);
        Route::get('/audit-logs/export', [AuditLogController::class, 'export']);
        Route::get('/audit-logs', [AuditLogController::class, 'index']);
        Route::apiResource('monthly-plans', MonthlyPlanController::class)->except(['index', 'show']);
        Route::apiResource('budgets', BudgetController::class)->except(['index', 'show']);
    });

    Route::get('/wallets', [WalletController::class, 'index']);
    Route::get('/categories', [CategoryController::class, 'index']);
    Route::get('/categories/{category}', [CategoryController::class, 'show']);
    Route::middleware('role:owner,supervisor')->group(function () {
        Route::get('/monthly-plans', [MonthlyPlanController::class, 'index']);
        Route::get('/monthly-plans/{monthlyPlan}', [MonthlyPlanController::class, 'show']);
        Route::get('/budgets', [BudgetController::class, 'index']);
    });
    Route::apiResource('transactions', TransactionController::class);
    Route::get('/expense-requests', [ExpenseRequestController::class, 'index']);
    Route::post('/expense-requests', [ExpenseRequestController::class, 'store'])->middleware('role:staff');
    Route::get('/expense-requests/{expenseRequest}/evidence', [ExpenseRequestController::class, 'downloadEvidence']);
    Route::post('/expense-requests/{expenseRequest}/approve', [ExpenseRequestController::class, 'approve'])->middleware('role:supervisor');
    Route::post('/expense-requests/{expenseRequest}/reject', [ExpenseRequestController::class, 'reject'])->middleware('role:supervisor');
    Route::post('/expense-requests/{expenseRequest}/pay', [ExpenseRequestController::class, 'pay'])->middleware('role:staff');
    Route::get('/debts', [DebtController::class, 'index']);
    Route::post('/debts', [DebtController::class, 'store']);
    Route::post('/debts/{debt}/settle', [DebtController::class, 'settle']);
    Route::get('/reconciliations', [ReconciliationController::class, 'index']);
    Route::post('/reconciliations', [ReconciliationController::class, 'store']);
    Route::post('/reconciliations/{reconciliation}/review', [ReconciliationController::class, 'review'])->middleware('role:supervisor');
    Route::post('/receipt-extractions', [ReceiptExtractionController::class, 'store'])->middleware('role:staff');
    Route::apiResource('subscriptions', SubscriptionController::class);
    Route::get('/dashboard', DashboardController::class);
    Route::get('/reports', ReportController::class);
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllRead']);
    Route::post('/notifications/{notification}/read', [NotificationController::class, 'markRead']);
});
