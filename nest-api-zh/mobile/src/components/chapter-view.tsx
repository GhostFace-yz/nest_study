import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { Chapter, ViewMode } from '../lib/types';
import { useTheme } from '../theme';
import { neighbors } from '../lib/data';
import { BlockView, type Selection } from './block';
import { TranslationSheet } from './translation-sheet';
import type { ReadingProgress } from '../lib/progress';

interface Props {
  chapter: Chapter;
  mode: ViewMode;
  bottomInset: number;
  progress?: ReadingProgress;
  onProgress: (slug: string, y: number, ratio: number) => void;
  onNavigate: (slug: string) => void;
}

export function ChapterView({ chapter, mode, bottomInset, progress, onProgress, onNavigate }: Props) {
  const { p } = useTheme();
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const { prev, next } = neighbors(chapter.slug);

  const contentH = useRef(0);
  const viewH = useRef(0);
  const restored = useRef(false);
  const lastSave = useRef(0);

  // 换章：允许下一章恢复位置，清掉选中
  useEffect(() => {
    restored.current = false;
    lastSave.current = 0;
    setSelection(null);
  }, [chapter.slug]);

  /** 内容高度和视口高度都已知后，再按进度恢复位置 */
  const tryRestore = () => {
    if (restored.current) return;
    if (!progress) return;                       // 进度是异步读出来的，等等再恢复
    if (!contentH.current || !viewH.current) return;
    if (lastSave.current > 0) {                  // 用户已经自己滚过了，别再跳
      restored.current = true;
      return;
    }
    restored.current = true;
    const max = Math.max(1, contentH.current - viewH.current);
    const y = progress.ratio > 0 ? progress.ratio * max : progress.y;
    if (y > 4) {
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ y, animated: false }));
    }
  };

  // 进度可能比内容晚到（AsyncStorage 异步）
  useEffect(() => {
    tryRestore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  const handleScroll = (y: number) => {
    const now = Date.now();
    if (now - lastSave.current < 800) return;
    lastSave.current = now;
    const max = Math.max(1, contentH.current - viewH.current);
    onProgress(chapter.slug, y, Math.min(1, Math.max(0, y / max)));
  };

  const handleSelect = (sel: Selection) => {
    setSelection((current) =>
      current && current.blockId === sel.blockId && current.index === sel.index ? null : sel,
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(e) => handleScroll(e.nativeEvent.contentOffset.y)}
        onLayout={(e) => {
          viewH.current = e.nativeEvent.layout.height;
          tryRestore();
        }}
        onContentSizeChange={(_w, h) => {
          contentH.current = h;
          tryRestore();
        }}
      >
        <Text style={{ color: p.primary, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginBottom: 6 }}>
          {chapter.section.toUpperCase()}
        </Text>
        <Text style={{ color: p.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.4, marginBottom: 4 }}>
          {chapter.title}
        </Text>
        <Text style={{ color: p.muted, fontSize: 12, marginBottom: 14 }}>
          第 {chapter.order} 章 · 共 {chapter.blocks.length} 块
          {mode === 'focus' ? ' · 点句子看中文' : ''}
        </Text>

        {chapter.blocks.map((block) => (
          <BlockView
            key={block.id}
            block={block}
            mode={mode}
            selection={selection}
            onSelect={handleSelect}
          />
        ))}

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 26 }}>
          {prev ? (
            <Pressable
              onPress={() => onNavigate(prev.slug)}
              style={{ flex: 1, borderWidth: 1, borderColor: p.border, borderRadius: 12, padding: 12 }}
            >
              <Text style={{ color: p.muted, fontSize: 10.5, marginBottom: 3 }}>上一章</Text>
              <Text style={{ color: p.text, fontSize: 14 }} numberOfLines={1}>
                {prev.title}
              </Text>
            </Pressable>
          ) : null}
          {next ? (
            <Pressable
              onPress={() => onNavigate(next.slug)}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: p.border,
                borderRadius: 12,
                padding: 12,
                alignItems: 'flex-end',
              }}
            >
              <Text style={{ color: p.muted, fontSize: 10.5, marginBottom: 3 }}>下一章</Text>
              <Text style={{ color: p.text, fontSize: 14 }} numberOfLines={1}>
                {next.title}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>

      <TranslationSheet selection={selection} onClose={() => setSelection(null)} bottomInset={bottomInset} />
    </View>
  );
}
