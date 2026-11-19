# Modes and models

All modes use Anthropic's Claude models, reached through Orgo's model proxy. Model use is charged to your Orgo credits at the provider's list price plus {{credits.markup}}. See [Credits and billing](/docs/credits-and-billing).

## The modes

| Mode | Model | Best for |
|---|---|---|
| {{mode.lite}} | Claude Haiku 5.5 | Small, routine jobs at the lowest cost |
| {{mode.standard}} | Claude Sonnet 5.5 | Everyday work |
| {{mode.max}} | Claude Opus 5.5 | Long or demanding work where quality comes first |

Choose a mode from the menu at the top of the app before sending. Every run requests high reasoning effort from the model.

## Effort and speed in {{mode.max}}

When {{mode.max}} is selected, the menu adds **Effort** and **Speed** settings.

- **Effort**: Medium and High use Claude Opus 5.5. Extra and Ultra request Claude Fable 5.2, which Orgo does not serve yet, so those runs use Opus 5.5 instead and the task says so.
- **Speed**: Fast requests priority processing from the provider.

## Picking one

{{mode.standard}} is a good default. Step up to {{mode.max}} for work that needs extended planning or careful reasoning, and down to {{mode.lite}} for quick lookups and small edits. Your Orgo usage shows what each task cost (see [Credits and billing](/docs/credits-and-billing)).
