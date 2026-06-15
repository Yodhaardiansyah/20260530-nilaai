<?php

use App\Http\Controllers\Api\FeedScheduleController;
use App\Http\Controllers\Api\AuthController;
use App\Models\FeedSchedule;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Cache;
use Carbon\Carbon;

// =======================================================
// 1. PUBLIC ROUTES (Bisa diakses tanpa login)
// =======================================================
Route::post('/login', [AuthController::class, 'login']);


// =======================================================
// 2. PROTECTED ROUTES (Harus pakai Bearer Token Aplikasi)
// =======================================================
Route::middleware('auth:sanctum')->group(function () {
    
    // --- Auth & Profile ---
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', function (Request $request) {
        return $request->user();
    });
    Route::put('/user', [AuthController::class, 'updateProfile']);

    // --- Jadwal Pakan ---
    Route::get('/schedules', [FeedScheduleController::class, 'index']);
    Route::post('/schedules', [FeedScheduleController::class, 'store']);
    Route::put('/schedules/{id}/toggle', [FeedScheduleController::class, 'toggleActive']);
    Route::delete('/schedules/{id}', [FeedScheduleController::class, 'destroy']);

    // --- Konfigurasi Sistem ---
    Route::get('/system-config', function () {
        return response()->json([
            'success' => true,
            'python_stream_url' => env('PYTHON_STREAM_URL')
        ]);
    });

    // --- Dashboard Summary ---
    Route::get('/dashboard/summary', function (Request $request) {
        // 1. Ambil jumlah ikan terakhir dari tabel log (kiriman Python)
        $latestLog = DB::table('fish_logs')->orderBy('created_at', 'desc')->first();
        $fishCount = $latestLog ? $latestLog->count : 0;
        $lastUpdate = $latestLog ? Carbon::parse($latestLog->created_at)->diffForHumans() : 'Belum ada data';

        // 2. Cari jadwal pakan terdekat hari ini
        $now = now()->format('H:i');
        $nextSchedule = $request->user()->feedSchedules()
            ->where('is_active', true)
            ->where('time', '>=', $now)
            ->orderBy('time')
            ->first();

        // Jika hari ini sudah tidak ada jadwal, ambil jadwal pertama untuk besok
        if (!$nextSchedule) {
            $nextSchedule = $request->user()->feedSchedules()
                ->where('is_active', true)
                ->orderBy('time')
                ->first();
        }

        // 3. Status IoT dan Waktu Terakhir Dilihat (Heartbeat)
        $isOnline = Cache::has('iot_is_online');
        $deviceStatus = $isOnline ? 'Online' : 'Offline';
        
        $lastSeenData = Cache::get('iot_last_seen');
        $lastSeenTime = $lastSeenData ? Carbon::parse($lastSeenData)->format('d/m/Y H:i') : 'Belum pernah terhubung';

        return response()->json([
            'success' => true,
            'data' => [
                'fish_count' => $fishCount,
                'last_vision_update' => $lastUpdate,
                'next_feeding' => $nextSchedule ? substr($nextSchedule->time, 0, 5) . ' (' . $nextSchedule->label . ')' : 'Belum ada jadwal aktif',
                'device_status' => $deviceStatus,
                'last_seen' => $lastSeenTime
            ]
        ]);
    });
    
    // --- Perintah Pakan Manual dari Aplikasi ---
    Route::post('/device/feed-now', function () {
        DB::table('device_commands')->insert([
            'command_name' => 'feed_now',
            'is_executed' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        return response()->json(['success' => true, 'message' => 'Perintah pakan dikirim ke antrean']);
    });

    // --- Perintah AI Kamera dari Aplikasi ---
    Route::post('/device/ai-command', function (Request $request) {
        $request->validate(['command' => 'required|string']);
        
        DB::table('device_commands')->insert([
            'command_name' => 'ai_' . $request->command, // Tambahkan prefix 'ai_' agar tidak tertukar dengan alat ESP32
            'is_executed' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        
        return response()->json(['success' => true, 'message' => 'Perintah AI dikirim ke antrean']);
    });

    // --- Manajemen Token Push Notification ---
    Route::post('/user/push-token', function (Request $request) {
        $request->validate(['token' => 'required|string']);
        
        // Simpan token ke tabel users (Pastikan kamu sudah membuat kolom 'expo_token' di database)
        $request->user()->update(['expo_token' => $request->token]);
        
        return response()->json(['success' => true, 'message' => 'Token tersimpan']);
    });

    Route::post('/user/remove-push-token', function (Request $request) {
        $request->user()->update(['expo_token' => null]);
        return response()->json(['success' => true]);
    });
});


// =======================================================
// 3. DEVICE ROUTES (Untuk Komunikasi ESP32 & Python AI)
// =======================================================
Route::prefix('device')->group(function () {
    
    // --- Tarik Data Command & Jadwal oleh ESP32 ---
    Route::get('/check-command', function (Request $request) {
        if ($request->bearerToken() !== 'token-rahasia-mesin-123') {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        // Simpan "detak jantung" alat ke Cache
        Cache::put('iot_is_online', true, 60); // 60 detik
        Cache::forever('iot_last_seen', now()->toDateTimeString());

        // 1. Cek antrean perintah pakan manual
        $command = DB::table('device_commands')
            ->where('command_name', 'feed_now')
            ->where('is_executed', false)
            ->first();

        $feedNow = false;
        if ($command) {
            $feedNow = true;
            // Tandai sudah dieksekusi agar ESP32 tidak memberi pakan berkali-kali
            DB::table('device_commands')
                ->where('id', $command->id)
                ->update(['is_executed' => true, 'updated_at' => now()]);
        }

        // 2. Ambil jadwal aktif
        $activeSchedules = FeedSchedule::where('is_active', true)->get();
        $formattedSchedules = $activeSchedules->map(function ($schedule) {
            $parts = explode(':', $schedule->time);
            return ['h' => (int) $parts[0], 'm' => (int) $parts[1]];
        });

        // 3. AMBIL DATA JUMLAH IKAN TERAKHIR (TAMBAHAN BARU)
        $latestLog = DB::table('fish_logs')->orderBy('created_at', 'desc')->first();
        $fishCount = $latestLog ? $latestLog->count : 1; // Default 1 jika belum ada data kamera

        return response()->json([
            'feed_now' => $feedNow,
            'fish_count' => (int) $fishCount, // Kirim ke ESP32
            'schedules' => $formattedSchedules
        ]);
    });

    // --- Tempat ESP32 mengirim log aktivitas (Placeholder) ---
    Route::post('/log', function (Request $request) {
        if ($request->bearerToken() !== 'token-rahasia-mesin-123') {
            return response()->json(['message' => 'Unauthorized'], 401);
        }
        return response()->json(['success' => true]);
    });
});

// --- API Python Vision: Catat Hasil Hitung Ikan ---
Route::post('/machine/fish-count', function (Request $request) {
    if ($request->bearerToken() !== 'token-rahasia-mesin-123') {
        return response()->json(['message' => 'Unauthorized'], 401);
    }

    $request->validate([
        'fish_count' => 'required|integer'
    ]);

    DB::table('fish_logs')->insert([
        'count' => $request->fish_count,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    return response()->json(['success' => true, 'message' => 'Log ikan berhasil disimpan']);
});

// --- API Python Vision: Tarik Perintah dari Server ---
Route::get('/machine/check-command', function (Request $request) {
    if ($request->bearerToken() !== 'token-rahasia-mesin-123') {
        return response()->json(['message' => 'Unauthorized'], 401);
    }

    // Cari perintah khusus AI yang belum dieksekusi
    $command = DB::table('device_commands')
        ->where('command_name', 'like', 'ai_%')
        ->where('is_executed', false)
        ->first();

    $activeCommand = null;
    if ($command) {
        // Hilangkan tulisan 'ai_' agar Python hanya membaca 'restart' atau 'resolusi'
        $activeCommand = str_replace('ai_', '', $command->command_name);
        
        // Langsung tandai selesai
        DB::table('device_commands')
            ->where('id', $command->id)
            ->update(['is_executed' => true, 'updated_at' => now()]);
    }

    return response()->json([
        'success' => true,
        'command' => $activeCommand // Akan berisi null jika tidak ada perintah
    ]);
});