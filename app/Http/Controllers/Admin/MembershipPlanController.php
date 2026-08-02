<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\MembershipPlan;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Dimensions;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class MembershipPlanController extends Controller
{
    private function gate(): void
    {
        abort_unless(auth()->user()?->can('manage-members'), 403);
    }

    public function index(): Response
    {
        $this->gate();

        $plans = MembershipPlan::with('media')->withCount([
            'memberships as active_members_count' => fn ($q) => $q
                ->where('status', 'active')
                ->whereDate('start_date', '<=', today())
                ->whereDate('end_date', '>=', today()),
        ])
            ->orderByTier()
            ->orderBy('sort_order')
            ->orderBy('price')
            ->orderBy('id')
            ->get()
            ->map(fn (MembershipPlan $p) => [
                'id' => $p->id,
                'name' => $p->name,
                'description' => $p->description,
                'tier' => $p->tier,
                'public_badge' => $p->public_badge,
                'savings_label' => $p->savings_label,
                'cta_label' => $p->cta_label,
                'card_image_url' => $p->cardImageUrl(),
                'price' => $p->price,
                'compare_at_price' => $p->compare_at_price,
                'discount_percent' => $p->discountPercentage(),
                'duration_months' => $p->duration_months,
                'duration_label' => $p->durationLabel(),
                'duration_lead' => $p->durationLead(),
                'features' => $p->features ?? [],
                'is_active' => $p->is_active,
                'is_primary' => $p->is_primary,
                'sort_order' => $p->sort_order,
                'active_members_count' => $p->active_members_count,
            ]);

        return Inertia::render('Admin/MembershipPlans/Index', [
            'plans' => $plans,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $this->gate();

        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string'],
            'tier' => ['required', Rule::in(MembershipPlan::TIERS)],
            'public_badge' => ['nullable', 'string', 'max:80'],
            'savings_label' => ['nullable', 'string', 'max:80'],
            'cta_label' => ['nullable', 'string', 'max:80'],
            'card_image' => $this->cardImageRules(required: true),
            'price' => $this->priceRules($request),
            'compare_at_price' => ['nullable', 'integer', 'min:0', 'gt:price'],
            'duration_months' => ['required', Rule::in(MembershipPlan::SUPPORTED_DURATIONS)],
            'features' => ['nullable', 'array'],
            'features.*' => ['string', 'max:200'],
            'is_active' => ['boolean'],
            'is_primary' => ['boolean'],
            'sort_order' => ['integer'],
        ]);

        $cardImage = $data['card_image'];
        unset($data['card_image']);

        $plan = DB::transaction(function () use ($data, $cardImage): MembershipPlan {
            if ($data['is_primary'] ?? false) {
                MembershipPlan::query()->update(['is_primary' => false]);
            }

            $plan = MembershipPlan::create($data);
            $plan->addMedia($cardImage)->toMediaCollection('card_image');
            $this->ensurePrimaryPlan();

            return $plan;
        });

        return redirect()->route('admin.memberships.plans.index')
            ->with('success', 'Paket membership berhasil dibuat.');
    }

    public function update(Request $request, MembershipPlan $plan): RedirectResponse
    {
        $this->gate();

        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string'],
            'tier' => ['required', Rule::in(MembershipPlan::TIERS)],
            'public_badge' => ['nullable', 'string', 'max:80'],
            'savings_label' => ['nullable', 'string', 'max:80'],
            'cta_label' => ['nullable', 'string', 'max:80'],
            'card_image' => $this->cardImageRules(),
            'remove_card_image' => ['boolean'],
            'price' => $this->priceRules($request),
            'compare_at_price' => ['nullable', 'integer', 'min:0', 'gt:price'],
            'duration_months' => ['required', Rule::in(MembershipPlan::SUPPORTED_DURATIONS)],
            'features' => ['nullable', 'array'],
            'features.*' => ['string', 'max:200'],
            'is_active' => ['boolean'],
            'is_primary' => ['boolean'],
            'sort_order' => ['integer'],
        ]);

        $cardImage = $data['card_image'] ?? null;
        $removeCardImage = $data['remove_card_image'] ?? false;
        unset($data['card_image'], $data['remove_card_image']);

        if ($removeCardImage && ! $cardImage) {
            throw ValidationException::withMessages([
                'card_image' => 'Gambar membership tidak dapat dihapus tanpa memilih gambar pengganti.',
            ]);
        }

        if (! ($data['is_active'] ?? true)) {
            $data['is_primary'] = false;
        }

        DB::transaction(function () use ($data, $plan): void {
            if ($data['is_primary'] ?? false) {
                MembershipPlan::whereKeyNot($plan->id)->update(['is_primary' => false]);
            }

            $plan->update($data);
            $this->ensurePrimaryPlan();
        });

        if ($cardImage) {
            $plan->addMedia($cardImage)->toMediaCollection('card_image');
        } elseif ($removeCardImage) {
            $plan->clearMediaCollection('card_image');
        }

        if ($removeCardImage || $cardImage) {
            $plan->forceFill(['card_image_url' => null])->save();
        }

        return back()->with('success', 'Paket berhasil diperbarui.');
    }

    public function destroy(MembershipPlan $plan): RedirectResponse
    {
        $this->gate();

        $count = $plan->memberships()->count();

        if ($count > 0) {
            return back()->withErrors([
                'plan' => "Paket tidak dapat dihapus karena sudah terhubung ke {$count} pendaftaran atau membership. Nonaktifkan paket agar histori transaksi tetap utuh.",
            ]);
        }

        DB::transaction(function () use ($plan): void {
            $plan->delete();
            $this->ensurePrimaryPlan();
        });

        return back()->with('success', 'Paket berhasil dihapus.');
    }

    private function ensurePrimaryPlan(): void
    {
        MembershipPlan::where('is_active', false)->update(['is_primary' => false]);

        if (MembershipPlan::where('is_active', true)->where('is_primary', true)->exists()) {
            return;
        }

        $fallback = MembershipPlan::where('is_active', true)
            ->orderBy('price')
            ->orderBy('id')
            ->first();

        if ($fallback) {
            $fallback->update(['is_primary' => true]);
        }
    }

    /**
     * @return array<int, mixed>
     */
    private function cardImageRules(bool $required = false): array
    {
        return [
            $required ? 'required' : 'nullable',
            'file',
            'mimetypes:image/jpeg,image/png,image/webp,image/avif',
            'max:5120',
            (new Dimensions)
                ->minWidth(960)
                ->minHeight(240),
            static function (string $attribute, mixed $value, \Closure $fail): void {
                $dimensions = method_exists($value, 'dimensions')
                    ? $value->dimensions()
                    : null;

                if (! $dimensions) {
                    return;
                }

                [$width, $height] = $dimensions;
                $ratio = $height > 0 ? $width / $height : 0;

                if ($ratio < 1.4 || $ratio > 5) {
                    $fail('Gambar membership harus berformat landscape dengan rasio antara 1.4:1 dan 5:1.');
                }
            },
        ];
    }

    /**
     * Publicly active plans must always represent a payable purchase. A future
     * complimentary flow needs its own explicit grant semantics and audit trail.
     *
     * @return array<int, mixed>
     */
    private function priceRules(Request $request): array
    {
        $willBeActive = $request->has('is_active')
            ? $request->boolean('is_active')
            : true;

        return [
            'required',
            'integer',
            'min:0',
            static function (string $attribute, mixed $value, \Closure $fail) use ($willBeActive): void {
                if ($willBeActive && (int) $value < 1) {
                    $fail('Paket aktif harus memiliki harga lebih dari Rp 0. Nonaktifkan paket gratis sampai alur complimentary tersedia.');
                }
            },
        ];
    }
}
