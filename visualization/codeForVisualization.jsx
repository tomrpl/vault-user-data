import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  ComposedChart,
  Area,
} from "recharts";

const MorphoVaultVisualization = () => {
  // Data from the summary
  const vaultInfo = {
    user: "0xB3F8A1885bb8C1afFe4980d8926132A0C3A318d5",
    vault: "0xcdDCDd18A16ED441F6CB10c3909e5e7ec2B9e8f3",
    chainId: 8453,
    underlyingAsset: "USDC",
    assetAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    currentPrice: 0.99993,
  };

  const overallMetrics = {
    totalDuration: 7.32, // days
    totalInterestEarned: 870.1,
    totalRewardsEarned: 199.89,
    totalEarnings: 1069.99,
    overallNativeAPY: 9.78,
    overallRewardsAPR: 2.14,
    overallTotalAPY: 11.92,
  };

  const currentPosition = {
    amount: 500104.536793,
    amountUSD: 500069.53,
    currentNativeAPY: 9.91,
    currentRewardsAPR: 2.18,
    currentTotalAPY: 12.09,
    projectedAnnualInterest: 49548.42,
    projectedAnnualRewards: 10923.53,
    projectedAnnualTotal: 60471.95,
  };

  const periods = [
    {
      number: 1,
      type: "deposit",
      duration: 0.01, // days
      start: "2025-02-23T23:31:27.000Z",
      end: "2025-02-23T23:50:03.000Z",
      position: 99.99,
      interestEarned: 0.0,
      nativeAPY: 5.81,
      rewardsAPR: 0.0,
      totalAPY: 5.81,
      displayDate: "Feb 23",
    },
    {
      number: 2,
      type: "deposit",
      duration: 0.62, // days
      start: "2025-02-23T23:50:03.000Z",
      end: "2025-02-24T14:48:55.000Z",
      position: 100092.96,
      interestEarned: 4.8,
      nativeAPY: 2.85,
      rewardsAPR: 0.0,
      totalAPY: 2.85,
      displayDate: "Feb 24",
    },
    {
      number: 3,
      type: "deposit",
      duration: 6.68, // days
      start: "2025-02-24T14:48:55.000Z",
      end: "2025-03-03T07:07:05.000Z",
      position: 500069.53,
      interestEarned: 865.3,
      nativeAPY: 9.91,
      rewardsAPR: 2.18,
      totalAPY: 12.09,
      displayDate: "Feb 24 - Mar 3",
    },
  ];

  const totalPeriods = periods.length;

  // Prepare data for charts
  const timelineData = periods.map((period) => ({
    period: period.number,
    date: period.displayDate,
    position: period.position,
    interestEarned: period.interestEarned,
    nativeAPY: period.nativeAPY,
    rewardsAPR: period.rewardsAPR,
    totalAPY: period.totalAPY,
    duration: period.duration,
  }));

  const yieldData = periods.map((period) => ({
    period: period.number,
    date: period.displayDate,
    nativeAPY: period.nativeAPY,
    rewardsAPR: period.rewardsAPR,
    totalAPY: period.totalAPY,
  }));

  const positionData = periods.map((period) => ({
    period: period.number,
    date: period.displayDate,
    position: period.position,
    interestEarned: period.interestEarned,
  }));

  // Format large numbers with commas
  const formatNumber = (num) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  const formatCurrency = (num) => {
    return `$${formatNumber(parseFloat(num).toFixed(2))}`;
  };

  const formatPercentage = (num) => {
    return `${parseFloat(num).toFixed(2)}%`;
  };

  // Custom tooltip to display all relevant period information
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="p-4 bg-white border rounded shadow">
          <p className="font-bold text-lg">{`Period #${data.period} (${data.date})`}</p>
          <p className="text-gray-700">{`Duration: ${data.duration.toFixed(
            2
          )} days`}</p>
          <p className="text-gray-700">{`Position: ${formatCurrency(
            data.position
          )}`}</p>
          <p className="text-gray-700">{`Interest Earned: ${formatCurrency(
            data.interestEarned
          )}`}</p>
          <p className="text-gray-700">{`Native APY: ${formatPercentage(
            data.nativeAPY
          )}`}</p>
          <p className="text-gray-700">{`Rewards APR: ${formatPercentage(
            data.rewardsAPR
          )}`}</p>
          <p className="font-semibold text-gray-700">{`Total APY: ${formatPercentage(
            data.totalAPY
          )}`}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="p-6 max-w-6xl mx-auto bg-gray-50 rounded-lg shadow">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          Morpho Vault Periods Summary
        </h1>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-white p-4 rounded shadow">
            <h2 className="text-lg font-semibold mb-2 text-gray-700">
              Vault Information
            </h2>
            <p className="text-sm text-gray-600">{`User: ${vaultInfo.user.substring(
              0,
              6
            )}...${vaultInfo.user.substring(38)}`}</p>
            <p className="text-sm text-gray-600">{`Vault: ${vaultInfo.vault.substring(
              0,
              6
            )}...${vaultInfo.vault.substring(38)}`}</p>
            <p className="text-sm text-gray-600">{`Chain ID: ${vaultInfo.chainId}`}</p>
            <p className="text-sm text-gray-600">{`Asset: ${vaultInfo.underlyingAsset} (${vaultInfo.currentPrice} USD)`}</p>
          </div>
          <div className="bg-white p-4 rounded shadow">
            <h2 className="text-lg font-semibold mb-2 text-gray-700">
              Overall Performance
            </h2>
            <p className="text-sm text-gray-600">{`Total Duration: ${overallMetrics.totalDuration.toFixed(
              2
            )} days`}</p>
            <p className="text-sm text-gray-600">{`Total Earnings: ${formatCurrency(
              overallMetrics.totalEarnings
            )}`}</p>
            <p className="text-sm text-gray-600">{`Native APY: ${formatPercentage(
              overallMetrics.overallNativeAPY
            )}`}</p>
            <p className="text-sm text-gray-600">{`Rewards APR: ${formatPercentage(
              overallMetrics.overallRewardsAPR
            )}`}</p>
            <p className="text-sm font-medium text-gray-800">{`Total APY: ${formatPercentage(
              overallMetrics.overallTotalAPY
            )}`}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded shadow mb-6">
          <h2 className="text-lg font-semibold mb-2 text-gray-700">
            Current Active Position
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">{`Position Value: ${formatNumber(
                parseFloat(currentPosition.amount).toFixed(2)
              )} USDC (${formatCurrency(currentPosition.amountUSD)})`}</p>
              <p className="text-sm text-gray-600">{`Current Native APY: ${formatPercentage(
                currentPosition.currentNativeAPY
              )}`}</p>
              <p className="text-sm text-gray-600">{`Current Rewards APR: ${formatPercentage(
                currentPosition.currentRewardsAPR
              )}`}</p>
              <p className="text-sm font-medium text-gray-800">{`Current Total APY: ${formatPercentage(
                currentPosition.currentTotalAPY
              )}`}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">{`Projected Annual Interest: ${formatCurrency(
                currentPosition.projectedAnnualInterest
              )}`}</p>
              <p className="text-sm text-gray-600">{`Projected Annual Rewards: ${formatCurrency(
                currentPosition.projectedAnnualRewards
              )}`}</p>
              <p className="text-sm font-medium text-gray-800">{`Projected Annual Total: ${formatCurrency(
                currentPosition.projectedAnnualTotal
              )}`}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-xl font-bold mb-4 text-gray-800">
          Position Timeline
        </h2>
        <div className="h-72 bg-white p-4 rounded shadow">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={timelineData}
              margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis
                yAxisId="left"
                orientation="left"
                label={{
                  value: "Position Size (USD)",
                  angle: -90,
                  position: "insideLeft",
                }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                label={{
                  value: "APY/APR (%)",
                  angle: 90,
                  position: "insideRight",
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar
                yAxisId="left"
                dataKey="position"
                name="Position Value (USD)"
                fill="#3B82F6"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="nativeAPY"
                name="Native APY (%)"
                stroke="#10B981"
                strokeWidth={2}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="rewardsAPR"
                name="Rewards APR (%)"
                stroke="#F59E0B"
                strokeWidth={2}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="totalAPY"
                name="Total APY (%)"
                stroke="#EF4444"
                strokeWidth={3}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-xl font-bold mb-4 text-gray-800">
            Yield Performance
          </h2>
          <div className="h-72 bg-white p-4 rounded shadow">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={yieldData}
                margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis
                  label={{
                    value: "APY/APR (%)",
                    angle: -90,
                    position: "insideLeft",
                  }}
                />
                <Tooltip />
                <Legend />
                <Bar dataKey="nativeAPY" name="Native APY" fill="#10B981" />
                <Bar dataKey="rewardsAPR" name="Rewards APR" fill="#F59E0B" />
                <Bar dataKey="totalAPY" name="Total APY" fill="#EF4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-bold mb-4 text-gray-800">
            Interest Earned
          </h2>
          <div className="h-72 bg-white p-4 rounded shadow">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={positionData}
                margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis
                  yAxisId="left"
                  orientation="left"
                  label={{
                    value: "Position (USD)",
                    angle: -90,
                    position: "insideLeft",
                  }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  label={{
                    value: "Interest (USD)",
                    angle: 90,
                    position: "insideRight",
                  }}
                />
                <Tooltip />
                <Legend />
                <Bar
                  yAxisId="left"
                  dataKey="position"
                  name="Position Value"
                  fill="#3B82F6"
                  opacity={0.7}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="interestEarned"
                  name="Interest Earned"
                  stroke="#EF4444"
                  strokeWidth={3}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-bold mb-4 text-gray-800">Period Details</h2>
        <div className="bg-white rounded shadow overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-gray-100 border-b">
                <th className="py-3 px-4 text-left font-semibold">Period</th>
                <th className="py-3 px-4 text-left font-semibold">
                  Date Range
                </th>
                <th className="py-3 px-4 text-left font-semibold">Duration</th>
                <th className="py-3 px-4 text-right font-semibold">Position</th>
                <th className="py-3 px-4 text-right font-semibold">
                  Interest Earned
                </th>
                <th className="py-3 px-4 text-right font-semibold">
                  Native APY
                </th>
                <th className="py-3 px-4 text-right font-semibold">
                  Rewards APR
                </th>
                <th className="py-3 px-4 text-right font-semibold">
                  Total APY
                </th>
              </tr>
            </thead>
            <tbody>
              {periods.map((period, index) => (
                <tr
                  key={index}
                  className={index % 2 === 0 ? "bg-gray-50" : "bg-white"}
                >
                  <td className="py-3 px-4 border-b">{`#${period.number} (${period.type})`}</td>
                  <td className="py-3 px-4 border-b">{period.displayDate}</td>
                  <td className="py-3 px-4 border-b">{`${period.duration.toFixed(
                    2
                  )} days`}</td>
                  <td className="py-3 px-4 text-right border-b">
                    {formatCurrency(period.position)}
                  </td>
                  <td className="py-3 px-4 text-right border-b">
                    {formatCurrency(period.interestEarned)}
                  </td>
                  <td className="py-3 px-4 text-right border-b">
                    {formatPercentage(period.nativeAPY)}
                  </td>
                  <td className="py-3 px-4 text-right border-b">
                    {formatPercentage(period.rewardsAPR)}
                  </td>
                  <td className="py-3 px-4 text-right border-b">
                    {formatPercentage(period.totalAPY)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-100 font-semibold">
                <td className="py-3 px-4" colSpan="4">
                  Overall Metrics
                </td>
                <td className="py-3 px-4 text-right">
                  {formatCurrency(overallMetrics.totalInterestEarned)}
                </td>
                <td className="py-3 px-4 text-right">
                  {formatPercentage(overallMetrics.overallNativeAPY)}
                </td>
                <td className="py-3 px-4 text-right">
                  {formatPercentage(overallMetrics.overallRewardsAPR)}
                </td>
                <td className="py-3 px-4 text-right">
                  {formatPercentage(overallMetrics.overallTotalAPY)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

export default MorphoVaultVisualization;
