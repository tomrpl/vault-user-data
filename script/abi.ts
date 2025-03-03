import { parseAbi, parseAbiItem } from "viem";

// Define common contract ABI once for reuse
export const VAULT_ABI = parseAbi([
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function asset() view returns (address)",
]);

export const ERC20_ABI = parseAbi(["function decimals() view returns (uint8)"]);

// Event signatures for ERC4626
export const DEPOSIT_EVENT = parseAbiItem(
  "event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)"
);

export const WITHDRAW_EVENT = parseAbiItem(
  "event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)"
);
