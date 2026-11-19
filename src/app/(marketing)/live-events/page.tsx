// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { redirect } from "next/navigation";

/** There is no events page; the path redirects home so old links keep working. */
export default function LiveEventsPage() {
  redirect("/");
}
