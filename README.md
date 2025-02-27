# Morpho APY Calculator

A precision tool for calculating the actual Annual Percentage Yield (APY) experienced by specific users in a given Morpho Vault, based on their unique deposit history.

## Overview

The Morpho APY Calculator analyzes blockchain data to determine the exact returns a user has earned in a Morpho Vault over time. Unlike general APY metrics that show vault-wide performance, this calculator determines the precise returns for individual users based on their specific deposit timing and amounts.

This calculator connects directly to the blockchain to retrieve all user interactions with a vault, analyzes price-per-share changes between interactions, and provides detailed metrics on investment performance with full numerical precision.

> **Important:** Currently, the calculator only tracks native yield (interest from price-per-share appreciation). Support for external rewards will be added soon!

## What It Measures

The calculator provides the following key metrics:

- **Actual Experienced APY**: Calculates the time-weighted average APY the user has actually earned
- **Total Interest Accrued**: Shows exactly how much interest the user has earned in absolute terms
- **Percentage Return**: Expresses interest as a percentage of total deposits
- **Interest Timeline**: Breaks down interest earned in each period between user interactions
- **Position Summary**: Provides current value, shares held, and total deposits

## Key Features

- **Blockchain Data Retrieval**: Connects directly to the blockchain to fetch historical transaction data
- **Deposit/Withdrawal Tracking**: Identifies all user interactions with the vault through on-chain events
- **Precise Interest Calculation**: Uses bigint math to maintain full numerical precision for calculations
- **Period-Based Analysis**: Breaks returns into specific periods between user interactions
- **Dual Interest Calculation**: Reconciles two different methods of interest calculation for verification
- **Performance Optimization**: Uses batched requests, parallel processing, and caching for efficient blockchain queries

## Technical Components

### Data Sources

The calculator sources data directly from blockchain events:

- `Deposit` events: Track assets deposited and shares received
- `Withdraw` events: Track shares redeemed and assets received
- Block timestamps: Determine the duration of each period
- Vault metrics: Query `totalAssets` and `totalSupply` to calculate price-per-share at each point

### Calculation Methodology

#### Price Per Share

For each relevant block, price-per-share is calculated as:

```
pricePerShare = totalAssets / totalSupply
```

#### Period Interest

For each period between interactions:

```
startValue = shares * startPrice
endValue = shares * endPrice
interestAccrued = endValue - startValue
interestPercent = (interestAccrued / startValue) * 100
```

#### APY Calculation

For each period, annualized APY is calculated as:

```
priceRatio = endPrice / startPrice
apy = (Math.pow(priceRatio, 365 / durationDays) - 1) * 100
```

#### Weighted Average APY

The final APY is weighted by both shares held and duration:

```
weight = shares * durationDays
weightedSum = sum(apy * weight) for all periods
totalWeight = sum(weight) for all periods
averageAPY = weightedSum / totalWeight
```

## Output Data

The calculator provides three levels of output:

1. **Summary Metrics**:

   - Average annualized APY
   - Total interest accrued (in wei and percentage)
   - Total deposits and current value
   - Investment timespan

2. **Detailed Period Analysis**:

   - Per-period APY
   - Interest accrued in each period
   - Price-per-share changes
   - Cumulative interest over time

3. **Reconciliation Report**:
   - Compares period-by-period interest with simple interest calculation
   - Explains discrepancies between calculation methodologies
   - Provides transparency into calculation accuracy

## Implementation Notes

1. **Precision Handling**: The code uses bigint arithmetic to maintain full numerical precision throughout calculations, avoiding floating-point errors that could affect financial calculations.

2. **Dual Interest Calculation**: The code reconciles two different methods of calculating interest:

   - Period-by-period calculation (tracks interest earned in each period between interactions)
   - Simple calculation (difference between final value and total deposits)

   The period-by-period calculation is more accurate as it properly attributes interest to each deposit based on how long it has been in the vault.

3. **Interest Reconciliation**: The calculator explains any differences between calculation methods. For example, in the sample output:

   - Period-by-period calculation: 285 697 428 715 wei
   - Simple calculation: 204 577 142 923 wei
   - Difference: 81 120 285 792 wei

   This difference exists because later deposits haven't had as much time to earn interest, which the period-by-period calculation accounts for.

4. **Current Limitations**: The current implementation does not include external rewards in the APY calculation. It only tracks interest from price-per-share appreciation within the vault itself.

## Use Cases

1. **Performance Analysis**: Track actual returns for specific positions in Morpho Vaults
2. **Investment Timing Analysis**: Understand how deposit timing affects overall returns
3. **Historical Performance**: View a complete record of a user's vault performance over time
4. **Interest Attribution**: See exactly how much interest was earned in each time period
5. **Position Monitoring**: Track share growth, current value, and total returns in one place

## Example Output

The calculator generates detailed reports showing:

- User position summary (total deposited, current value, shares held)
- Interest summary (total interest, percentage return, annualized APY)
- Interest calculation reconciliation
- Time summary (first interaction, last interaction, total duration)
- Activity summary (total interactions, interest accrual periods)
- List of all user interactions (deposits and withdrawals)
- Detailed breakdown of each interest accrual period

Sample summary output:

```
Summary: {
  userAddress: '0x2917956eFF0B5eaF030abDB4EF4296DF775009cA',
  vaultAddress: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A',
  averageAPY: '5.59%',
  totalInterestAccrued: '285697428715',
  totalInterestPercent: '0.44%',
  numberOfInteractions: 14,
  numberOfPeriods: 12,
  totalDeposited: '64700000000000',
  currentValue: '64904577142923',
  totalDurationDays: '42.82',
  firstInteraction: '2025-01-15T20:31:15.000Z',
  lastInteraction: '2025-02-25T21:37:51.000Z'
}
```

## Requirements

- **Node.js**: v16.x or higher
- **Package Manager**: yarn (preferred) or npm
- **Environment Variables**: Create a `.env` file with the following:
  ```
  RPC_URL_MAINNET=your_ethereum_node_url
  RPC_URL_BASE=your_base_node_url
  ```
- **Dependencies**:
  - @morpho-org/blue-sdk: ^2.3.1
  - viem: ^2.23.3

## Execute

```bash
yarn
```

```bash
yarn start
```

Full output example:

```bash
Calculating APY for user 0x2917956eFF0B5eaF030abDB4EF4296DF775009cA on vault 0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A
Fetching user interactions...
Found 14 deposits and 0 withdrawals
Fetching timestamps for 14 blocks...
Fetching price per share for 14 blocks...
Processed 14 / 14 block timestamps
Processed 14 / 14 price calculations
Processed all interactions in 1.65 seconds
Calculating precise interest accrual between interactions...
=== Morpho Vault Enhanced Interest Report ===

User: 0x2917956eFF0B5eaF030abDB4EF4296DF775009cA
Vault: 0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A

=== Position Summary ===
Total Deposited: 64700000000000 wei
Current Shares: 64512662716918103112218770 shares
Current Value: 64904577142923 wei

=== Interest Summary ===
Total Interest Accrued: 285697428715 wei
Total Return: 0.4400%
Annualized APY: 5.59%

=== Interest Calculation Reconciliation ===
Period-by-period Interest: 285697428715 wei
Simple Interest (currentValue - totalDeposited): 204577142923 wei

  The difference between these two interest calculations (81120285792)
  is due to the interest accrual methodology:

  1. Period-by-period calculation (285697428715):
     - Tracks interest earned in each period between interactions
     - Accounts for price changes applied to shares held in each period
     - More precise because it captures the interest earned on each deposit separately

  2. Simple calculation (204577142923):
     - Just the difference between final value and total deposits
     - Doesn't account for the timing of deposits
     - Less precise because later deposits haven't had as much time to earn interest

  The period-by-period calculation is more accurate as it properly attributes interest
  to each deposit based on how long it has been in the vault.


=== Time Summary ===
First Interaction: 2025-01-15T20:31:15.000Z
Last Interaction: 2025-02-25T21:37:51.000Z
Total Duration: 42.82 days

=== Activity Summary ===
Total Interactions: 14
Interest Accrual Periods: 12

=== User Interactions ===
- Block 25091864: deposit 1000000 assets (1000000000000000000 shares) at 2025-01-15T20:31:15.000Z
  Price per share: 1e-12
- Block 25092124: deposit 1000000000000 assets (1000000000000000000000000 shares) at 2025-01-15T20:39:55.000Z
  Price per share: 1e-12
- Block 25092229: deposit 1999999000000 assets (1999998497946879109511721 shares) at 2025-01-15T20:43:25.000Z
  Price per share: 1.000000251026749e-12
- Block 25124002: deposit 2000000000000 assets (1999861913675383786880739 shares) at 2025-01-16T14:22:31.000Z
  Price per share: 1.0000690479295957e-12
- Block 25167363: deposit 1500000000000 assets (1499755425644787388603624 shares) at 2025-01-17T14:27:53.000Z
  Price per share: 1.0001630761596394e-12
- Block 25214742: deposit 3000000000000 assets (2999026989125750697644513 shares) at 2025-01-18T16:47:11.000Z
  Price per share: 1.000324442186675e-12
- Block 25261337: deposit 2300000000000 assets (2298858962493249858357608 shares) at 2025-01-19T18:40:21.000Z
  Price per share: 1.0004963495044135e-12
- Block 25345420: deposit 3500000000000 assets (3496946658914997578987116 shares) at 2025-01-21T17:23:07.000Z
  Price per share: 1.000873144884043e-12
- Block 25390822: deposit 2400000000000 assets (2397508318791093828836603 shares) at 2025-01-22T18:36:31.000Z
  Price per share: 1.001039279484195e-12
- Block 25442490: deposit 2000000000000 assets (1997555002499561466396996 shares) at 2025-01-23T23:18:47.000Z
  Price per share: 1.001223995082678e-12
- Block 25661907: deposit 5000000000000 assets (4990019482241610066825291 shares) at 2025-01-29T01:12:41.000Z
  Price per share: 1.0020000959503081e-12
- Block 25914033: deposit 10000000000000 assets (9972287564107014186110493 shares) at 2025-02-03T21:16:53.000Z
  Price per share: 1.0027789447220445e-12
- Block 26084984: deposit 15000000000000 assets (14951428155552536083897497 shares) at 2025-02-07T20:15:15.000Z
  Price per share: 1.0032486424669357e-12
- Block 26865062: deposit 15000000000000 assets (14909414745925239060166569 shares) at 2025-02-25T21:37:51.000Z
  Price per share: 1.0060757082433112e-12

=== Interest Accrual Periods ===
- Period 1: 2025-01-15T20:43:25.000Z to 2025-01-16T14:22:31.000Z
  Duration: 0.74 days
  Price change: 1.000000251026749e-12 -> 1.0000690479295957e-12 (0.0069%)
  Shares held: 4999861411622262896392460
  Value: 4999861411622 -> 5000206402059
  Interest accrued: 344990437 (0.0000%)
  Cumulative interest: 344990437 (0.0000% of total deposits so far)
  APY: 3.47%

- Period 2: 2025-01-16T14:22:31.000Z to 2025-01-17T14:27:53.000Z
  Duration: 1.00 days
  Price change: 1.0000690479295957e-12 -> 1.0001630761596394e-12 (0.0094%)
  Shares held: 6499616837267050284996084
  Value: 6500065310828 -> 6500676274811
  Interest accrued: 610963983 (0.0000%)
  Cumulative interest: 955954420 (0.0100% of total deposits so far)
  APY: 3.48%

- Period 3: 2025-01-17T14:27:53.000Z to 2025-01-18T16:47:11.000Z
  Duration: 1.10 days
  Price change: 1.0001630761596394e-12 -> 1.000324442186675e-12 (0.0161%)
  Shares held: 9498643826392800982640597
  Value: 9500192105336 -> 9501721386992
  Interest accrued: 1529281656 (0.0100%)
  Cumulative interest: 2485236076 (0.0200% of total deposits so far)
  APY: 5.52%

- Period 4: 2025-01-18T16:47:11.000Z to 2025-01-19T18:40:21.000Z
  Duration: 1.08 days
  Price change: 1.000324442186675e-12 -> 1.0004963495044135e-12 (0.0172%)
  Shares held: 11797502788886050840998205
  Value: 11801325179789 -> 11803354350269
  Interest accrued: 2029170480 (0.0100%)
  Cumulative interest: 4514406556 (0.0300% of total deposits so far)
  APY: 5.99%

- Period 5: 2025-01-19T18:40:21.000Z to 2025-01-21T17:23:07.000Z
  Duration: 1.95 days
  Price change: 1.0004963495044135e-12 -> 1.000873144884043e-12 (0.0377%)
  Shares held: 15294449447801048419985321
  Value: 15302035494727 -> 15307801502168
  Interest accrued: 5766007441 (0.0300%)
  Cumulative interest: 10280413997 (0.0600% of total deposits so far)
  APY: 7.32%

- Period 6: 2025-01-21T17:23:07.000Z to 2025-01-22T18:36:31.000Z
  Duration: 1.05 days
  Price change: 1.000873144884043e-12 -> 1.001039279484195e-12 (0.0166%)
  Shares held: 17691957766592142248821924
  Value: 17707402845722 -> 17710339710711
  Interest accrued: 2936864989 (0.0100%)
  Cumulative interest: 13217278986 (0.0700% of total deposits so far)
  APY: 5.93%

- Period 7: 2025-01-22T18:36:31.000Z to 2025-01-23T23:18:47.000Z
  Duration: 1.20 days
  Price change: 1.001039279484195e-12 -> 1.001223995082678e-12 (0.0185%)
  Shares held: 19689512769091703715218920
  Value: 19709970172858 -> 19713593043208
  Interest accrued: 3622870350 (0.0100%)
  Cumulative interest: 16840149336 (0.0800% of total deposits so far)
  APY: 5.79%

- Period 8: 2025-01-23T23:18:47.000Z to 2025-01-29T01:12:41.000Z
  Duration: 5.08 days
  Price change: 1.001223995082678e-12 -> 1.0020000959503081e-12 (0.0775%)
  Shares held: 24679532251333313782044211
  Value: 24709715319276 -> 24728891315835
  Interest accrued: 19175996559 (0.0700%)
  Cumulative interest: 36016145895 (0.1400% of total deposits so far)
  APY: 5.73%

- Period 9: 2025-01-29T01:12:41.000Z to 2025-02-03T21:16:53.000Z
  Duration: 5.84 days
  Price change: 1.0020000959503081e-12 -> 1.0027789447220445e-12 (0.0777%)
  Shares held: 34651819815440327968154704
  Value: 34721123455071 -> 34748082570887
  Interest accrued: 26959115816 (0.0700%)
  Cumulative interest: 62975261711 (0.1800% of total deposits so far)
  APY: 4.98%

- Period 10: 2025-02-03T21:16:53.000Z to 2025-02-07T20:15:15.000Z
  Duration: 3.96 days
  Price change: 1.0027789447220445e-12 -> 1.0032486424669357e-12 (0.0468%)
  Shares held: 49603247970992864052052201
  Value: 49741045793856 -> 49764359320402
  Interest accrued: 23313526546 (0.0400%)
  Cumulative interest: 86288788257 (0.1700% of total deposits so far)
  APY: 4.41%

- Period 11: 2025-02-07T20:15:15.000Z to 2025-02-25T21:37:51.000Z
  Duration: 18.06 days
  Price change: 1.0032486424669357e-12 -> 1.0060757082433112e-12 (0.2818%)
  Shares held: 64512662716918103112218770
  Value: 64722199845422 -> 64904577142923
  Interest accrued: 182377297501 (0.2800%)
  Cumulative interest: 268666085758 (0.4100% of total deposits so far)
  APY: 5.85%

- Period 12: 2025-02-25T21:37:51.000Z to 2025-02-27T16:21:25.000Z
  Duration: 1.78 days
  Price change: 1.0060757082433112e-12 -> 1.0063398356094729e-12 (0.0263%)
  Shares held: 64512662716918103112218770
  Value: 64904577142923 -> 64921608485880
  Interest accrued: 17031342957 (0.0200%)
  Cumulative interest: 285697428715 (0.4400% of total deposits so far)
  APY: 5.53%


Total execution time: 3.226s
Summary: {
  userAddress: '0x2917956eFF0B5eaF030abDB4EF4296DF775009cA',
  vaultAddress: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A',
  averageAPY: '5.59%',
  totalInterestAccrued: '285697428715',
  totalInterestPercent: '0.44%',
  numberOfInteractions: 14,
  numberOfPeriods: 12,
  totalDeposited: '64700000000000',
  currentValue: '64904577142923',
  totalDurationDays: '42.82',
  firstInteraction: '2025-01-15T20:31:15.000Z',
  lastInteraction: '2025-02-25T21:37:51.000Z'
}
✨  Done in 6.67s.
```
