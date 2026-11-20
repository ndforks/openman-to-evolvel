# Connectors

With connectors, the agent can read from and act in your apps, for example sending mail from Gmail or editing a Notion page. They are provided through Orgo, and Composio takes care of signing in to each app.

## Connecting an app

Go to **Connectors** (in Settings or on the **Plugins** page), pick an app and sign in. The connection is tied to your home computer, so any task running there can use it.

You see the apps Orgo offers by default. If your Orgo key covers the whole account, the complete Composio catalog appears as well.

You can disconnect an app from the same screen whenever you want.

## Custom MCP servers

Any Model Context Protocol server can be added:

- **By URL**: give the server address plus any headers it requires. {{name}} checks the connection before saving.
- **By command**: give a command that launches the server on your computer. It is tried on the computer before saving.

## Custom APIs

For an HTTP API without a connector, enter its base URL and key. The key is encrypted at rest, and the agent receives one tool for calling that API.

## Per task and per project

The connectors menu in the input box shows which connectors a task is allowed to use. A [project](/docs/projects) can preselect connectors for all of its tasks.

## Worth knowing

- Anyone who can run tasks on a computer can ask the agent to use the apps connected there.
- When a computer is deleted, the app connections made on it go with it.
