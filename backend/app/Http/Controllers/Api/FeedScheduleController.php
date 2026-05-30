<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\FeedSchedule;
use Illuminate\Http\Request;

class FeedScheduleController extends Controller
{
    // Mengambil semua jadwal milik user yang sedang login
    public function index(Request $request)
    {
        $schedules = $request->user()->feedSchedules()->orderBy('time')->get();
        return response()->json(['success' => true, 'data' => $schedules], 200);
    }

    // Menambah jadwal baru
    public function store(Request $request)
    {
        $request->validate([
            'label' => 'nullable|string|max:50',
            'time' => 'required|date_format:H:i', // Format jam dan menit, contoh: 08:00
        ]);

        $schedule = $request->user()->feedSchedules()->create([
            'label' => $request->label ?: 'Jadwal Baru',
            'time' => $request->time,
            'is_active' => true,
        ]);

        return response()->json(['success' => true, 'message' => 'Jadwal ditambahkan', 'data' => $schedule], 201);
    }

    // Mengubah status aktif/nonaktif jadwal
    public function toggleActive(Request $request, $id)
    {
        $schedule = $request->user()->feedSchedules()->findOrFail($id);
        $schedule->is_active = !$schedule->is_active;
        $schedule->save();

        return response()->json(['success' => true, 'message' => 'Status diubah', 'data' => $schedule], 200);
    }

    // Menghapus jadwal
    public function destroy(Request $request, $id)
    {
        $schedule = $request->user()->feedSchedules()->findOrFail($id);
        $schedule->delete();

        return response()->json(['success' => true, 'message' => 'Jadwal dihapus'], 200);
    }
}