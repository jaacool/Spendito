// File: src/components/home/CategoryOverview.tsx
import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { TrendingUp, TrendingDown } from 'lucide-react-native';
import { Category, CategorySummary, YearSummary } from '../../types';
import { CategoryCard } from '../CategoryCard';
import { CategoryBar } from '../CategoryBar';
import { homeStyles as styles } from './homeStyles';

interface CategoryOverviewProps {
  summary: YearSummary;
  selectedCategory: Category | null;
  onSelectCategory: (category: Category | null) => void;
  // grid = desktop column, scroll = horizontal cards on the phone
  layout: 'grid' | 'scroll';
}

interface CategoryGroupProps extends Omit<CategoryOverviewProps, 'summary'> {
  data: CategorySummary[];
  type: 'income' | 'expense';
  extraStyle?: object;
}

function CategoryGroup({ data, type, layout, selectedCategory, onSelectCategory, extraStyle }: CategoryGroupProps) {
  if (data.length === 0) return null;

  const toggle = (category: Category) =>
    onSelectCategory(selectedCategory === category ? null : category);

  const cards = data.map(cat => {
    const card = (
      <CategoryCard
        key={cat.category}
        category={cat.category}
        total={cat.total}
        count={cat.count}
        percentage={cat.percentage}
        type={type}
        onPress={() => toggle(cat.category)}
      />
    );
    return layout === 'grid'
      ? <View key={cat.category} style={styles.desktopCategoryCardWrapper}>{card}</View>
      : card;
  });

  return (
    <View style={[styles.categorySection, extraStyle]}>
      <View style={styles.sectionHeader}>
        {type === 'income'
          ? <TrendingUp size={18} color="#22c55e" />
          : <TrendingDown size={18} color="#ef4444" />}
        <Text style={styles.sectionTitle}>{type === 'income' ? 'Einnahmen' : 'Ausgaben'}</Text>
      </View>
      {layout === 'grid' ? (
        <View style={styles.desktopCategoryGrid}>{cards}</View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScrollContent}>
          {cards}
        </ScrollView>
      )}
      <CategoryBar data={data} height={6} />
    </View>
  );
}

/**
 * Income and expense category cards (click = filter the list by category).
 */
export function CategoryOverview({ summary, ...rest }: CategoryOverviewProps) {
  return (
    <View style={styles.categoriesSection}>
      <CategoryGroup {...rest} data={summary.incomeByCategory} type="income" />
      <CategoryGroup
        {...rest}
        data={summary.expenseByCategory}
        type="expense"
        extraStyle={rest.layout === 'grid' ? { marginTop: 24 } : undefined}
      />
    </View>
  );
}
