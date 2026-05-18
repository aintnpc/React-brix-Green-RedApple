import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GOAL_KO: Record<string, string> = { bulk: '증량', cut: '감량', maintain: '유지' }
const LEVEL_KO: Record<string, string> = { beginner: '초보자', intermediate: '중급자', advanced: '고급자' }

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
      buildInfo: {
        build_goal: string
        experience_level: string
        weight: number
      }
      totalSec: number
      totalSets: number
      totalVolume: number
      exerciseSummary: string
      weeklyHistory: {
        weekLabel: string
        totalVolume: number
        totalSets: number
        proteinRatio: number
      }[]
    }

    const { buildInfo, totalSec, totalSets, totalVolume, exerciseSummary, weeklyHistory } = body

    const historyStr = weeklyHistory.length > 0
      ? weeklyHistory.map((w) =>
          `  ${w.weekLabel}: 볼륨 ${w.totalVolume.toLocaleString()}kg, ${w.totalSets}세트, 단백질 달성 ${Math.round(w.proteinRatio * 100)}%`
        ).join('\n')
      : '  (데이터 없음 — 첫 세션)'

    const lastWeekVol = weeklyHistory.find((w) => w.weekLabel === '1주 전')?.totalVolume ?? null
    const volChangeLine = lastWeekVol && lastWeekVol > 0
      ? `볼륨 변화: ${lastWeekVol.toLocaleString()}kg → ${totalVolume.toLocaleString()}kg (${totalVolume >= lastWeekVol ? '+' : ''}${Math.round(((totalVolume - lastWeekVol) / lastWeekVol) * 100)}%)`
      : ''

    const prompt = `당신은 열정적이고 친근한 헬스 트레이너입니다. 다음 운동 세션 데이터와 최근 히스토리를 보고 짧은 피드백을 한국어로 작성하세요.

[사용자 정보]
- 목표: ${GOAL_KO[buildInfo.build_goal] ?? buildInfo.build_goal}
- 경력: ${LEVEL_KO[buildInfo.experience_level] ?? buildInfo.experience_level}
- 체중: ${buildInfo.weight}kg

[오늘 세션]
- 총 시간: ${Math.round(totalSec / 60)}분
- 총 세트: ${totalSets}개
- 총 볼륨: ${totalVolume.toLocaleString()}kg
${volChangeLine ? `- ${volChangeLine}` : ''}

[최근 4주 히스토리]
${historyStr}

[운동별 기록]
${exerciseSummary}

위 데이터를 바탕으로 다음 규칙을 지켜 피드백을 작성하세요:
1. 2~3문장으로 짧고 임팩트 있게
2. 히스토리가 있으면 반드시 구체적 수치 비교 언급 (예: "지난주보다 볼륨 15% 올랐어")
3. 단백질 달성률이 낮으면 식단 조언 포함
4. 잘한 점 + 다음 세션 한 가지 팁으로 마무리
5. 트레이너처럼 말하되 딱딱하지 않게, 반말로
6. 이모지 1~2개 사용
7. "피드백:" 같은 접두어 없이 바로 본문 시작`

    const geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 250, temperature: 0.8 },
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
    const feedback = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''

    return new Response(JSON.stringify({ feedback }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
