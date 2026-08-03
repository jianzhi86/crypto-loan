// Display-side variable APR for the demo assets: each asset's base rate plus
// a risk premium when its market is volatile or falling — mirroring how the
// real on-chain ETH rate works (CryptoLoan.currentAprBps: base + utilization
// premium + volatility premium). The ETH row shows the contract's own rate
// when a wallet is connected; every other asset uses this formula.
export function dynamicApr(base: number, change24h: number) {
  const volPrem  = Math.min(1.5, Math.abs(change24h) * 0.15);
  const downPrem = change24h < 0 ? Math.min(1.0, -change24h * 0.1) : 0;
  return Math.round((base + volPrem + downPrem) * 100) / 100;
}
