export const MORPHO_API_URL = "https://blue-api.morpho.org/graphql";

export interface AssetData {
  address: string;
  symbol: string;
  decimals: number;
  priceUsd: string;
}

interface QueryResponse {
  data: {
    assets: {
      items: AssetData[];
    };
  };
}

export async function fetchAssetData(
  chainId: number,
  assetAddress: string
): Promise<AssetData | null> {
  const query = `
    query {
      assets(where: { chainId_in: [${chainId}], address_in: ["${assetAddress}"] }) {
        items {
          address
          symbol 
          decimals
          priceUsd
        }
      }
    }
  `;

  try {
    const response = await fetch(MORPHO_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = (await response.json()) as QueryResponse;
    return data.data.assets.items[0] || null;
  } catch (error) {
    console.error("Error fetching asset data:", error);
    return null;
  }
}
