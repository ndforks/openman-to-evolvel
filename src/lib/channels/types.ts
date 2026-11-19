// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Shapes shared by the channel routes and the UI ("Reach <brand> from anywhere": Telegram and Slack). */

export type ChannelId = "telegram" | "slack";

/** Hermes' gateway state for one platform (`~/.hermes/gateway_state.json`), or "off" when it is not configured. */
export type PlatformState = "off" | "connected" | "connecting" | "failed" | "stopped" | "unknown";

export interface ChannelHealth {
  /** Credentials are on the computer. */
  linked: boolean;
  state: PlatformState;
  /** Hermes' own sentence when the platform failed to start. */
  error: string | null;
}

export interface TelegramStatus extends ChannelHealth {
  /** The bot's @handle (without @), when known. */
  bot: string | null;
}

export interface SlackPairingRequest {
  /** Hermes' pairing request id (never the code). */
  id: string;
  name: string;
  at: string | null;
}

export interface SlackStatus extends ChannelHealth {
  /** "Workspace · @bot", remembered at link time. */
  name: string | null;
  /** People who DM'd the bot and are waiting for the owner's approval. */
  pending: SlackPairingRequest[];
  /** People approved to talk to the bot. */
  approved: number;
}

export interface ChannelsStatus {
  /** False until the user's agent computer exists. */
  configured: boolean;
  telegram: TelegramStatus;
  slack: SlackStatus;
  /** Runs in progress on the agent right now (a relink restarts the agent and would cut them off). */
  activeRuns: number;
  error?: string;
}

export interface TelegramPairingAnswer {
  status: "waiting" | "connecting" | "connected" | "expired" | "stuck" | "refused";
  /** Opens Telegram on the Create Bot screen; what the QR code encodes. */
  link?: string;
  /** Opaque, sealed by Orgo: hand it back to poll. */
  handle?: string;
  bot?: string | null;
  /** The person may close the page once they tapped Create. */
  canLeave?: boolean;
}

export interface ChannelSession {
  id: string;
  channel: string;
  title: string;
  startedAt: string | null;
  lastAt: string | null;
  messages: number;
}

export interface ChannelSessionRead {
  id: string;
  channel: string;
  title: string;
  messages: { role: "user" | "assistant"; text: string; at: string | null }[];
  total: number;
}

export const CHANNEL_LABEL: Record<string, string> = { telegram: "Telegram", slack: "Slack", discord: "Discord", email: "Email", whatsapp: "WhatsApp", signal: "Signal", sms: "SMS", schedule: "Schedule", terminal: "Terminal", api: "API", other: "Other" };
