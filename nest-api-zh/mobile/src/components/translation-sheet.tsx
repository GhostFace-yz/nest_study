import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../theme';
import type { Selection } from './block';

export function TranslationSheet({
  selection,
  onClose,
  bottomInset,
}: {
  selection: Selection | null;
  onClose: () => void;
  bottomInset: number;
}) {
  const { p } = useTheme();
  if (!selection) return null;

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
      <View
        style={{
          backgroundColor: p.sheet,
          borderTopWidth: 1,
          borderColor: p.border,
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          paddingHorizontal: 18,
          paddingTop: 12,
          paddingBottom: 14 + bottomInset,
          shadowColor: '#000',
          shadowOpacity: 0.3,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: -6 },
          elevation: 12,
        }}
      >
        <View style={{ alignItems: 'center', marginBottom: 8 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: p.border }} />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <Text style={{ color: p.muted, fontSize: 10.5, letterSpacing: 1.2 }}>
            {selection.zh ? '对应中文' : '暂无译文'}
          </Text>
          <View style={{ flex: 1 }} />
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={{ color: p.muted, fontSize: 12 }}>收起</Text>
          </Pressable>
        </View>
        <Text style={{ color: p.textDim, fontSize: 12.5, lineHeight: 20 }} numberOfLines={4}>
          {selection.en}
        </Text>
        {selection.zh ? (
          <Text style={{ color: p.text, fontSize: 17, lineHeight: 28, marginTop: 8 }}>{selection.zh}</Text>
        ) : null}
      </View>
    </View>
  );
}
