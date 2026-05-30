<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FeedSchedule extends Model
{
    protected $fillable = ['user_id', 'label', 'time', 'is_active'];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}