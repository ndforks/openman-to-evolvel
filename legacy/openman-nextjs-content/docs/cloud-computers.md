# Cloud computers

Tasks run on Orgo cloud computers in your own Orgo workspace. Your **home computer** is created at your first sign-in and is the default place tasks run. More computers can be added from the **Computers** page.

Every price here is Orgo's and is charged to your Orgo account.

## Operating systems

{{table:os}}

## Sizes and pricing

{{table:sizes}}

- Each computer's storage can grow to {{storage.max}}, at {{storage.block}}.
- Linux computers can be billed hourly from credit. Windows and Mac computers are billed monthly.
- Mac comes in one fixed configuration: {{mac.spec}}.
- Orgo decides where each computer is hosted; there is no region choice.
- A plan includes up to {{computers.plan}} computers. Beyond that, extra computers run hourly from credit, up to {{computers.credit}} per account.

[Pricing](/pricing) lists which sizes each plan keeps always on.

## Adding a computer

On **Computers**, choose **Create cloud computer** and pick the operating system, size and storage. The computer shows up in the list with its live status, and you can select it as the place a task runs (see [Tasks](/docs/tasks)).

Computers marked **Temporary** have an expiry time, shown on the badge; Orgo deletes them after it.

## Managing a computer

Open a computer to:

- **Watch it**: live screen, current CPU, memory and disk use, and its location.
- **Open a terminal**: a shell on the computer, right in the browser.
- **Add an SSH key** (Linux): connect with your own SSH client. New keys apply after the next restart.
- **Resize** it or add storage. Storage can be increased, never decreased.
- **Restart**, **rename** or **delete** it.

The home computer cannot be resized, restarted, renamed or deleted from {{name}}, since every task relies on it.

## Backups

Orgo takes a daily backup of each computer and keeps it for 7 days. From the computer's page, restore a backup onto the same computer or into a new one.

## Running out of credit

Under Orgo's rules, an hourly computer stops when your credit runs out, and its files are held for 7 days. If no credit is added in that time, they are deleted, so top up before then. See [Credits and billing](/docs/credits-and-billing).
