<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class IdentityQueueController extends Controller
{
    public function index(): Response
    {
        $this->authorize('verify-identity');

        $users = User::whereNotIn('identity_status', ['unverified'])
            ->select([
                'id', 'name', 'email', 'phone_number',
                'identity_category', 'identity_number',
                'identity_status', 'identity_file_path', 'updated_at',
            ])
            ->latest('updated_at')
            ->get()
            ->map(fn (User $user) => [
                'id'                => $user->id,
                'name'              => $user->name,
                'email'             => $user->email,
                'phone_number'      => $user->phone_number,
                'identity_category' => $user->identity_category,
                'identity_number'   => $user->identity_number,
                'identity_status'   => $user->identity_status,
                'has_document'      => filled($user->identity_file_path),
                'document_url'      => filled($user->identity_file_path)
                    ? route('admin.identity.document', $user->id)
                    : null,
                'updated_at'        => $user->updated_at->diffForHumans(),
            ]);

        return Inertia::render('Admin/Identity/Index', [
            'users' => $users,
        ]);
    }

    public function verify(Request $request, User $user): RedirectResponse
    {
        $this->authorize('verify-identity');

        $validated = $request->validate([
            'status'            => ['required', Rule::in(['verified', 'rejected'])],
            'identity_category' => ['nullable', Rule::in(['umum', 'warga_kampus'])],
        ]);

        $updates = ['identity_status' => $validated['status']];

        // Staff can correct the category the user selected during registration
        if (filled($validated['identity_category'] ?? null)) {
            $updates['identity_category'] = $validated['identity_category'];
        }

        $user->update($updates);

        $label = $validated['status'] === 'verified' ? 'diverifikasi' : 'ditolak';

        return back()->with('success', "Identitas {$user->name} berhasil {$label}.");
    }

    public function document(User $user): StreamedResponse
    {
        $this->authorize('verify-identity');

        abort_unless(
            filled($user->identity_file_path),
            404,
            'No document uploaded.',
        );

        abort_unless(
            Storage::disk('identity-documents')->exists($user->identity_file_path),
            404,
            'Document not found on disk.',
        );

        return Storage::disk('identity-documents')->response(
            $user->identity_file_path,
        );
    }
}
