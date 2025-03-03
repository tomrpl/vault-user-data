import { Address } from "viem";

// Types for rewards API response
export interface TimeseriesEntry {
  timestamp: number;
  amount: string;
}

export interface AssetTimeseries {
  asset: {
    address: string;
    chain_id: number;
  };
  timeseries: TimeseriesEntry[];
}

export interface RewardsApiResponse {
  data: AssetTimeseries[];
}

export interface TokenData {
  symbol: string;
  decimals: number;
  priceUsd?: string;
}

/**
 * Represents a reward accrued during a period
 */
export interface RewardAccrual {
  chainId: number;
  assetAddress: string;
  symbol: string;
  decimals: number;
  rawAmount: bigint;
  formattedAmount: string;
  priceUsd?: string;
}

/**
 * Represents a user interaction (deposit or withdrawal) with the vault
 */
export interface UserInteraction {
  blockNumber: bigint;
  timestamp: bigint;
  type: "deposit" | "withdraw";
  assets: bigint;
  shares: bigint;
}

/**
 * Yield metrics for a period or overall position
 */
export interface YieldMetrics {
  nativeAPY: number;
  rewardsAPR: number;
  totalAPY: number;
}

/**
 * Represents a period between user interactions
 */
export interface Period {
  periodeNumber: number;
  type: "deposit" | "withdraw";
  startBlock: bigint;
  endBlock: bigint;
  startTimestamp: bigint;
  endTimestamp: bigint;
  positionShares: bigint;
  positionAmountUnderlyingUnits: bigint;
  positionAmountUSD: number;
  positionAccruedInterestUnderlyingUnits: bigint;
  positionAccruedInterestUSD: number;
  rewardsAccrued: RewardAccrual[];
  totalRewardsAccruedUSD: number;
  durationInSeconds: number;
  nativeAPY: number;
  rewardsAPR: number;
  totalAPY: number;
}

/**
 * Overall position metrics
 */
export interface OverallPositionMetrics extends YieldMetrics {
  totalInterestEarnedUSD: number;
  totalRewardsEarnedUSD: number;
  totalEarningsUSD: number;
  weightedDuration: number; // in days
}
