import { ethers } from 'ethers';
import { CONTRACT_ADDRESSES } from '@/lib/contractConfig';

const RPC_URL   = process.env.HARDHAT_RPC_URL ?? 'http://127.0.0.1:8545';
const LOAN_ADDR = CONTRACT_ADDRESSES.CryptoLoan;

const LOAN_ABI = [
  'function setKYC(address user, bool approved) external',
  'function kycApproved(address user) view returns (bool)',
  'function loans(address user) view returns (uint256 collateral, uint256 principal, uint256 startTime, uint256 lastRepayTime)',
];

function readContract() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  return new ethers.Contract(LOAN_ADDR, LOAN_ABI, provider);
}

/** Flip a wallet's KYC flag on the CryptoLoan contract (owner-signed). */
export async function setKycOnChain(wallet: string, approved = true): Promise<void> {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer   = new ethers.Wallet(process.env.OWNER_PRIVATE_KEY!, provider);
  const contract = new ethers.Contract(LOAN_ADDR, LOAN_ABI, signer);
  const tx = await (contract.setKYC as (u: string, a: boolean) => Promise<ethers.TransactionResponse>)(wallet, approved);
  await tx.wait();
}

/** Whether the contract currently has this wallet flagged as KYC-approved. */
export async function isKycOnChain(wallet: string): Promise<boolean> {
  const contract = readContract();
  return await (contract.kycApproved as (u: string) => Promise<boolean>)(wallet);
}

/**
 * The wallet's live position on the contract. Wallet changes are forbidden
 * while collateral is locked or a loan is outstanding — funds must not end up
 * anchored to a wallet no account owns.
 */
export async function getOnChainPosition(wallet: string): Promise<{ collateral: bigint; principal: bigint }> {
  const contract = readContract();
  const loan = await (contract.loans as (u: string) => Promise<[bigint, bigint, bigint, bigint]>)(wallet);
  return { collateral: loan[0], principal: loan[1] };
}
