<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\FeedSchedule;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Carbon\Carbon;

class CheckFeedingSchedule extends Command
{
    protected $signature = 'feed:check-schedule';
    protected $description = 'Cek jadwal pakan dan kirim push notification ke pengguna';

    public function handle()
    {
        // Ambil waktu saat ini dalam format jam:menit (contoh: "08:00")
        $now = now()->format('H:i');

        // Cari jadwal yang statusnya aktif dan waktunya sama persis dengan sekarang
        $schedules = FeedSchedule::where('is_active', true)
                                 ->where('time', 'like', $now . '%')
                                 ->get();

        if ($schedules->isEmpty()) {
            return Command::SUCCESS;
        }

        foreach ($schedules as $schedule) {
            // Asumsikan jadwal ini milik user tertentu (jika tabel punya user_id)
            // Jika untuk semua admin, kita ambil semua user yang punya expo_token
            $users = User::whereNotNull('expo_token')->get();

            foreach ($users as $user) {
                // Tembak API Push Notification milik Expo
                Http::post('https://exp.host/--/api/v2/push/send', [
                    'to' => $user->expo_token,
                    'title' => 'Waktunya Makan! 🐟',
                    'body' => "Jadwal pakan '{$schedule->label}' sedang berjalan. Mesin sedang menabur pakan.",
                    'sound' => 'default',
                    'badge' => 1,
                ]);
            }
        }

        $this->info("Pengecekan jadwal {$now} selesai.");
        return Command::SUCCESS;
    }
}