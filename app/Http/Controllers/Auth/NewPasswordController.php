<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Services\CredentialSecurity;
use App\Support\AuthenticationIdentity;
use App\Support\PublicReturnPath;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Timebox;
use Illuminate\Validation\Rules;
use Illuminate\Validation\ValidationException;

class NewPasswordController extends Controller
{
    /**
     * Display the password reset view.
     */
    public function create(Request $request): RedirectResponse
    {
        $returnTo = PublicReturnPath::resolveForRequest(
            $request,
            $request->query('return_to'),
        );
        $entry = PublicReturnPath::modalEntry('reset', $returnTo);
        $fragment = http_build_query([
            'token' => (string) $request->route('token'),
            'email' => (string) $request->query('email', ''),
        ], '', '&', PHP_QUERY_RFC3986);

        return redirect()->to($entry.'#'.$fragment);
    }

    /**
     * Handle an incoming new password request.
     *
     * @throws \Illuminate\Validation\ValidationException
     */
    public function store(
        Request $request,
        CredentialSecurity $credentials,
    ): RedirectResponse {
        $request->merge([
            'email' => AuthenticationIdentity::normalizeEmail($request->input('email')),
        ]);

        $request->validate([
            'token' => 'required',
            'email' => 'required|email',
            'password' => ['required', 'confirmed', Rules\Password::defaults()],
            'return_to' => ['nullable', 'string', 'max:2048'],
        ]);

        $returnTo = PublicReturnPath::resolveForRequest(
            $request,
            $request->input('return_to'),
        );

        // Here we will attempt to reset the user's password. If it is successful we
        // will update the password on an actual user model and persist it to the
        // database. Otherwise we will parse the error and return the response.
        $status = (new Timebox)->call(
            fn () => Password::reset(
                $request->only('email', 'password', 'password_confirmation', 'token'),
                function ($user) use ($request, $credentials) {
                    $credentials->replacePassword(
                        $user,
                        (string) $request->password,
                    );

                    event(new PasswordReset($user));
                },
            ),
            $this->enumerationTimeboxMicroseconds(),
        );

        // If the password was successfully reset, we will redirect the user back to
        // the application's home authenticated view. If there is an error we can
        // redirect them back to where they came from with their error message.
        if ($status == Password::PASSWORD_RESET) {
            $request->session()->forget('url.intended');

            return redirect()
                ->to(PublicReturnPath::withQuery($returnTo, [
                    'auth' => 'login',
                    'password_reset' => '1',
                ]))
                ->with('status', __('passwords.reset'));
        }

        throw ValidationException::withMessages([
            'email' => [__('passwords.token')],
        ]);
    }

    private function enumerationTimeboxMicroseconds(): int
    {
        return max(
            300,
            min(3000, (int) config('security.password_recovery.timebox_ms', 1000)),
        ) * 1000;
    }
}
