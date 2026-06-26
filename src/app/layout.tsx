import type { Metadata } from "next";
import { Geist, Geist_Mono, Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/lib/WalletContext";
import TxToast from "@/components/TxToast";
import MuiProvider from "@/components/MuiProvider";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Display grotesk — the precise, friendly "passbook" voice for headlines.
const hanken = Hanken_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "CryptoLend — Borrow MYR Against Crypto",
  description: "Decentralized crypto lending protocol — borrow Malaysian Ringgit against ETH collateral on Hardhat testnet.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${hanken.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <MuiProvider>
          <WalletProvider>
            {children}
            <TxToast />
          </WalletProvider>
        </MuiProvider>
      </body>
    </html>
  );
}
