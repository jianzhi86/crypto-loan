import type { Metadata } from "next";
import { Geist, Geist_Mono, Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/lib/WalletContext";
import { FeatureProvider } from "@/lib/FeatureContext";
import { AuthProvider } from "@/lib/AuthContext";
import { ViewerProvider } from "@/lib/ViewerContext";
import TxToast from "@/components/TxToast";
import MuiProvider from "@/components/MuiProvider";
import SmoothScrollProvider from "@/components/SmoothScrollProvider";
import MaintenanceDialog from "@/components/MaintenanceDialog";
import SiteMaintenanceGate from "@/components/SiteMaintenanceGate";
import { headers } from "next/headers";
import { getFlags } from "@/lib/features-server";
import { getSessionUser } from "@/lib/authz";
import { flagMessage, ON } from "@/lib/features";
import { PATHNAME_HEADER, isMaintenanceExempt } from "@/lib/maintenance";

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

/**
 * Every page is rendered per-request.
 *
 * This layout reads the feature flags, and prerendering would freeze whatever
 * they happened to be at build time — an admin switching a page to maintenance
 * would then have no effect on it until the next deploy. Correct toggles matter
 * more here than statically serving a handful of pages.
 */
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read flags on the server so the very first paint already reflects them.
  // Without this the sidebar would briefly render items that are switched off.
  const flags = await getFlags();

  // Site-wide maintenance pauses the product, not the whole origin. Sign-in and
  // the landing page stay reachable — otherwise an admin who is signed out
  // cannot authenticate, and so cannot switch maintenance back off. Admins are
  // waved through everywhere so they can verify a fix before lifting it.
  const maintenance = (flags['site.maintenance']?.state ?? ON) !== ON;
  const pathname = (await headers()).get(PATHNAME_HEADER) ?? '';
  const exempt = isMaintenanceExempt(pathname);

  // Resolving the viewer needs a database read, which can fail — a connection
  // pool exhausted by the pooler's client limit is enough. Treat "could not
  // determine who this is" as "do not put a maintenance wall in front of them":
  // failing closed here would slam the door on an admin because of an unrelated
  // DB blip, and maintenance is a UX gate, not a security boundary. Real access
  // control (proxy.ts, the admin layout, and every API route) is enforced
  // separately and still applies.
  //
  // Resolved on every request, not just the ones about to be walled: the whole
  // tree reads admin-ness from this one answer now (see ViewerContext), so it
  // has to exist even on exempt pages like /admin and /explorer — those are
  // precisely where an admin looks at the sidebar while maintenance is on. The
  // layout already awaits getFlags() per request, so this is a second read on a
  // path that was never static.
  let viewer = null;
  let lookupFailed = false;
  try {
    viewer = await getSessionUser();
  } catch (err) {
    console.error('[layout] session lookup failed; skipping maintenance gate', err);
    lookupFailed = true;
  }
  const blocked = maintenance && !exempt && !lookupFailed && !viewer?.isAdmin;

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${hanken.variable}`} suppressHydrationWarning data-scroll-behavior="smooth">
      <body suppressHydrationWarning>
        <MuiProvider>
          <FeatureProvider initialFlags={flags}>
            {/* The server's answer on who this is, handed down so nothing has to
                guess it from the client. Admin-ness in particular is never
                re-derived from a browser fetch again — see ViewerContext. */}
            <ViewerProvider value={{ isAdmin: !!viewer?.isAdmin, isAuthenticated: !!viewer, resolved: !lookupFailed }}>
            {/* One session lookup for the whole tree — see AuthContext. It is
                seeded with the same viewer, so the first paint is already right
                and only a real change (a logout) can move it. */}
            <AuthProvider initialUser={lookupFailed ? undefined : viewer}>
            <WalletProvider>
              <SmoothScrollProvider>
                {children}
              </SmoothScrollProvider>
              {/* The page still renders when paused — the popup covers it and
                  blurs it, rather than replacing it. Deciding here keeps the
                  first paint correct with no flash and no JavaScript.

                  Exactly one of these two: the popup below is this document's
                  server-side verdict, and the gate is the live layer for
                  client-side navigations, which do not re-run this layout.
                  Rendering both would stack two identical overlays. */}
              {blocked ? (
                <MaintenanceDialog
                  message={flagMessage(flags, 'site.maintenance')}
                  // The explorer only serves public chain data, so it is offered
                  // as a way out — unless it is switched off in its own right.
                  explorerAvailable={(flags['page.explorer']?.state ?? ON) === ON}
                  signedIn={!!viewer}
                />
              ) : (
                <SiteMaintenanceGate />
              )}
              <TxToast />
            </WalletProvider>
            </AuthProvider>
            </ViewerProvider>
          </FeatureProvider>
        </MuiProvider>
      </body>
    </html>
  );
}
