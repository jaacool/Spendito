// File: src/components/settings/DisplaySection.tsx
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Type, Minus, Circle, Plus } from 'lucide-react-native';
import { settingsStyles as styles } from './settingsStyles';

type Scale = 'compact' | 'default' | 'large';

const SCALE_OPTIONS: { value: Scale; label: string; description: string }[] = [
  { value: 'compact', label: 'Kompakt', description: 'Schlank & modern' },
  { value: 'default', label: 'Standard', description: 'Ausgewogen' },
  { value: 'large', label: 'Groß', description: 'Bessere Lesbarkeit' },
];

const ICONS: Record<Scale, typeof Minus> = { compact: Minus, default: Circle, large: Plus };

interface DisplaySectionProps {
  scale: Scale;
  onScaleChange: (scale: Scale) => void;
}

/** "Anzeigegröße" */
export function DisplaySection({ scale, onScaleChange }: DisplaySectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}><Type size={16} color="#6b7280" /><Text style={styles.sectionTitle}>Anzeigegröße</Text></View>
      <View style={styles.scaleOptions}>
        {SCALE_OPTIONS.map(option => {
          const active = scale === option.value;
          const Icon = ICONS[option.value];
          return (
            <Pressable key={option.value} style={[styles.scaleOption, active && styles.scaleOptionActive]} onPress={() => onScaleChange(option.value)}>
              <View style={styles.scaleIconContainer}>
                <Icon size={16} color={active ? '#0ea5e9' : '#9ca3af'} />
              </View>
              <Text style={[styles.scaleLabel, active && styles.scaleLabelActive]}>{option.label}</Text>
              <Text style={styles.scaleDescription}>{option.description}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
