import { render } from '@testing-library/react-native';
import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { MarkdownBody } from '../markdown-body';
import { markdownExcerpt, noteTitle, parseMarkdown, safeLink, setChecklistItem } from '../markdown';

const groceries = '## 菜场\n\n- [x] 排骨 两斤\n- [ ] 西红柿 6 个\n- [ ] 鸡蛋 **一盒**\n\n> 周日上午去';

test('links reject active protocols', () => {
  expect(safeLink('javascript:alert(1)')).toBe(false);
  expect(safeLink('file:///etc/passwd')).toBe(false);
  expect(safeLink('https://example.com')).toBe(true);
});

test('rendering exposes headings and table semantics while HTML remains text', async () => {
  const view = await render(<MuchakuchaThemeProvider><MarkdownBody source={'# 学习 **日语**\n\n[资料](https://example.com)\n\n| 词语 | 意思 |\n| --- | --- |\n| 猫 | cat |\n\n<script>alert(1)</script>'} /></MuchakuchaThemeProvider>);
  expect(view.getByRole('header')).toBeTruthy();
  expect(view.getByRole('link')).toBeTruthy();
  expect(view.getAllByRole('columnheader')).toHaveLength(2);
  expect(view.getByText('<script>alert(1)</script>')).toBeTruthy();
});

describe('noteTitle', () => {
  test('uses the title line, trimmed, when it has text', () => {
    expect(noteTitle('  周末采购 ', groceries)).toBe('周末采购');
  });

  test('falls back to the first line of the body that has text, without Markdown', () => {
    expect(noteTitle('', groceries)).toBe('菜场');
    expect(noteTitle(' ', '\n\n- [ ] **牛奶** 两盒\n- [ ] 面包')).toBe('牛奶 两盒');
    expect(noteTitle('', '访客网络：guest\n密码在路由器背面')).toBe('访客网络：guest');
    expect(noteTitle('', '```\nwifi = "guest"\n```')).toBe('wifi = "guest"');
  });

  test('is null when the title and the body are both empty', () => {
    expect(noteTitle('', '')).toBeNull();
    expect(noteTitle(' \n', '\n\n   \n- [ ] ')).toBeNull();
  });

  test('stays within the 200 characters the API accepts', () => {
    expect(noteTitle('', '长'.repeat(300))).toHaveLength(200);
    expect(noteTitle('标'.repeat(250), '')).toHaveLength(200);
    // A pair of UTF-16 units is never split at the limit.
    expect(noteTitle(`${'a'.repeat(199)}😀`, '')).toBe('a'.repeat(199));
  });
});

describe('setChecklistItem', () => {
  test('ticks and unticks the indexed item and changes nothing else', () => {
    expect(setChecklistItem(groceries, { index: 1, text: '西红柿 6 个', checked: true })).toBe(groceries.replace('- [ ] 西红柿', '- [x] 西红柿'));
    expect(setChecklistItem(groceries, { index: 0, text: '排骨 两斤', checked: false })).toBe(groceries.replace('- [x] 排骨', '- [ ] 排骨'));
  });

  test('compares the text a person reads, not its Markdown', () => {
    expect(setChecklistItem(groceries, { index: 2, text: '鸡蛋 一盒', checked: true })).toContain('- [x] 鸡蛋 **一盒**');
  });

  test('leaves an already matching item as it is', () => {
    expect(setChecklistItem(groceries, { index: 0, text: '排骨 两斤', checked: true })).toBe(groceries);
  });

  test('refuses when the item text has changed', () => {
    const edited = groceries.replace('西红柿 6 个', '西红柿 8 个');
    expect(setChecklistItem(edited, { index: 1, text: '西红柿 6 个', checked: true })).toBeNull();
  });

  test('refuses when the item was deleted, even if another item moved into its place', () => {
    const removed = groceries.replace('- [ ] 西红柿 6 个\n', '');
    expect(setChecklistItem(removed, { index: 1, text: '西红柿 6 个', checked: true })).toBeNull();
    expect(setChecklistItem(removed, { index: 5, text: '西红柿 6 个', checked: true })).toBeNull();
  });

  test('counts nested items in document order', () => {
    const nested = '- [ ] 行李\n  - [ ] 充电器\n  - [x] 护照\n- [ ] 门票';
    expect(setChecklistItem(nested, { index: 1, text: '充电器', checked: true })).toBe('- [ ] 行李\n  - [x] 充电器\n  - [x] 护照\n- [ ] 门票');
    expect(setChecklistItem(nested, { index: 3, text: '门票', checked: true })).toBe('- [ ] 行李\n  - [ ] 充电器\n  - [x] 护照\n- [x] 门票');
  });

  test('finds items inside a quote', () => {
    const quoted = '提醒：\n\n> - [ ] 交水费\n> - [ ] 交电费';
    expect(setChecklistItem(quoted, { index: 1, text: '交电费', checked: true })).toBe('提醒：\n\n> - [ ] 交水费\n> - [x] 交电费');
  });

  test('does not count brackets in a mixed or ordered list as checklist items', () => {
    const mixed = '- 甲\n- [ ] 乙\n\n1. [ ] 丙\n\n- [ ] 丁';
    expect(setChecklistItem(mixed, { index: 0, text: '丁', checked: true })).toBe('- 甲\n- [ ] 乙\n\n1. [ ] 丙\n\n- [x] 丁');
    expect(setChecklistItem(mixed, { index: 0, text: '乙', checked: true })).toBeNull();
  });

  test('keeps an escaped bracket as text', () => {
    expect(setChecklistItem('- \\[ \\] 不是方框', { index: 0, text: '[ ] 不是方框', checked: true })).toBeNull();
  });
});

describe('checklists when reading', () => {
  test('excerpts read the item text without its box', () => {
    expect(markdownExcerpt('- [x] 排骨\n- [ ] 小葱')).toBe('排骨 小葱');
  });

  test('only a bullet list whose every item has a box is a checklist', () => {
    const types = (source: string) => parseMarkdown(source).map(node => node.token.attrGet('data-type'));
    expect(types('- [ ] 甲\n- [x] 乙')).toEqual(['taskList']);
    expect(types('- [ ]\n- [ ] 乙')).toEqual(['taskList']);
    expect(types('- 甲\n- [ ] 乙')).toEqual([null]);
    expect(types('1. [ ] 甲')).toEqual([null]);
  });

  test('assistant replies show checklist items as boxes that cannot be ticked', async () => {
    const view = await render(<MuchakuchaThemeProvider><MarkdownBody source={'- [x] 排骨 两斤\n- [ ] 西红柿'} chat /></MuchakuchaThemeProvider>);
    const boxes = view.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    expect(view.getByRole('checkbox', { name: '排骨 两斤', checked: true, disabled: true })).toBeTruthy();
    expect(view.getByRole('checkbox', { name: '西红柿', checked: false })).toBeTruthy();
    expect(view.getByText('西红柿')).toBeTruthy();
    expect(view.queryByText(/\[ \]|\[x\]/)).toBeNull();
  });
});
