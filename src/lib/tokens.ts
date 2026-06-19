// ─────────────────────────────────────────────────────────────────────────────
// CryptoLend visual identity — "Passbook" light neobank palette.
//
// A calm, trustworthy LIGHT surface (deliberately contrarian for crypto, which
// defaults to dark). Indigo is the single brand accent. Green = up / gain and
// red = down / loss are RESERVED status semantics — never used as brand accent —
// so figures read like a bank statement at a glance.
// ─────────────────────────────────────────────────────────────────────────────
export const PALETTE = {
  // Surfaces — cool paper, white cards
  bg:       '#F4F6F8',
  surface:  '#FFFFFF', // cards
  raised:   '#EEF1F5', // inset panels / hover
  raisedHi: '#E7EBF1',

  // Lines — the passbook ruling
  line:     '#E2E7EE', // hairline borders
  rule:     '#D7DEE6', // stronger ruled ledger lines

  // Brand — ringgit indigo
  indigo:   '#2A3FD6',
  indigoHi: '#4458E8',
  indigoDeep:'#1E2FA8',

  // Status — reserved, never brand
  up:       '#0E9F6E', // gain / positive / safe
  down:     '#E5484D', // loss / risk / liquidation
  amber:    '#C77700', // caution (e.g. moderate health)

  // Text — ink on paper
  text:     '#10151C', // ink
  textDim:  '#5A6675', // slate
  textMute: '#8B96A5',
} as const;

export type Palette = typeof PALETTE;
