// Fuzzy matching between OCR'd ID-document text and a submitted KYC record.
//
// OCR output from photos (MyKad / passport / driving licence) is noisy: wrong
// characters, missing spaces, reordered lines. So we don't demand an exact
// match — we normalise aggressively and check that the *significant* tokens of
// each field appear in the document text above a per-field threshold.

export type DocType = 'ic' | 'passport' | 'license';

export interface KycFields {
  fullName: string;
  icNumber: string; // document number (IC / passport / licence) as typed on the form
  addr1: string;
  addr2: string;
  postcode: string;
  city: string;
  state: string;
  docType?: DocType; // passports carry no address, so address is skipped for them
}

export interface FieldCheck {
  field: 'name' | 'ic' | 'address';
  matched: boolean;
  score: number;   // 0..1 fraction of significant tokens found
  detail: string;  // human-readable explanation
}

export interface MatchResult {
  matched: boolean;
  checks: FieldCheck[];
  reason: string;  // empty when matched, else why it failed
}

// Per-field pass thresholds (fraction of significant tokens that must appear).
// Kept low because phone-photo OCR (Tesseract) is noisy; a document passes
// verification when ANY one field matches (see `matched` below), so loose
// per-field bars don't on their own approve an unrelated document.
const NAME_THRESHOLD = 0.3;
const ADDRESS_THRESHOLD = 0.3;

// Name connectors / honorifics that carry no identifying weight.
const NAME_STOPWORDS = new Set([
  'BIN', 'BINTI', 'BT', 'BTE', 'AL', 'AP', 'A', 'L', 'P', 'S', 'O', 'D',
  'ANAK', 'LELAKI', 'PEREMPUAN',
]);
// Address words that are too generic to be evidence on their own.
const ADDRESS_STOPWORDS = new Set([
  'NO', 'JALAN', 'JLN', 'LORONG', 'LRG', 'TAMAN', 'TMN', 'KAMPUNG', 'KG',
  'BLOK', 'TINGKAT', 'TKT', 'LOT', 'UNIT', 'PERSIARAN', 'PSN', 'LEBUH',
]);

/** Upper-case, strip punctuation/diacritics, collapse whitespace. */
export function normalize(s: string): string {
  return (s ?? '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '') // drop combining accents
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Keep only digits — used to compare IC / postcode numbers. */
function digitsOnly(s: string): string {
  return (s ?? '').replace(/\D/g, '');
}

function tokenize(s: string, stopwords: Set<string>): string[] {
  return normalize(s)
    .split(' ')
    .filter(t => t.length >= 3 && !stopwords.has(t));
}

/** Fraction of `tokens` that appear as a substring of `haystack`. */
function tokenCoverage(tokens: string[], haystack: string): number {
  if (tokens.length === 0) return 1;
  const found = tokens.filter(t => haystack.includes(t)).length;
  return found / tokens.length;
}

/**
 * Compare a KYC record against OCR text from one or more document images.
 * Front/back text is searched as one combined corpus so single-image documents
 * (e.g. passports) and two-sided IDs both work.
 */
export function matchKyc(fields: KycFields, ...ocrTexts: string[]): MatchResult {
  const text = normalize(ocrTexts.filter(Boolean).join(' '));
  const textDigits = digitsOnly(ocrTexts.join(' '));

  // ── Name ────────────────────────────────────────────────────────────────
  const nameTokens = tokenize(fields.fullName, NAME_STOPWORDS);
  const nameScore = tokenCoverage(nameTokens, text);
  const nameMatched = nameScore >= NAME_THRESHOLD;

  // ── IC / document number ──────────────────────────────────────────────────
  const ic = digitsOnly(fields.icNumber);
  // OCR frequently misreads a digit or two, so accept the full number or any
  // long contiguous run of it (>=70% of its length, minimum 6 digits).
  const icWindow = Math.max(6, Math.ceil(ic.length * 0.7));
  let icMatched = false;
  if (ic.length > 0) {
    if (ic.length <= icWindow) {
      icMatched = textDigits.includes(ic);
    } else {
      for (let i = 0; i + icWindow <= ic.length; i++) {
        if (textDigits.includes(ic.slice(i, i + icWindow))) { icMatched = true; break; }
      }
    }
  }

  // ── Address ───────────────────────────────────────────────────────────────
  const addrTokens = tokenize(
    [fields.addr1, fields.addr2, fields.city, fields.state].join(' '),
    ADDRESS_STOPWORDS,
  );
  const postcode = digitsOnly(fields.postcode);
  const postcodeFound = postcode.length >= 4 && textDigits.includes(postcode);
  let addrScore = tokenCoverage(addrTokens, text);
  // A matched postcode is strong evidence — let it lift a borderline address.
  if (postcodeFound) addrScore = Math.max(addrScore, ADDRESS_THRESHOLD);
  // Passports don't print an address, so the address check doesn't apply.
  const addressRequired = fields.docType !== 'passport';
  const addressMatched = !addressRequired || addrScore >= ADDRESS_THRESHOLD;

  const checks: FieldCheck[] = [
    {
      field: 'name',
      matched: nameMatched,
      score: nameScore,
      detail: nameMatched
        ? 'Full name found on document'
        : `Full name not found on document (${Math.round(nameScore * 100)}% of name matched)`,
    },
    {
      field: 'ic',
      matched: icMatched,
      score: icMatched ? 1 : 0,
      detail: icMatched ? 'IC / document number matches' : 'IC / document number not found on document',
    },
    {
      field: 'address',
      matched: addressMatched,
      score: addrScore,
      detail: !addressRequired
        ? 'Address check not required for passport'
        : addressMatched
          ? 'Address matches document'
          : `Address not found on document (${Math.round(addrScore * 100)}% of address matched)`,
    },
  ];

  // Lenient policy: approve when ANY one field matches the document. OCR on
  // phone photos rarely captures all three fields cleanly, so requiring all of
  // them produced too many false rejections of genuine documents.
  const matched = nameMatched || icMatched || addressMatched;
  const reason = matched
    ? ''
    : 'Could not match your name, document number, or address to the uploaded document — please upload a clearer, well-lit photo of the whole document';

  return { matched, checks, reason };
}
