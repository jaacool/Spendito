// File: src/components/settings/CacheResetDialog.tsx
import React, { useEffect, useRef } from 'react';
import { View, Text, Modal, Pressable, Animated } from 'react-native';
import { settingsStyles as styles } from './settingsStyles';

interface CacheResetDialogProps {
  visible: boolean;
  step: 1 | 2 | 3;
  onCancel: () => void;
  onConfirm: () => void;
}

const STEPS = {
  1: { text: 'Cache löschen?', cancel: 'Abbrechen', confirm: 'Ja', danger: false },
  2: { text: 'Mit Aaron gesprochen?', cancel: 'Nein', confirm: 'Ja', danger: false },
  3: { text: 'LETZTE WARNUNG!', cancel: 'Abbrechen', confirm: 'LÖSCHEN!', danger: true },
} as const;

/** Blinking three-step warning before ALL data is deleted */
export function CacheResetDialog({ visible, step, onCancel, onConfirm }: CacheResetDialogProps) {
  const blinkAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) {
      blinkAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blinkAnim, { toValue: 0.2, duration: 500, useNativeDriver: true }),
        Animated.timing(blinkAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    loop.start();
    // Stop the animation when the dialog closes (it used to run forever)
    return () => loop.stop();
  }, [visible, blinkAnim]);

  if (!visible) return null;
  const current = STEPS[step];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.warningOverlay} onPress={onCancel}>
        <Animated.View style={[styles.warningContainer, { opacity: blinkAnim }]}>
          <View style={styles.warningHeader}><Text style={styles.warningTitle}>⚠️ WARNUNG ⚠️</Text></View>
          <View style={styles.warningContent}>
            <Text style={styles.warningText}>{current.text}</Text>
            <View style={styles.warningButtons}>
              <Pressable style={styles.warningCancelButton} onPress={onCancel}>
                <Text style={styles.warningCancelText}>{current.cancel}</Text>
              </Pressable>
              <Pressable style={current.danger ? styles.warningDangerButton : styles.warningConfirmButton} onPress={onConfirm}>
                <Text style={current.danger ? styles.warningDangerText : styles.warningConfirmText}>{current.confirm}</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
