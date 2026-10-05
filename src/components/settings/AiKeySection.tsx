// File: src/components/settings/AiKeySection.tsx
import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Key, ShieldCheck, Trash2 } from 'lucide-react-native';
import { settingsStyles as styles } from './settingsStyles';

interface AiKeySectionProps {
  hasKey: boolean;
  keyInput: string;
  isSaving: boolean;
  onKeyInputChange: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
}

/** "KI Analyse (Gemini)": API key */
export function AiKeySection({ hasKey, keyInput, isSaving, onKeyInputChange, onSave, onDelete }: AiKeySectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Key size={16} color="#6b7280" />
        <Text style={styles.sectionTitle}>KI Analyse (Gemini)</Text>
      </View>
      <View style={styles.aiKeyContainer}>
        {hasKey ? (
          <View style={styles.keyStatusBox}>
            <View style={styles.keyStatusInfo}>
              <ShieldCheck size={18} color="#22c55e" />
              <Text style={styles.keyStatusText}>API-Key ist hinterlegt</Text>
            </View>
            <TouchableOpacity onPress={onDelete} style={styles.deleteKeyButton}>
              <Trash2 size={14} color="#ef4444" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.keyInputRow}>
            <TextInput
              style={styles.keyInput}
              value={keyInput}
              onChangeText={onKeyInputChange}
              placeholder="API-Key hier einfügen..."
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={[styles.saveKeyButton, isSaving && styles.buttonDisabled]} onPress={onSave} disabled={isSaving}>
              {isSaving ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={styles.saveKeyButtonText}>Speichern</Text>}
            </TouchableOpacity>
          </View>
        )}
        <Text style={styles.balanceHelpText}>
          Der Key wird nur lokal auf diesem Gerät gespeichert. Für die Prüfung werden
          Beschreibung, Name und Betrag der Buchungen an Google Gemini gesendet.
        </Text>
      </View>
    </View>
  );
}
