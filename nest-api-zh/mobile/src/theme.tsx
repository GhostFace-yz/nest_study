import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'dark' | 'light';

export interface Palette {
  bg: string;
  card: string;
  cardStrong: string;
  text: string;
  textDim: string;
  muted: string;
  border: string;
  primary: string;
  primarySoft: string;
  codeBg: string;
  codeText: string;
  infoBorder: string;
  infoBg: string;
  warnBorder: string;
  warnBg: string;
  highlight: string;
  sheet: string;
  overlay: string;
}

export const palettes: Record<ThemeMode, Palette> = {
  dark: {
    bg: '#0d0d12',
    card: '#16161d',
    cardStrong: '#1d1d26',
    text: '#e9e9ef',
    textDim: '#c2c2cc',
    muted: '#8f94a1',
    border: '#262631',
    primary: '#e8455f',
    primarySoft: 'rgba(232,69,95,0.16)',
    codeBg: '#13131a',
    codeText: '#d8d8e2',
    infoBorder: 'rgba(56,160,240,0.35)',
    infoBg: 'rgba(56,160,240,0.08)',
    warnBorder: 'rgba(240,170,60,0.35)',
    warnBg: 'rgba(240,170,60,0.08)',
    highlight: 'rgba(232,69,95,0.28)',
    sheet: '#1a1a23',
    overlay: 'rgba(0,0,0,0.6)',
  },
  light: {
    bg: '#ffffff',
    card: '#f6f6f8',
    cardStrong: '#eeeef2',
    text: '#18181d',
    textDim: '#3a3a44',
    muted: '#6b7280',
    border: '#e3e3e9',
    primary: '#d21f45',
    primarySoft: 'rgba(210,31,69,0.1)',
    codeBg: '#f5f5f8',
    codeText: '#26262e',
    infoBorder: 'rgba(30,140,220,0.3)',
    infoBg: 'rgba(30,140,220,0.06)',
    warnBorder: 'rgba(220,150,40,0.32)',
    warnBg: 'rgba(220,150,40,0.07)',
    highlight: 'rgba(210,31,69,0.16)',
    sheet: '#ffffff',
    overlay: 'rgba(0,0,0,0.35)',
  },
};

interface ThemeCtx {
  mode: ThemeMode;
  p: Palette;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx>({ mode: 'dark', p: palettes.dark, toggle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('dark');

  useEffect(() => {
    AsyncStorage.getItem('nest-mobile-theme').then((v) => {
      if (v === 'light' || v === 'dark') setMode(v);
    });
  }, []);

  const toggle = useCallback(() => {
    setMode((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem('nest-mobile-theme', next).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo(() => ({ mode, p: palettes[mode], toggle }), [mode, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
