import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../theme';
import type { ViewMode } from '../lib/types';

const MODES: { value: ViewMode; label: string }[] = [
  { value: 'focus', label: 'EN' },
  { value: 'both', label: '对照' },
  { value: 'zh', label: '中' },
];

export function Header({
  title,
  topInset,
  mode,
  onModeChange,
  onMenu,
  onToggleTheme,
}: {
  title: string;
  topInset: number;
  mode: ViewMode;
  onModeChange: (m: ViewMode) => void;
  onMenu: () => void;
  onToggleTheme: () => void;
}) {
  const { p } = useTheme();
  return (
    <View
      style={{
        paddingTop: topInset,
        backgroundColor: p.bg,
        borderBottomWidth: 1,
        borderColor: p.border,
      }}
    >
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10 }}>
        <Pressable onPress={onMenu} hitSlop={10} style={{ padding: 4 }}>
          <Text style={{ color: p.text, fontSize: 20 }}>☰</Text>
        </Pressable>

        <Text numberOfLines={1} style={{ flex: 1, color: p.text, fontSize: 15, fontWeight: '700', letterSpacing: -0.2 }}>
          {title}
        </Text>

        <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: p.border, borderRadius: 8, padding: 2 }}>
          {MODES.map((m) => {
            const active = mode === m.value;
            return (
              <Pressable
                key={m.value}
                onPress={() => onModeChange(m.value)}
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 6,
                  backgroundColor: active ? p.primary : 'transparent',
                }}
              >
                <Text style={{ color: active ? '#fff' : p.muted, fontSize: 11.5, fontWeight: '600' }}>
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable onPress={onToggleTheme} hitSlop={10} style={{ padding: 4 }}>
          <Text style={{ color: p.muted, fontSize: 16 }}>◐</Text>
        </Pressable>
      </View>
    </View>
  );
}
