/** Agent email (AgentMail). Server only. */
export { processMailEvent, startTaskFromEmail, type InboundEmail, type MailTaskOptions } from "./inbound";
export {
  MAX_SENDERS,
  MailError,
  addApprovedSender,
  changePersonalAddress,
  createTriggerAddress,
  createWorkflow,
  deleteWorkflow,
  ensurePersonalInbox,
  mailOverview,
  removeApprovedSender,
  updateWorkflow,
  workflowLimits,
} from "./service";
export { vendorConfig, vendorReady } from "./vendor";
