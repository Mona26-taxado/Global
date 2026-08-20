// IMPORTANT: Registration and plans become ACTIVE only after this server-side
// blockchain verification. Wallet UI success is not enough.
import {
  decodeEventLog,
  decodeFunctionData,
  erc20Abi,
  getAddress,
  isHash,
  type Hash,
} from "viem";
import { publicClient } from "@/lib/viem";
import { activeChainId, paymentRecipient, usdtContract } from "@/lib/network-config";

export class ChainVerifyError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function verifyTokenTransfer(input: {
  txHash: Hash;
  expectedPayer: string;
  expectedAmount: bigint;
  expectedRecipient: string;
}) {
  const token = usdtContract();
  const recipient = input.expectedRecipient || paymentRecipient();
  if (!token) throw new ChainVerifyError("TOKEN_NOT_CONFIGURED", "USDT contract is not configured. Paste a verified address in env.");
  if (!recipient) throw new ChainVerifyError("RECIPIENT_NOT_CONFIGURED", "PAYMENT_RECIPIENT_ADDRESS is empty.");
  if (!isHash(input.txHash)) throw new ChainVerifyError("BAD_HASH", "A real transaction hash is required.");

  const client = publicClient();
  let chainId: number;
  try {
    chainId = await client.getChainId();
  } catch (error) {
    throw new ChainVerifyError(
      "PENDING",
      error instanceof Error ? error.message : "RPC is not reachable. Payment is waiting for verification.",
    );
  }
  if (chainId !== activeChainId()) {
    throw new ChainVerifyError("WRONG_CHAIN", `Expected chain ${activeChainId()}, RPC reported ${chainId}.`);
  }

  let tx;
  try {
    tx = await client.getTransaction({ hash: input.txHash });
  } catch (error) {
    throw new ChainVerifyError(
      "PENDING",
      error instanceof Error ? error.message : "Transaction is not readable from RPC yet.",
    );
  }
  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: input.txHash });
  } catch {
    throw new ChainVerifyError("PENDING", "Transaction is not mined yet.");
  }
  if (!receipt) throw new ChainVerifyError("PENDING", "Transaction is not mined yet.");
  if (receipt.status !== "success") throw new ChainVerifyError("TX_FAILED", "On-chain transaction failed.");
  if (getAddress(tx.from) !== getAddress(input.expectedPayer as `0x${string}`)) {
    throw new ChainVerifyError("WRONG_SENDER", "Sender does not match the authenticated wallet.");
  }
  if (!tx.to || getAddress(tx.to) !== getAddress(token)) {
    throw new ChainVerifyError("WRONG_TOKEN", "Not a call to the configured token contract.");
  }

  const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.input });
  if (decoded.functionName !== "transfer") {
    throw new ChainVerifyError("WRONG_METHOD", "Transaction is not an ERC-20 transfer.");
  }
  const to = String(decoded.args[0]);
  const amount = decoded.args[1] as bigint;
  if (getAddress(to as `0x${string}`) !== getAddress(recipient)) {
    throw new ChainVerifyError("WRONG_RECIPIENT", "On-chain recipient is not the server-approved address.");
  }
  if (amount !== input.expectedAmount) {
    throw new ChainVerifyError("WRONG_AMOUNT", "On-chain amount does not match the plan.");
  }

  const transferLog = receipt.logs.find((log) => getAddress(log.address) === getAddress(token));
  if (!transferLog) throw new ChainVerifyError("NO_TRANSFER_EVENT", "Receipt has no token Transfer event.");
  const event = decodeEventLog({ abi: erc20Abi, data: transferLog.data, topics: transferLog.topics });
  if (event.eventName !== "Transfer") throw new ChainVerifyError("NO_TRANSFER_EVENT", "Event is not Transfer.");
  const args = event.args as { from?: string; to?: string; value?: bigint };
  if (args.from && getAddress(args.from) !== getAddress(tx.from)) {
    throw new ChainVerifyError("WRONG_SENDER", "Transfer event sender mismatch.");
  }
  if (args.to && getAddress(args.to) !== getAddress(recipient)) {
    throw new ChainVerifyError("WRONG_RECIPIENT", "Transfer event recipient mismatch.");
  }
  if (args.value !== undefined && args.value !== amount) {
    throw new ChainVerifyError("WRONG_AMOUNT", "Transfer event amount mismatch.");
  }

  return {
    payerWallet: getAddress(tx.from),
    recipientWallet: getAddress(recipient),
    tokenContract: getAddress(token),
    amount,
    chainId,
    txHash: input.txHash,
  };
}
