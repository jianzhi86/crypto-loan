/**
 * Server-side read-only contract calls.
 * Uses JsonRpcProvider (no wallet, no browser) so this can run in Server Components.
 * Never throws — returns null on any failure so pages degrade gracefully.
 */

import { ethers } from 'ethers';
import { CONTRACT_ADDRESSES, CRYPTO_LOAN_ABI, HARDHAT_RPC_URL } from './contractConfig';

export type ChainStats = {
  aprBps:            number;   // currentAprBps — live ETH borrow APR
  baseRateBps:       number;   // base rate before vol premium
  ethPriceMYR:       number;   // on-chain ETH price in MYR (whole MYR units)
  totalBorrowedMYR:  number;   // totalBorrowed / 1e6
  totalCollateralETH:number;   // totalCollateral / 1e18
  protocolFeesMYR:   number;   // protocolFees / 1e6
  paused:            boolean;
};

export async function readChainStats(): Promise<ChainStats | null> {
  try {
    const provider = new ethers.JsonRpcProvider(HARDHAT_RPC_URL);
    const loan = new ethers.Contract(CONTRACT_ADDRESSES.CryptoLoan, CRYPTO_LOAN_ABI, provider);

    const [aprBps, baseRateBps, ethPrice, stats, paused] = await Promise.all([
      loan.currentAprBps()    as Promise<bigint>,
      loan.baseRateBps()      as Promise<bigint>,
      loan.ethPrice()         as Promise<bigint>,
      loan.getProtocolStats() as Promise<[bigint, bigint, bigint, bigint, bigint]>,
      loan.paused()           as Promise<boolean>,
    ]);

    return {
      aprBps:             Number(aprBps),
      baseRateBps:        Number(baseRateBps),
      ethPriceMYR:        Number(ethPrice),
      totalBorrowedMYR:   Number(stats[0]) / 1e6,
      totalCollateralETH: Number(stats[1]) / 1e18,
      protocolFeesMYR:    Number(stats[2]) / 1e6,
      paused,
    };
  } catch {
    return null;
  }
}
