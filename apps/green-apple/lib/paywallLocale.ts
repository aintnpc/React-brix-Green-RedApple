// 국가별 페이월 비유 텍스트 + 이미지
// 이미지 파일은 assets/ 에 위치 — 없는 경우 KR fallback

import { getRegionCode } from './locale'

export type PlanKey = '1week' | '2week' | '2week_x3'

export interface PlanLocale {
  analogy: string
  analogySub: string
  image: ReturnType<typeof require>
}

export type RegionLocale = Record<PlanKey, PlanLocale>

// ─── 이미지 맵 ────────────────────────────────────────────────────────────────
// 이미지가 준비되지 않은 항목은 KR 이미지를 fallback으로 사용
const IMG = {
  // KR
  salt_bread:  require('../assets/salt_bread.png'),
  tteokbokki:  require('../assets/tteokbokki.png'),
  chicken:     require('../assets/chicken.png'),
  // US
  latte:       require('../assets/latte.png'),
  chipotle:    require('../assets/chipotle.png'),
  netflix:     require('../assets/netflix.png'),
  // CA
  timhortons:  require('../assets/timhortons.png'),
  poutine:     require('../assets/poutine.png'),
  spotify:     require('../assets/spotify.png'),
  // GB
  meal_deal:   require('../assets/meal_deal.png'),
  pret:        require('../assets/pret.png'),
  pizza:       require('../assets/pizza.png'),
  // JP
  convenience: require('../assets/convenience.png'),
  sukiya:      require('../assets/sukiya.png'),
  cafe_lunch:  require('../assets/cafe_lunch.png'),
  // SG
  hawker:      require('../assets/hawker.png'),
  kopitiam:    require('../assets/kopitiam.png'),
  // AU
  avo_toast:   require('../assets/avo_toast.png'),
  acai_bowl:   require('../assets/acai_bowl.png'),
  // TW
  boba:        require('../assets/boba.png'),
  bento:       require('../assets/bento.png'),
  hotpot:      require('../assets/hotpot.png'),
  // NZ (latte, acai_bowl, cafe_lunch 재사용)
}

// ─── 지역별 데이터 ────────────────────────────────────────────────────────────

const REGION_LOCALES: Partial<Record<string, RegionLocale>> = {
  KR: {
    '1week':    { analogy: '소금빵보다',        analogySub: ' 저렴하게', image: IMG.salt_bread },
    '2week':    { analogy: '엽기떡볶이보다',     analogySub: ' 저렴하게', image: IMG.tteokbokki },
    '2week_x3': { analogy: '치킨 한 마리보다',   analogySub: ' 저렴하게', image: IMG.chicken },
  },
  US: {
    '1week':    { analogy: 'Less than a latte',       analogySub: '', image: IMG.latte },
    '2week':    { analogy: 'Less than Chipotle',      analogySub: '', image: IMG.chipotle },
    '2week_x3': { analogy: 'Less than Netflix',       analogySub: '', image: IMG.netflix },
  },
  CA: {
    '1week':    { analogy: 'Less than Tim Hortons',   analogySub: '', image: IMG.timhortons },
    '2week':    { analogy: 'Cheaper than poutine',    analogySub: '', image: IMG.poutine },
    '2week_x3': { analogy: 'Less than Spotify',       analogySub: '', image: IMG.spotify },
  },
  GB: {
    '1week':    { analogy: 'Cheaper than a meal deal',   analogySub: '', image: IMG.meal_deal },
    '2week':    { analogy: 'Less than a Pret sandwich',  analogySub: '', image: IMG.pret },
    '2week_x3': { analogy: 'Cheaper than a pizza',       analogySub: '', image: IMG.pizza },
  },
  JP: {
    '1week':    { analogy: 'コンビニ弁当より安く',     analogySub: '', image: IMG.convenience },
    '2week':    { analogy: 'すき家より安く',            analogySub: '', image: IMG.sukiya },
    '2week_x3': { analogy: 'カフェランチより安く',      analogySub: '', image: IMG.cafe_lunch },
  },
  SG: {
    '1week':    { analogy: 'Less than a hawker meal',  analogySub: '', image: IMG.hawker },
    '2week':    { analogy: 'Less than a kopitiam set', analogySub: '', image: IMG.kopitiam },
    '2week_x3': { analogy: 'Less than a café lunch',   analogySub: '', image: IMG.cafe_lunch },
  },
  AU: {
    '1week':    { analogy: 'Less than a latte',        analogySub: '', image: IMG.latte },
    '2week':    { analogy: 'Cheaper than avo toast',   analogySub: '', image: IMG.avo_toast },
    '2week_x3': { analogy: 'Less than an acai bowl',   analogySub: '', image: IMG.acai_bowl },
  },
  TW: {
    '1week':    { analogy: '比珍珠奶茶便宜',   analogySub: '', image: IMG.boba },
    '2week':    { analogy: '比便當便宜',        analogySub: '', image: IMG.bento },
    '2week_x3': { analogy: '比一頓火鍋便宜',   analogySub: '', image: IMG.hotpot },
  },
  NZ: {
    '1week':    { analogy: 'Less than a latte',        analogySub: '', image: IMG.latte },
    '2week':    { analogy: 'Less than an acai bowl',   analogySub: '', image: IMG.acai_bowl },
    '2week_x3': { analogy: 'Less than a café lunch',   analogySub: '', image: IMG.cafe_lunch },
  },
}

const FALLBACK = REGION_LOCALES['KR']!

export function getPlanLocale(planId: PlanKey): PlanLocale {
  const region = getRegionCode()
  const regionData = REGION_LOCALES[region] ?? FALLBACK
  return regionData[planId]
}

export function getRegionLocale(): RegionLocale {
  const region = getRegionCode()
  return REGION_LOCALES[region] ?? FALLBACK
}
