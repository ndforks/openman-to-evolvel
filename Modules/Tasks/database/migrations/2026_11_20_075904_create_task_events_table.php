<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('task_events', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->foreignId('task_id')->constrained('tasks')->cascadeOnDelete();
            $table->string('type');
            $table->json('data');
            $table->unsignedBigInteger('sequence');
            $table->timestamps();

            // Replay order for a reconnecting browser (docs/ARCHITECTURE.md's
            // "the browser can reconnect and replay" — the one piece of
            // OpenMan's live-view design this table exists to carry over).
            $table->unique(['task_id', 'sequence']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('task_events');
    }
};
