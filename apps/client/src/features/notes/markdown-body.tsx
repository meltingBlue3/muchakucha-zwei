import { useMemo, useState, type ReactNode } from 'react';
import { Linking, ScrollView, View, Text as NativeText, type TextStyle } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type Token from 'markdown-it/lib/token.mjs';
import { Stack, Text } from '../../ui/primitives';
import type { Theme } from '../../ui/theme';
import { parseMarkdown, safeLink, type MarkdownNode } from './markdown';

export function MarkdownBody({ source, tableLabel = '笔记表格，可横向滚动', headingOffset = 0 }: { source: string; tableLabel?: string; headingOffset?: number }) {
  const theme = useTheme<Theme>();
  const nodes = useMemo(() => parseMarkdown(source), [source]);
  const [linkError, setLinkError] = useState(false);
  const inline = (tokens: Token[]): ReactNode[] => {
    let index = 0;
    const walk = (): ReactNode[] => {
      const result: ReactNode[] = [];
      while (index < tokens.length) {
        const token = tokens[index++]!;
        if (token.nesting === -1) break;
        const key = index;
        const children = token.nesting === 1 ? walk() : token.content;
        const href = token.attrGet('href');
        const style: TextStyle = token.type === 'strong_open' ? { fontWeight: '700' }
          : token.type === 'em_open' ? { fontStyle: 'italic' }
          : token.type === 's_open' ? { textDecorationLine: 'line-through' }
          : token.type === 'code_inline' ? { backgroundColor: theme.colors.surfaceMuted } : {};
        if (token.type === 'softbreak' || token.type === 'hardbreak') result.push('\n');
        else if (token.type === 'link_open' && href && safeLink(href)) result.push(
          <NativeText key={key} accessibilityRole="link" style={{ color: theme.colors.link, textDecorationLine: 'underline' }} onPress={() => { setLinkError(false); void Linking.openURL(href).catch(() => setLinkError(true)); }}>{children}</NativeText>,
        );
        // Use inherited typography so inline runs do not shrink headings.
        else result.push(<NativeText key={key} style={style}>{children}</NativeText>);
      }
      return result;
    };
    return walk();
  };
  const render = (items: MarkdownNode[]): ReactNode[] => items.map(({ token, children }, index) => {
    if (token.type === 'inline') return <Text key={index} selectable>{inline(token.children ?? [])}</Text>;
    if (token.type === 'heading_open') {
      const level = Number(token.tag.slice(1));
      const typography = level === 1 ? theme.typography.heading : level === 2 ? theme.typography.section : level === 3 ? theme.typography.body : level === 4 ? theme.typography.label : theme.typography.bodySm;
      return <Text key={index} selectable accessibilityRole="header" aria-level={Math.min(6, level + headingOffset)} style={{ ...typography, fontWeight: level >= 5 ? '600' : '700', marginTop: theme.spacing[level <= 2 ? 4 : 2], ...(level === 6 ? { color: theme.colors.inkMuted } : {}) }}>{inline(children[0]?.token.children ?? [])}</Text>;
    }
    if (token.type === 'table_open') return <ScrollView key={index} tabIndex={0} horizontal accessibilityLabel={tableLabel} style={{ maxWidth: '100%' }}><View role="table">{render(children)}</View></ScrollView>;
    if (token.type === 'tr_open') return <View key={index} role="row" style={{ flexDirection: 'row' }}>{render(children)}</View>;
    if (token.type === 'th_open' || token.type === 'td_open') {
      const align = token.attrGet('style')?.split(':')[1];
      return <View key={index} accessible role={token.type === 'th_open' ? 'columnheader' : 'cell'} style={{ width: theme.spacing[16] * 3, padding: theme.spacing[3], borderWidth: theme.borderWidths.default, borderColor: theme.colors.separator, backgroundColor: token.type === 'th_open' ? theme.colors.surfaceMuted : theme.colors.surface }}><Text selectable style={{ fontWeight: token.type === 'th_open' ? '700' : '400', textAlign: align === 'center' || align === 'right' ? align : 'left' }}>{inline(children[0]?.token.children ?? [])}</Text></View>;
    }
    if (token.type === 'hr') return <View key={index} style={{ borderTopWidth: theme.borderWidths.default, borderTopColor: theme.colors.separator }} />;
    if (token.type === 'fence' || token.type === 'code_block') return <ScrollView key={index} tabIndex={0} horizontal><Text selectable style={{ backgroundColor: theme.colors.surfaceMuted, padding: theme.spacing[3] }}>{token.content}</Text></ScrollView>;
    if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') return <Stack key={index} gap={2}>{children.map((child, i) => <View key={i} style={{ flexDirection: 'row', gap: theme.spacing[2] }}><Text>{token.type === 'bullet_list_open' ? '•' : `${Number(token.attrGet('start') ?? 1) + i}.`}</Text><View style={{ flex: 1 }}>{render(child.children)}</View></View>)}</Stack>;
    return <View key={index} style={token.type === 'blockquote_open' ? { borderLeftWidth: theme.borderWidths.focus, borderLeftColor: theme.colors.teal, paddingLeft: theme.spacing[3] } : undefined}>{children.length ? render(children) : <Text selectable>{token.content}</Text>}</View>;
  });
  return <Stack gap={3} testID="markdown-body">{source.trim() ? render(nodes) : <Text color="inkMuted">这篇笔记还没有内容。</Text>}{linkError ? <Text accessibilityRole="alert" color="destructive">无法打开链接，请检查网址后重试。</Text> : null}</Stack>;
}
