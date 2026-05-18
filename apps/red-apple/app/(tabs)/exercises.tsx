import { useState } from 'react'
import { View, StyleSheet, FlatList, Image, TouchableOpacity } from 'react-native'
import { Text, Card, Button, Badge, Input } from '@repo/ui'
import { colorsDark as colors, spacing } from '@repo/theme'
import type { MuscleGroup } from '@repo/shared'
import { useExerciseStore } from '../../store/exercise'

const MUSCLE_FILTER: { value: MuscleGroup | 'all'; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'chest', label: '가슴' },
  { value: 'back', label: '등' },
  { value: 'lats', label: '광배근' },
  { value: 'shoulders', label: '어깨' },
  { value: 'biceps', label: '이두' },
  { value: 'triceps', label: '삼두' },
  { value: 'abs', label: '복근' },
  { value: 'quads', label: '대퇴사두' },
  { value: 'hamstrings', label: '햄스트링' },
  { value: 'glutes', label: '둔근' },
  { value: 'calves', label: '종아리' },
]

const EQUIPMENT_LABELS: Record<string, string> = {
  none: '맨몸', barbell: '바벨', dumbbell: '덤벨',
  machine: '머신', cable: '케이블', kettlebell: '케틀벨', resistance_band: '밴드',
}

const MUSCLE_LABELS: Record<string, string> = {
  chest: '가슴', back: '등', shoulders: '어깨', biceps: '이두',
  triceps: '삼두', forearms: '전완', abs: '복근', obliques: '복사근',
  glutes: '둔근', quads: '대퇴사두', hamstrings: '햄스트링',
  calves: '종아리', traps: '승모근', lats: '광배근', lower_back: '하배부',
}

export default function ExercisesScreen() {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<MuscleGroup | 'all'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const { exercises, cart, addToCart } = useExerciseStore()

  const filtered = exercises.filter((ex) => {
    const matchSearch =
      search === '' ||
      ex.name.toLowerCase().includes(search.toLowerCase()) ||
      ex.name_ko?.includes(search)
    const matchFilter =
      filter === 'all' || ex.primary_muscles.includes(filter as MuscleGroup)
    return matchSearch && matchFilter
  })

  return (
    <View style={styles.container}>
      <View style={styles.topSection}>
        <Text variant="h3" style={styles.title}>운동 목록</Text>
        <Input
          placeholder="운동 검색..."
          value={search}
          onChangeText={setSearch}
          containerStyle={styles.searchInput}
        />
        <FlatList
          horizontal
          data={MUSCLE_FILTER}
          keyExtractor={(item) => item.value}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => (
            <Button
              label={item.label}
              size="sm"
              variant={filter === item.value ? 'primary' : 'outline'}
              onPress={() => setFilter(item.value)}
              style={styles.filterBtn}
            />
          )}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const isExpanded = expandedId === item.id
          const inCart = cart.some((c) => c.id === item.id)

          return (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setExpandedId(isExpanded ? null : item.id)}
            >
              <Card style={styles.exerciseCard}>
                <View style={styles.row}>
                  <View style={styles.info}>
                    <Text variant="label">{item.name_ko || item.name}</Text>
                    <Text variant="caption" color="secondary">{item.name}</Text>
                    <View style={styles.badges}>
                      <Badge label={EQUIPMENT_LABELS[item.equipment] ?? item.equipment} variant="default" />
                      <Badge
                        label={item.difficulty === 'beginner' ? '초급' : item.difficulty === 'intermediate' ? '중급' : '고급'}
                        variant={item.difficulty === 'beginner' ? 'success' : item.difficulty === 'intermediate' ? 'warning' : 'error'}
                      />
                    </View>
                  </View>
                  <View style={styles.rightActions}>
                    <Text variant="caption" color="tertiary">{isExpanded ? '▲' : '▼'}</Text>
                    <Button
                      label={inCart ? '담음' : '담기'}
                      size="sm"
                      variant={inCart ? 'secondary' : 'primary'}
                      onPress={() => addToCart(item)}
                      disabled={inCart}
                    />
                  </View>
                </View>

                {isExpanded && (
                  <View style={styles.expanded}>
                    {item.image_url ? (
                      <Image
                        source={{ uri: item.image_url }}
                        style={styles.exerciseImage}
                        resizeMode="contain"
                      />
                    ) : null}
                    {item.primary_muscles.length > 0 && (
                      <View style={styles.muscleRow}>
                        <Text variant="caption" color="secondary">주동근  </Text>
                        {item.primary_muscles.map((m) => (
                          <View key={m} style={styles.muscleTag}>
                            <Text variant="caption">{MUSCLE_LABELS[m] ?? m}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {item.instructions.length > 0 && (
                      <View style={styles.instructionBlock}>
                        {item.instructions.slice(0, 3).map((step, i) => (
                          <View key={i} style={styles.instructionRow}>
                            <View style={styles.stepNum}>
                              <Text variant="caption" color="inverse">{i + 1}</Text>
                            </View>
                            <Text variant="caption" style={styles.stepText}>{step}</Text>
                          </View>
                        ))}
                        {item.instructions.length > 3 && (
                          <Text variant="caption" color="tertiary" style={styles.moreSteps}>
                            +{item.instructions.length - 3}단계 더 있음
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                )}
              </Card>
            </TouchableOpacity>
          )
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="body" color="tertiary">검색 결과가 없어요</Text>
          </View>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topSection: { paddingHorizontal: spacing[4], paddingTop: 50, paddingBottom: spacing[2] },
  title: { marginBottom: spacing[3] },
  searchInput: { marginBottom: spacing[3] },
  filterList: { gap: spacing[2], paddingBottom: spacing[3] },
  filterBtn: { minWidth: 60 },
  listContent: { padding: spacing[4], gap: spacing[2] },
  exerciseCard: { padding: spacing[4] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  info: { flex: 1, gap: spacing[1] },
  badges: { flexDirection: 'row', gap: spacing[1], flexWrap: 'wrap' },
  rightActions: { alignItems: 'flex-end', gap: spacing[2] },
  expanded: {
    marginTop: spacing[3],
    gap: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing[3],
  },
  exerciseImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: colors.backgroundSecondary,
  },
  muscleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing[1] },
  muscleTag: { backgroundColor: colors.backgroundSecondary, paddingHorizontal: spacing[2], paddingVertical: 2, borderRadius: 12 },
  instructionBlock: { gap: spacing[2] },
  instructionRow: { flexDirection: 'row', gap: spacing[2], alignItems: 'flex-start' },
  stepNum: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, marginTop: 1,
  },
  stepText: { flex: 1 },
  moreSteps: { marginLeft: 28 },
  empty: { paddingTop: spacing[8], alignItems: 'center' },
})
