import { parseSearchQuery } from '../search-query';

const finds = (query: string, ...fields: Array<string | null | undefined>) => parseSearchQuery(query).matches(...fields);

describe('parseSearchQuery', () => {
  test('a query with no words is blank and matches anything', () => {
    for (const query of ['', '   ', '　', ' ・ ']) {
      const search = parseSearchQuery(query);
      expect(search.blank).toBe(true);
      expect(search.matches('任意')).toBe(true);
    }
    expect(parseSearchQuery(' 牛乳 ').blank).toBe(false);
  });

  test('full-width and half-width Latin letters and digits are the same', () => {
    expect(finds('ＡＢＣ', 'abc 计划')).toBe(true);
    expect(finds('abc', 'ＡＢＣ计划')).toBe(true);
    expect(finds('１２３', '房间 123')).toBe(true);
    expect(finds('123', '房间１２３')).toBe(true);
  });

  test('half-width katakana, voiced marks included, matches full-width katakana', () => {
    expect(finds('ｶﾞｽ代', 'ガス代の支払い')).toBe(true);
    expect(finds('ガス代', 'ｶﾞｽ代の支払い')).toBe(true);
    expect(finds('ﾊﾟﾝ', 'パン屋')).toBe(true);
  });

  test('hiragana and katakana are the same', () => {
    expect(finds('みるく', 'ミルクを買う')).toBe(true);
    expect(finds('ミルク', 'みるくを買う')).toBe(true);
    expect(finds('こーひー', 'ｺｰﾋｰ豆')).toBe(true);
  });

  test('letter case does not matter, in either width', () => {
    expect(finds('wi-fi', 'Wi-Fi 密码')).toBe(true);
    expect(finds('WI-FI', 'wi-fi 密码')).toBe(true);
    expect(finds('ｗｉ－ｆｉ', 'Wi-Fi 密码')).toBe(true);
  });

  test('spaces in either the query or the text do not matter', () => {
    expect(finds('買い物 リスト', '買い物リスト')).toBe(true);
    expect(finds('買い物リスト', '買い物 リスト')).toBe(true);
    expect(finds('買い物リスト', '買い物　リスト')).toBe(true);
    expect(finds('wifi', 'Wi Fi')).toBe(true);
    expect(finds('采购清单', '采购 清单')).toBe(true);
  });

  test('middle dots join words the way spaces do', () => {
    expect(finds('コーヒーメーカー', 'コーヒー・メーカー')).toBe(true);
    expect(finds('コーヒー・メーカー', 'コーヒーメーカー')).toBe(true);
    expect(finds('ｺｰﾋｰ･ﾒｰｶｰ', 'コーヒーメーカー')).toBe(true);
    expect(finds('达芬奇', '达·芬奇')).toBe(true);
  });

  test('every word of the query has to appear, in any order', () => {
    expect(finds('牛乳 買い物', '牛乳を買い物')).toBe(true);
    expect(finds('買い物 牛乳', '牛乳を買い物')).toBe(true);
    expect(finds('牛乳 パン', '牛乳を買い物')).toBe(false);
  });

  test('the words may be spread across fields, but never across a field boundary', () => {
    expect(finds('牛乳 超市', '买牛乳', '去超市')).toBe(true);
    expect(finds('ab', 'xa', 'by')).toBe(false);
  });

  test('missing fields match nothing', () => {
    expect(finds('牛乳', null, undefined)).toBe(false);
    expect(finds('牛乳')).toBe(false);
  });

  test('dashes and wave dashes typed on different keyboards are the same', () => {
    expect(finds('1-2', '1−2 号室')).toBe(true);
    expect(finds('1−2', '1-2 号室')).toBe(true);
    expect(finds('10〜12', '10～12時')).toBe(true);
    expect(finds('10～12', '10〜12時')).toBe(true);
  });

  test('a decomposed accent matches the precomposed one', () => {
    expect(finds('café', 'café 计划')).toBe(true);
  });

  test('characters that only look alike in one script stay different', () => {
    expect(finds('ば', 'はし')).toBe(false);
    expect(finds('つ', 'まって')).toBe(false);
    expect(finds('ー', '1-2')).toBe(false);
  });
});

describe('SearchQuery.locate', () => {
  /** The written text a query found, so each case reads as what a person would see marked. */
  const marked = (query: string, text: string) => {
    const range = parseSearchQuery(query).locate(text);
    return range === null ? null : text.slice(range.start, range.end);
  };

  test('finds the words where they are written, or nowhere', () => {
    expect(parseSearchQuery('钥匙').locate('门口抽屉里有钥匙')).toEqual({ start: 6, end: 8 });
    expect(marked('钥匙', '没有')).toBeNull();
    expect(marked('', '任意')).toBeNull();
    expect(marked('钥匙', '')).toBeNull();
  });

  test('marks full-width and half-width forms as they are written', () => {
    expect(marked('wifi', '密码在 ＷｉＦｉ 背面')).toBe('ＷｉＦｉ');
    expect(marked('ＡＢＣ', 'xx abc yy')).toBe('abc');
    expect(marked('ガス', '払う ｶﾞｽ代')).toBe('ｶﾞｽ');
    expect(marked('ｶﾞｽ', '払う ガス代')).toBe('ガス');
  });

  test('marks hiragana for katakana and the reverse', () => {
    expect(marked('みるく', '帰りにミルクを買う')).toBe('ミルク');
    expect(marked('ミルク', '帰りにみるくを買う')).toBe('みるく');
  });

  test('a match across a space includes the space as written', () => {
    expect(marked('買い物リスト', 'メモ：買い物 リスト')).toBe('買い物 リスト');
    expect(marked('買い物 リスト', '今週の買い物リスト')).toBe('買い物');
  });

  test('a character NFKC changes the length of is marked whole', () => {
    expect(parseSearchQuery('株式').locate('ABC㍿です')).toEqual({ start: 3, end: 4 });
    expect(marked('会社', 'ABC㍿')).toBe('㍿');
    expect(marked('株式会社です', 'ABC㍿です')).toBe('㍿です');
    expect(marked('kg', '买 5㎏ 大米')).toBe('㎏');
  });

  test('a combining accent stays with its letter', () => {
    const decomposed = 'cafe\u0301 计划';
    expect(marked('café', decomposed)).toBe('cafe\u0301');
    expect(marked('f\u00e9', decomposed)).toBe('fe\u0301');
    // As in `matches`, the accented letter is one letter, not e followed by an accent.
    expect(marked('e', decomposed)).toBeNull();
  });

  test('the earliest of several words is the one marked', () => {
    expect(marked('牛乳 パン', 'パンと牛乳')).toBe('パン');
    expect(marked('牛乳 パン', '牛乳だけ')).toBe('牛乳');
  });

  test('characters outside the basic plane are kept whole', () => {
    expect(marked('𠮷野', '𠮷野家の牛丼')).toBe('𠮷野');
  });
});
