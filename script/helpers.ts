/**
 * Helper function to convert BigInt timestamp to date string for API
 */
export function timestampToDateString(timestamp: bigint): string {
  const date = new Date(Number(timestamp) * 1000);
  return date.toISOString().split("T")[0];
}
