// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { Suspense } from "react";
import type { Metadata } from "next";
import { TaskView, TaskViewFallback } from "@/components/task/task-view";

export const metadata: Metadata = { title: "Task" };

/**
 * /app/task/[id]: the task view. The id is only known at request time, so the part that reads it
 * sits inside Suspense (required with Cache Components) and everything live happens in the client component.
 * Append `?mock=1` to play a scripted task without a backend.
 */
export default function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<TaskViewFallback />}>
      {params.then(({ id }) => (
        <TaskView taskId={id} />
      ))}
    </Suspense>
  );
}
