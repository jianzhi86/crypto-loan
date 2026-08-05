/**
 * Server-side read-only contract calls.
 * Uses JsonRpcProvider (no wallet, no browser) so this can run in Server Components.
 * Never throws — returns null on any failure so pages degrade gracefully.
 */

import { ethers } from 'ethers';
import { CONTRACT_ADDRESSES, CRYPTO_LOAN_ABI, MOCK_MYR_ABI, HARDHAT_RPC_URL } from './contractConfig';

export type ChainStats = {
  aprBps:            number;
  baseRateBps:       number;
  supplyRateBps:     number;   // 38% of baseRateBps — paid to depositors
  ethPriceMYR:       number;
  totalBorrowedMYR:  number;
  totalCollateralETH:number;
  protocolFeesMYR:   number;
  paused:            boolean;
  /// Actual ETH sitting at the contract's address right now (provider.getBalance,
  /// not the totalCollateral bookkeeping variable) — the audit-grade "does the
  /// contract really hold what it claims to" figure for a treasury view. Should
  /// equal totalCollateralETH; a mismatch would mean stuck/stray ETH or a bug.
  contractEthBalanceETH: number;
  /// MYR total supply — every unit ever minted (borrows + purchases + supply-
  /// interest claims), i.e. the protocol's total outstanding liability in MYR.
  /// MockMYR mints straight to recipients rather than custodying funds, so
  /// this — not a token balanceOf(contract) — is the meaningful "company MYR
  /// balance" figure: what the protocol has issued and could be redeemed against.
  myrTotalSupplyMYR: number;
  /// Contract owner address — the wallet protocol fee withdrawals are sent to.
  ownerAddress: string;
};

export async function readChainStats(): Promise<ChainStats | null> {
  try {
    const provider = new ethers.JsonRpcProvider(HARDHAT_RPC_URL);
    const loan = new ethers.Contract(CONTRACT_ADDRESSES.CryptoLoan, CRYPTO_LOAN_ABI, provider);
    const myr  = new ethers.Contract(CONTRACT_ADDRESSES.MockMYR, MOCK_MYR_ABI, provider);

    const [aprBps, baseRateBps, ethPrice, stats, paused, supplyRate, contractEthBalance, myrTotalSupply, owner] = await Promise.all([
      loan.currentAprBps()       as Promise<bigint>,
      loan.baseRateBps()         as Promise<bigint>,
      loan.ethPrice()            as Promise<bigint>,
      loan.getProtocolStats()    as Promise<[bigint, bigint, bigint, bigint, bigint]>,
      loan.paused()              as Promise<boolean>,
      loan.supplyInterestRate().catch(() => BigInt(0)) as Promise<bigint>,
      provider.getBalance(CONTRACT_ADDRESSES.CryptoLoan),
      myr.totalSupply()          as Promise<bigint>,
      loan.owner()               as Promise<string>,
    ]);

    return {
      aprBps:             Number(aprBps),
      baseRateBps:        Number(baseRateBps),
      supplyRateBps:      Number(supplyRate),
      ethPriceMYR:        Number(ethPrice),
      totalBorrowedMYR:   Number(stats[0]) / 1e6,
      totalCollateralETH: Number(stats[1]) / 1e18,
      protocolFeesMYR:    Number(stats[2]) / 1e6,
      paused,
      contractEthBalanceETH: Number(ethers.formatEther(contractEthBalance)),
      myrTotalSupplyMYR:  Number(myrTotalSupply) / 1e6,
      ownerAddress:       owner,
    };
  } catch {
    return null;
  }
}
