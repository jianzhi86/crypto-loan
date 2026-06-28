import { ethers } from 'ethers';
import { CONTRACT_ADDRESSES } from '@/lib/contractConfig';

const RPC_URL     = process.env.HARDHAT_RPC_URL ?? 'http://127.0.0.1:8545';
const LOAN_ADDR   = CONTRACT_ADDRESSES.CryptoLoan;
const SET_KYC_ABI = ['function setKYC(address user, bool approved) external'];

/** Flip a wallet's KYC flag on the CryptoLoan contract (owner-signed). */
export async function setKycOnChain(wallet: string, approved = true): Promise<void> {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer   = new ethers.Wallet(process.env.OWNER_PRIVATE_KEY!, provider);
  const contract = new ethers.Contract(LOAN_ADDR, SET_KYC_ABI, signer);
  const tx = await (contract.setKYC as (u: string, a: boolean) => Promise<ethers.TransactionResponse>)(wallet, approved);
  await tx.wait();
}
