import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`

type Lang = 'ko' | 'en' | 'ja' | 'zh'

// ─── Image prompt ─────────────────────────────────────────────────────────────

function getImagePrompt(lang: Lang): string {
  const nameInstr: Record<Lang, string> = {
    ko: '"name": "음식명 (항상 한국어로)", "amount": "음식 양 (한국어로, e.g. 1개, 1인분, 200g, 1공기)"',
    en: '"name": "food name in English", "amount": "portion size in English (e.g. 1 piece, 1 serving, 200g, 1 bowl)"',
    ja: '"name": "料理名（常に日本語で）", "amount": "分量（日本語で、例: 1個、1人前、200g、1膳）"',
    zh: '"name": "食物名称（始终用中文）", "amount": "份量（中文，例如：1个、1份、200g、1碗）"',
  }
  return `You are a food nutrition analyzer for a global diet app.
Identify each food item in the image and estimate its nutrition.
Respond ONLY with valid JSON, no explanation, no markdown fences.
Format:
{
  "foods": [
    {
      "id": "unique_id",
      ${nameInstr[lang]},
      "nutrition": {
        "calories": number,
        "carbs": number,
        "protein": number,
        "fat": number
      }
    }
  ]
}
Use realistic average portion sizes. All nutrition values are numbers only (no units in JSON values).`
}

// ─── Text prompt ──────────────────────────────────────────────────────────────

function getTextPrompt(lang: Lang): string {
  const example: Record<Lang, string> = {
    ko: '{"foods": [{"id": "1", "name": "음식명 (항상 한국어로)", "amount": "음식 양 (한국어로, e.g. 1개, 1인분, 200g, 1공기)", "nutrition": {"calories": 300, "carbs": 50, "protein": 20, "fat": 10}}]}',
    en: '{"foods": [{"id": "1", "name": "food name in English", "amount": "portion in English (e.g. 1 serving, 200g)", "nutrition": {"calories": 300, "carbs": 50, "protein": 20, "fat": 10}}]}',
    ja: '{"foods": [{"id": "1", "name": "料理名（日本語）", "amount": "分量（日本語、例: 1人前、200g）", "nutrition": {"calories": 300, "carbs": 50, "protein": 20, "fat": 10}}]}',
    zh: '{"foods": [{"id": "1", "name": "食物名称（中文）", "amount": "份量（中文，例如：1份、200g）", "nutrition": {"calories": 300, "carbs": 50, "protein": 20, "fat": 10}}]}',
  }
  return `You are a food nutrition analyzer. Respond ONLY with valid JSON, no markdown.
Format: ${example[lang]}
Use realistic nutrition values for the described foods. All nutrition values are numbers only.`
}

// ─── Feedback prompt ──────────────────────────────────────────────────────────

function getFeedbackPrompt(lang: Lang): string {
  const instructions: Record<Lang, string> = {
    ko: 'Write ONE sentence in Korean (20-50 characters), casual tone (반말), no emoji at start. Focus on calorie balance and today\'s diet goal — not muscle growth. Be specific to the actual foods eaten and calorie context. Respond with ONLY the sentence.',
    en: 'Write ONE sentence in English (20-60 words), friendly and encouraging tone, no emoji at start. Focus on calorie balance and today\'s diet goal — not muscle growth. Be specific to the actual foods eaten and calorie context. Respond with ONLY the sentence.',
    ja: '日本語で1文だけ書いてください（20〜50文字）、カジュアルなトーン、文頭に絵文字なし。カロリーバランスと今日の食事目標に集中してください。実際に食べた食事とカロリーの文脈に具体的に言及してください。文のみで回答してください。',
    zh: '用中文写一句话（20-50个字），语气友好鼓励，句首不加表情符号。专注于卡路里平衡和今天的饮食目标。请具体提及实际食物和卡路里情况。只回答这一句话。',
  }
  return `You are a diet coach helping users lose weight. ${instructions[lang]}`
}

// ─── Meal label ───────────────────────────────────────────────────────────────

function getMealLabel(mealType: string, lang: Lang): string {
  const labels: Record<string, Record<Lang, string>> = {
    breakfast: { ko: '아침', en: 'Breakfast', ja: '朝食', zh: '早餐' },
    lunch:     { ko: '점심', en: 'Lunch',     ja: '昼食', zh: '午餐' },
    dinner:    { ko: '저녁', en: 'Dinner',    ja: '夕食', zh: '晚餐' },
    snack:     { ko: '간식', en: 'Snack',     ja: '間食', zh: '零食' },
  }
  return labels[mealType]?.[lang] ?? mealType
}

// ─── CORS ─────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json() as {
      mode: 'image' | 'text' | 'feedback'
      lang?: Lang
      text?: string
      base64?: string
      mimeType?: string
      foods?: { name: string; amount: string; calories: number }[]
      mealType?: string
      totalCalories?: number
    }

    const lang: Lang = (['ko', 'en', 'ja', 'zh'] as Lang[]).includes(body.lang as Lang)
      ? (body.lang as Lang)
      : 'ko'

    let contents: unknown
    let systemInstruction: unknown
    let maxOutputTokens: number

    if (body.mode === 'image') {
      if (!body.base64) {
        return new Response(JSON.stringify({ error: 'base64 required for image mode' }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        })
      }
      systemInstruction = { parts: [{ text: getImagePrompt(lang) }] }
      contents = [{
        parts: [
          { inline_data: { mime_type: body.mimeType ?? 'image/jpeg', data: body.base64 } },
          { text: 'Analyze the foods in this image.' },
        ],
      }]
      maxOutputTokens = 4096

    } else if (body.mode === 'feedback') {
      const mealLabel = getMealLabel(body.mealType ?? 'snack', lang)
      const foodList = (body.foods ?? []).map((f) => `${f.name} ${f.amount} (${f.calories}kcal)`).join(', ')
      const userMsg = `${mealLabel}: ${foodList}. Total ${body.totalCalories}kcal`

      systemInstruction = { parts: [{ text: getFeedbackPrompt(lang) }] }
      contents = [{ parts: [{ text: userMsg }] }]
      maxOutputTokens = 500

    } else {
      if (!body.text) {
        return new Response(JSON.stringify({ error: 'text required for text mode' }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        })
      }
      systemInstruction = { parts: [{ text: getTextPrompt(lang) }] }
      contents = [{ parts: [{ text: body.text }] }]
      maxOutputTokens = 2048
    }

    const geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: systemInstruction,
        contents,
        generationConfig: { temperature: 0.1, maxOutputTokens, thinkingConfig: { thinkingBudget: 0 } },
      }),
    })

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      return new Response(JSON.stringify({ error: `Gemini error: ${errText}` }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const geminiData = await geminiRes.json()
    const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    if (body.mode === 'feedback') {
      console.log('[feedback] lang:', lang, 'input:', JSON.stringify({ mealType: body.mealType, foods: body.foods, totalCalories: body.totalCalories }))
      console.log('[feedback] raw response:', raw)
      return new Response(JSON.stringify({ comment: raw.trim() }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const cleaned = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)

    return new Response(JSON.stringify(parsed), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
