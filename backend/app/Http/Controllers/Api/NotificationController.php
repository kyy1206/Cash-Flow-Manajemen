<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function index(Request $request, NotificationService $notificationService): JsonResponse
    {
        $validated = $request->validate([
            'category' => ['sometimes', 'in:all,budget,subscription'],
            'status' => ['sometimes', 'in:all,unread,read'],
            'search' => ['sometimes', 'string', 'max:255'],
        ]);

        $notificationService->syncUpcomingSubscriptionReminders($request->user());
        $userNotifications = $request->user()->notifications();
        $unreadCount = (clone $userNotifications)->whereNull('read_at')->count();
        $summary = [
            'total' => (clone $userNotifications)->count(),
            'unread_count' => $unreadCount,
            'budget_count' => (clone $userNotifications)
                ->whereIn('type', ['budget_warning', 'budget_critical', 'budget_overbudget'])
                ->count(),
            'subscription_count' => (clone $userNotifications)
                ->where('type', 'subscription_due')
                ->count(),
        ];

        $notifications = clone $userNotifications;
        if (($validated['category'] ?? 'all') === 'budget') {
            $notifications->whereIn('type', ['budget_warning', 'budget_critical', 'budget_overbudget']);
        } elseif (($validated['category'] ?? 'all') === 'subscription') {
            $notifications->where('type', 'subscription_due');
        }

        if (($validated['status'] ?? 'all') === 'unread') {
            $notifications->whereNull('read_at');
        } elseif (($validated['status'] ?? 'all') === 'read') {
            $notifications->whereNotNull('read_at');
        }

        if (isset($validated['search'])) {
            $search = $validated['search'];
            $notifications->where(function ($query) use ($search): void {
                $query->where('message', 'like', '%'.$search.'%')
                    ->orWhere('type', 'like', '%'.$search.'%');
            });
        }

        $notifications = $notifications->latest()->paginate(30);

        return response()->json([
            'data' => $notifications,
            'unread_count' => $unreadCount,
            'summary' => $summary,
        ]);
    }

    public function markRead(Request $request, Notification $notification): JsonResponse
    {
        $notification = $request->user()->notifications()->findOrFail($notification->id);
        $notification->markAsRead();

        return response()->json(['data' => $notification->fresh()]);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $request->user()->notifications()
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        return response()->json([
            'message' => 'Semua notifikasi telah ditandai dibaca.',
            'unread_count' => 0,
        ]);
    }
}
