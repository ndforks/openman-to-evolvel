<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('project_files', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->foreignId('project_id')->constrained('projects')->cascadeOnDelete();
            $table->string('path');
            $table->unsignedBigInteger('size_bytes')->default(0);
            $table->string('disk_path');
            $table->timestamps();

            $table->unique(['project_id', 'path']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('project_files');
    }
};
