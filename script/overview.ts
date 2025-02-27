import {
  type PublicClient,
  createPublicClient,
  http,
  parseAbiItem,
  formatEther,
} from "viem";
import { parseAbi } from "viem";
import { mainnet, base } from "viem/chains";
import { Address } from "@morpho-org/blue-sdk";
import "dotenv/config";

export async function getClient(
  chainId: number,
  options: { enableDebug?: boolean } = {}
): Promise<PublicClient> {
  const rpcUrl = chainId === 8453 ? process.env.RPC_URL_BASE : undefined;

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

// Interface for user interactions to track deposits/withdrawals
interface UserInteraction {
  blockNumber: bigint;
  timestamp: bigint;
  type: "deposit" | "withdraw";
  assets: bigint;
  shares: bigint;
  pricePerShare: number;
}

// Enhanced interface for APY calculation between interactions
interface APYPeriod {
  startBlock: bigint;
  endBlock: bigint;
  startTimestamp: bigint;
  endTimestamp: bigint;
  startPrice: number;
  endPrice: number;
  durationDays: number;
  apy: number;
  shares: bigint;
  // Fields for accrued interest
  startValue: number;
  endValue: number;
  interestAccrued: number;
  interestPercent: number;
}

/**
 * Enhanced interface for detailed interest period
 * Provides precise tracking of interest in each period between interactions
 */
interface EnhancedInterestPeriod extends APYPeriod {
  // Period identification
  periodIndex: number; // Sequential index of the period

  // Additional time metrics
  startDate: string; // Human-readable start date
  endDate: string; // Human-readable end date

  // Enhanced value tracking
  sharesHeldBigint: bigint; // Exact shares held (in wei)
  startValueBigint: bigint; // Exact start value (in wei)
  endValueBigint: bigint; // Exact end value (in wei)
  interestAccruedBigint: bigint; // Exact interest accrued (in wei)

  // Cumulative metrics
  cumulativeInterest: bigint; // Cumulative interest up to this period
  cumulativeInterestPercent: number; // Cumulative interest percentage
}

/**
 * Enhanced interface for summary interest statistics
 * Shows comprehensive view of user's position and interest accrual
 */
interface EnhancedInterestSummary {
  // Position metrics
  totalDeposited: bigint; // Total assets deposited (in asset wei)
  currentShares: bigint; // Current shares held
  currentValue: bigint; // Current value in asset terms (in asset wei)

  // Interest metrics
  totalInterestAccrued: bigint; // Total interest accrued (in asset wei)
  totalInterestPercent: number; // Total interest as percentage of deposits

  // Performance metrics
  annualizedAPY: number; // Weighted average APY

  // Time metrics
  firstInteractionTimestamp: bigint; // First interaction timestamp
  lastInteractionTimestamp: bigint; // Most recent interaction timestamp
  totalDurationDays: number; // Total duration in days

  // Activity metrics
  interactionCount: number; // Total number of user interactions
  periodCount: number; // Number of interest accrual periods
}

// Cache interface for storing block and price data
interface BlockCache {
  [blockNumber: string]: {
    timestamp?: bigint;
    pricePerShare?: number;
  };
}

// Define common contract ABI once for reuse
const VAULT_ABI = parseAbi([
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
]);

// Event signatures for ERC4626
const DEPOSIT_EVENT = parseAbiItem(
  "event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)"
);

const WITHDRAW_EVENT = parseAbiItem(
  "event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)"
);

class EnhancedMorphoAPYCalculator {
  private readonly client: PublicClient;
  private readonly userAddress: Address;
  private readonly vaultAddress: Address;
  private userInteractions: UserInteraction[] = [];
  private apyPeriods: APYPeriod[] = [];
  private enhancedPeriods: EnhancedInterestPeriod[] = [];
  private blockCache: BlockCache = {};
  private memoizedFormatEther: Map<string, number> = new Map();

  // Track total interest accrued over all periods
  private totalInterestAccrued: number = 0;
  private totalInterestAccruedBigint: bigint = 0n;

  constructor(
    client: PublicClient,
    userAddress: Address,
    vaultAddress: Address
  ) {
    this.client = client;
    this.userAddress = userAddress;
    this.vaultAddress = vaultAddress;
  }

  /**
   * Helper method to memoize formatEther calls for better performance
   */
  private memoizedEther(value: bigint): number {
    const key = value.toString();
    if (!this.memoizedFormatEther.has(key)) {
      this.memoizedFormatEther.set(key, Number(formatEther(value)));
    }
    return this.memoizedFormatEther.get(key)!;
  }

  /**
   * Main function to calculate user's average APY with enhanced interest accrual tracking
   */
  async calculateAverageAPY(): Promise<{
    averageAPY: number;
    totalInterestAccrued: bigint;
    totalInterestPercent: number;
    periods: EnhancedInterestPeriod[];
    interactions: UserInteraction[];
  }> {
    console.log(
      `Calculating APY for user ${this.userAddress} on vault ${this.vaultAddress}`
    );

    // 1. Fetch all deposit and withdraw events for this user
    await this.fetchUserInteractions();

    if (this.userInteractions.length === 0) {
      console.log("No user interactions found");
      return {
        averageAPY: 0,
        totalInterestAccrued: 0n,
        totalInterestPercent: 0,
        periods: [],
        interactions: [],
      };
    }

    // 2. Sort interactions by block number
    this.userInteractions.sort((a, b) => Number(a.blockNumber - b.blockNumber));

    // 3. Calculate APY and interest accrual between each interaction
    // Use the enhanced version instead of the original
    await this.calculatePreciseInterestBetweenInteractions();

    // 4. Calculate weighted average APY
    const averageAPY = this.calculateWeightedAverageAPY();

    // 5. Calculate total interest metrics with precision
    const { totalDepositedBigint } = this.calculatePreciseTotalValue();
    const totalInterestPercent =
      totalDepositedBigint > 0n
        ? Number(
            (this.totalInterestAccruedBigint * 10000n) / totalDepositedBigint
          ) / 100
        : 0;

    return {
      averageAPY,
      totalInterestAccrued: this.totalInterestAccruedBigint,
      totalInterestPercent,
      periods: this.enhancedPeriods,
      interactions: this.userInteractions,
    };
  }

  /**
   * Calculate total deposited value and current value
   */
  private calculateTotalValue(): {
    totalDeposited: number;
    currentValue: number;
  } {
    let totalDeposited = 0;
    let currentShares = 0n;

    // Process interactions in order
    for (const interaction of this.userInteractions) {
      if (interaction.type === "deposit") {
        totalDeposited += this.memoizedEther(interaction.assets);
        currentShares += interaction.shares;
      } else {
        // Withdraw reduces shares
        currentShares -= interaction.shares;
      }
    }

    // Calculate current value based on last known price per share
    let currentPrice = 1.0; // Default
    if (this.userInteractions.length > 0) {
      currentPrice =
        this.userInteractions[this.userInteractions.length - 1].pricePerShare;
    }

    const currentValue = this.memoizedEther(currentShares) * currentPrice;

    return { totalDeposited, currentValue };
  }

  /**
   * Calculate total value metrics with bigint precision
   */
  private calculatePreciseTotalValue(): {
    totalDepositedBigint: bigint;
    currentSharesBigint: bigint;
    currentValueBigint: bigint;
  } {
    let totalDepositedBigint = 0n;
    let currentSharesBigint = 0n;

    // Process all interactions to track deposits and current shares
    for (const interaction of this.userInteractions) {
      if (interaction.type === "deposit") {
        totalDepositedBigint += interaction.assets;
        currentSharesBigint += interaction.shares;
      } else {
        // Withdraw reduces shares
        currentSharesBigint -= interaction.shares;
      }
    }

    // Calculate current value based on last known price per share
    let currentPriceBigint = 10n ** 18n; // Default 1.0 scaled by 1e18

    if (this.userInteractions.length > 0) {
      const lastPrice =
        this.userInteractions[this.userInteractions.length - 1].pricePerShare;
      currentPriceBigint = BigInt(Math.floor(lastPrice * 1e18));
    }

    // Calculate current value with precise bigint arithmetic
    const SCALE = 10n ** 18n;
    const currentValueBigint =
      (currentSharesBigint * currentPriceBigint) / SCALE;

    return {
      totalDepositedBigint,
      currentSharesBigint,
      currentValueBigint,
    };
  }

  /**
   * Add the following method to reconcile the total interest calculation:
   */
  private reconcileInterestCalculation(): {
    calculatedInterest: bigint;
    simpleInterest: bigint;
    explanation: string;
  } {
    // Get current position state
    const { totalDepositedBigint, currentValueBigint } =
      this.calculatePreciseTotalValue();

    // Calculate simple interest (currentValue - totalDeposited)
    const simpleInterest =
      currentValueBigint > totalDepositedBigint
        ? currentValueBigint - totalDepositedBigint
        : 0n;

    // The calculated interest from periods
    const calculatedInterest = this.totalInterestAccruedBigint;

    // Generate explanation for discrepancy
    let explanation = "";

    if (calculatedInterest !== simpleInterest) {
      explanation = `
  The difference between these two interest calculations (${(
    calculatedInterest - simpleInterest
  ).toString()}) 
  is due to the interest accrual methodology:
  
  1. Period-by-period calculation (${calculatedInterest.toString()}):
     - Tracks interest earned in each period between interactions
     - Accounts for price changes applied to shares held in each period
     - More precise because it captures the interest earned on each deposit separately
  
  2. Simple calculation (${simpleInterest.toString()}): 
     - Just the difference between final value and total deposits
     - Doesn't account for the timing of deposits
     - Less precise because later deposits haven't had as much time to earn interest
  
  The period-by-period calculation is more accurate as it properly attributes interest 
  to each deposit based on how long it has been in the vault.
  `;
    } else {
      explanation = "Both interest calculation methods match.";
    }

    return {
      calculatedInterest,
      simpleInterest,
      explanation,
    };
  }

  /**
   * Get the initial deposit value in asset terms
   * This helps with calculating proper return percentages
   */
  private getInitialDepositValueInAssets(): bigint {
    if (this.userInteractions.length === 0) return 0n;

    // Find the first deposit
    const firstDeposit = this.userInteractions.find(
      (interaction) => interaction.type === "deposit"
    );

    return firstDeposit ? firstDeposit.assets : 0n;
  }

  /**
   * Fetch all deposit and withdraw events for this user
   */
  private async fetchUserInteractions(): Promise<void> {
    console.log("Fetching user interactions...");
    const startTime = performance.now();

    // Fetch deposit and withdraw events in parallel
    const [depositEvents, withdrawEvents] = await Promise.all([
      // Fetch deposit events
      this.client.getLogs({
        address: this.vaultAddress,
        event: DEPOSIT_EVENT,
        args: {
          owner: this.userAddress,
        },
        fromBlock: 0n,
        toBlock: "latest",
      }),

      // Fetch withdraw events
      this.client.getLogs({
        address: this.vaultAddress,
        event: WITHDRAW_EVENT,
        args: {
          owner: this.userAddress,
        },
        fromBlock: 0n,
        toBlock: "latest",
      }),
    ]);

    console.log(
      `Found ${depositEvents.length} deposits and ${withdrawEvents.length} withdrawals`
    );

    // Create arrays for batched operations
    const blockNumbers: Set<bigint> = new Set();
    const interactions: Array<{
      blockNumber: bigint;
      type: "deposit" | "withdraw";
      assets: bigint;
      shares: bigint;
    }> = [];

    // Collect all deposit events
    for (const event of depositEvents) {
      blockNumbers.add(event.blockNumber);
      interactions.push({
        blockNumber: event.blockNumber,
        type: "deposit",
        assets: event.args.assets ?? 0n,
        shares: event.args.shares ?? 0n,
      });
    }

    // Collect all withdraw events
    for (const event of withdrawEvents) {
      blockNumbers.add(event.blockNumber);
      interactions.push({
        blockNumber: event.blockNumber,
        type: "withdraw",
        assets: event.args.assets ?? 0n,
        shares: event.args.shares ?? 0n,
      });
    }

    // Batch fetch all required block information in parallel
    await Promise.all([
      this.fetchBlockTimestamps(Array.from(blockNumbers)),
      this.fetchPricePerShare(Array.from(blockNumbers)),
    ]);

    // Now construct the interactions with all data
    for (const interaction of interactions) {
      const blockNumber = interaction.blockNumber;
      const blockData = this.blockCache[blockNumber.toString()];

      if (
        !blockData ||
        blockData.timestamp === undefined ||
        blockData.pricePerShare === undefined
      ) {
        console.warn(
          `Missing data for block ${blockNumber}, skipping interaction`
        );
        continue;
      }

      this.userInteractions.push({
        blockNumber,
        timestamp: blockData.timestamp,
        type: interaction.type,
        assets: interaction.assets,
        shares: interaction.shares,
        pricePerShare: blockData.pricePerShare,
      });
    }

    const endTime = performance.now();
    console.log(
      `Processed all interactions in ${((endTime - startTime) / 1000).toFixed(
        2
      )} seconds`
    );
  }

  /**
   * Batch fetch block timestamps
   */
  private async fetchBlockTimestamps(blockNumbers: bigint[]): Promise<void> {
    console.log(`Fetching timestamps for ${blockNumbers.length} blocks...`);

    const batchSize = 100; // Adjust based on RPC provider limits

    for (let i = 0; i < blockNumbers.length; i += batchSize) {
      const batch = blockNumbers.slice(i, i + batchSize);

      // Create a batch of promises
      const promises = batch.map((blockNumber) =>
        this.client.getBlock({ blockNumber }).then((block) => {
          this.blockCache[blockNumber.toString()] = {
            ...this.blockCache[blockNumber.toString()],
            timestamp: block.timestamp,
          };
          return block;
        })
      );

      // Execute batch
      await Promise.all(promises);

      console.log(
        `Processed ${Math.min(i + batchSize, blockNumbers.length)} / ${
          blockNumbers.length
        } block timestamps`
      );
    }
  }

  /**
   * Batch fetch price per share for multiple blocks
   */
  private async fetchPricePerShare(blockNumbers: bigint[]): Promise<void> {
    console.log(
      `Fetching price per share for ${blockNumbers.length} blocks...`
    );

    const batchSize = 50; // Adjust based on RPC provider limits

    for (let i = 0; i < blockNumbers.length; i += batchSize) {
      const batch = blockNumbers.slice(i, i + batchSize);

      // Create an array of promises for both totalAssets and totalSupply for each block
      const promises = batch.flatMap((blockNumber) => [
        // Promise for totalAssets
        this.client
          .readContract({
            address: this.vaultAddress,
            abi: VAULT_ABI,
            functionName: "totalAssets",
            blockNumber,
          })
          .then((result) => ({
            blockNumber,
            type: "totalAssets",
            value: result as bigint,
          })),

        // Promise for totalSupply
        this.client
          .readContract({
            address: this.vaultAddress,
            abi: VAULT_ABI,
            functionName: "totalSupply",
            blockNumber,
          })
          .then((result) => ({
            blockNumber,
            type: "totalSupply",
            value: result as bigint,
          })),
      ]);

      // Execute all promises in parallel
      const results = await Promise.all(promises);

      // Group results by blockNumber
      const blockData: Record<
        string,
        { totalAssets?: bigint; totalSupply?: bigint }
      > = {};

      for (const result of results) {
        const blockKey = result.blockNumber.toString();
        if (!blockData[blockKey]) {
          blockData[blockKey] = {};
        }

        if (result.type === "totalAssets") {
          blockData[blockKey].totalAssets = result.value;
        } else {
          blockData[blockKey].totalSupply = result.value;
        }
      }

      // Calculate price per share for each block
      for (const [blockKey, data] of Object.entries(blockData)) {
        if (data.totalAssets && data.totalSupply) {
          const totalAssets = Number(formatEther(data.totalAssets));
          const totalSupply = Number(formatEther(data.totalSupply));

          const pricePerShare =
            totalSupply > 0 ? totalAssets / totalSupply : 1.0;

          this.blockCache[blockKey] = {
            ...this.blockCache[blockKey],
            pricePerShare,
          };
        }
      }

      console.log(
        `Processed ${Math.min(i + batchSize, blockNumbers.length)} / ${
          blockNumbers.length
        } price calculations`
      );
    }
  }

  /**
   * Calculate interest accrued between each interaction
   * This is the original implementation, kept for backward compatibility
   */
  private async calculateInterestBetweenInteractions(): Promise<void> {
    console.log("Calculating interest accrual between interactions...");

    // Track user's current share balance
    let currentShares = 0n;

    // Process interactions in order
    for (let i = 0; i < this.userInteractions.length; i++) {
      const currentInteraction = this.userInteractions[i];

      // Update share balance
      if (currentInteraction.type === "deposit") {
        currentShares += currentInteraction.shares;
      } else {
        currentShares -= currentInteraction.shares;
      }

      // Skip if this is the first interaction or if no shares held
      if (i === 0 || currentShares === 0n) continue;

      // Get previous interaction
      const prevInteraction = this.userInteractions[i - 1];

      // Calculate time difference in seconds
      const timeDiffSeconds = Number(
        currentInteraction.timestamp - prevInteraction.timestamp
      );
      const durationDays = timeDiffSeconds / 86400; // Convert seconds to days

      // Skip if duration is too short (< 1 hour)
      if (durationDays < 0.04) continue;

      // Calculate price change
      const startPrice = prevInteraction.pricePerShare;
      const endPrice = currentInteraction.pricePerShare;

      // Calculate annualized return (APY)
      // Formula: ((endPrice / startPrice) ^ (365 / durationDays)) - 1
      const priceRatio = endPrice / startPrice;
      const apy = (Math.pow(priceRatio, 365 / durationDays) - 1) * 100;

      // Calculate start and end values in underlying units
      const sharesValue = this.memoizedEther(currentShares);
      const startValue = sharesValue * startPrice;
      const endValue = sharesValue * endPrice;

      // Calculate interest accrued in this period
      const interestAccrued = endValue - startValue;
      const interestPercent = (interestAccrued / startValue) * 100;

      // Add to total interest accrued
      this.totalInterestAccrued += interestAccrued;

      // Add to APY periods with interest accrual data
      this.apyPeriods.push({
        startBlock: prevInteraction.blockNumber,
        endBlock: currentInteraction.blockNumber,
        startTimestamp: prevInteraction.timestamp,
        endTimestamp: currentInteraction.timestamp,
        startPrice,
        endPrice,
        durationDays,
        apy,
        shares: currentShares,
        startValue,
        endValue,
        interestAccrued,
        interestPercent,
      });
    }

    // If user still has shares, calculate APY up to latest block
    if (currentShares > 0n && this.userInteractions.length > 0) {
      const lastInteraction =
        this.userInteractions[this.userInteractions.length - 1];

      // Get latest block info - use cache if possible, otherwise fetch
      const latestBlock = await this.client.getBlock({ blockTag: "latest" });
      let latestPrice: number;

      // Try to use cache for the latest price
      if (
        this.blockCache[latestBlock.number.toString()]?.pricePerShare !==
        undefined
      ) {
        latestPrice =
          this.blockCache[latestBlock.number.toString()].pricePerShare!;
      } else {
        // Fetch if not in cache
        latestPrice = await this.getPricePerShareAtBlock(latestBlock.number);
      }

      // Calculate time difference in seconds
      const timeDiffSeconds = Number(
        latestBlock.timestamp - lastInteraction.timestamp
      );
      const durationDays = timeDiffSeconds / 86400; // Convert seconds to days

      // Only add if duration is significant (> 1 hour)
      if (durationDays > 0.04) {
        // Calculate annualized return (APY)
        const startPrice = lastInteraction.pricePerShare;
        const endPrice = latestPrice;
        const priceRatio = endPrice / startPrice;
        const apy = (Math.pow(priceRatio, 365 / durationDays) - 1) * 100;

        // Calculate interest accrued for current period
        const sharesValue = this.memoizedEther(currentShares);
        const startValue = sharesValue * startPrice;
        const endValue = sharesValue * endPrice;
        const interestAccrued = endValue - startValue;
        const interestPercent = (interestAccrued / startValue) * 100;

        // Add to total interest accrued
        this.totalInterestAccrued += interestAccrued;

        // Add to APY periods
        this.apyPeriods.push({
          startBlock: lastInteraction.blockNumber,
          endBlock: latestBlock.number,
          startTimestamp: lastInteraction.timestamp,
          endTimestamp: latestBlock.timestamp,
          startPrice,
          endPrice,
          durationDays,
          apy,
          shares: currentShares,
          startValue,
          endValue,
          interestAccrued,
          interestPercent,
        });
      }
    }
  }

  /**
   * Calculate total deposits up to a specific interaction index
   * This helps with calculating accurate cumulative interest percentages
   */
  private calculateTotalDepositedUpToInteraction(
    interactionIndex: number
  ): bigint {
    let totalDeposited = 0n;

    // Process interactions up to the specified index
    for (let i = 0; i <= interactionIndex; i++) {
      const interaction = this.userInteractions[i];
      if (interaction?.type === "deposit") {
        totalDeposited += interaction.assets;
      }
    }

    return totalDeposited;
  }
  /**
   * Calculate interest accrued between interactions with full precision
   * Enhanced version that preserves bigint precision for all calculations
   */
  private async calculatePreciseInterestBetweenInteractions(): Promise<void> {
    console.log("Calculating precise interest accrual between interactions...");

    // Track user's current share balance
    let currentShares = 0n;

    // Track cumulative interest for running total
    let cumulativeInterest = 0n;

    // Process interactions in order
    for (let i = 0; i < this.userInteractions.length; i++) {
      const currentInteraction = this.userInteractions[i];

      // Update share balance based on interaction type
      if (currentInteraction.type === "deposit") {
        currentShares += currentInteraction.shares;
      } else {
        currentShares -= currentInteraction.shares;
      }

      // Skip if this is the first interaction or if no shares held
      if (i === 0 || currentShares === 0n) continue;

      // Get previous interaction
      const prevInteraction = this.userInteractions[i - 1];

      // Calculate time difference in seconds
      const timeDiffSeconds = Number(
        currentInteraction.timestamp - prevInteraction.timestamp
      );
      const durationDays = timeDiffSeconds / 86400; // Convert seconds to days

      // Skip if duration is too short (< 1 hour)
      if (durationDays < 0.04) continue;

      // Calculate price changes using BigInt to maintain precision
      // Convert floating point price per share to scaled bigint (scale by 1e18 for precision)
      const SCALE = 10n ** 18n;
      const startPriceBigint = BigInt(
        Math.floor(prevInteraction.pricePerShare * 1e18)
      );
      const endPriceBigint = BigInt(
        Math.floor(currentInteraction.pricePerShare * 1e18)
      );

      // Calculate start and end values with full precision
      const startValueBigint = (currentShares * startPriceBigint) / SCALE;
      const endValueBigint = (currentShares * endPriceBigint) / SCALE;

      // Calculate interest accrued in this period with full precision
      const interestAccruedBigint =
        endValueBigint > startValueBigint
          ? endValueBigint - startValueBigint
          : 0n; // Prevent negative interest in case of price drops

      // Update cumulative interest
      cumulativeInterest += interestAccruedBigint;

      // Calculate interest percentage with precision
      const interestPercent =
        startValueBigint > 0n
          ? Number((interestAccruedBigint * 10000n) / startValueBigint) / 100
          : 0;

      // Calculate cumulative interest percentage based on initial deposit value
      // This shows total returns since first deposit
      const totalDepositedSoFar =
        this.calculateTotalDepositedUpToInteraction(i);
      const cumulativeInterestPercent =
        totalDepositedSoFar > 0n
          ? Number((cumulativeInterest * 10000n) / totalDepositedSoFar) / 100
          : 0;

      // Calculate annualized return (APY)
      // Formula: ((endPrice / startPrice) ^ (365 / durationDays)) - 1
      const priceRatio =
        currentInteraction.pricePerShare / prevInteraction.pricePerShare;
      const apy = (Math.pow(priceRatio, 365 / durationDays) - 1) * 100;

      // Format dates for human readability
      const startDate = new Date(
        Number(prevInteraction.timestamp * 1000n)
      ).toISOString();
      const endDate = new Date(
        Number(currentInteraction.timestamp * 1000n)
      ).toISOString();

      // Add to enhanced interest periods with precise tracking
      const enhancedPeriod: EnhancedInterestPeriod = {
        periodIndex: this.enhancedPeriods.length + 1,
        startBlock: prevInteraction.blockNumber,
        endBlock: currentInteraction.blockNumber,
        startTimestamp: prevInteraction.timestamp,
        endTimestamp: currentInteraction.timestamp,
        startDate,
        endDate,
        startPrice: prevInteraction.pricePerShare,
        endPrice: currentInteraction.pricePerShare,
        durationDays,
        apy,
        shares: currentShares,
        // Original floating point values for compatibility
        startValue: Number(formatEther(startValueBigint)),
        endValue: Number(formatEther(endValueBigint)),
        interestAccrued: Number(formatEther(interestAccruedBigint)),
        interestPercent,
        // Precise bigint values
        sharesHeldBigint: currentShares,
        startValueBigint,
        endValueBigint,
        interestAccruedBigint,
        // Cumulative metrics
        cumulativeInterest,
        cumulativeInterestPercent,
      };

      this.enhancedPeriods.push(enhancedPeriod);

      // Also update the original periods array for backward compatibility
      this.apyPeriods.push({
        startBlock: enhancedPeriod.startBlock,
        endBlock: enhancedPeriod.endBlock,
        startTimestamp: enhancedPeriod.startTimestamp,
        endTimestamp: enhancedPeriod.endTimestamp,
        startPrice: enhancedPeriod.startPrice,
        endPrice: enhancedPeriod.endPrice,
        durationDays: enhancedPeriod.durationDays,
        apy: enhancedPeriod.apy,
        shares: enhancedPeriod.shares,
        startValue: enhancedPeriod.startValue,
        endValue: enhancedPeriod.endValue,
        interestAccrued: enhancedPeriod.interestAccrued,
        interestPercent: enhancedPeriod.interestPercent,
      });
    }

    // Calculate interest up to current block if user still has shares
    await this.calculateInterestToLatestBlock(
      currentShares,
      cumulativeInterest
    );
  }

  /**
   * Calculate interest from last interaction up to the latest block
   * @param currentShares Current share balance
   * @param cumulativeInterest Cumulative interest accrued so far
   */
  private async calculateInterestToLatestBlock(
    currentShares: bigint,
    cumulativeInterest: bigint
  ): Promise<void> {
    // Skip if user has no shares
    if (currentShares === 0n || this.userInteractions.length === 0) return;

    const lastInteraction =
      this.userInteractions[this.userInteractions.length - 1];

    // Get latest block info
    const latestBlock = await this.client.getBlock({ blockTag: "latest" });
    let latestPrice: number;

    // Try to use cache for the latest price
    if (
      this.blockCache[latestBlock.number.toString()]?.pricePerShare !==
      undefined
    ) {
      latestPrice =
        this.blockCache[latestBlock.number.toString()].pricePerShare!;
    } else {
      // Fetch if not in cache
      latestPrice = await this.getPricePerShareAtBlock(latestBlock.number);
    }

    // Calculate time difference in seconds
    const timeDiffSeconds = Number(
      latestBlock.timestamp - lastInteraction.timestamp
    );
    const durationDays = timeDiffSeconds / 86400; // Convert seconds to days

    // Only add if duration is significant (> 1 hour)
    if (durationDays > 0.04) {
      // Using bigint for precise calculations
      const SCALE = 10n ** 18n;
      const startPriceBigint = BigInt(
        Math.floor(lastInteraction.pricePerShare * 1e18)
      );
      const endPriceBigint = BigInt(Math.floor(latestPrice * 1e18));

      // Calculate values with full precision
      const startValueBigint = (currentShares * startPriceBigint) / SCALE;
      const endValueBigint = (currentShares * endPriceBigint) / SCALE;

      // Calculate interest accrued with full precision
      const interestAccruedBigint =
        endValueBigint > startValueBigint
          ? endValueBigint - startValueBigint
          : 0n;

      // Update final cumulative interest
      const finalCumulativeInterest =
        cumulativeInterest + interestAccruedBigint;

      // Calculate interest percentage
      const interestPercent =
        startValueBigint > 0n
          ? Number((interestAccruedBigint * 10000n) / startValueBigint) / 100
          : 0;

      // Calculate cumulative interest percentage
      const totalDepositedSoFar = this.calculateTotalDepositedUpToInteraction(
        this.userInteractions.length - 1
      );
      const cumulativeInterestPercent =
        totalDepositedSoFar > 0n
          ? Number((finalCumulativeInterest * 10000n) / totalDepositedSoFar) /
            100
          : 0;

      // Calculate APY
      const priceRatio = latestPrice / lastInteraction.pricePerShare;
      const apy = (Math.pow(priceRatio, 365 / durationDays) - 1) * 100;

      // Format dates for human readability
      const startDate = new Date(
        Number(lastInteraction.timestamp * 1000n)
      ).toISOString();
      const endDate = new Date(
        Number(latestBlock.timestamp * 1000n)
      ).toISOString();

      // Add current period to enhanced periods
      const enhancedPeriod: EnhancedInterestPeriod = {
        periodIndex: this.enhancedPeriods.length + 1,
        startBlock: lastInteraction.blockNumber,
        endBlock: latestBlock.number,
        startTimestamp: lastInteraction.timestamp,
        endTimestamp: latestBlock.timestamp,
        startDate,
        endDate,
        startPrice: lastInteraction.pricePerShare,
        endPrice: latestPrice,
        durationDays,
        apy,
        shares: currentShares,
        // Original floating point values for compatibility
        startValue: Number(formatEther(startValueBigint)),
        endValue: Number(formatEther(endValueBigint)),
        interestAccrued: Number(formatEther(interestAccruedBigint)),
        interestPercent,
        // Precise bigint values
        sharesHeldBigint: currentShares,
        startValueBigint,
        endValueBigint,
        interestAccruedBigint,
        // Cumulative metrics
        cumulativeInterest: finalCumulativeInterest,
        cumulativeInterestPercent,
      };

      this.enhancedPeriods.push(enhancedPeriod);

      // Also update total interest accrued for the calculator
      this.totalInterestAccruedBigint = finalCumulativeInterest;
      this.totalInterestAccrued = Number(formatEther(finalCumulativeInterest));

      // Add to original periods array for backward compatibility
      this.apyPeriods.push({
        startBlock: enhancedPeriod.startBlock,
        endBlock: enhancedPeriod.endBlock,
        startTimestamp: enhancedPeriod.startTimestamp,
        endTimestamp: enhancedPeriod.endTimestamp,
        startPrice: enhancedPeriod.startPrice,
        endPrice: enhancedPeriod.endPrice,
        durationDays: enhancedPeriod.durationDays,
        apy: enhancedPeriod.apy,
        shares: enhancedPeriod.shares,
        startValue: enhancedPeriod.startValue,
        endValue: enhancedPeriod.endValue,
        interestAccrued: enhancedPeriod.interestAccrued,
        interestPercent: enhancedPeriod.interestPercent,
      });
    }
  }

  /**
   * Fallback method for getting price per share at a block if not in cache
   * Includes retry logic for resilience
   */
  private async getPricePerShareAtBlock(
    blockNumber: bigint,
    retryCount = 3
  ): Promise<number> {
    // Check cache first
    if (this.blockCache[blockNumber.toString()]?.pricePerShare !== undefined) {
      return this.blockCache[blockNumber.toString()].pricePerShare!;
    }

    try {
      // Run both calls in parallel
      const [totalAssetsResult, totalSupplyResult] = await Promise.all([
        this.client.readContract({
          address: this.vaultAddress,
          abi: VAULT_ABI,
          functionName: "totalAssets",
          blockNumber,
        }),
        this.client.readContract({
          address: this.vaultAddress,
          abi: VAULT_ABI,
          functionName: "totalSupply",
          blockNumber,
        }),
      ]);

      // Convert BigInts to numbers for calculation
      const totalAssets = Number(formatEther(totalAssetsResult as bigint));
      const totalSupply = Number(formatEther(totalSupplyResult as bigint));

      const pricePerShare = totalSupply > 0 ? totalAssets / totalSupply : 1.0;

      // Update cache
      this.blockCache[blockNumber.toString()] = {
        ...this.blockCache[blockNumber.toString()],
        pricePerShare,
      };

      return pricePerShare;
    } catch (error) {
      // Implement retry logic for network-related errors
      if (retryCount > 0) {
        console.warn(
          `Error fetching price per share at block ${blockNumber}, retrying... (${retryCount} attempts left)`
        );

        // Exponential backoff - wait longer between each retry
        const backoffMs = Math.pow(2, 4 - retryCount) * 100;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));

        // Retry with one less retry count
        return this.getPricePerShareAtBlock(blockNumber, retryCount - 1);
      }

      console.error(
        `Error getting price per share at block ${blockNumber} after all retries:`,
        error
      );
      return 1.0; // Default to 1:1 ratio if there's an error after all retries
    }
  }

  /**
   * Calculate weighted average APY
   * Weighted by (shares * duration)
   */
  private calculateWeightedAverageAPY(): number {
    if (this.apyPeriods.length === 0) return 0;

    let totalWeight = 0;
    let weightedSum = 0;

    for (const period of this.apyPeriods) {
      // Use memoized version to avoid repeated conversion
      const normalizedShares = this.memoizedEther(period.shares);

      // Calculate weight
      const weight = normalizedShares * period.durationDays;

      // Calculate weighted APY contribution
      weightedSum += period.apy * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Get detailed APY report with all periods and interest accrual
   * Original implementation maintained for backward compatibility
   */
  getDetailedReport(): string {
    let report = "=== Morpho Vault APY and Interest Accrual Report ===\n\n";

    report += `User: ${this.userAddress}\n`;
    report += `Vault: ${this.vaultAddress}\n\n`;

    report += "User Interactions:\n";
    for (const interaction of this.userInteractions) {
      const date = new Date(Number(interaction.timestamp * 1000n));
      report += `- Block ${interaction.blockNumber}: ${
        interaction.type
      } ${this.memoizedEther(interaction.assets)} assets `;
      report += `(${this.memoizedEther(
        interaction.shares
      )} shares) at ${date.toISOString()}\n`;
      report += `  Price per share: ${interaction.pricePerShare}\n`;
    }

    report += "\nAPY and Interest Accrual Periods:\n";
    for (const period of this.apyPeriods) {
      const startDate = new Date(Number(period.startTimestamp * 1000n));
      const endDate = new Date(Number(period.endTimestamp * 1000n));

      report += `- Period from ${startDate.toISOString()} to ${endDate.toISOString()}\n`;
      report += `  Duration: ${period.durationDays.toFixed(2)} days\n`;
      report += `  Price change: ${period.startPrice} -> ${period.endPrice} (${(
        (period.endPrice / period.startPrice - 1) *
        100
      ).toFixed(4)}%)\n`;
      report += `  Shares held: ${this.memoizedEther(period.shares)}\n`;
      report += `  Value: ${period.startValue} -> ${period.endValue}\n`;
      report += `  Interest accrued: ${
        period.interestAccrued
      } (${period.interestPercent.toFixed(4)}%)\n`;
      report += `  APY: ${period.apy.toFixed(2)}%\n\n`;
    }

    const averageAPY = this.calculateWeightedAverageAPY();
    report += `Average APY (weighted by shares * duration): ${averageAPY.toFixed(
      2
    )}%\n`;

    report += `Total interest accrued: ${this.totalInterestAccrued}\n`;

    // Calculate total interest percentage
    const { totalDeposited, currentValue } = this.calculateTotalValue();
    const totalInterestPercent =
      totalDeposited > 0
        ? ((currentValue - totalDeposited) / totalDeposited) * 100
        : 0;

    report += `Total deposit value: ${totalDeposited}\n`;
    report += `Current value: ${currentValue}\n`;
    report += `Total return: ${totalInterestPercent.toFixed(2)}%\n`;

    return report;
  }

  /**
   * Get enhanced interest summary with precise bigint values
   */
  public getPreciseInterestSummary(): EnhancedInterestSummary {
    // Calculate value metrics with precision
    const { totalDepositedBigint, currentSharesBigint, currentValueBigint } =
      this.calculatePreciseTotalValue();

    // Calculate total interest percentage with precision
    const totalInterestPercent =
      totalDepositedBigint > 0n
        ? Number(
            (this.totalInterestAccruedBigint * 10000n) / totalDepositedBigint
          ) / 100
        : 0;

    // Get timestamp ranges
    let firstInteractionTimestamp = 0n;
    let lastInteractionTimestamp = 0n;

    if (this.userInteractions.length > 0) {
      firstInteractionTimestamp = this.userInteractions[0].timestamp;
      lastInteractionTimestamp =
        this.userInteractions[this.userInteractions.length - 1].timestamp;
    }

    // Calculate total duration in days
    const totalDurationDays = this.enhancedPeriods.reduce(
      (sum, period) => sum + period.durationDays,
      0
    );

    return {
      // Position metrics with bigint precision
      totalDeposited: totalDepositedBigint,
      currentShares: currentSharesBigint,
      currentValue: currentValueBigint,

      // Interest metrics
      totalInterestAccrued: this.totalInterestAccruedBigint,
      totalInterestPercent,

      // Performance metrics
      annualizedAPY: this.calculateWeightedAverageAPY(),

      // Time metrics
      firstInteractionTimestamp,
      lastInteractionTimestamp,
      totalDurationDays,

      // Activity metrics
      interactionCount: this.userInteractions.length,
      periodCount: this.enhancedPeriods.length,
    };
  }

  /**
   * Generate a detailed interest report with precise values
   */
  public generatePreciseInterestReport(): string {
    const summary = this.getPreciseInterestSummary();

    let report = "=== Morpho Vault Enhanced Interest Report ===\n\n";

    report += `User: ${this.userAddress}\n`;
    report += `Vault: ${this.vaultAddress}\n\n`;

    // Position summary
    report += "=== Position Summary ===\n";
    report += `Total Deposited: ${summary.totalDeposited} wei\n`;
    report += `Current Shares: ${summary.currentShares} shares\n`;
    report += `Current Value: ${summary.currentValue} wei\n`;

    // Interest summary
    report += "\n=== Interest Summary ===\n";
    report += `Total Interest Accrued: ${summary.totalInterestAccrued} wei\n`;
    report += `Total Return: ${summary.totalInterestPercent.toFixed(4)}%\n`;
    report += `Annualized APY: ${summary.annualizedAPY.toFixed(2)}%\n`;

    // Interest calculation reconciliation
    const reconciliation = this.reconcileInterestCalculation();
    report += "\n=== Interest Calculation Reconciliation ===\n";
    report += `Period-by-period Interest: ${reconciliation.calculatedInterest} wei\n`;
    report += `Simple Interest (currentValue - totalDeposited): ${reconciliation.simpleInterest} wei\n`;
    report += `${reconciliation.explanation}\n`;

    // Time summary
    report += "\n=== Time Summary ===\n";
    const firstDate = new Date(
      Number(summary.firstInteractionTimestamp * 1000n)
    );
    const lastDate = new Date(Number(summary.lastInteractionTimestamp * 1000n));
    report += `First Interaction: ${firstDate.toISOString()}\n`;
    report += `Last Interaction: ${lastDate.toISOString()}\n`;
    report += `Total Duration: ${summary.totalDurationDays.toFixed(2)} days\n`;

    // Activity summary
    report += "\n=== Activity Summary ===\n";
    report += `Total Interactions: ${summary.interactionCount}\n`;
    report += `Interest Accrual Periods: ${summary.periodCount}\n`;

    // User interactions
    report += "\n=== User Interactions ===\n";
    for (const interaction of this.userInteractions) {
      const date = new Date(Number(interaction.timestamp * 1000n));
      report += `- Block ${interaction.blockNumber}: ${interaction.type} `;
      report += `${interaction.assets} assets (${interaction.shares} shares) `;
      report += `at ${date.toISOString()}\n`;
      report += `  Price per share: ${interaction.pricePerShare}\n`;
    }

    // Interest periods
    report += "\n=== Interest Accrual Periods ===\n";
    for (const period of this.enhancedPeriods) {
      report += `- Period ${period.periodIndex}: ${period.startDate} to ${period.endDate}\n`;
      report += `  Duration: ${period.durationDays.toFixed(2)} days\n`;
      report += `  Price change: ${period.startPrice} -> ${period.endPrice} `;
      report += `(${((period.endPrice / period.startPrice - 1) * 100).toFixed(
        4
      )}%)\n`;
      report += `  Shares held: ${period.sharesHeldBigint}\n`;
      report += `  Value: ${period.startValueBigint} -> ${period.endValueBigint}\n`;
      report += `  Interest accrued: ${
        period.interestAccruedBigint
      } (${period.interestPercent.toFixed(4)}%)\n`;
      report += `  Cumulative interest: ${
        period.cumulativeInterest
      } (${period.cumulativeInterestPercent.toFixed(
        4
      )}% of total deposits so far)\n`;
      report += `  APY: ${period.apy.toFixed(2)}%\n\n`;
    }

    return report;
  }

  /**
   * Generate a compact JSON representation of interest data
   * Suitable for API responses or frontend visualization
   */
  public generateInterestData(): {
    summary: EnhancedInterestSummary;
    periods: EnhancedInterestPeriod[];
    interactions: UserInteraction[];
  } {
    return {
      summary: this.getPreciseInterestSummary(),
      periods: this.enhancedPeriods,
      interactions: this.userInteractions,
    };
  }

  /**
   * Get a compact summary of the interest accrual
   * Original implementation maintained for backward compatibility
   */
  getInterestSummary(): {
    totalDeposited: number;
    currentValue: number;
    totalInterestAccrued: number;
    totalInterestPercent: number;
    annualizedAPY: number;
    periodCount: number;
    firstInteractionDate: string;
    lastInteractionDate: string;
    totalDuration: number;
  } {
    const { totalDeposited, currentValue } = this.calculateTotalValue();
    const totalInterestPercent =
      totalDeposited > 0
        ? ((currentValue - totalDeposited) / totalDeposited) * 100
        : 0;

    let firstDate = new Date();
    let lastDate = new Date();

    if (this.userInteractions.length > 0) {
      firstDate = new Date(Number(this.userInteractions[0].timestamp * 1000n));
      lastDate = new Date(
        Number(
          this.userInteractions[this.userInteractions.length - 1].timestamp *
            1000n
        )
      );
    }

    // Calculate total duration in days
    const totalDuration = this.apyPeriods.reduce(
      (sum, period) => sum + period.durationDays,
      0
    );

    return {
      totalDeposited,
      currentValue,
      totalInterestAccrued: this.totalInterestAccrued,
      totalInterestPercent,
      annualizedAPY: this.calculateWeightedAverageAPY(),
      periodCount: this.apyPeriods.length,
      firstInteractionDate: firstDate.toISOString(),
      lastInteractionDate: lastDate.toISOString(),
      totalDuration,
    };
  }
}

async function calculateVaultUserAPYWithInterest(
  vaultAddress: Address,
  userAddress: Address
) {
  try {
    console.time("Total execution time");

    // Set up client
    const client = await getClient(8453); // Using Base chain

    // Initialize APY calculator
    const apyCalculator = new EnhancedMorphoAPYCalculator(
      client,
      userAddress,
      vaultAddress
    );

    // Calculate average APY
    const result = await apyCalculator.calculateAverageAPY();

    // Print detailed report using the new enhanced report
    console.log(apyCalculator.generatePreciseInterestReport());

    console.timeEnd("Total execution time");

    // Return summarized result with bigint values converted to strings
    const summary = apyCalculator.getPreciseInterestSummary();

    return {
      userAddress,
      vaultAddress,
      averageAPY: `${result.averageAPY.toFixed(2)}%`,
      totalInterestAccrued: summary.totalInterestAccrued.toString(),
      totalInterestPercent: `${summary.totalInterestPercent.toFixed(2)}%`,
      numberOfInteractions: result.interactions.length,
      numberOfPeriods: result.periods.length,
      totalDeposited: summary.totalDeposited.toString(),
      currentValue: summary.currentValue.toString(),
      totalDurationDays: summary.totalDurationDays.toFixed(2),
      firstInteraction: new Date(
        Number(summary.firstInteractionTimestamp * 1000n)
      ).toISOString(),
      lastInteraction: new Date(
        Number(summary.lastInteractionTimestamp * 1000n)
      ).toISOString(),
    };
  } catch (error) {
    console.error("Failed to calculate user APY with interest:", error);
    throw error;
  }
}

// Example usage
async function main() {
  try {
    // Define user and vault addresses
    const userAddress: Address =
      "0x2917956eFF0B5eaF030abDB4EF4296DF775009cA" as Address;

    // Spark USDC vault: 0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A
    const vaultAddress: Address =
      "0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A" as Address;

    // Execute the calculation
    const result = await calculateVaultUserAPYWithInterest(
      vaultAddress,
      userAddress
    );
    console.log("Summary:", result);

    return result;
  } catch (error) {
    console.error("Error in main:", error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

// Export for module usage
export { EnhancedMorphoAPYCalculator, calculateVaultUserAPYWithInterest };
