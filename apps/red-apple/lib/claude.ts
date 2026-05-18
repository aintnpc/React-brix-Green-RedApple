import type { FoodItem } from '@repo/shared'
import { supabase } from './supabase'

export async function analyzeFoodImage(
  base64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg'
): Promise<FoodItem[]> {
  const { data, error } = await supabase.functions.invoke('analyze-food', {
    body: { mode: 'image', base64, mimeType },
  })
  if (error) throw error
  if (!data?.foods) throw new Error('Invalid response from analyze-food')
  return data.foods as FoodItem[]
}

export async function analyzeFoodText(text: string): Promise<FoodItem[]> {
  const { data, error } = await supabase.functions.invoke('analyze-food', {
    body: { mode: 'text', text },
  })
  if (error) throw error
  if (!data?.foods) throw new Error('Invalid response from analyze-food')
  return data.foods as FoodItem[]
}

export interface MealFeedbackContext {
  todayMuscles?: string[]
  proteinRatio?: number
  proteinGoal?: number
  proteinConsumed?: number
}

export async function generateMealFeedback(
  foods: FoodItem[],
  mealType: string,
  totalCalories: number,
  ctx?: MealFeedbackContext,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('analyze-food', {
    body: {
      mode: 'feedback',
      mealType,
      totalCalories,
      foods: foods.map((f) => ({ name: f.name, amount: f.amount, calories: f.nutrition.calories })),
      todayMuscles: ctx?.todayMuscles,
      proteinRatio: ctx?.proteinRatio,
      proteinGoal: ctx?.proteinGoal,
      proteinConsumed: ctx?.proteinConsumed,
    },
  })
  if (error) throw error
  return data?.comment ?? ''
}
