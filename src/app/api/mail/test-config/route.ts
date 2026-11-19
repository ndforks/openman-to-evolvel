import { testConfigRoute } from "@/lib/mail/http";

/** Dev-only: lets a local test process set a short-lived AgentMail key, webhook secret and fake base URL. */
export const { POST, DELETE } = testConfigRoute("agentmail");
