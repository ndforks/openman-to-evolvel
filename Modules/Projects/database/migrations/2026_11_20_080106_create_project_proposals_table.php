<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('project_proposals', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->foreignId('project_id')->constrained('projects')->cascadeOnDelete();
            // No FK to tasks: Projects does not depend on the Tasks module.
            $table->unsignedBigInteger('task_id')->nullable();
            $table->string('summary');
            $table->longText('diff');
            $table->string('status')->default('pending');
            $table->timestampTz('decided_at')->nullable();
            $table->timestamps();

            $table->index(['project_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('project_proposals');
    }
};
