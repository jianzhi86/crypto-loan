/** Transaction types that get a receipt email — the ones a user thinks of as
 *  "I just did something with money," not internal/derived records. */
export const RECEIPT_TX_TYPES = ['CollateralDeposited', 'CollateralWithdrawn', 'Borrowed', 'Repaid'] as const;
export type ReceiptTxType = typeof RECEIPT_TX_TYPES[number];

const TX_META: Record<ReceiptTxType, { verb: string; noun: string; unit: 'ETH' | 'MYR' }> = {
  CollateralDeposited: { verb: 'Deposited',  noun: 'Collateral Deposit', unit: 'ETH' },
  CollateralWithdrawn: { verb: 'Withdrew',   noun: 'Collateral Withdrawal', unit: 'ETH' },
  Borrowed:            { verb: 'Borrowed',   noun: 'Loan Disbursement', unit: 'MYR' },
  Repaid:              { verb: 'Repaid',     noun: 'Loan Repayment', unit: 'MYR' },
};

function formatAmount(type: ReceiptTxType, rawAmount: string): string {
  const meta = TX_META[type];
  if (meta.unit === 'ETH') {
    // amount arrives in wei (18 decimals)
    const eth = Number(BigInt(rawAmount)) / 1e18;
    return `${eth.toFixed(4)} ETH`;
  }
  // amount arrives in MYR 1e6 units
  const myr = Number(BigInt(rawAmount)) / 1e6;
  return `RM ${myr.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function buildReceiptEmail(opts: {
  type: ReceiptTxType;
  wallet: string;
  amount: string; // raw units, see formatAmount
  txHash: string;
  blockNumber: number;
}): { subject: string; html: string } {
  const meta   = TX_META[opts.type];
  const amount = formatAmount(opts.type, opts.amount);
  const when   = new Date().toLocaleString('en-MY', { dateStyle: 'medium', timeStyle: 'short' });
  const short  = `${opts.wallet.slice(0, 6)}…${opts.wallet.slice(-4)}`;

  const subject = `${meta.noun} confirmed — ${amount}`;
  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #0B1220;">
      <h2 style="margin: 0 0 4px;">${meta.noun} confirmed</h2>
      <p style="color: #5B6572; margin: 0 0 24px;">This is your receipt for a CryptoLend transaction.</p>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 8px 0; color: #5B6572;">Amount</td><td style="padding: 8px 0; text-align: right; font-weight: 700;">${amount}</td></tr>
        <tr><td style="padding: 8px 0; color: #5B6572;">Wallet</td><td style="padding: 8px 0; text-align: right; font-family: monospace;">${short}</td></tr>
        <tr><td style="padding: 8px 0; color: #5B6572;">Date</td><td style="padding: 8px 0; text-align: right;">${when}</td></tr>
        <tr><td style="padding: 8px 0; color: #5B6572;">Block</td><td style="padding: 8px 0; text-align: right;">${opts.blockNumber}</td></tr>
        <tr><td style="padding: 8px 0; color: #5B6572;">Tx Hash</td><td style="padding: 8px 0; text-align: right; font-family: monospace; font-size: 11px; word-break: break-all;">${opts.txHash}</td></tr>
      </table>
      <p style="color: #9AA3AF; font-size: 12px; margin-top: 32px;">
        Automated receipt — CryptoLend never asks for your private key or seed phrase.
      </p>
    </div>
  `.trim();

  return { subject, html };
}
