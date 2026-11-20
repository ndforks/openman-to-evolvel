<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('task_files', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->foreignId('task_id')->constrained('tasks')->cascadeOnDelete();
            $table->string('path');
            $table->unsignedBigInteger('size_bytes')->default(0);
            // Large task files stay on the execution worktree; this is only
            // a pointer, never the content (OpenMan's "large files stay on
            // the user's computer" decision, carried over as-is).
            $table->string('disk_path');
            $table->timestamps();

            $table->unique(['task_id', 'path']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('task_files');
    }
};
