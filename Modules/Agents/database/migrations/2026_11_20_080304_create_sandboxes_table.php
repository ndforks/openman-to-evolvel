<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sandboxes', function (Blueprint $table) {
            $table->bigIncrements('id');
            // No FK to tasks: Agents does not depend on the Tasks module. A
            // task references its sandbox by id through Modules\Agents's
            // public contracts, never the other way around.
            $table->unsignedBigInteger('task_id');
            $table->string('repository_path');
            $table->string('worktree_path');
            $table->string('branch');
            $table->string('status')->default('provisioning');
            $table->timestamps();

            $table->unique('task_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sandboxes');
    }
};
