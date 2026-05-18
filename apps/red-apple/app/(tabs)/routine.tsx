import { useState } from 'react'
import { View, StyleSheet, FlatList, TouchableOpacity } from 'react-native'
import { Screen, Text, Card, Button, Badge, BottomSheet, Input } from '@repo/ui'
import { colorsDark as colors, spacing } from '@repo/theme'
import type { Exercise } from '@repo/shared'
import { useExerciseStore } from '../../store/exercise'

interface RoutineItem {
  exercise: Exercise
  sets: number
  reps: number
}

export default function RoutineScreen() {
  const { cart, removeFromCart, clearCart, saveRoutine } = useExerciseStore()
  const [routineItems, setRoutineItems] = useState<RoutineItem[]>([])
  const [editTarget, setEditTarget] = useState<Exercise | null>(null)
  const [editSets, setEditSets] = useState('3')
  const [editReps, setEditReps] = useState('10')

  // cart가 바뀔 때 routineItems 동기화
  const syncedItems: RoutineItem[] = cart.map((ex) => {
    const existing = routineItems.find((r) => r.exercise.id === ex.id)
    return existing ?? { exercise: ex, sets: 3, reps: 10 }
  })

  const openEdit = (exercise: Exercise) => {
    const item = syncedItems.find((r) => r.exercise.id === exercise.id)
    setEditSets(String(item?.sets ?? 3))
    setEditReps(String(item?.reps ?? 10))
    setEditTarget(exercise)
  }

  const applyEdit = () => {
    setRoutineItems(
      syncedItems.map((item) =>
        item.exercise.id === editTarget?.id
          ? { ...item, sets: Number(editSets) || 3, reps: Number(editReps) || 10 }
          : item
      )
    )
    setEditTarget(null)
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text variant="h3">내 루틴</Text>
          {cart.length > 0 && (
            <Text variant="caption" color="secondary">{cart.length}개 운동</Text>
          )}
        </View>
        {cart.length > 0 && (
          <Button label="전체 삭제" variant="ghost" size="sm" onPress={clearCart} />
        )}
      </View>

      {cart.length === 0 ? (
        <View style={styles.empty}>
          <Text variant="h3" style={styles.emptyIcon}>💪</Text>
          <Text variant="body" color="secondary" style={styles.emptyText}>
            근육 탐색에서 운동을 담아보세요
          </Text>
          <Text variant="caption" color="tertiary" style={styles.emptyText}>
            원하는 부위 터치 → 운동 선택 → 여기서 루틴 완성
          </Text>
        </View>
      ) : (
        <>
          <FlatList
            data={syncedItems}
            keyExtractor={(item) => item.exercise.id}
            contentContainerStyle={styles.list}
            renderItem={({ item, index }) => (
              <Card style={styles.itemCard}>
                <View style={styles.itemRow}>
                  <View style={styles.indexBadge}>
                    <Text variant="label" color="inverse">{index + 1}</Text>
                  </View>
                  <View style={styles.itemInfo}>
                    <Text variant="label">{item.exercise.name_ko || item.exercise.name}</Text>
                    <View style={styles.itemMeta}>
                      <Badge
                        label={item.exercise.primary_muscles
                          .slice(0, 2)
                          .map((m) => muscleLabel(m))
                          .join(' · ')}
                        variant="info"
                      />
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => removeFromCart(item.exercise.id)}
                    style={styles.removeBtn}
                  >
                    <Text variant="caption" color="tertiary">✕</Text>
                  </TouchableOpacity>
                </View>

                {/* 세트 / 횟수 설정 */}
                <TouchableOpacity
                  style={styles.setsRow}
                  onPress={() => openEdit(item.exercise)}
                >
                  <View style={styles.setItem}>
                    <Text variant="h3">{item.sets}</Text>
                    <Text variant="caption" color="secondary">세트</Text>
                  </View>
                  <Text variant="h3" color="tertiary">×</Text>
                  <View style={styles.setItem}>
                    <Text variant="h3">{item.reps}</Text>
                    <Text variant="caption" color="secondary">회</Text>
                  </View>
                  <Text variant="caption" color="accent" style={styles.editHint}>
                    수정 ›
                  </Text>
                </TouchableOpacity>
              </Card>
            )}
            ListFooterComponent={
              <Button
                label="루틴 저장하기"
                onPress={() => saveRoutine()}
                fullWidth
                style={styles.saveBtn}
              />
            }
          />
        </>
      )}

      {/* 세트/횟수 편집 바텀시트 */}
      <BottomSheet
        visible={!!editTarget}
        onClose={() => setEditTarget(null)}
        snapHeight={0.45}
      >
        <Text variant="h3">{editTarget?.name_ko}</Text>
        <Text variant="caption" color="secondary" style={styles.editSubtitle}>
          세트 수와 반복 횟수를 설정하세요
        </Text>

        <View style={styles.editRow}>
          <View style={styles.editField}>
            <Text variant="label">세트</Text>
            <View style={styles.counter}>
              <TouchableOpacity
                style={styles.counterBtn}
                onPress={() => setEditSets((v) => String(Math.max(1, Number(v) - 1)))}
              >
                <Text variant="h3">−</Text>
              </TouchableOpacity>
              <Text variant="h2" style={styles.counterValue}>{editSets}</Text>
              <TouchableOpacity
                style={styles.counterBtn}
                onPress={() => setEditSets((v) => String(Math.min(10, Number(v) + 1)))}
              >
                <Text variant="h3">+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.editDivider} />

          <View style={styles.editField}>
            <Text variant="label">횟수</Text>
            <View style={styles.counter}>
              <TouchableOpacity
                style={styles.counterBtn}
                onPress={() => setEditReps((v) => String(Math.max(1, Number(v) - 1)))}
              >
                <Text variant="h3">−</Text>
              </TouchableOpacity>
              <Text variant="h2" style={styles.counterValue}>{editReps}</Text>
              <TouchableOpacity
                style={styles.counterBtn}
                onPress={() => setEditReps((v) => String(Math.min(50, Number(v) + 1)))}
              >
                <Text variant="h3">+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <Button label="확인" onPress={applyEdit} fullWidth style={styles.applyBtn} />
      </BottomSheet>
    </Screen>
  )
}

function muscleLabel(m: string): string {
  const map: Record<string, string> = {
    chest: '가슴', back: '등', shoulders: '어깨',
    biceps: '이두', triceps: '삼두', abs: '복근',
    quads: '대퇴사두', hamstrings: '햄스트링', glutes: '둔근',
    calves: '종아리', traps: '승모근', lats: '광배근',
    lower_back: '하배부', forearms: '전완', obliques: '복사근',
  }
  return map[m] ?? m
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: spacing[4],
    marginBottom: spacing[4],
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[3],
    paddingBottom: spacing[16],
  },
  emptyIcon: { fontSize: 48 },
  emptyText: { textAlign: 'center' },
  list: {
    gap: spacing[3],
    paddingBottom: spacing[6],
  },
  itemCard: {
    padding: spacing[4],
    gap: spacing[3],
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  indexBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  itemInfo: {
    flex: 1,
    gap: spacing[1],
  },
  itemMeta: {
    flexDirection: 'row',
  },
  removeBtn: {
    padding: spacing[2],
  },
  setsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[4],
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 10,
    paddingVertical: spacing[3],
  },
  setItem: {
    alignItems: 'center',
    gap: 2,
    minWidth: 48,
  },
  editHint: {
    position: 'absolute',
    right: spacing[3],
  },
  saveBtn: {
    marginTop: spacing[2],
    marginBottom: spacing[4],
  },
  // 편집 바텀시트
  editSubtitle: {
    marginTop: spacing[1],
    marginBottom: spacing[5],
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    marginBottom: spacing[5],
  },
  editField: {
    flex: 1,
    alignItems: 'center',
    gap: spacing[3],
  },
  editDivider: {
    width: 1,
    height: 80,
    backgroundColor: colors.borderLight,
  },
  counter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
  },
  counterBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  counterValue: {
    minWidth: 40,
    textAlign: 'center',
  },
  applyBtn: {},
})
