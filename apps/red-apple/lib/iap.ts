import Purchases, {
  LOG_LEVEL,
  type PurchasesPackage,
  type CustomerInfo,
} from 'react-native-purchases'
import type { PlanType } from '../store/auth'

export const RC_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY!

export const PRODUCT_IDS: Record<string, PlanType> = {
  'app.brix.redapple.monthly': 'monthly',
  'app.brix.redapple.yearly':  'yearly',
}

export const PLAN_TO_PRODUCT_ID: Record<PlanType, string> = {
  'monthly': 'app.brix.redapple.monthly',
  'yearly':  'app.brix.redapple.yearly',
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
  if (!current) return []
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

export async function getActivePlan(): Promise<PlanType | null> {
  const info = await Purchases.getCustomerInfo()
  return extractActivePlan(info)
}

export function extractActivePlan(info: CustomerInfo): PlanType | null {
  const active = info.activeSubscriptions
  for (const productId of active) {
    const plan = PRODUCT_IDS[productId]
    if (plan) return plan
  }
  const entitlement = info.entitlements.active['premium']
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
