# TOKENPOCKET

Official H5 DeepLink: https://help.tokenpocket.pro/developer-en/wallet/pull-up-wallet-with-deeplink

Connect uses **action: login** only. Fields `to`, `amount`, `contract`, `symbol` are never added on this path.

If you see Transaction Details / Verify Password during Connect, the code is using **transfer** by mistake — that must not happen.

Callback:

- Wallet POSTs to `/api/wallet/tokenpocket/callback?actionId=`
- Page `/wallet/callback/tokenpocket` also stores query params
- App polls `/api/wallet/tokenpocket/status`

A raw `?address=` query is not login. Signature auth still required.

DApp Browser: use JS injected provider, not H5 pull-up. https://help.tokenpocket.pro/developer-en/wallet/js-sdk
