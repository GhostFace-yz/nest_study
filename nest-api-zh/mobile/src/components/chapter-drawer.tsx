import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, SectionList, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { allChapters, dataset, searchChapters } from '../lib/data';
import type { ProgressMap } from '../lib/progress';

export function ChapterDrawer({
  visible,
  currentSlug,
  progress,
  continueTarget,
  topInset,
  bottomInset,
  onClose,
  onContinue,
  onSelect,
}: {
  visible: boolean;
  currentSlug: string;
  progress: ProgressMap;
  continueTarget: { slug: string; title: string; ratio: number } | null;
  topInset: number;
  bottomInset: number;
  onClose: () => void;
  onContinue: () => void;
  onSelect: (slug: string) => void;
}) {
  const { p } = useTheme();
  const [query, setQuery] = useState('');

  const sections = useMemo(
    () => dataset.sections.map((s) => ({ title: s.title, data: s.chapters })),
    [],
  );
  const hits = useMemo(() => searchChapters(query, 30), [query]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: p.bg, paddingTop: topInset }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            height: 52,
            borderBottomWidth: 1,
            borderColor: p.border,
            gap: 12,
          }}
        >
          <Text style={{ color: p.text, fontSize: 16, fontWeight: '700', flex: 1 }}>章节目录</Text>
          <Text style={{ color: p.muted, fontSize: 11.5 }}>
            {dataset.meta.chapters} 章 · {dataset.meta.sections} 个分区
          </Text>
          <Pressable onPress={onClose} hitSlop={12} style={{ padding: 4 }}>
            <Text style={{ color: p.muted, fontSize: 18 }}>✕</Text>
          </Pressable>
        </View>

        <View style={{ padding: 12 }}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="搜索章节…"
            placeholderTextColor={p.muted}
            autoCorrect={false}
            style={{
              backgroundColor: p.card,
              borderWidth: 1,
              borderColor: p.border,
              borderRadius: 10,
              paddingHorizontal: 12,
              height: 40,
              color: p.text,
              fontSize: 14,
            }}
          />
        </View>

        {continueTarget ? (
          <Pressable
            onPress={onContinue}
            style={{
              marginHorizontal: 12,
              marginBottom: 4,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: p.primary,
              backgroundColor: p.primarySoft,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: p.muted, fontSize: 10.5, letterSpacing: 1 }}>继续阅读</Text>
              <Text style={{ color: p.primary, fontSize: 11, marginLeft: 'auto' }}>
                {Math.round(continueTarget.ratio * 100)}%
              </Text>
            </View>
            <Text style={{ color: p.text, fontSize: 15, fontWeight: '600', marginTop: 3 }} numberOfLines={1}>
              {continueTarget.title}
            </Text>
          </Pressable>
        ) : null}

        {query.trim() ? (
          <FlatList
            data={hits}
            keyExtractor={(item) => item.slug}
            contentContainerStyle={{ paddingBottom: bottomInset + 24 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => onSelect(item.slug)}
                style={{ paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1, borderColor: p.border }}
              >
                <Text style={{ color: p.text, fontSize: 15 }}>{item.title}</Text>
                <Text style={{ color: p.muted, fontSize: 11.5, marginTop: 2 }}>{item.section}</Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={{ color: p.muted, textAlign: 'center', marginTop: 24, fontSize: 13 }}>
                没有匹配的章节
              </Text>
            }
          />
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.slug}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={{ paddingBottom: bottomInset + 24 }}
            renderSectionHeader={({ section }) => (
              <Text
                style={{
                  color: p.muted,
                  fontSize: 10.5,
                  fontWeight: '700',
                  letterSpacing: 1.2,
                  paddingHorizontal: 16,
                  paddingTop: 14,
                  paddingBottom: 6,
                }}
              >
                {section.title.toUpperCase()}
              </Text>
            )}
            renderItem={({ item }) => {
              const active = item.slug === currentSlug;
              return (
                <Pressable
                  onPress={() => onSelect(item.slug)}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderBottomWidth: 1,
                    borderColor: p.border,
                    backgroundColor: active ? p.primarySoft : 'transparent',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ color: p.muted, fontSize: 11, width: 16, textAlign: 'right' }}>{item.order}</Text>
                    <Text style={{ color: active ? p.primary : p.text, fontSize: 15, flex: 1 }} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {progress[item.slug]?.ratio ? (
                      <Text style={{ color: p.muted, fontSize: 10.5 }}>
                        {Math.round(progress[item.slug].ratio * 100)}%
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

export function useChapterCount() {
  return allChapters.length;
}
