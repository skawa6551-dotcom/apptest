// ============================================================
// themes.js
// テーマ定義だけを担当する純粋な定数モジュール。
// DOM操作・Storageアクセスは一切行わない。
// ============================================================

export const THEMES = Object.freeze([
  Object.freeze({
    id: 'dark',
    label: 'ダーク',
    colorTokens: Object.freeze({
      background: '#0B0B0F',
      surface: 'rgba(255, 255, 255, 0.06)',
      textPrimary: '#F5F5F7',
      textSecondary: '#8E8E93',
      accent: '#C9A96A',
      accentContrast: '#0B0B0F',
    }),
  }),
  Object.freeze({
    id: 'midnight',
    label: 'ミッドナイト',
    colorTokens: Object.freeze({
      background: '#070B14',
      surface: 'rgba(255, 255, 255, 0.05)',
      textPrimary: '#EAF0FA',
      textSecondary: '#7C8AA3',
      accent: '#5B8DEF',
      accentContrast: '#070B14',
    }),
  }),
  Object.freeze({
    id: 'blue',
    label: 'ブルー',
    colorTokens: Object.freeze({
      background: '#0A1420',
      surface: 'rgba(255, 255, 255, 0.06)',
      textPrimary: '#EAF4FF',
      textSecondary: '#7FA7C9',
      accent: '#3AA0FF',
      accentContrast: '#0A1420',
    }),
  }),
  Object.freeze({
    id: 'purple',
    label: 'パープル',
    colorTokens: Object.freeze({
      background: '#120B1A',
      surface: 'rgba(255, 255, 255, 0.06)',
      textPrimary: '#F1E9FA',
      textSecondary: '#9A85B3',
      accent: '#A876E0',
      accentContrast: '#120B1A',
    }),
  }),
  Object.freeze({
    id: 'gold',
    label: 'ゴールド',
    colorTokens: Object.freeze({
      background: '#14100A',
      surface: 'rgba(255, 255, 255, 0.07)',
      textPrimary: '#FBF3E3',
      textSecondary: '#B8A488',
      accent: '#E3B04B',
      accentContrast: '#14100A',
    }),
  }),
]);

export const DEFAULT_THEME_ID = 'dark';

export function isValidThemeId(themeId) {
  return THEMES.some((theme) => theme.id === themeId);
}

export function getThemeById(themeId) {
  return THEMES.find((theme) => theme.id === themeId) ?? null;
}
