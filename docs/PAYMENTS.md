# PAYMENTS

Pay is separate from Connect.

Flow: prepare (server recipient/amount) → wallet `eth_sendTransaction` transfer → `/api/payments/confirm` verifies sender, recipient, token, amount, chain, receipt, Transfer event.

Frontend amounts are ignored. Empty USDT env disables Pay with a clear error.
