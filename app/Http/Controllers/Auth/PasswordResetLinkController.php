<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Support\PublicReturnPath;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Password;
use Throwable;

class PasswordResetLinkController extends Controller
{
    /**
     * Display the password reset link request view.
     */
    public function create(Request $request): RedirectResponse
    {
        $returnTo = PublicReturnPath::resolveForRequest(
            $request,
            $request->query('return_to'),
        );

        return redirect(PublicReturnPath::modalEntry('forgot', $returnTo));
    }

    /**
     * Handle an incoming password reset link request.
     */
    public function store(Request $request): RedirectResponse
    {
        $request->validate([
            'email' => 'required|email',
        ]);

        try {
            Password::sendResetLink($request->only('email'));
        } catch (Throwable $exception) {
            report($exception);
        }

        /*
         * Always return the same response for known, unknown, and throttled
         * addresses. Besides protecting member privacy, this keeps transport
         * failures from turning the endpoint into an account-existence oracle.
         */
        return back()->with('status', __(Password::RESET_LINK_SENT));
    }
}
