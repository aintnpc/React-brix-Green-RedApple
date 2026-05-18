export interface NutritionInfo {
  calories: number
  carbs: number       // g
  protein: number     // g
  fat: number         // g
  fiber?: number      // g
}

export interface FoodItem {
  id: string
  name: string
  amount: string      // "1개", "100g" 등
  nutrition: NutritionInfo
}

export interface MealLog {
  id: string
  user_id: string
  date: string        // YYYY-MM-DD
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  foods: FoodItem[]
  total_nutrition: NutritionInfo
  input_text?: string   // 유저가 입력한 원문
  image_url?: string
  ai_comment?: string
  created_at: string
}

export interface DailyNutritionGoal {
  calories: number
  carbs: number
  protein: number
  fat: number
}
