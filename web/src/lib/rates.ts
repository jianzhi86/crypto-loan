/**
 * Derive a variable borrow APR for any collateral asset.
 *
 * ethRate   — live ETH borrow APR in % (from the on-chain contract)
 * riskMul   — per-asset multiplier relative to ETH (e.g. 0.78 BTC, 1.30 ADA)
 * change24h — the asset's own 24h price change for the volatility premium
 *
 * All rates move together when the market base rate changes — nothing is frozen.
 */
export function dynamicApr(ethRate: number, riskMul: number, change24h: number) {
  const base     = ethRate * riskMul;
  const volPrem  = Math.min(1.5, Math.abs(change24h) * 0.15);
  const downPrem = change24h < 0 ? Math.min(1.0, -change24h * 0.1) : 0;
  return Math.round((base + volPrem + downPrem) * 100) / 100;
}

/**
 * Derive the supply APR from the borrow APR using a per-asset utilization ratio.
 * ratio encodes how much of the spread is passed to lenders (higher for illiquid assets).
 */
export function supplyApr(borrowApr: number, ratio: number) {
  return Math.round(borrowApr * ratio * 100) / 100;
}
