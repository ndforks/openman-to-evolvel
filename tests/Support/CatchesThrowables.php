<?php

namespace Tests\Support;

use Throwable;

/**
 * Captures a thrown value in Act so it can be asserted on in Assert, instead
 * of a hand-rolled try/catch that passes silently when nothing is thrown.
 */
trait CatchesThrowables
{
    protected function catchThrowable(callable $callback): ?Throwable
    {
        try {
            $callback();

            return null;
        } catch (Throwable $throwable) {
            return $throwable;
        }
    }
}
