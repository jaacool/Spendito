// File: src/services/dialogs.ts
/**
 * Platform-safe message and confirm dialogs.
 *
 * React Native's Alert.alert does NOTHING in the browser (react-native-web
 * implements it as an empty function), so messages and confirmations were
 * silently lost on the web version. Always use these helpers instead.
 */
import { Alert, Platform } from 'react-native';

/**
 * Show a simple message with an OK button. Resolves when the user closed it.
 */
export function showMessage(title: string, message: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(`${title}\n\n${message}`);
    }
    return Promise.resolve();
  }
  return new Promise(resolve => {
    Alert.alert(title, message, [{ text: 'OK', onPress: () => resolve() }], {
      cancelable: true,
      onDismiss: () => resolve(),
    });
  });
}

/**
 * Ask the user to confirm an action. Resolves true only on explicit confirmation.
 */
export function askConfirm(
  title: string,
  message: string,
  confirmLabel = 'OK',
  destructive = false
): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      return Promise.resolve(window.confirm(`${title}\n\n${message}`));
    }
    // No way to ask -> never perform the action
    return Promise.resolve(false);
  }
  return new Promise(resolve => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Abbrechen', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}
