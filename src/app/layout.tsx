import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/lib/WalletContext";
import TxToast from "@/components/TxToast";
import MuiProvider from "@/components/MuiProvider";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CryptoLend — Borrow MYR Against Crypto",
  description: "Decentralized crypto lending protocol — borrow Malaysian Ringgit against ETH collateral on Hardhat testnet.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body>
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
