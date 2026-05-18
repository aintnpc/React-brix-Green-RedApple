#!/usr/bin/env python3
"""
weighttraining.guide 운동 데이터 크롤러
Exercise 타입에 맞는 JSON 데이터를 생성합니다.
출력: scripts/exercises_data.json
"""

import json
import re
import time
import warnings
from typing import Optional
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

warnings.filterwarnings("ignore")

BASE_URL = "https://weighttraining.guide"

CATEGORY_URLS = {
    "chest":       f"{BASE_URL}/exercises/chest/",
    "back":        f"{BASE_URL}/exercises/back/",
    "shoulders":   f"{BASE_URL}/exercises/shoulders/",
    "arms":        f"{BASE_URL}/exercises/arms/",
    "core":        f"{BASE_URL}/exercises/abdominals/",
    "lower_body":  f"{BASE_URL}/exercises/lower-body/",
}

# 세부 근육 → 대분류 카테고리 매핑
MUSCLE_TO_CATEGORY = {
    "chest":      "chest",
    "lats":       "back",
    "traps":      "back",
    "lower_back": "back",
    "back":       "back",
    "shoulders":  "shoulders",
    "biceps":     "arms",
    "triceps":    "arms",
    "forearms":   "arms",
    "abs":        "core",
    "obliques":   "core",
    "quads":      "legs_glutes",
    "hamstrings": "legs_glutes",
    "glutes":     "legs_glutes",
    "calves":     "legs_glutes",
}

# weighttraining.guide에서 사용하는 근육명 → MuscleGroup 매핑
MUSCLE_MAP = {
    # chest
    "pectoralis major": "chest",
    "pectoralis major, sternal": "chest",
    "pectoralis major, clavicular": "chest",
    "upper pectoralis": "chest",
    "lower pectoralis major": "chest",
    "pectoralis minor": "chest",

    # back / lats / traps / lower_back
    "latissimus dorsi": "lats",
    "trapezius": "traps",
    "trapezius, middle": "traps",
    "trapezius, lower": "traps",
    "trapezius, upper": "traps",
    "erector spinae": "lower_back",
    "lower back": "lower_back",
    "rhomboids": "back",
    "teres major": "back",
    "teres minor": "back",
    "infraspinatus": "shoulders",
    "supraspinatus": "shoulders",

    # shoulders
    "anterior deltoid": "shoulders",
    "lateral deltoid": "shoulders",
    "posterior deltoid": "shoulders",
    "deltoid": "shoulders",
    "deltoid, anterior": "shoulders",
    "deltoid, lateral": "shoulders",
    "deltoid, posterior": "shoulders",

    # arms
    "biceps brachii": "biceps",
    "brachialis": "biceps",
    "brachioradialis": "forearms",
    "forearm extensors": "forearms",
    "forearm flexors": "forearms",
    "wrist extensors": "forearms",
    "wrist flexors": "forearms",
    "triceps brachii": "triceps",

    # core
    "rectus abdominis": "abs",
    "obliques": "obliques",
    "transverse abdominis": "abs",
    "iliopsoas": "abs",
    "hip flexors": "abs",

    # lower body
    "quadriceps": "quads",
    "rectus femoris": "quads",
    "vastus lateralis": "quads",
    "vastus medialis": "quads",
    "hamstrings": "hamstrings",
    "biceps femoris": "hamstrings",
    "gluteus maximus": "glutes",
    "gluteus medius": "glutes",
    "gluteus minimus": "glutes",
    "glutes": "glutes",
    "gastrocnemius": "calves",
    "soleus": "calves",
    "calves": "calves",
    "adductors": "quads",
    "hip adductors": "quads",
    "tibialis anterior": "calves",
}

# 태그 → ExerciseEquipment 매핑
EQUIPMENT_KEYWORDS = {
    "barbell": "barbell",
    "dumbbell": "dumbbell",
    "dumbbells": "dumbbell",
    "cable": "cable",
    "machine": "machine",
    "kettlebell": "kettlebell",
    "resistance band": "resistance_band",
    "resistance-band": "resistance_band",
    "band": "resistance_band",
}

# 운동명 → 한국어 번역 (자주 쓰이는 운동 중심)
KOREAN_NAMES = {
    "bench press": "벤치 프레스",
    "barbell bench press": "바벨 벤치 프레스",
    "dumbbell bench press": "덤벨 벤치 프레스",
    "incline bench press": "인클라인 벤치 프레스",
    "decline bench press": "디클라인 벤치 프레스",
    "push-up": "푸시업",
    "push up": "푸시업",
    "pull-up": "풀업",
    "pull up": "풀업",
    "chin-up": "친업",
    "chin up": "친업",
    "squat": "스쿼트",
    "barbell squat": "바벨 스쿼트",
    "deadlift": "데드리프트",
    "barbell deadlift": "바벨 데드리프트",
    "romanian deadlift": "루마니안 데드리프트",
    "overhead press": "오버헤드 프레스",
    "barbell overhead press": "바벨 오버헤드 프레스",
    "shoulder press": "숄더 프레스",
    "lateral raise": "레터럴 레이즈",
    "front raise": "프론트 레이즈",
    "bicep curl": "바이셉 컬",
    "biceps curl": "바이셉스 컬",
    "hammer curl": "해머 컬",
    "tricep dip": "트라이셉 딥",
    "dip": "딥",
    "triceps pushdown": "트라이셉스 푸시다운",
    "lunge": "런지",
    "leg press": "레그 프레스",
    "leg curl": "레그 컬",
    "leg extension": "레그 익스텐션",
    "calf raise": "카프 레이즈",
    "crunch": "크런치",
    "plank": "플랭크",
    "sit-up": "싯업",
    "sit up": "싯업",
    "row": "로우",
    "bent-over row": "벤트오버 로우",
    "barbell row": "바벨 로우",
    "cable row": "케이블 로우",
    "fly": "플라이",
    "chest fly": "체스트 플라이",
    "dumbbell fly": "덤벨 플라이",
    "glute bridge": "글루트 브릿지",
    "hip thrust": "힙 스러스트",
    "face pull": "페이스 풀",
    "shrug": "슈러그",
    "wrist curl": "리스트 컬",
    "reverse curl": "리버스 컬",
    "arnold press": "아놀드 프레스",
    "preacher curl": "프리처 컬",
    "concentration curl": "컨센트레이션 컬",
    "skullcrusher": "스컬 크러셔",
    "close-grip bench press": "클로즈 그립 벤치 프레스",
    "sumo deadlift": "스모 데드리프트",
    "hack squat": "핵 스쿼트",
    "good morning": "굿모닝",
    "hyperextension": "하이퍼익스텐션",
    "cable crossover": "케이블 크로스오버",
    "pec deck": "펙 덱",
    "chest dip": "체스트 딥",
    "pull-over": "풀오버",
    "pullover": "풀오버",
}


def get_korean_name(english_name: str) -> str:
    lower = english_name.lower()
    if lower in KOREAN_NAMES:
        return KOREAN_NAMES[lower]
    # 부분 매칭
    for en, ko in KOREAN_NAMES.items():
        if en in lower:
            return ko
    return english_name  # 번역 없으면 영어 그대로


def map_muscle(raw: str) -> Optional[str]:
    cleaned = raw.strip().lower()
    cleaned = re.sub(r'\s*\(.*?\)', '', cleaned).strip()
    if cleaned in MUSCLE_MAP:
        return MUSCLE_MAP[cleaned]
    for key, val in MUSCLE_MAP.items():
        if key in cleaned:
            return val
    return None


def detect_equipment(tags: list[str], name: str) -> str:
    combined = " ".join(tags + [name]).lower()
    for kw, eq in EQUIPMENT_KEYWORDS.items():
        if kw in combined:
            return eq
    return "none"


def detect_category(mechanics: str, force: str) -> str:
    mech_low = mechanics.lower()
    force_low = force.lower()
    if "cardio" in mech_low or "endurance" in force_low:
        return "cardio"
    return "strength"


def detect_difficulty(equipment: str, mechanics: str) -> str:
    mech_low = mechanics.lower()
    if equipment == "barbell" and "compound" in mech_low:
        return "advanced"
    if equipment in ("dumbbell", "cable", "kettlebell"):
        return "intermediate"
    if equipment == "machine":
        return "beginner"
    if equipment == "none":
        return "beginner"
    return "intermediate"


def parse_exercise_detail(url: str, category_key: str) -> Optional[dict]:
    try:
        resp = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
        if resp.status_code != 200:
            return None
        soup = BeautifulSoup(resp.text, "html.parser")

        # 제목
        h1 = soup.find("h1")
        name = h1.get_text(strip=True) if h1 else ""
        if not name:
            return None

        # ID: URL slug
        slug = urlparse(url).path.strip("/").split("/")[-1]

        # 운동 세부정보 파싱
        details = {}
        entry_content = soup.find("div", class_=re.compile("entry-content|post-content|article-content", re.I))
        if not entry_content:
            entry_content = soup.find("article") or soup

        # Exercise details 섹션 파싱 (p 태그에서 Target muscle, Synergists, Mechanics, Force)
        for p in entry_content.find_all("p"):
            text = p.get_text(" ", strip=True)
            # "Target muscle: ..." 또는 "Target muscles: ..."
            if re.match(r"target muscles?:", text, re.I):
                details["target"] = re.split(r":\s*", text, maxsplit=1)[-1].strip()
            elif re.match(r"major synergists?:", text, re.I):
                details["synergists"] = re.split(r":\s*", text, maxsplit=1)[-1].strip()
            elif re.match(r"minor synergists?:", text, re.I):
                details["minor_synergists"] = re.split(r":\s*", text, maxsplit=1)[-1].strip()
            elif re.match(r"stabilizers?:", text, re.I):
                pass  # 안정근은 사용 안 함
            elif re.match(r"mechanics:", text, re.I):
                details["mechanics"] = re.split(r":\s*", text, maxsplit=1)[-1].strip()
            elif re.match(r"force:", text, re.I):
                details["force"] = re.split(r":\s*", text, maxsplit=1)[-1].strip()

        # 대안적 파싱: dt/dd 구조나 table 구조인 경우
        for dt in soup.find_all("dt"):
            label = dt.get_text(strip=True).lower().rstrip(":")
            dd = dt.find_next_sibling("dd")
            if dd:
                val = dd.get_text(" ", strip=True)
                if "target" in label:
                    details.setdefault("target", val)
                elif "synergist" in label and "minor" not in label:
                    details.setdefault("synergists", val)
                elif "mechanics" in label:
                    details.setdefault("mechanics", val)
                elif "force" in label:
                    details.setdefault("force", val)

        # Primary muscles
        primary_muscles = []
        if "target" in details:
            muscles = [m.strip() for m in re.split(r",\s*", details["target"])]
            for m in muscles:
                mapped = map_muscle(m)
                if mapped and mapped not in primary_muscles:
                    primary_muscles.append(mapped)

        # Secondary muscles
        secondary_muscles = []
        for key in ("synergists", "minor_synergists"):
            if key in details:
                muscles = [m.strip() for m in re.split(r",\s*", details[key])]
                for m in muscles:
                    mapped = map_muscle(m)
                    if mapped and mapped not in secondary_muscles and mapped not in primary_muscles:
                        secondary_muscles.append(mapped)

        # 기본값: 카테고리 기반 근육 fallback
        if not primary_muscles:
            default_muscles = {
                "chest": ["chest"],
                "back": ["lats"],
                "shoulders": ["shoulders"],
                "arms": ["biceps"],
                "core": ["abs"],
                "lower_body": ["quads"],
            }
            primary_muscles = default_muscles.get(category_key, [])

        # 대분류: primary_muscles 첫 번째 기준
        muscle_group = MUSCLE_TO_CATEGORY.get(primary_muscles[0], "other") if primary_muscles else "other"

        # 지시사항 파싱 (heading: "Starting position", "Execution" 등)
        instructions = []
        headings = entry_content.find_all(re.compile("^h[2-4]$"))
        for h in headings:
            heading_text = h.get_text(strip=True).lower()
            if any(kw in heading_text for kw in ["starting position", "execution", "steps", "how to"]):
                # 다음 형제 요소에서 ol/ul/p 찾기
                sibling = h.find_next_sibling()
                while sibling and sibling.name not in ["h2", "h3", "h4"]:
                    if sibling.name in ["ol", "ul"]:
                        for li in sibling.find_all("li"):
                            text = li.get_text(" ", strip=True)
                            if text:
                                instructions.append(text)
                    elif sibling.name == "p":
                        text = sibling.get_text(" ", strip=True)
                        if text and len(text) > 20:
                            instructions.append(text)
                    sibling = sibling.find_next_sibling()

        # li 태그에서 직접 파싱 (fallback)
        if not instructions:
            for ol in entry_content.find_all("ol"):
                for li in ol.find_all("li"):
                    text = li.get_text(" ", strip=True)
                    if text and len(text) > 10:
                        instructions.append(text)

        # 태그 추출 (equipment 감지용)
        tags = []
        for tag_elem in soup.find_all("a", rel=lambda r: r and "tag" in r):
            tags.append(tag_elem.get_text(strip=True).lower())
        # 포스트 태그가 rel 없이 있는 경우
        tags_section = soup.find("div", class_=re.compile("post-tags|tags|entry-tags", re.I))
        if tags_section:
            for a in tags_section.find_all("a"):
                tags.append(a.get_text(strip=True).lower())

        # 이미지 URL
        image_url = None
        featured_img = soup.find("img", class_=re.compile("post-top-featured|wp-post-image", re.I))
        if featured_img:
            image_url = featured_img.get("src")
        if not image_url:
            # og:image fallback
            og_img = soup.find("meta", property="og:image")
            if og_img:
                image_url = og_img.get("content")

        # GIF URL (있는 경우)
        gif_url = None
        for img in soup.find_all("img"):
            src = img.get("src", "")
            if src.lower().endswith(".gif"):
                gif_url = src
                break

        # Equipment, category, difficulty
        mechanics = details.get("mechanics", "")
        equipment = detect_equipment(tags, name)
        category = detect_category(mechanics, details.get("force", ""))
        difficulty = detect_difficulty(equipment, mechanics)

        return {
            "id": slug,
            "name": name,
            "name_ko": get_korean_name(name),
            "category": category,
            "equipment": equipment,
            "difficulty": difficulty,
            "muscle_group": muscle_group,
            "primary_muscles": primary_muscles,
            "secondary_muscles": secondary_muscles,
            "instructions": instructions[:10],
            "image_url": image_url,
            "gif_url": gif_url,
            "source_url": url,
        }

    except Exception as e:
        print(f"  ERROR parsing {url}: {e}")
        return None


def get_exercise_urls_from_category(category_url: str) -> list[str]:
    """카테고리 페이지의 모든 운동 URL 수집 (페이징 포함)"""
    urls = []
    page_url = category_url
    page = 1

    while page_url:
        print(f"  페이지 스캔: {page_url}")
        try:
            resp = requests.get(page_url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
            soup = BeautifulSoup(resp.text, "html.parser")
        except Exception as e:
            print(f"  ERROR: {e}")
            break

        # 운동 링크 수집 (exercises/ 경로, 카테고리/페이지 URL 제외)
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if (
                href.startswith(f"{BASE_URL}/exercises/")
                and href.count("/") == 5  # /exercises/slug/ 형태
                and not any(cat in href for cat in [
                    "/arms/", "/shoulders/", "/chest/", "/abdominals/",
                    "/back/", "/lower-body/", "/page/"
                ])
            ):
                if href not in urls:
                    urls.append(href)

        # 다음 페이지
        next_btn = soup.find("a", class_=re.compile("next", re.I))
        if next_btn and next_btn.get("href"):
            next_href = next_btn["href"]
            if next_href != page_url:
                page_url = next_href
                page += 1
                time.sleep(0.5)
            else:
                break
        else:
            break

    return urls


def main():
    all_exercises = []
    seen_ids = set()

    for category_key, category_url in CATEGORY_URLS.items():
        print(f"\n{'='*50}")
        print(f"카테고리: {category_key} ({category_url})")
        print(f"{'='*50}")

        exercise_urls = get_exercise_urls_from_category(category_url)
        print(f"  운동 URL {len(exercise_urls)}개 발견")

        for i, url in enumerate(exercise_urls):
            slug = urlparse(url).path.strip("/").split("/")[-1]
            if slug in seen_ids:
                print(f"  [{i+1}/{len(exercise_urls)}] 중복 건너뜀: {slug}")
                continue

            print(f"  [{i+1}/{len(exercise_urls)}] 크롤링: {slug}")
            exercise = parse_exercise_detail(url, category_key)

            if exercise:
                seen_ids.add(slug)
                all_exercises.append(exercise)

            time.sleep(0.8)  # 서버 부하 방지

    # 결과 저장
    output_path = "scripts/exercises_data.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(all_exercises, f, ensure_ascii=False, indent=2)

    print(f"\n\n{'='*50}")
    print(f"완료! 총 {len(all_exercises)}개 운동 저장됨")
    print(f"파일: {output_path}")
    print(f"{'='*50}")

    # 통계
    equip_counts = {}
    group_counts = {}
    muscle_counts = {}
    for ex in all_exercises:
        equip_counts[ex["equipment"]] = equip_counts.get(ex["equipment"], 0) + 1
        group_counts[ex["muscle_group"]] = group_counts.get(ex["muscle_group"], 0) + 1
        for m in ex.get("primary_muscles", []):
            muscle_counts[m] = muscle_counts.get(m, 0) + 1

    print("\n대분류별:")
    for k, v in sorted(group_counts.items(), key=lambda x: -x[1]):
        print(f"  {k}: {v}개")
    print("\n세부 근육별:")
    for k, v in sorted(muscle_counts.items(), key=lambda x: -x[1]):
        print(f"  {k}: {v}개")
    print("\n장비별:")
    for k, v in sorted(equip_counts.items(), key=lambda x: -x[1]):
        print(f"  {k}: {v}개")


if __name__ == "__main__":
    main()
