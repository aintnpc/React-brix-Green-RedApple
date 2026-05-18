# brix 명칭 변경 후속 작업

오늘 작업: diet-app → green-apple 폴더 변경, onfit → brix 패키지명 변경

---

## App Store Connect

- [ ] green-apple: Bundle ID `app.brix.greenapple` 으로 앱 등록 확인 (기존 `app.onfit.greenapple` 앱과 다른 앱으로 인식됨 — 신규 등록 필요)
- [ ] red-apple: Bundle ID `app.brix.redapple` 으로 앱 등록 확인

## RevenueCat

- [ ] green-apple 앱에서 Product ID `app.brix.greenapple.1week` / `app.brix.greenapple.2week` / `app.brix.greenapple.2week_x3` 신규 등록
- [ ] red-apple 앱에서 Product ID `app.brix.redapple.1week` / `app.brix.redapple.2week` / `app.brix.redapple.2week_x3` 등록 (설정 시점에)
- [ ] 기존 `app.onfit.*` Product ID 정리 (구매 이력 있으면 바로 삭제 금지)

## Xcode / iOS 빌드

- [ ] `apps/green-apple/ios/` 내 `.xcodeproj` 또는 `Info.plist`에 Bundle Identifier 하드코딩 여부 확인 → `app.brix.greenapple` 으로 맞춰야 EAS/Xcode 빌드 통과
- [ ] `apps/red-apple/ios/` 동일 확인

## Supabase

- [ ] red-apple용 신규 Supabase 프로젝트 생성 및 `.env` 분리 (todo-red.md Phase 1 항목)
