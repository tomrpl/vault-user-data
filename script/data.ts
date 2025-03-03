import { Address, formatEther, formatUnits, type PublicClient } from "viem";
import { DEPOSIT_EVENT, VAULT_ABI, WITHDRAW_EVENT } from "./abi";
import { timestampToDateString } from "./helpers";
import { fetchAssetData, type AssetData } from "./morphoApi";
import {
  OverallPositionMetrics,
  Period,
  RewardAccrual,
  RewardsApiResponse,
  TimeseriesEntry,
  TokenData,
  UserInteraction,
} from "./types";

/**
 * Main class to track and analyze a user's interaction with a vault
 */
class VaultPeriodTracker {
  private client: PublicClient;
  private userAddress: Address;
  private vaultAddress: Address;
  private chainId: number;
  private underlyingAsset: Address | null = null;
  private assetData: AssetData | null = null;

  private userInteractions: UserInteraction[] = [];
  private periods: Period[] = [];

  // Class property additions
  private rewardsCache: Map<string, RewardAccrual[]> = new Map();
  private totalRewardsAccrued: Map<string, bigint> = new Map();
  /**
   * Fetches rewards accrued during a period
   * Uses the rewards API to get token balances over time
   */
  private async fetchRewardsForPeriod(
    startBlock: bigint,
    endBlock: bigint
  ): Promise<RewardAccrual[]> {
    // We'll use timestamps instead of blocks for the rewards API
    const startTimestamp = await this.getBlockTimestamp(startBlock);
    const endTimestamp = await this.getBlockTimestamp(endBlock);

    // Check if we already have cached rewards for this period
    const periodCacheKey = `${startTimestamp}-${endTimestamp}`;

    if (this.rewardsCache.has(periodCacheKey)) {
      return this.rewardsCache.get(periodCacheKey)!;
    }

    try {
      // Calculate rewards for this period
      const rewards = await this.calculateRewardsForPeriod(
        this.userAddress,
        startTimestamp,
        endTimestamp
      );

      // Cache the results
      this.rewardsCache.set(periodCacheKey, rewards);

      // Update total rewards accrued
      for (const reward of rewards) {
        const rewardKey = `${reward.chainId}-${reward.assetAddress}`;
        const currentTotal = this.totalRewardsAccrued.get(rewardKey) || 0n;
        this.totalRewardsAccrued.set(
          rewardKey,
          currentTotal + reward.rawAmount
        );
      }

      return rewards;
    } catch (error) {
      console.warn(
        `Failed to fetch rewards for period ${startTimestamp} to ${endTimestamp}:`,
        error
      );
      return [];
    }
  }

  /**
   * Calculate rewards accrued for a specific period
   * Uses dynamic interval selection based on period duration
   */
  private async calculateRewardsForPeriod(
    userAddress: Address,
    startTimestamp: bigint,
    endTimestamp: bigint
  ): Promise<RewardAccrual[]> {
    // Convert timestamps to date strings
    const fromDate = timestampToDateString(startTimestamp);
    const toDate = timestampToDateString(endTimestamp);

    // Calculate duration in days
    const durationSeconds = Number(endTimestamp - startTimestamp);
    const durationDays = durationSeconds / 86400;

    // Choose interval based on duration
    // If period is longer than 2 days, use "day" interval for better performance
    const interval: "hour" | "day" = durationDays > 2 ? "day" : "hour";

    console.log(
      `
      Using ${interval} interval for rewards for period ${fromDate} to ${toDate} (${durationDays.toFixed(
        2
      )} days)`
    );

    // Fetch rewards data with appropriate interval
    const rewardsData = await this.fetchBalanceTimeseries(
      userAddress,
      fromDate,
      toDate,
      interval
    );

    if (!rewardsData) {
      return [];
    }

    const rewards: RewardAccrual[] = [];

    // Process each asset in the response
    for (const assetData of rewardsData.data) {
      const timeseries = assetData.timeseries;
      if (timeseries.length < 2) continue;

      // Get first and last entries within our time range
      let firstEntry: TimeseriesEntry | null = null;
      let lastEntry: TimeseriesEntry | null = null;

      for (const entry of timeseries) {
        // Skip entries outside our time range
        if (
          entry.timestamp < Number(startTimestamp) ||
          entry.timestamp > Number(endTimestamp)
        ) {
          continue;
        }

        if (!firstEntry || entry.timestamp < firstEntry.timestamp) {
          firstEntry = entry;
        }

        if (!lastEntry || entry.timestamp > lastEntry.timestamp) {
          lastEntry = entry;
        }
      }

      if (!firstEntry || !lastEntry) continue;

      // Calculate accrued rewards
      const startAmount = BigInt(firstEntry.amount);
      const endAmount = BigInt(lastEntry.amount);
      const accrued = endAmount > startAmount ? endAmount - startAmount : 0n;

      if (accrued === 0n) continue;

      // Get token data
      const tokenData = await this.fetchTokenData(
        assetData.asset.address,
        assetData.asset.chain_id
      );

      // Format amount
      const formattedAmount = formatUnits(accrued, tokenData.decimals);

      rewards.push({
        assetAddress: assetData.asset.address,
        chainId: assetData.asset.chain_id,
        symbol: tokenData.symbol,
        decimals: tokenData.decimals,
        rawAmount: accrued,
        formattedAmount: formattedAmount,
        priceUsd: tokenData.priceUsd,
      });
    }

    return rewards;
  }
  private async fetchTokenData(
    assetAddress: string,
    chainId: number
  ): Promise<TokenData> {
    try {
      // Use the fetchAssetData function you already have
      const assetData = await fetchAssetData(chainId, assetAddress as Address);

      if (assetData) {
        return {
          symbol: assetData.symbol,
          decimals: assetData.decimals,
          priceUsd: assetData.priceUsd,
        };
      }

      // Fallback if asset data not available
      return {
        symbol: "UNKNOWN",
        decimals: 18,
      };
    } catch (error) {
      console.error(`Error fetching token data for ${assetAddress}:`, error);
      return {
        symbol: "UNKNOWN",
        decimals: 18,
      };
    }
  }
  /**
   * Fetch rewards balance timeseries from the API
   */
  private async fetchBalanceTimeseries(
    userAddress: Address,
    fromDate: string,
    toDate: string,
    interval: "hour" | "day"
  ): Promise<RewardsApiResponse | null> {
    try {
      const baseUrl = "https://rewards.morpho.org/v1";
      const url = new URL(
        `${baseUrl}/users/${userAddress}/balances/timeseries`
      );

      url.searchParams.append("from", fromDate);
      url.searchParams.append("to", toDate);
      url.searchParams.append("interval", interval);
      url.searchParams.append("chain_id", this.chainId.toString());

      console.log(`Fetching rewards data from: ${url.toString()}`);

      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`API error: ${response.status} ${response.statusText}`);
        return null;
      }
      return (await response.json()) as RewardsApiResponse;
    } catch (error) {
      console.error("Error fetching rewards data:", error);
      return null;
    }
  }
  constructor(
    client: PublicClient,
    userAddress: Address,
    vaultAddress: Address,
    chainId: number
  ) {
    this.client = client;
    this.userAddress = userAddress;
    this.vaultAddress = vaultAddress;
    this.chainId = chainId;
  }

  /**
   * Initialize the tracker by fetching necessary data
   */
  public async initialize(): Promise<void> {
    // Get the underlying asset for the vault
    await this.fetchUnderlyingAsset();

    // Get price and metadata for the underlying asset
    await this.fetchAssetMetadata();

    // Fetch all user interactions with the vault
    await this.fetchUserInteractions();

    // Sort interactions by block number
    this.sortInteractions();

    // Calculate periods between interactions
    await this.calculatePeriods();
  }

  /**
   * Fetches the underlying asset address of the vault
   * Reads the 'asset()' function from the vault contract
   */
  private async fetchUnderlyingAsset(): Promise<void> {
    try {
      const assetAddress = (await this.client.readContract({
        address: this.vaultAddress,
        abi: VAULT_ABI,
        functionName: "asset",
      })) as Address;

      this.underlyingAsset = assetAddress;
      console.log(`Underlying asset: ${assetAddress}`);
    } catch (error) {
      console.error("Error fetching underlying asset:", error);
      throw new Error("Failed to fetch underlying asset for vault");
    }
  }

  /**
   * Fetches price and metadata for the underlying asset
   * Uses the morphoAPI to get price and metadata information
   */
  private async fetchAssetMetadata(): Promise<void> {
    if (!this.underlyingAsset) {
      throw new Error("Underlying asset not fetched yet");
    }

    try {
      const assetData = await fetchAssetData(
        this.chainId,
        this.underlyingAsset
      );

      if (!assetData) {
        throw new Error(
          `No data found for asset ${this.underlyingAsset} on chain ${this.chainId}`
        );
      }

      this.assetData = assetData;
      console.log(
        `Asset data fetched: ${assetData.symbol} at ${assetData.priceUsd}`
      );
    } catch (error) {
      console.error("Error fetching asset metadata:", error);
      throw new Error("Failed to fetch asset metadata");
    }
  }

  /**
   * Fetches all deposit and withdraw events for the user
   * Queries blockchain logs to find all interactions by the user with the vault
   */
  private async fetchUserInteractions(): Promise<void> {
    const startTime = performance.now();

    try {
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

      // Process deposit events
      for (const event of depositEvents) {
        this.userInteractions.push({
          blockNumber: event.blockNumber,
          timestamp: 0n, // Will be filled later
          type: "deposit",
          assets: event.args.assets ?? 0n,
          shares: event.args.shares ?? 0n,
        });
      }

      // Process withdraw events
      for (const event of withdrawEvents) {
        this.userInteractions.push({
          blockNumber: event.blockNumber,
          timestamp: 0n, // Will be filled later
          type: "withdraw",
          assets: event.args.assets ?? 0n,
          shares: event.args.shares ?? 0n,
        });
      }

      // Fetch timestamps for all interactions
      const blockNumbers = this.userInteractions.map((i) => i.blockNumber);
      const uniqueBlockNumbers = [...new Set(blockNumbers)];

      // Fetch timestamps for all blocks
      for (const blockNumber of uniqueBlockNumbers) {
        const timestamp = await this.getBlockTimestamp(blockNumber);

        // Update all interactions with this block number
        for (const interaction of this.userInteractions) {
          if (interaction.blockNumber === blockNumber) {
            interaction.timestamp = timestamp;
          }
        }
      }

      const endTime = performance.now();
      console.log(
        `Processed all interactions in ${((endTime - startTime) / 1000).toFixed(
          2
        )} seconds`
      );
    } catch (error) {
      console.error("Error fetching user interactions:", error);
      throw new Error("Failed to fetch user interactions");
    }
  }

  /**
   * Sorts interactions by block number
   * Ensures interactions are processed in chronological order
   */
  private sortInteractions(): void {
    this.userInteractions.sort((a, b) => {
      // First by block number
      if (a.blockNumber < b.blockNumber) return -1;
      if (a.blockNumber > b.blockNumber) return 1;

      // If same block, deposits come before withdrawals
      if (a.type === "deposit" && b.type === "withdraw") return -1;
      if (a.type === "withdraw" && b.type === "deposit") return 1;

      return 0;
    });
  }

  /**
   * Calculates the price per share at a specific block
   * Determines the ratio of totalAssets to totalSupply at a given block
   */
  private async getPricePerShareAtBlock(blockNumber: bigint): Promise<number> {
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
      return pricePerShare;
    } catch (error) {
      console.error(
        `Error getting price per share at block ${blockNumber}:`,
        error
      );
      return 1.0; // Default to 1:1 ratio if there's an error
    }
  }

  /**
   * Gets block timestamp for a specific block number
   * Fetches block information to get the timestamp
   */
  private async getBlockTimestamp(blockNumber: bigint): Promise<bigint> {
    try {
      const block = await this.client.getBlock({ blockNumber });
      return block.timestamp;
    } catch (error) {
      console.error(`Error getting timestamp for block ${blockNumber}:`, error);
      throw new Error(`Failed to get timestamp for block ${blockNumber}`);
    }
  }

  /**
   * Calculates the periods between user interactions
   * Creates period objects for each interval between interactions
   */
  private async calculatePeriods(): Promise<void> {
    if (this.userInteractions.length === 0) {
      console.log("No interactions found, no periods to calculate");
      return;
    }

    let currentShares: bigint = 0n;

    // Process each interaction
    for (let i = 0; i < this.userInteractions.length; i++) {
      const interaction = this.userInteractions[i];

      // Update running totals based on interaction type
      if (interaction.type === "deposit") {
        currentShares += interaction.shares;
      } else {
        currentShares -= interaction.shares;
      }

      // Skip if no shares (position closed)
      if (currentShares === 0n) {
        continue;
      }

      // This interaction marks the start of a period
      const isLastInteraction = i === this.userInteractions.length - 1;

      // For non-last interactions, period ends at next interaction
      // For last interaction, period ends "now" (latest block)
      const nextInteraction = isLastInteraction
        ? null
        : this.userInteractions[i + 1];

      // For the last period, we'll need to get the current block
      let endBlock: bigint;
      let endTimestamp: bigint;

      if (isLastInteraction) {
        // Get the latest block for the current active period
        const latestBlock = await this.client.getBlock({ blockTag: "latest" });
        endBlock = latestBlock.number;
        endTimestamp = latestBlock.timestamp;
      } else {
        // Use the next interaction's block/timestamp for historical periods
        endBlock = nextInteraction!.blockNumber;
        endTimestamp = nextInteraction!.timestamp;
      }

      // Skip if this is not the last interaction and there's no change in position
      // (handles multiple transactions in the same block)
      if (!isLastInteraction && interaction.blockNumber === endBlock) {
        continue;
      }

      // Get price per share at start and end of period
      const startPricePerShare = await this.getPricePerShareAtBlock(
        interaction.blockNumber
      );
      const endPricePerShare = await this.getPricePerShareAtBlock(endBlock);

      // Calculate position value in underlying asset units
      const positionUnderlyingStart =
        (currentShares * BigInt(Math.floor(startPricePerShare * 1e18))) /
        BigInt(1e18);
      const positionUnderlyingEnd =
        (currentShares * BigInt(Math.floor(endPricePerShare * 1e18))) /
        BigInt(1e18);

      // Calculate accrued interest in underlying units
      const interestUnderlyingUnits =
        positionUnderlyingEnd - positionUnderlyingStart;

      // Calculate USD values if price data is available
      let positionUsdValue = 0;
      let interestUsdValue = 0;

      if (this.assetData && this.assetData.priceUsd) {
        const priceUsd = parseFloat(this.assetData.priceUsd);
        const decimals = this.assetData.decimals;

        positionUsdValue =
          Number(formatUnits(positionUnderlyingStart, decimals)) * priceUsd;
        interestUsdValue =
          Number(formatUnits(interestUnderlyingUnits, decimals)) * priceUsd;
      }

      // Fetch any rewards for this period
      const rewards = await this.fetchRewardsForPeriod(
        interaction.blockNumber,
        endBlock
      );

      // Calculate total USD value of rewards
      const totalRewardsAccruedUSD = rewards.reduce((total, reward) => {
        if (reward.priceUsd) {
          return (
            total +
            parseFloat(reward.formattedAmount) * parseFloat(reward.priceUsd)
          );
        }
        return total;
      }, 0);

      // Create the period object with basic metrics
      let period: Period = {
        periodeNumber: i + 1,
        type: interaction.type,
        startBlock: interaction.blockNumber,
        endBlock: endBlock,
        startTimestamp: interaction.timestamp,
        endTimestamp: endTimestamp,
        positionShares: currentShares,
        positionAmountUnderlyingUnits: positionUnderlyingStart,
        positionAmountUSD: positionUsdValue,
        positionAccruedInterestUnderlyingUnits: interestUnderlyingUnits,
        positionAccruedInterestUSD: interestUsdValue,
        rewardsAccrued: rewards,
        totalRewardsAccruedUSD: totalRewardsAccruedUSD,
        // Default values for new fields
        durationInSeconds: Number(endTimestamp - interaction.timestamp),
        nativeAPY: 0,
        rewardsAPR: 0,
        totalAPY: 0,
      };

      // Calculate APY/APR metrics
      period = this.calculatePeriodYieldMetrics(period);

      this.periods.push(period);

      // If not the last interaction and the next interaction is a withdrawal
      // that closes the position, we need to recalculate shares
      if (!isLastInteraction && nextInteraction?.type === "withdraw") {
        if (currentShares === nextInteraction.shares) {
          // This will be a full withdrawal - position will be closed
          currentShares = 0n;
        }
      }
    }

    console.log(`Calculated ${this.periods.length} periods`);
  }

  /**
   * New method to get the current active period specifically
   */
  public getCurrentActivePeriod(): Period | null {
    // If there are no periods or the user has no active position
    if (this.periods.length === 0) {
      return null;
    }

    // The last period in the array should be the current active one
    // if the user still has an active position
    const lastPeriod = this.periods[this.periods.length - 1];

    // Check if it's actually current (ends at the latest block)
    // You could implement additional checks here if needed
    return lastPeriod;
  }
  /**
   * Returns all calculated periods
   * Provides access to the periods data for external use
   */
  public getPeriods(): Period[] {
    return this.periods;
  }

  /**
   * Prints a summary of all periods to the console
   * Formats and displays period data in a readable format
   */
  public printPeriodSummary(): void {
    console.log("\n=== VAULT PERIODS SUMMARY ===");
    console.log(`User: ${this.userAddress}`);
    console.log(`Vault: ${this.vaultAddress}`);
    console.log(`Chain ID: ${this.chainId}`);

    if (this.assetData) {
      console.log(
        `Underlying Asset: ${this.assetData.symbol} (${this.underlyingAsset})`
      );
      console.log(`Current Price: ${this.assetData.priceUsd}`);
    }

    // Add current active period summary
    const activePeriod = this.getCurrentActivePeriod();
    if (activePeriod) {
      console.log("\n=== CURRENT ACTIVE POSITION ===");
      const durationDays =
        (Number(activePeriod.endTimestamp) -
          Number(activePeriod.startTimestamp)) /
        86400;

      if (this.assetData) {
        const positionFormatted = formatUnits(
          activePeriod.positionAmountUnderlyingUnits,
          this.assetData.decimals
        );
        console.log(
          `Current Position: ${positionFormatted} ${
            this.assetData.symbol
          } ($${activePeriod.positionAmountUSD.toFixed(2)})`
        );

        // Calculate and show current APY
        const annualizedReturn =
          (activePeriod.positionAccruedInterestUSD /
            activePeriod.positionAmountUSD) *
          (365 / durationDays) *
          100;
        console.log(`Current APY: ${annualizedReturn.toFixed(2)}%`);

        // Show projected earnings
        const projectedAnnualEarnings =
          activePeriod.positionAmountUSD * (annualizedReturn / 100);
        console.log(
          `Projected annual earnings: $${projectedAnnualEarnings.toFixed(
            2
          )} if current rate continues`
        );
      }
    }

    console.log(`\nTotal Periods: ${this.periods.length}`);

    if (this.periods.length === 0) {
      console.log("No periods found for this user");
      return;
    }

    // Calculate overall metrics
    let totalInterestUnits = 0n;
    let totalInterestUSD = 0;

    for (const period of this.periods) {
      totalInterestUnits += period.positionAccruedInterestUnderlyingUnits;
      totalInterestUSD += period.positionAccruedInterestUSD;
    }

    // Print overall metrics
    if (this.assetData) {
      console.log(
        `Total Interest Earned: ${formatUnits(
          totalInterestUnits,
          this.assetData.decimals
        )} ${this.assetData.symbol} (${totalInterestUSD.toFixed(2)})`
      );
    }

    // Print individual periods
    console.log("\n--- Period Details ---");

    for (const period of this.periods) {
      console.log(period);
      const startDate = new Date(Number(period.startTimestamp) * 1000);
      const endDate = new Date(Number(period.endTimestamp) * 1000);
      const durationDays =
        (Number(period.endTimestamp) - Number(period.startTimestamp)) / 86400;

      console.log(`\nPeriod #${period.periodeNumber} (${period.type})`);
      console.log(
        `Duration: ${durationDays.toFixed(
          2
        )} days (${startDate.toISOString()} to ${endDate.toISOString()})`
      );

      if (this.assetData) {
        const positionFormatted = formatUnits(
          period.positionAmountUnderlyingUnits,
          this.assetData.decimals
        );
        const interestFormatted = formatUnits(
          period.positionAccruedInterestUnderlyingUnits,
          this.assetData.decimals
        );

        console.log(
          `Position: ${positionFormatted} ${
            this.assetData.symbol
          } (${period.positionAmountUSD.toFixed(2)})`
        );
        console.log(
          `Interest Earned: ${interestFormatted} ${
            this.assetData.symbol
          } (${period.positionAccruedInterestUSD.toFixed(2)})`
        );

        // Calculate and display APY
        const annualizedReturn =
          (period.positionAccruedInterestUSD / period.positionAmountUSD) *
          (365 / durationDays) *
          100;
        console.log(`Effective APY: ${annualizedReturn.toFixed(2)}%`);
      } else {
        console.log(`Position Shares: ${formatEther(period.positionShares)}`);
        console.log(
          `Interest Units: ${formatEther(
            period.positionAccruedInterestUnderlyingUnits
          )}`
        );
      }

      // Print rewards if any
      if (period.rewardsAccrued.length > 0) {
        console.log("Rewards:");
        for (const reward of period.rewardsAccrued) {
          const usdValue = reward.priceUsd
            ? `(${(
                parseFloat(reward.formattedAmount) * parseFloat(reward.priceUsd)
              ).toFixed(2)})`
            : "";

          console.log(
            `  ${reward.formattedAmount} ${reward.symbol} ${usdValue}`
          );
        }
      }
    }

    console.log("\n=== END OF SUMMARY ===\n");
  }

  /**
   * Calculate APY/APR metrics for a period
   * @param period The period to calculate metrics for
   * @returns Updated period with APY/APR metrics
   */
  private calculatePeriodYieldMetrics(period: Period): Period {
    // Calculate duration in seconds
    const durationInSeconds = Number(
      period.endTimestamp - period.startTimestamp
    );

    // Calculate annualization factor (seconds in a year / period duration in seconds)
    const annualizationFactor = (365 * 86400) / durationInSeconds;

    // Calculate Native APY using compound interest formula
    let nativeAPY = 0;
    if (period.positionAmountUSD > 0) {
      // Calculate the period return rate
      const periodReturn =
        period.positionAccruedInterestUSD / period.positionAmountUSD;

      // Apply compound interest formula: (1 + r)^AF - 1
      nativeAPY = (Math.pow(1 + periodReturn, annualizationFactor) - 1) * 100;
    }

    // Calculate Rewards APR (simple interest - no compounding)
    const rewardsAPR =
      period.positionAmountUSD > 0
        ? (period.totalRewardsAccruedUSD / period.positionAmountUSD) *
          annualizationFactor *
          100
        : 0;

    // Calculate Total APY (sum of Native APY and Rewards APR)
    const totalAPY = nativeAPY + rewardsAPR;

    // Return updated period with new metrics
    return {
      ...period,
      durationInSeconds,
      nativeAPY,
      rewardsAPR,
      totalAPY,
    };
  }

  /**
   * Calculate the overall yield metrics for the entire position
   * Uses time-weighted average based on period durations and position sizes
   * @returns Overall yield metrics
   */
  private calculateOverallYieldMetrics(): OverallPositionMetrics {
    // Return defaults if no periods
    if (this.periods.length === 0) {
      return {
        nativeAPY: 0,
        rewardsAPR: 0,
        totalAPY: 0,
        totalInterestEarnedUSD: 0,
        totalRewardsEarnedUSD: 0,
        totalEarningsUSD: 0,
        weightedDuration: 0,
      };
    }

    // Calculate sums for weighted averages
    let weightedNativeAPYSum = 0;
    let weightedRewardsAPRSum = 0;
    let weightedDenominator = 0;
    let totalInterestEarnedUSD = 0;
    let totalRewardsEarnedUSD = 0;
    let totalPositionDurationSeconds = 0;

    // Process each period
    for (const period of this.periods) {
      // Add to totals
      totalInterestEarnedUSD += period.positionAccruedInterestUSD;
      totalRewardsEarnedUSD += period.totalRewardsAccruedUSD;
      totalPositionDurationSeconds += period.durationInSeconds;

      // Calculate weight (duration * position size)
      const weight = period.durationInSeconds * period.positionAmountUSD;

      // Add weighted APY/APR to sums
      weightedNativeAPYSum += weight * period.nativeAPY;
      weightedRewardsAPRSum += weight * period.rewardsAPR;
      weightedDenominator += weight;
    }

    // Calculate weighted averages
    const overallNativeAPY =
      weightedDenominator > 0 ? weightedNativeAPYSum / weightedDenominator : 0;

    const overallRewardsAPR =
      weightedDenominator > 0 ? weightedRewardsAPRSum / weightedDenominator : 0;

    return {
      nativeAPY: overallNativeAPY,
      rewardsAPR: overallRewardsAPR,
      totalAPY: overallNativeAPY + overallRewardsAPR,
      totalInterestEarnedUSD,
      totalRewardsEarnedUSD,
      totalEarningsUSD: totalInterestEarnedUSD + totalRewardsEarnedUSD,
      weightedDuration: totalPositionDurationSeconds / 86400, // Convert to days
    };
  }

  /**
   * Gets the overall yield metrics for the position
   * @returns Overall position metrics including APY/APR
   */
  public getOverallYieldMetrics(): OverallPositionMetrics {
    return this.calculateOverallYieldMetrics();
  }

  /**
   * Enhanced version of printPeriodSummary that includes APY/APR metrics
   */
  public printEnhancedSummary(): void {
    console.log("\n=== ENHANCED VAULT PERIODS SUMMARY ===");
    console.log(`User: ${this.userAddress}`);
    console.log(`Vault: ${this.vaultAddress}`);
    console.log(`Chain ID: ${this.chainId}`);

    if (this.assetData) {
      console.log(
        `Underlying Asset: ${this.assetData.symbol} (${this.underlyingAsset})`
      );
      console.log(`Current Price: ${this.assetData.priceUsd}`);
    }

    // Get overall metrics
    const overallMetrics = this.getOverallYieldMetrics();

    // Print overall position summary
    console.log("\n=== OVERALL POSITION METRICS ===");
    console.log(
      `Total Position Duration: ${overallMetrics.weightedDuration.toFixed(
        2
      )} days`
    );
    console.log(
      `Total Interest Earned: $${overallMetrics.totalInterestEarnedUSD.toFixed(
        2
      )}`
    );
    console.log(
      `Total Rewards Earned: $${overallMetrics.totalRewardsEarnedUSD.toFixed(
        2
      )}`
    );
    console.log(
      `Total Earnings: $${overallMetrics.totalEarningsUSD.toFixed(2)}`
    );
    console.log(`Overall Native APY: ${overallMetrics.nativeAPY.toFixed(2)}%`);
    console.log(
      `Overall Rewards APR: ${overallMetrics.rewardsAPR.toFixed(2)}%`
    );
    console.log(`Overall Total APY: ${overallMetrics.totalAPY.toFixed(2)}%`);

    // Add current active period summary
    const activePeriod = this.getCurrentActivePeriod();
    if (activePeriod) {
      console.log("\n=== CURRENT ACTIVE POSITION ===");
      if (this.assetData) {
        const positionFormatted = formatUnits(
          activePeriod.positionAmountUnderlyingUnits,
          this.assetData.decimals
        );
        console.log(
          `Current Position: ${positionFormatted} ${
            this.assetData.symbol
          } ($${activePeriod.positionAmountUSD.toFixed(2)})`
        );

        // Show current APY/APR metrics
        console.log(
          `Current Native APY: ${activePeriod.nativeAPY.toFixed(2)}%`
        );
        console.log(
          `Current Rewards APR: ${activePeriod.rewardsAPR.toFixed(2)}%`
        );
        console.log(`Current Total APY: ${activePeriod.totalAPY.toFixed(2)}%`);

        // Show projected earnings
        const projectedAnnualInterest =
          activePeriod.positionAmountUSD * (activePeriod.nativeAPY / 100);
        const projectedAnnualRewards =
          activePeriod.positionAmountUSD * (activePeriod.rewardsAPR / 100);

        console.log(
          `Projected annual interest earnings: $${projectedAnnualInterest.toFixed(
            2
          )} if current rate continues`
        );
        console.log(
          `Projected annual rewards earnings: $${projectedAnnualRewards.toFixed(
            2
          )} if current rate continues`
        );
        console.log(
          `Projected annual total earnings: $${(
            projectedAnnualInterest + projectedAnnualRewards
          ).toFixed(2)} if current rates continue`
        );
      }
    }

    console.log(`\nTotal Periods: ${this.periods.length}`);

    if (this.periods.length === 0) {
      console.log("No periods found for this user");
      return;
    }

    // Print individual periods
    console.log("\n--- Period Details ---");

    for (const period of this.periods) {
      console.log(`\nPeriod #${period.periodeNumber} (${period.type})`);
      console.log(period);
      const startDate = new Date(Number(period.startTimestamp) * 1000);
      const endDate = new Date(Number(period.endTimestamp) * 1000);
      const durationDays = period.durationInSeconds / 86400;

      console.log(
        `Duration: ${durationDays.toFixed(
          2
        )} days (${startDate.toISOString()} to ${endDate.toISOString()})`
      );

      if (this.assetData) {
        const positionFormatted = formatUnits(
          period.positionAmountUnderlyingUnits,
          this.assetData.decimals
        );
        const interestFormatted = formatUnits(
          period.positionAccruedInterestUnderlyingUnits,
          this.assetData.decimals
        );

        console.log(
          `Position: ${positionFormatted} ${
            this.assetData.symbol
          } (${period.positionAmountUSD.toFixed(2)})`
        );
        console.log(
          `Interest Earned: ${interestFormatted} ${
            this.assetData.symbol
          } (${period.positionAccruedInterestUSD.toFixed(2)})`
        );

        // Display APY/APR metrics
        console.log(`Native APY: ${period.nativeAPY.toFixed(2)}%`);
        console.log(`Rewards APR: ${period.rewardsAPR.toFixed(2)}%`);
        console.log(`Total APY: ${period.totalAPY.toFixed(2)}%`);
      }

      // Print rewards if any
      if (period.rewardsAccrued.length > 0) {
        console.log("Rewards:");
        for (const reward of period.rewardsAccrued) {
          const usdValue = reward.priceUsd
            ? `(${(
                parseFloat(reward.formattedAmount) * parseFloat(reward.priceUsd)
              ).toFixed(2)})`
            : "";

          console.log(
            `  ${reward.formattedAmount} ${reward.symbol} ${usdValue}`
          );
        }
      }
    }

    console.log("\n=== END OF ENHANCED SUMMARY ===\n");
  }
}
/**
 * Main function to analyze a user's interactions with a vault
 * Creates a tracker, initializes it, and returns the calculated periods and overall metrics
 */
export async function analyzeUserVaultPeriods(
  client: PublicClient,
  userAddress: Address,
  vaultAddress: Address,
  chainId: number
): Promise<{
  periods: Period[];
  overallMetrics: OverallPositionMetrics;
}> {
  console.log(`Analyzing vault periods for user ${userAddress}`);
  console.log(`Vault: ${vaultAddress} on chain ${chainId}`);

  try {
    // Create tracker instance
    const tracker = new VaultPeriodTracker(
      client,
      userAddress,
      vaultAddress,
      chainId
    );

    // Initialize and calculate periods
    await tracker.initialize();

    // Print enhanced summary to console
    tracker.printEnhancedSummary();

    // Return calculated periods and overall metrics
    return {
      periods: tracker.getPeriods(),
      overallMetrics: tracker.getOverallYieldMetrics(),
    };
  } catch (error) {
    console.error("Error analyzing vault periods:", error);
    throw error;
  }
}

/**
 * Example usage
 */
async function main() {
  try {
    // Import the client from your client.ts file
    const { getClient } = await import("./client");
    const client = await getClient(8453);

    // Define user and vault addresses
    const userAddress: Address =
      "0xB3F8A1885bb8C1afFe4980d8926132A0C3A318d5" as Address;
    const vaultAddress: Address =
      "0xcdDCDd18A16ED441F6CB10c3909e5e7ec2B9e8f3" as Address;
    const chainId = 8453; // Base chain

    // Execute the analysis
    const result = await analyzeUserVaultPeriods(
      client,
      userAddress,
      vaultAddress,
      chainId
    );

    console.log(`Analysis complete. Found ${result.periods.length} periods.`);
    console.log(
      `Overall Native APY: ${result.overallMetrics.nativeAPY.toFixed(2)}%`
    );
    console.log(
      `Overall Rewards APR: ${result.overallMetrics.rewardsAPR.toFixed(2)}%`
    );
    console.log(
      `Overall Total APY: ${result.overallMetrics.totalAPY.toFixed(2)}%`
    );

    return result;
  } catch (error) {
    console.error("Error in main:", error);
    process.exit(1);
  }
}

main();
