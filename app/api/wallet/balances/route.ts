import { NextRequest } from "next/server";
import { formatUnits, isAddress, erc20Abi } from "viem";
import { jsonError, jsonOk } from "@/lib/http";
import { publicClient } from "@/lib/viem";
import { usdtContract } from "@/lib/network-config";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address") ?? "";
  if (!isAddress(address)) return jsonError("INVALID_ADDRESS");
  try {
    const client = publicClient();
    const pol = await client.getBalance({ address });
    let usdt = "0";
    const token = usdtContract();
    if (token) {
      const raw = await client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      });
      usdt = formatUnits(raw as bigint, 6);
    }
    return jsonOk({ pol: formatUnits(pol, 18), usdt, usdtConfigured: Boolean(token) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "BALANCE_FAILED");
  }
}
