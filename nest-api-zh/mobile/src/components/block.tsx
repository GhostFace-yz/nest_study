import React, { useMemo } from 'react';
import { Image, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import type { Block, ViewMode } from '../lib/types';
import { matchZhSentence, splitSentences } from '../lib/align';
import { groupRunsBySentence, htmlToText, parseInline, parseList, parseTable, stripInline, type Run } from '../lib/markdown';
import { useTheme, type Palette } from '../theme';

export interface Selection {
  blockId: string;
  index: number;
  en: string;
  zh: string;
}

interface Props {
  block: Block;
  mode: ViewMode;
  selection: Selection | null;
  onSelect: (sel: Selection) => void;
}

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

export function BlockView({ block, mode, selection, onSelect }: Props) {
  const { p } = useTheme();
  const isSelected = (index: number) => selection?.blockId === block.id && selection.index === index;

  const en = block.md || '';
  const zh = block.zh || '';

  // 段落类：句子级对照
  const sentences = useMemo(() => {
    if (!['paragraph', 'callout', 'details'].includes(block.type)) return null;
    const enText = stripInline(en);
    const zhText = stripInline(zh);
    if (!enText.trim()) return null;
    const enSpans = splitSentences(enText, 'en');
    const zhSpans = splitSentences(zhText, 'zh');
    return { enText, zhText, enSpans, zhSpans };
  }, [block.type, en, zh]);

  if (block.type === 'hr') {
    return <View style={{ height: 1, backgroundColor: p.border, marginVertical: 20 }} />;
  }

  if (block.type === 'image' && block.src) {
    return (
      <Image
        source={{ uri: block.src }}
        style={{ width: '100%', height: 190, borderRadius: 10, backgroundColor: p.card, marginVertical: 10 }}
        resizeMode="contain"
      />
    );
  }

  if (block.type === 'heading') {
    const level = block.level ?? 2;
    const size = level <= 2 ? 21 : level === 3 ? 18 : 16;
    return (
      <Text
        style={{
          color: p.text,
          fontSize: size,
          fontWeight: '700',
          marginTop: level <= 2 ? 26 : 18,
          marginBottom: 8,
        }}
      >
        {mode === 'zh' && zh ? stripInline(zh) : stripInline(en)}
      </Text>
    );
  }

  if (block.type === 'code') {
    return <CodeBlockView code={block.code || ''} lang={block.lang} p={p} />;
  }

  if (block.type === 'table') {
    return <TableBlockView block={block} selection={selection} onSelect={onSelect} p={p} />;
  }

  if (block.type === 'html') {
    const text = htmlToText(en);
    if (!text.trim()) return null;
    return (
      <View style={{ backgroundColor: p.codeBg, borderRadius: 10, padding: 12, marginVertical: 10 }}>
        <Text style={{ fontFamily: MONO, fontSize: 12.5, color: p.codeText, lineHeight: 20 }}>{text}</Text>
      </View>
    );
  }

  if (block.type === 'callout') {
    const warn = block.kind === 'warning';
    const body =
      mode === 'zh' && zh ? (
        <PlainRich text={zh} p={p} muted={false} />
      ) : sentences ? (
        <SentenceText
          runs={parseInline(en)}
          spans={sentences.enSpans}
          blockId={block.id}
          enText={sentences.enText}
          zhText={sentences.zhText}
          zhSpans={sentences.zhSpans}
          isSelected={isSelected}
          onSelect={onSelect}
          p={p}
          fontSize={14.5}
          lineHeight={24}
        />
      ) : (
        <PlainRich text={en} p={p} muted={false} />
      );
    return (
      <View
        style={{
          borderWidth: 1,
          borderColor: warn ? p.warnBorder : p.infoBorder,
          backgroundColor: warn ? p.warnBg : p.infoBg,
          borderRadius: 10,
          padding: 12,
          marginVertical: 12,
        }}
      >
        <Text style={{ color: warn ? '#e0a340' : '#4fa8e0', fontSize: 12, fontWeight: '600', marginBottom: 6 }}>
          {block.title || (warn ? 'Warning' : 'Info')}
        </Text>
        {body}
        {mode === 'both' && zh ? (
          <Text style={{ color: p.muted, fontSize: 13.5, lineHeight: 22, marginTop: 8 }}>{stripInline(zh)}</Text>
        ) : null}
      </View>
    );
  }

  if (block.type === 'details') {
    return (
      <View style={{ borderWidth: 1, borderColor: p.border, borderRadius: 10, padding: 12, marginVertical: 12 }}>
        <Text style={{ color: p.text, fontWeight: '600', fontSize: 14 }}>{block.title}</Text>
        <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 24, marginTop: 6 }}>
          {mode === 'zh' && zh ? stripInline(zh) : stripInline(en)}
        </Text>
      </View>
    );
  }

  if (block.type === 'list') {
    return <ListBlockView block={block} mode={mode} selection={selection} onSelect={onSelect} p={p} />;
  }

  // paragraph（默认）
  if (!en.trim() && !zh.trim()) return null;
  return (
    <View style={{ marginVertical: 7 }}>
      {mode === 'zh' ? (
        <PlainRich text={zh} p={p} muted={false} />
      ) : sentences ? (
        <SentenceText
          runs={parseInline(en)}
          spans={sentences.enSpans}
          blockId={block.id}
          enText={sentences.enText}
          zhText={sentences.zhText}
          zhSpans={sentences.zhSpans}
          isSelected={isSelected}
          onSelect={onSelect}
          p={p}
          fontSize={15.5}
          lineHeight={29}
        />
      ) : (
        <PlainRich text={en} p={p} muted={false} />
      )}
      {mode === 'both' && zh ? (
        <Text style={{ color: p.muted, fontSize: 14, lineHeight: 25, marginTop: 6 }}>{stripInline(zh)}</Text>
      ) : null}
    </View>
  );
}

/* ---------------- 段落：句子可点 ---------------- */

function SentenceText({
  runs,
  spans,
  blockId,
  enText,
  zhText,
  zhSpans,
  isSelected,
  onSelect,
  p,
  fontSize,
  lineHeight,
}: {
  runs: Run[];
  spans: { start: number; end: number }[];
  blockId: string;
  enText: string;
  zhText: string;
  zhSpans: { start: number; end: number }[];
  isSelected: (i: number) => boolean;
  onSelect: (s: Selection) => void;
  p: Palette;
  fontSize: number;
  lineHeight: number;
}) {
  // 把句尾空白并进上一句，避免渲染成 "A.B." 这种粘连
  const display = spans.map((s, i) => ({
    start: s.start,
    end: i + 1 < spans.length ? spans[i + 1].start : enText.length,
  }));
  const groups = groupRunsBySentence(runs, display);

  return (
    <Text style={{ fontSize, lineHeight, color: p.text }}>
      {groups.map((group, i) => {
        const enSentence = enText.slice(spans[i].start, spans[i].end);
        const zhSpan = matchZhSentence(spans, zhSpans, i);
        const zhSentence = zhSpan ? zhText.slice(zhSpan.start, zhSpan.end) : stripInline(zhText);
        return (
          <Text
            key={i}
            onPress={() =>
              onSelect({ blockId, index: i, en: enSentence.trim(), zh: zhSentence.trim() })
            }
            style={isSelected(i) ? { backgroundColor: p.highlight } : undefined}
          >
            {group.map((run, j) => (
              <RunText key={j} run={run} p={p} />
            ))}
          </Text>
        );
      })}
    </Text>
  );
}

function RunText({ run, p }: { run: Run; p: Palette }) {
  if (run.code) {
    return <Text style={{ fontFamily: MONO, fontSize: 13, color: p.primary, backgroundColor: p.codeBg }}>{run.text}</Text>;
  }
  if (run.bold) return <Text style={{ fontWeight: '700', color: p.text }}>{run.text}</Text>;
  if (run.href) {
    return (
      <Text style={{ color: p.primary, textDecorationLine: 'underline' }} onPress={() => Linking.openURL(resolveLink(run.href!)).catch(() => {})}>
        {run.text}
      </Text>
    );
  }
  return <Text>{run.text}</Text>;
}

function resolveLink(href: string): string {
  if (/^https?:/i.test(href)) return href;
  return `https://docs.nestjs.com${href.startsWith('/') ? '' : '/'}${href}`;
}

/** 不带交互的富文本（中文/整段用） */
function PlainRich({ text, p, muted }: { text: string; p: Palette; muted?: boolean }) {
  const runs = parseInline(text);
  return (
    <Text style={{ color: muted ? p.muted : p.text, fontSize: 15.5, lineHeight: 29 }}>
      {runs.map((run, i) => (
        <RunText key={i} run={run} p={p} />
      ))}
    </Text>
  );
}

/* ---------------- 列表 ---------------- */

function ListBlockView({
  block,
  mode,
  selection,
  onSelect,
  p,
}: {
  block: Block;
  mode: ViewMode;
  selection: Selection | null;
  onSelect: (s: Selection) => void;
  p: Palette;
}) {
  const enItems = parseList(block.md || '');
  const zhItems = parseList(block.zh || '');
  const isSelected = (i: number) => selection?.blockId === block.id && selection.index === i;

  return (
    <View style={{ marginVertical: 8 }}>
      {enItems.map((item, i) => {
        const enText = stripInline(item.text);
        const zhText = zhItems[i] ? stripInline(zhItems[i].text) : '';
        return (
          <Pressable
            key={i}
            onPress={() => onSelect({ blockId: block.id, index: i, en: enText, zh: zhText })}
            style={{
              flexDirection: 'row',
              gap: 8,
              paddingVertical: 4,
              paddingHorizontal: 4,
              borderRadius: 6,
              backgroundColor: isSelected(i) ? p.highlight : 'transparent',
            }}
          >
            <Text style={{ color: p.primary, fontSize: 14, lineHeight: 26 }}>{item.marker}</Text>
            <View style={{ flex: 1 }}>
              {mode === 'zh' ? (
                <PlainRich text={item.text} p={p} muted={false} />
              ) : (
                <Text style={{ color: p.text, fontSize: 15, lineHeight: 27 }}>
                  {parseInline(item.text).map((run, k) => (
                    <RunText key={k} run={run} p={p} />
                  ))}
                </Text>
              )}
              {mode === 'both' && zhText ? (
                <Text style={{ color: p.muted, fontSize: 13.5, lineHeight: 23, marginTop: 2 }}>{zhText}</Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------------- 表格 ---------------- */

function TableBlockView({
  block,
  selection,
  onSelect,
  p,
}: {
  block: Block;
  selection: Selection | null;
  onSelect: (s: Selection) => void;
  p: Palette;
}) {
  const enRows = parseTable(block.md || '');
  const zhRows = parseTable(block.zh || '');
  const isSelected = (i: number) => selection?.blockId === block.id && selection.index === i;
  let cell = 0;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 12 }}>
      <View style={{ borderWidth: 1, borderColor: p.border, borderRadius: 10, overflow: 'hidden' }}>
        {enRows.map((row, r) => (
          <View key={r} style={{ flexDirection: 'row' }}>
            {row.map((text, c) => {
              const idx = cell++;
              const zhText = stripInline(zhRows[r]?.[c] || '');
              const header = r === 0;
              return (
                <Pressable
                  key={c}
                  onPress={() =>
                    onSelect({ blockId: block.id, index: idx, en: stripInline(text), zh: zhText })
                  }
                  style={{
                    width: 170,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRightWidth: c === row.length - 1 ? 0 : 1,
                    borderBottomWidth: r === enRows.length - 1 ? 0 : 1,
                    borderColor: p.border,
                    backgroundColor: isSelected(idx)
                      ? p.highlight
                      : header
                        ? p.cardStrong
                        : 'transparent',
                  }}
                >
                  <Text style={{ color: header ? p.text : p.textDim, fontSize: 12.5, lineHeight: 19, fontWeight: header ? '700' : '400' }}>
                    {stripInline(text)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

/* ---------------- 代码 ---------------- */

function CodeBlockView({ code, lang, p }: { code: string; lang?: string; p: Palette }) {
  return (
    <View style={{ marginVertical: 12 }}>
      {lang ? (
        <Text style={{ color: p.muted, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
          {lang}
        </Text>
      ) : null}
      <View style={{ backgroundColor: p.codeBg, borderWidth: 1, borderColor: p.border, borderRadius: 10 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12 }}>
          <Text style={{ fontFamily: MONO, fontSize: 12.5, lineHeight: 20, color: p.codeText }}>{code}</Text>
        </ScrollView>
      </View>
    </View>
  );
}
