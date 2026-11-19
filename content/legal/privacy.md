# Privacy policy

> **Draft for legal review. Not in effect.** This text has not been reviewed by a lawyer. The operating company named below must be confirmed before publication.

Last updated: November 19, 2026

## 1. Who is responsible

{{name}} (the "Service", at {{domain}}) is operated by Organic Intelligence, Inc. ("Orgo", "we", "us"), San Francisco, California. This policy covers data the Service itself handles. Your Orgo account, computers and billing are covered by [Orgo's Privacy Policy](https://www.orgo.ai/privacy).

## 2. What we collect

**From your Orgo account when you sign in:** your name, email address, avatar, plan, Orgo workspace, and an Orgo API key for your account.

**What you create in the Service:** tasks and the messages you send; the agent's steps, outputs and the records of files it produces; files you attach (to tasks and projects); projects and their instructions; your profile and knowledge entries; skills you build; custom connector settings and keys; automations and their run history; website records; share links; settings; API keys (as a hash) and webhook endpoints.

**Technical data:** an encrypted session cookie that keeps you signed in. We do not use advertising or analytics trackers.

**On your computers:** the files the agent creates and the websites it builds are stored on your Orgo cloud computers, not in our database.

## 3. How we use it

To run the Service for you: run tasks on your computers, call AI models, run your automations, show your history, keep you signed in, protect the Service from abuse, and answer support requests. We do not sell your data and we do not use your content to train AI models.

## 4. Where it is stored

The Service's records are stored in a Postgres database hosted by Supabase in the United States (AWS us-west-1). Only our server can read or write that database; your browser never connects to it. Secrets (your Orgo key, the key to the agent on your computer, custom connector keys, webhook secrets) are encrypted with AES-256-GCM before they are stored.

## 5. Who we share it with (sub-processors)

| Provider | What it does for the Service | Data it receives |
|---|---|---|
| Supabase | Hosts the Service's database | Everything listed in section 2 except data on your computers |
| Orgo (Organic Intelligence, Inc.) | Your account, sign-in, cloud computers, hosting of websites and previews, model proxy, billing | Your Orgo key, task instructions and content sent to your computer and to models |
| Anthropic, through Orgo's model proxy | Runs the Claude models the agent uses | Task prompts, context and results needed to complete each step |
| Composio, through Orgo | Holds sign-ins to the apps you connect and runs app actions | The app actions the agent takes for you and their results |
| Stripe, through Orgo | Payments when you add credit or change plan | Payment details you enter on Stripe's pages (we never see card numbers) |

**Not yet in use:** agent email (AgentMail) and agent phone (AgentPhone). When those features are switched on, AgentMail will receive mail sent to and from your agent's address, and AgentPhone will receive texts and calls to and from your agent's number. We will update this table before they go live.

We may also disclose data if the law requires it, or to protect the rights and safety of users and others, or as part of a merger or acquisition with notice to you.

## 6. Sharing you control

If you make a task's share link public, anyone with the link can see that task's conversation, steps and files. Text that looks like a password, key or token is hidden in the shared view. Make the link private to stop sharing.

## 7. How long we keep it

We keep your data while you use the Service. When you delete your data in **Settings → Data controls**, we delete the Service's records about you, including your stored Orgo key. Backups held by our database provider expire on its schedule. Data on your Orgo computers and in your Orgo account is kept or deleted under Orgo's policies.

## 8. Your rights

You can export your data as a zip and delete it from Settings at any time. Depending on where you live you may have further rights, such as access, correction, objection or portability. To use them, write to [privacy@orgo.ai](mailto:privacy@orgo.ai).

## 9. Security

Your browser talks only to our server; database access is limited to that server; secrets are encrypted at rest; sessions are encrypted, HttpOnly cookies. No system is perfectly secure. Report security issues to [privacy@orgo.ai](mailto:privacy@orgo.ai).

## 10. Children

The Service is not for children under 13 (or the minimum age in your country), and we do not knowingly collect their data.

## 11. Changes

We will post changes here with a new date and tell you in the Service for material changes.

## 12. Contact

Questions about privacy: [privacy@orgo.ai](mailto:privacy@orgo.ai).
