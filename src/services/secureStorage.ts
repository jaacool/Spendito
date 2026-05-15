import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const GEMINI_API_KEY_NAME = 'spendito_gemini_api_key';

class SecureStorageService {
  /**
   * Save a key securely
   */
  async saveApiKey(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      // SecureStore has limited support on web, using localStorage for now
      // but in a production web app, this should be handled differently
      localStorage.setItem(GEMINI_API_KEY_NAME, key);
      return;
    }
    await SecureStore.setItemAsync(GEMINI_API_KEY_NAME, key);
  }

  /**
   * Get a key securely
   */
  async getApiKey(): Promise<string | null> {
    if (Platform.OS === 'web') {
      return localStorage.getItem(GEMINI_API_KEY_NAME);
    }
    return await SecureStore.getItemAsync(GEMINI_API_KEY_NAME);
  }

  /**
   * Delete a key securely
   */
  async deleteApiKey(): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.removeItem(GEMINI_API_KEY_NAME);
      return;
    }
    await SecureStore.deleteItemAsync(GEMINI_API_KEY_NAME);
  }

  /**
   * Check if a key exists without returning it
   */
  async hasApiKey(): Promise<boolean> {
    const key = await this.getApiKey();
    return !!key && key.length > 0;
  }
}

export const secureStorageService = new SecureStorageService();
