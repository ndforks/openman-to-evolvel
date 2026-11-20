// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * "Allow this text?" cards in the task that wanted to send it. The card is raised through the relay's
 * `raiseApproval`; answering it approves or denies the pending SMS. The owner can also answer by texting
 * `YES <code>` / `NO <code>`; any decision, wherever it was made, closes the card.
 */
import { raiseApproval, registerApprovalHandler, settleApproval } from "@/lib/agent/server/relay";
import type { SmsRecord } from "@/lib/db/phone";
import { DbStore } from "@/lib/store";

const KIND = "sms";
export const SMS_CHOICES = { send: "Send", deny: "Don't send" } as const;

const isNo = (choice: string) => /^(deny|don'?t|no\b|n$|reject|cancel|never)/i.test(choice.trim());

/** Shows the card for a pending outbound SMS in its task. Never throws: the text-back path still works without it. */
export async function raiseSmsApproval(userId: string, sms: SmsRecord): Promise<void> {
  if (!sms.taskId) return;
  try {
    await raiseApproval(new DbStore(userId), sms.taskId, {
      kind: KIND,
      ref: sms.id,
      title: `Allow this text to ${sms.counterpart}?`,
      detail: sms.body,
      choices: [SMS_CHOICES.deny, SMS_CHOICES.send],
      brief: `Waiting for your OK to text ${sms.counterpart}`,
    });
  } catch (err) {
    console.warn("[phone] could not show the SMS approval card:", err instanceof Error ? err.message : err);
  }
}

/** Closes the card after the SMS was approved or denied anywhere (card, text reply, phone settings). */
export async function settleSmsApproval(userId: string, taskId: string | null, smsId: string, decision: "approve" | "deny"): Promise<void> {
  if (!taskId) return;
  try {
    await settleApproval(new DbStore(userId), taskId, KIND, smsId, decision === "approve" ? SMS_CHOICES.send : SMS_CHOICES.deny);
  } catch (err) {
    console.warn("[phone] could not close the SMS approval card:", err instanceof Error ? err.message : err);
  }
}

registerApprovalHandler(KIND, async ({ userId, ref, choice }) => {
  // Imported here so this module stays light for the relay, which loads it on first answer.
  const { decideSms } = await import("./service");
  const sms = await decideSms(userId, ref, isNo(choice) ? "deny" : "approve");
  if (sms.status === "failed") throw new Error(`The text could not be sent: ${sms.error ?? "unknown error"}`);
});
