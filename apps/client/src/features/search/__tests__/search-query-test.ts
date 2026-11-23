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
