# withdraw
Withdraw funds from an IE over HTTP, with gas fees deducted

## `POST /`

Request body:

```json
{
  "account": "0x...",
  "nonce": 0,
  "target": "0x...",
  "value": "...",
  "v": 0,
  "r": "0x...",
  "s": "0x..."
}
```

Response:

```
<Transaction Hash>
```
