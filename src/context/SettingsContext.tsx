import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type UIScale = 'compact' | 'default' | 'large';

interface SettingsContextType {
  uiScale: UIScale;
  setUIScale: (scale: UIScale) => void;
  // Scale multipliers
  fontScale: number;
  spacingScale: number;
  iconScale: number;
}

const SETTINGS_KEY = '@spendito_settings';

const SCALE_VALUES: Record<UIScale, { font: number; spacing: number; icon: number }> = {
  compact: { font: 0.85, spacing: 0.8, icon: 0.85 },
  default: { font: 1, spacing: 1, icon: 1 },
  large: { font: 1.15, spacing: 1.15, icon: 1.15 },
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [uiScale, setUIScaleState] = useState<UIScale>('compact'); // Default to compact for modern look

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem(SETTINGS_KEY);
      if (stored) {
        const settings = JSON.parse(stored);
        if (settings.uiScale) {
          setUIScaleState(settings.uiScale);
        }
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const setUIScale = async (scale: UIScale) => {
    setUIScaleState(scale);
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ uiScale: scale }));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  const scaleValues = SCALE_VALUES[uiScale];

  return (
    <SettingsContext.Provider
      value={{
        uiScale,
        setUIScale,
        fontScale: scaleValues.font,
        spacingScale: scaleValues.spacing,
        iconScale: scaleValues.icon,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
