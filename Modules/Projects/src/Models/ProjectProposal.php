<?php

namespace Modules\Projects\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Projects\Data\ProposalStatus;
use Modules\Projects\Database\Factories\ProjectProposalFactory;

class ProjectProposal extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'task_id',
        'summary',
        'diff',
        'status',
        'decided_at',
    ];

    protected function casts(): array
    {
        return [
            'status' => ProposalStatus::class,
            'decided_at' => 'datetime',
        ];
    }

    protected static function newFactory(): ProjectProposalFactory
    {
        return ProjectProposalFactory::new();
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }
}
