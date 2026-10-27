import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppState, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider, useTheme } from './src/theme';
import { Header } from './src/components/header';
import { ChapterView } from './src/components/chapter-view';
import { ChapterDrawer } from './src/components/chapter-drawer';
import { allChapters, loadChapter } from './src/lib/data';
import { lastRead, loadProgress, saveProgress, type ProgressMap } from './src/lib/progress';
import type { ViewMode } from './src/lib/types';

function Root() {
  const { p, mode, toggle } = useTheme();
  const insets = useSafeAreaInsets();

  const [slug, setSlug] = useState('index');
  const [viewMode, setViewMode] = useState<ViewMode>('focus');
  const [drawer, setDrawer] = useState(false);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState<ProgressMap>({});

  useEffect(() => {
    Promise.all([
      AsyncStorage.multiGet(['nest-mobile-chapter', 'nest-mobile-mode']),
      loadProgress(),
    ]).then(([pairs, saved]) => {
      const savedSlug = pairs[0]?.[1];
      if (savedSlug && allChapters.some((c) => c.slug === savedSlug)) setSlug(savedSlug);
      const savedMode = pairs[1]?.[1];
      if (savedMode === 'focus' || savedMode === 'both' || savedMode === 'zh') setViewMode(savedMode);
      setProgress(saved);
      setReady(true);
    });
  }, []);

  // 阅读进度：滚动时更新内存，停手 0.9s 后落盘；切后台立即落盘
  const progressSnapshot = useRef(progress);
  progressSnapshot.current = progress;

  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => saveProgress(progressSnapshot.current), 900);
    return () => clearTimeout(id);
  }, [progress, ready]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') saveProgress(progressSnapshot.current);
    });
    return () => sub.remove();
  }, []);

  const updateProgress = useCallback((chapterSlug: string, y: number, ratio: number) => {
    setProgress((prev) => ({ ...prev, [chapterSlug]: { y, ratio, at: Date.now() } }));
  }, []);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem('nest-mobile-chapter', slug).catch(() => {});
  }, [slug, ready]);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem('nest-mobile-mode', viewMode).catch(() => {});
  }, [viewMode, ready]);

  const chapter = useMemo(() => loadChapter(slug), [slug]);
  const last = useMemo(() => lastRead(progress), [progress]);
  const continueTarget = useMemo(() => {
    if (!last) return null;
    const meta = allChapters.find((c) => c.slug === last.slug);
    if (!meta) return null;
    return { slug: last.slug, title: meta.title, ratio: last.p.ratio };
  }, [last]);

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Header
        title={chapter?.title ?? 'NestJS 文档'}
        topInset={insets.top}
        mode={viewMode}
        onModeChange={setViewMode}
        onMenu={() => setDrawer(true)}
        onToggleTheme={toggle}
      />

      {chapter ? (
        <ChapterView
          chapter={chapter}
          mode={viewMode}
          bottomInset={insets.bottom}
          progress={progress[slug]}
          onProgress={updateProgress}
          onNavigate={(next) => setSlug(next)}
        />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: p.muted }}>章节加载失败</Text>
        </View>
      )}

      <ChapterDrawer
        visible={drawer}
        currentSlug={slug}
        progress={progress}
        continueTarget={continueTarget}
        topInset={insets.top}
        bottomInset={insets.bottom}
        onClose={() => setDrawer(false)}
        onContinue={() => {
          if (continueTarget) setSlug(continueTarget.slug);
          setDrawer(false);
        }}
        onSelect={(next) => {
          setSlug(next);
          setDrawer(false);
        }}
      />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Root />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
