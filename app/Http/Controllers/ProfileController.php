<?php

namespace App\Http\Controllers;

use App\Http\Requests\ProfileUpdateRequest;
use App\Services\AuthSessionCoordinator;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Redirect;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class ProfileController extends Controller
{
    public function edit(Request $request): Response
    {
        return Inertia::render('Profile/Edit', [
            'status' => session('status'),
        ]);
    }

    public function update(ProfileUpdateRequest $request): RedirectResponse
    {
        $user = $request->user();
        $validated = $request->validated();

        $user->name = $validated['name'];

        // Never mutate a privileged login identity through the general admin
        // profile endpoint. The request validation gives immediate feedback;
        // this guard is the defense-in-depth boundary for future callers.
        if (! $request->routeIs('admin.account.profile.update')
            && array_key_exists('email', $validated)) {
            $user->email = $validated['email'];
        }

        if (array_key_exists('birth_place', $validated)) {
            $user->birth_place = $validated['birth_place'];
        }

        if (array_key_exists('birth_date', $validated)) {
            $user->birth_date = $validated['birth_date'];
        }

        if (array_key_exists('phone_number', $validated)) {
            $user->phone_number = $validated['phone_number'];
        }

        if ($user->isDirty('email')) {
            $user->email_verified_at = null;
        }

        if ($request->hasFile('avatar')) {
            if ($user->avatar && ! Str::startsWith($user->avatar, ['http://', 'https://', '/'])) {
                Storage::disk('public')->delete($user->avatar);
            }
            $user->avatar = $request->file('avatar')->store('avatars', 'public');
        }

        $user->save();

        return back();
    }

    public function destroy(
        Request $request,
        AuthSessionCoordinator $sessions,
    ): RedirectResponse {
        $request->validate([
            'password' => ['required', 'current_password'],
        ]);

        $user = $request->user();

        $sessions->logoutAndInvalidate($request);

        $user->delete();

        Inertia::clearHistory();

        return Redirect::to('/');
    }
}
