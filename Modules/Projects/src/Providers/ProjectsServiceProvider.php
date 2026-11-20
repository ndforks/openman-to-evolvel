<?php

namespace Modules\Projects\Providers;

use Illuminate\Support\ServiceProvider;
use Modules\Projects\Contracts\ReviewsProposals;
use Modules\Projects\Services\ProposalReviewService;

class ProjectsServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(ReviewsProposals::class, ProposalReviewService::class);
    }
}
