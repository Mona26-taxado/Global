# WALLET CONNECTION

1. DApp Browser: injected `eth_requestAccounts` + Polygon switch.
2. Trust from Chrome: official `open_url` deeplink (not a payment link).
3. TokenPocket from Chrome: H5 `tpoutside://pull.activity` with **login** action + callback poll.

No Reown AppKit. No WalletConnect as the primary library.

States: IDLE → OPENING_WALLET → WAITING_FOR_APPROVAL → CONNECTED → VERIFYING → AUTHENTICATED.
