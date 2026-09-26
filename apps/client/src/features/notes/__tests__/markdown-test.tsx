import { render } from '@testing-library/react-native';
import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { MarkdownBody } from '../markdown-body';
import { headingLevel, insertLink, insertTable, markdownExcerpt, parseMarkdown, safeLink, setHeading, toggleBold } from '../markdown';

test('bold wraps and unwraps the same selection without losing surrounding text', () => {
  const result = toggleBold('你好世界！', { start: 2, end: 4 });
  expect(result.value).toBe('你好**世界**！');
  expect(toggleBold(result.value, result.selection).value).toBe('你好世界！');
  expect(toggleBold('', { start: 0, end: 0 }).selection).toEqual({ start: 2, end: 2 });
});
test('heading replaces only the current line and supports returning to body', () => {
  for (let level = 1; level <= 6; level++) {
    const edit = setHeading('开头\n## 章节\n结尾', { start: 7, end: 7 }, level);
    expect(edit.value).toBe(`开头\n${'#'.repeat(level)} 章节\n结尾`);
    expect(headingLevel(edit.value, edit.selection)).toBe(level);
    expect(setHeading(edit.value, edit.selection, 0).value).toBe('开头\n章节\n结尾');
  }
});
test('links escape labels, preserve URL parentheses and reject active protocols', () => {
  const edit = insertLink('', { start: 0, end: 0 }, '[资料]', 'https://example.com/a(b)');
  expect(markdownExcerpt(edit.value)).toBe('[资料]');
  expect(safeLink('javascript:alert(1)')).toBe(false);
  expect(safeLink('file:///etc/passwd')).toBe(false);
  expect(safeLink('https://example.com')).toBe(true);
});
test('inserted table parses as a table and places selection on the first header', () => {
  const result = insertTable('段落', { start: 2, end: 2 }, 3, 2);
  expect(result.value.slice(result.selection.start, result.selection.end)).toBe('列 1');
  expect(parseMarkdown(result.value).map(n => n.token.type)).toContain('table_open');
  expect(markdownExcerpt(result.value)).toContain('段落 列 1 列 2 列 3');
});
test('rendering exposes headings and table semantics while HTML remains text', async () => {
  const view = await render(<MuchakuchaThemeProvider><MarkdownBody source={'# 学习 **日语**\n\n[资料](https://example.com)\n\n| 词语 | 意思 |\n| --- | --- |\n| 猫 | cat |\n\n<script>alert(1)</script>'} /></MuchakuchaThemeProvider>);
  expect(view.getByRole('header')).toBeTruthy();
  expect(view.getByRole('link')).toBeTruthy();
  expect(view.getAllByRole('columnheader')).toHaveLength(2);
  expect(view.getByText('<script>alert(1)</script>')).toBeTruthy();
});
