import { type PublicClient, createPublicClient, http } from "viem";
import "dotenv/config";
import { mainnet, base } from "viem/chains";

export async function getClient(
  chainId: number,
  options: { enableDebug?: boolean } = {}
): Promise<PublicClient> {
  const rpcUrl =
    chainId === 8453
      ? process.env.RPC_URL_BASE
      : chainId === 1
      ? process.env.RPC_URL_MAINNET
      : undefined;

  if (!rpcUrl)
    throw new Error(`No RPC URL configured for chain ID: ${chainId}`);

  const transport = http(rpcUrl, {
    retryCount: 3,
    ...(options.enableDebug
      ? {}
      : {
          batch: {
            batchSize: 100,
            wait: 200,
          },
        }),
  });

  const client = createPublicClient({
    chain: chainId === 8453 ? base : mainnet,
    transport,
    ...(options.enableDebug
      ? {}
      : {
          batch: {
            multicall: {
              batchSize: 2048,
              wait: 100,
            },
          },
        }),
  }) as PublicClient;

  return client;
}
