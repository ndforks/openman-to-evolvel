// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Static content of the Websites page: categories, the three feature lines and the example prompts. */
import { brand } from "@/config/brand";

export const WEBSITE_CATEGORIES = ["Landing Page", "SaaS", "E-commerce", "Productivity", "Portfolio", "Education"] as const;
export type WebsiteCategory = (typeof WEBSITE_CATEGORIES)[number];

export type WebsiteFeatureIcon = "build" | "publish" | "run";

export interface WebsiteFeature {
  id: WebsiteFeatureIcon;
  title: string;
  description: string;
}

/** Host that published sites get by default: an Orgo app URL. */
export const PUBLISH_DOMAIN = "web.orgo.dev";

export const WEBSITE_FEATURES: WebsiteFeature[] = [
  { id: "build", title: "Build", description: `Say what you want. ${brand.agentNoun} writes the pages, styles and code.` },
  { id: "publish", title: "Publish", description: `Put it online at a ${PUBLISH_DOMAIN} address or a domain you own.` },
  { id: "run", title: "Run", description: `See visits and data side by side, and ask for edits whenever you like.` },
];

/** Which drawn thumbnail a template card uses. */
export type WebsiteArt = "bakery" | "portal" | "board" | "clinic" | "shop" | "photo" | "cards" | "quiz";

export interface WebsiteTemplate {
  id: string;
  title: string;
  category: WebsiteCategory;
  art: WebsiteArt;
  /** Prompt a task would start from. */
  prompt: string;
}

export const WEBSITE_TEMPLATES: WebsiteTemplate[] = [
  { id: "bakery-preorders", title: "Bakery Pre-orders", category: "Landing Page", art: "bakery", prompt: "Make a one-page site for a neighbourhood bakery where people reserve tomorrow's bread before 8 pm." },
  { id: "client-portal", title: "Client Portal", category: "SaaS", art: "portal", prompt: "Make a client portal where an agency shares invoices, files and project status with each customer." },
  { id: "sprint-board", title: "Sprint Board", category: "Productivity", art: "board", prompt: "Make a sprint board with columns, story points, assignees and a burndown chart." },
  { id: "clinic-booking", title: "Clinic Booking", category: "Landing Page", art: "clinic", prompt: "Make a site for a physiotherapy clinic with services, prices and an appointment request form." },
  { id: "camera-shop", title: "Vintage Camera Shop", category: "E-commerce", art: "shop", prompt: "Make an online shop for refurbished film cameras with condition grades and a cart." },
  { id: "photo-portfolio", title: "Photographer Portfolio", category: "Portfolio", art: "photo", prompt: "Make a portfolio for a wedding photographer with galleries and an enquiry form." },
  { id: "language-flashcards", title: "Language Flashcards", category: "Education", art: "cards", prompt: "Make a flashcard app for learning Spanish verbs with spaced repetition." },
  { id: "chemistry-quiz", title: "Chemistry Quiz", category: "Education", art: "quiz", prompt: "Make a periodic-table quiz for high-school students with a score board." },
];
