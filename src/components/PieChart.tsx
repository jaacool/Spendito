import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { CategorySummary, CATEGORY_INFO } from '../types';

interface PieChartProps {
  data: CategorySummary[];
  size?: number;
  strokeWidth?: number;
}

export function PieChart({ data, size = 80, strokeWidth = 12 }: PieChartProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  // Calculate total for percentages
  const total = data.reduce((sum, item) => sum + item.total, 0);
  
  if (total === 0) {
    return (
      <View style={[styles.container, { width: size, height: size }]}>
        <Svg width={size} height={size}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke="#e5e7eb"
            strokeWidth={strokeWidth}
            fill="none"
          />
        </Svg>
      </View>
    );
  }

  // Sort by total descending for better visual
  const sortedData = [...data].sort((a, b) => b.total - a.total);
  
  let currentAngle = -90; // Start from top

  const segments = sortedData.map((item, index) => {
    const percentage = item.total / total;
    const angle = percentage * 360;
    const color = CATEGORY_INFO[item.category]?.color || '#9ca3af';
    
    // Calculate arc path
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1 = center + radius * Math.cos(startRad);
    const y1 = center + radius * Math.sin(startRad);
    const x2 = center + radius * Math.cos(endRad);
    const y2 = center + radius * Math.sin(endRad);

    const largeArcFlag = angle > 180 ? 1 : 0;

    // For very small segments, use a line instead
    if (angle < 1) return null;

    const pathData = [
      `M ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
    ].join(' ');

    return (
      <Path
        key={item.category}
        d={pathData}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="butt"
        fill="none"
      />
    );
  });

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {/* Background circle */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke="#f3f4f6"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Segments */}
        {segments}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
