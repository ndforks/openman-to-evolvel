# Automations

Automations start tasks without you: on a timetable, or in response to an event.

## Setting one up

Go to **Automations** and choose **Create**. Write what the agent should do (that text becomes the task) and pick when it should run. Or describe the whole automation in your own words and {{name}} fills in the settings for you to review.

You can also ask the agent to create and manage automations from inside a task, for example *"Every Monday at 9, summarize last week's support emails"*.

## Timing

**Scheduled**: once, every day, on weekdays, every week, every month, or every N minutes.

**Triggered** (up to 10 triggers per automation):

| Trigger | Fires when |
|---|---|
| Webhook | A request arrives at the automation's private URL. An auth header can be required. One webhook per automation. |
| RSS | A feed you choose publishes a new item matching your conditions. Feeds are polled every few minutes. |
| Timer | A repeat rule, just like a schedule. |

## Limits by plan

| Orgo plan | Active automations | Minimum interval |
|---|---|---|
| No plan | 2 | 15 minutes |
| Starter | 10 | 5 minutes |
| Growth | 20 | 5 minutes |
| Scale | 100 | 5 minutes |

## Runs and errors

- Each run is logged with its outcome. Check the history of one automation or all of them, plus a calendar of upcoming runs.
- **Test run** starts an automation immediately, even when it is paused.
- Failed runs are retried up to 3 times. Three failures in a row pause the automation and send you a notification.
- A run still going after 2 hours is stopped and counted as failed.
- You can pause and resume any automation whenever you like.

Automations run on your Orgo account and spend credits just like regular tasks, even when you are signed out.
