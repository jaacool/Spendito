import React from 'react';
import { View, StyleSheet } from 'react-native';
import { CategorySummary, CATEGORY_INFO } from '../types';

interface CategoryBarProps {
  data: CategorySummary[];
  height?: number;
}

export function CategoryBar({ data, height = 8 }: CategoryBarProps) {
  // Calculate total for percentages
  const total = data.reduce((sum, item) => sum + item.total, 0);
  
  if (total === 0) {
    return (
      <View style={styles.container}>
        <View style={[styles.emptyBar, { height }]} />
      </View>
    );
  }

  // Sort by total descending
  const sortedData = [...data].sort((a, b) => b.total - a.total);

  return (
    <View style={styles.container}>
      <View style={[styles.barContainer, { height }]}>
        {sortedData.map((item, index) => {
          const percentage = (item.total / total) * 100;
          const color = CATEGORY_INFO[item.category]?.color || '#9ca3af';
          
          if (percentage < 0.5) return null; // Skip very small segments
          
          return (
            <View
              key={item.category}
              style={{
                width: `${percentage}%`,
                height: height,
                backgroundColor: color,
                borderTopLeftRadius: index === 0 ? height / 2 : 0,
                borderBottomLeftRadius: index === 0 ? height / 2 : 0,
                borderTopRightRadius: index === sortedData.length - 1 ? height / 2 : 0,
                borderBottomRightRadius: index === sortedData.length - 1 ? height / 2 : 0,
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginTop: 12,
    paddingHorizontal: 16,
  },
  barContainer: {
    flexDirection: 'row',
    width: '100%',
    borderRadius: 4,
    overflow: 'hidden',
  },
  emptyBar: {
    width: '100%',
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
  },
});
