# Account and usage

## The current user

`GET /me` returns the user the key acts as, the key's id and the rate limit. `orgo_connected` is false when the account's Orgo sign-in has ended. See the example on [Authentication](/docs/api/authentication).

## Usage and credits

`GET /usage?days=30` reads your balance and spend from your Orgo billing. A credit is one US dollar; amounts are in cents. `days` is rounded up to 7, 30, 90 or 365.

```bash
curl -s "https://<your-app-host>/api/v1/usage?days=7" -H "Authorization: Bearer $API_KEY"
```

```json
{
  "ok": true, "request_id": "req_5Ry_ONgdcAYLnT4c",
  "data": { "object": "usage", "plan": "Free", "balance_cents": null, "period_days": 7, "available": false, "used_cents": null, "daily": [], "models": [] }
}
```

This sample is from a development account whose Orgo key covers a single workspace; Orgo withholds billing data from such keys, so `balance_cents` is null and `available` is false. With a normal account, `balance_cents` is your balance, `used_cents` the spend in the period, `daily` the spend per day (AI, computers, credit added) and `models` the top models. Top up and change plans in the web app.
