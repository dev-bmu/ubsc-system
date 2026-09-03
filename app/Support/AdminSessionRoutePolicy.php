<?php

namespace App\Support;

use Illuminate\Http\Request;
use Illuminate\Routing\Route;

final class AdminSessionRoutePolicy
{
    /**
     * Long-running or parallel gallery data-plane requests must not serialize
     * the entire browser session. They still pass through auth, auth.session,
     * role authorization and admin.session before controller execution.
     *
     * @var list<string>
     */
    public const READ_ONLY_ROUTE_NAMES = [
        // Mutates only ephemeral presence state, never the authenticated
        // session. Keeping it session-read-only prevents a heartbeat from
        // extending or racing the staff idle timeout.
        'admin.presence.heartbeat',
        // Monitoring reads cached, bounded telemetry and must never hold or
        // extend the staff session while the cockpit polls in the background.
        'admin.settings.monitoring.index',
        'admin.settings.monitoring.snapshot',
        'admin.gallery.upload-sessions.store',
        'admin.gallery.upload-sessions.chunks.store',
        'admin.gallery.upload-sessions.complete',
        'admin.gallery.upload-sessions.destroy',
        'admin.gallery.items.store',
        'admin.gallery.csv.export',
        'admin.gallery.csv.import',
    ];

    public static function isReadOnly(Request $request): bool
    {
        $route = $request->route();

        return $route instanceof Route && self::routeIsReadOnly($route);
    }

    public static function routeIsReadOnly(Route $route): bool
    {
        $name = $route->getName();

        return is_string($name)
            && in_array($name, self::READ_ONLY_ROUTE_NAMES, true);
    }
}
