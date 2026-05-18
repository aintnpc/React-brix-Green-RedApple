import Purchases, {
  LOG_LEVEL,
  type PurchasesPackage,
  type CustomerInfo,
} from 'react-native-purchases'
import type { PlanType } from '../store/auth'

export const RC_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY!

// App Store Connect Product ID → PlanType 매핑
export const PRODUCT_IDS: Record<string, PlanType> = {
  'app.onfit.greenapple.1week.':   '1week',
  'app.onfit.greenapple.2weeks':   '2week',
  'app.onfit.greenapple.2week_x3': '2week_x3',
}

export const PLAN_TO_PRODUCT_ID: Record<PlanType, string> = {
  '1week':    'app.onfit.greenapple.1week.',
  '2week':    'app.onfit.greenapple.2weeks',
  '2week_x3': 'app.onfit.greenapple.2week_x3',
}

export function configureRevenueCat(userId?: string) {
  Purchases.setLogLevel(LOG_LEVEL.ERROR)
  Purchases.configure({ apiKey: RC_API_KEY, appUserID: userId })
}

export async function identifyUser(userId: string) {
  await Purchases.logIn(userId)
}

export async function getOfferings(): Promise<PurchasesPackage[]> {
  const offerings = await Purchases.getOfferings()
  const current = offerings.current
  if (!current) {
    console.warn('[getOfferings] current offering is null. all offerings:', JSON.stringify(offerings))
    return []
  }
  return current.availablePackages
}

export async function purchasePlan(plan: PlanType): Promise<CustomerInfo> {
  const packages = await getOfferings()
  const productId = PLAN_TO_PRODUCT_ID[plan]
  const pkg = packages.find((p) => p.product.identifier === productId)
  if (!pkg) throw new Error(`패키지를 찾을 수 없어요: ${productId}`)
  const { customerInfo } = await Purchases.purchasePackage(pkg)
  return customerInfo
}

// 현재 RC 서버 기준 활성 플랜 반환 (환불/만료 자동 반영)
export async function getActivePlan(): Promise<PlanType | null> {
  const info = await Purchases.getCustomerInfo()
  return extractActivePlan(info)
}

export function extractActivePlan(info: CustomerInfo): PlanType | null {
  const active = info.activeSubscriptions
  const nonSub = Object.keys(info.nonSubscriptionTransactions ?? {})
  const allActive = [...active, ...nonSub]
  for (const productId of allActive) {
    const plan = PRODUCT_IDS[productId]
    if (plan) return plan
  }
  // entitlements fallback
  const entitlement = info.entitlements.active['Premium'] ?? info.entitlements.active['premium']
  if (entitlement) {
    const plan = PRODUCT_IDS[entitlement.productIdentifier]
    if (plan) return plan
  }
  return null
}

export async function restorePurchases(): Promise<PlanType | null> {
  const info = await Purchases.restorePurchases()
  return extractActivePlan(info)
}
