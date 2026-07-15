<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\BookingOrder;
use Illuminate\Http\Request;
use Illuminate\View\View;

class InvoiceController extends Controller
{
    public function booking(Request $request, BookingOrder $bookingOrder): View
    {
        abort_unless(
            $request->user() && $bookingOrder->user_id === $request->user()->id,
            403,
        );

        $bookingOrder->load([
            'bookings.facility',
            'bookings.facilityUnit',
            'transaction',
            'user',
        ]);

        return view('public.invoices.booking', [
            'bookingOrder' => $bookingOrder,
            'autoPrint' => $request->boolean('print'),
        ]);
    }
}
