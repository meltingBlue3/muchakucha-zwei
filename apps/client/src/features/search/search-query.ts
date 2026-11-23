/**
 * Katakana with a hiragana counterpart, ヽヾ included. ヷ–ヺ have none and stay
 * as they are; the prolonged sound mark ー is shared by both scripts.
 */
const KATAKANA = /[ァ-ヶヽヾ]/g;
/** The hiragana block sits 0x60 code points below the katakana block. */
const KANA_OFFSET = 0x60;
/**
 * Dashes that keyboards and IMEs produce for one key: hyphen, figure dash,
 * en and em dash, horizontal bar, and the minus sign a Japanese IME types for
 * a full-width hyphen. NFKC has already turned the full-width and small forms
 * into one of these or into `-`.
 */
const DASHES = /[‐-―−]/g;
/** 〜 (macOS and iOS) and ～ (Windows, `~` after NFKC) are the same key to a Japanese typist. */
const WAVE_DASH = /〜/g;
/**
 * What separates words without being part of them: any whitespace, the
 * ideographic space included, and the middle dots of コーヒー・メーカー and
 * 达·芬奇. Half-width ･ is ・ after NFKC.
 */
const SEPARATORS = /[\s·・]+/u;

/**
 * Folds text so the forms people type interchangeably compare equal: NFKC
 * joins full-width and half-width forms (ＡＢＣ and ABC, １２ and 12, ｶﾞ and
 * ガ) and composed and decomposed accents; then letter case, katakana and
 * hiragana, and dash variants are made one.
 */
function fold(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(KATAKANA, kana => String.fromCharCode(kana.charCodeAt(0) - KANA_OFFSET))
    .replace(DASHES, '-')
    .replace(WAVE_DASH, '~');
}

export interface SearchQuery {
  /** True when the query holds no word, so everything should show. */
  readonly blank: boolean;
  /**
   * Whether every word of the query appears in one of the fields. A blank
   * query matches anything; a missing field matches nothing.
   */
  matches(...fields: ReadonlyArray<string | null | undefined>): boolean;
}

/**
 * Reads what was typed into a search box. The query and each field are
 * folded the same way, so a match does not depend on full-width or
 * half-width forms, letter case, hiragana or katakana, which dash was typed,
 * or where the spaces are: 買い物 リスト finds 買い物リスト and the reverse.
 * Several words each have to appear, in any order and possibly in different
 * fields, so `牛乳 買い物` finds 牛乳を買い物.
 */
export function parseSearchQuery(query: string): SearchQuery {
  const words = fold(query).split(SEPARATORS).filter(word => word !== '');
  return {
    blank: words.length === 0,
    matches(...fields) {
      if (words.length === 0) return true;
      const texts = fields.flatMap(field => (field ? [fold(field).split(SEPARATORS).join('')] : []));
      return words.every(word => texts.some(text => text.includes(word)));
    },
  };
}
