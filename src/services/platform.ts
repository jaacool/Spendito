import { Platform } from 'react-native';

/**
 * Utility to detect if the app is running in an Electron environment
 */
export const isElectron = (): boolean => {
  if (Platform.OS !== 'web') return false;
  
  return (
    typeof window !== 'undefined' &&
    typeof window.process === 'object' &&
    (window.process as any).type === 'renderer' ||
    (typeof navigator === 'object' && 
     typeof navigator.userAgent === 'string' && 
     navigator.userAgent.indexOf('Electron') >= 0)
  );
};

/**
 * Detect if we are on a desktop-class screen
 * (Simplified check based on width or platform)
 */
export const isDesktop = (width: number): boolean => {
  return width >= 1024 || isElectron();
};
