import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Heart, Shield, Users, PlusCircle, Stethoscope, Truck, Home, FileText, MinusCircle } from 'lucide-react-native';
import { Category, CATEGORY_INFO } from '../types';

interface CategoryCardProps {
  category: Category;
  total: number;
  count: number;
  percentage: number;
  type: 'income' | 'expense';
  onPress?: () => void;
}

const ICONS: Record<string, React.ComponentType<any>> = {
  heart: Heart,
  shield: Shield,
  users: Users,
  'plus-circle': PlusCircle,
  stethoscope: Stethoscope,
  truck: Truck,
  home: Home,
  'file-text': FileText,
  'minus-circle': MinusCircle,
};

export function CategoryCard({ category, total, count, percentage, type, onPress }: CategoryCardProps) {
  const info = CATEGORY_INFO[category];
  const Icon = ICONS[info.icon] || PlusCircle;
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.iconContainer, { backgroundColor: info.color + '15' }]}>
          <Icon size={16} color={info.color} strokeWidth={2} />
        </View>
        <View style={styles.percentageContainer}>
          <Text style={styles.percentage}>{percentage.toFixed(0)}%</Text>
        </View>
      </View>
      
      <Text style={styles.label} numberOfLines={1}>{info.labelDe}</Text>
      
      <Text style={[styles.amount, { color: type === 'income' ? '#22c55e' : '#ef4444' }]}>
        {type === 'income' ? '+' : '-'}{formatCurrency(total)}
      </Text>
      
      <Text style={styles.count}>{count} Buchungen</Text>
      
      {/* Progress bar */}
      <View style={styles.progressContainer}>
        <View 
          style={[
            styles.progressBar, 
            { width: `${Math.min(percentage, 100)}%`, backgroundColor: info.color }
          ]} 
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    width: 140,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  percentageContainer: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  percentage: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6b7280',
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 2,
  },
  amount: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  count: {
    fontSize: 10,
    color: '#9ca3af',
    marginBottom: 8,
  },
  progressContainer: {
    height: 3,
    backgroundColor: '#f3f4f6',
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 1.5,
  },
});
