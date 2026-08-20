# TEST-TOKEN

Do **not** use real USDT on testnet.

GLOBAL X uses a project-owned mock ERC-20:

- Name: `GLOBAL X TEST USD`
- Symbol: `GXUSD`
- Decimals: `6`
- Warning string: `TESTNET / NO REAL VALUE`
- Source: `contracts/GXUSD.sol`
- Faucet: `faucet()` mints 2000 GXUSD to `msg.sender` with a 1-hour cooldown, **only if** `block.chainid == 80002`

The user signs the faucet transaction in their own wallet and pays POL gas. The server does **not** store a minter private key.

## Deploy (Remix — beginner)

1. Open https://remix.ethereum.org
2. Create a file and paste `contracts/GXUSD.sol`.
3. Compile with Solidity `0.8.24`.
4. In MetaMask / Trust Wallet / TokenPocket, select **Polygon Amoy (80002)**.
5. In Remix Deploy, confirm the environment is Injected Provider and the network is Amoy.
6. Deploy. Confirm in the wallet.
7. Copy the **deployed address** from Remix / [Amoy Polygonscan](https://amoy.polygonscan.com/).
8. Put that exact address in `.env`:

```
GXUSD_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_GXUSD_CONTRACT_ADDRESS=0x...
```

**Never invent or paste a placeholder address.** Until this is set, payments stay disabled.

## Disable faucet before production

- Set `ENABLE_GXUSD_FAUCET=false` and `NEXT_PUBLIC_ENABLE_GXUSD_FAUCET=false`
- Do not deploy this faucet contract to Polygon mainnet
- Mainnet must use a separate production token configuration
