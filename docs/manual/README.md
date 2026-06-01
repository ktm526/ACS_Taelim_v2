# ACS 사용자 매뉴얼 자동 생성기

실제로 렌더링된 프론트엔드 화면을 **Playwright(Chromium)**로 캡처해, 스크린샷이 포함된 `USER_MANUAL.md` / `USER_MANUAL.html` / `USER_MANUAL.pdf` 를 자동 생성합니다.

## 사전 조건

1. **백엔드와 프론트엔드가 실행 중**이어야 합니다.
   ```bash
   # 프로젝트 루트에서
   pm2 start ecosystem.config.cjs
   # 또는 개별 실행
   # (frontend) npm run dev
   # (backend)  npm start
   ```
2. 기본적으로 프론트엔드는 `http://localhost:3000` 으로 가정합니다. 다를 경우 환경변수로 덮어쓰세요.

## 최초 1회 — 의존성 설치

```bash
cd docs/manual
npm install          # playwright, marked 설치
npm run install-browsers   # chromium 다운로드
```

## 사용법

### 전체 실행 (스크린샷 + Markdown + PDF)

```bash
cd docs/manual
npm run generate
```

성공 시 생성되는 파일:

```
docs/manual/
├── images/               # 자동 캡처된 스크린샷 (18장)
├── USER_MANUAL.md        # Markdown
├── USER_MANUAL.html      # HTML (PDF 변환용)
└── USER_MANUAL.pdf       # 최종 PDF
```

### 스크린샷만 다시 찍기

```bash
npm run generate:screens
```

### 스크린샷은 재활용하고 Markdown/PDF만 재생성

UI 설명 문구를 수정했을 때 유용합니다. `generate.mjs`의 `buildMarkdown()` 본문만 고친 후 실행하면 됩니다.

```bash
npm run generate:md
```

## 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `BASE_URL` | `http://localhost:3000` | 프론트엔드 주소 |
| `ADMIN_ID` | `admin` | 로그인 아이디 |
| `ADMIN_PW` | `admin1234` | 로그인 비밀번호 |
| `HEADLESS` | `1` | `0`이면 브라우저 창이 실제로 보이며 동작 확인 가능 |

### 예

```bash
BASE_URL=http://192.168.1.10:3000 ADMIN_PW=secret HEADLESS=0 npm run generate
```

## 시나리오 (스크립트가 자동으로 수행하는 동작)

> ⚠️ 실제 DB에 레코드가 생성/삭제됩니다. `MANUAL-DEMO-XXXXX` 이름의 **임시 AMR**이 한 번 추가되었다가 바로 제거됩니다.

1. 로그인 페이지 접속 → 로그인
2. 대시보드 전체 캡처
3. AMR 추가 모달 열기 → 입력 → **추가** (임시 AMR 생성)
4. 새 AMR 카드 클릭 → 상세 모달
5. **삭제** 버튼 → Popconfirm → 확정
6. 맵 관리 / 통신 로그 / 설정 페이지 이동 캡처
7. 설정 > 시스템 설정 · 사용자 관리 · 이동 지시 테스트 · 로봇 팔 테스트 탭 캡처
8. 이동 지시 테스트 탭에서 Action을 **CANCEL** 로 바꾼 폼 캡처
9. 우측 상단 사용자 드롭다운(로그아웃 메뉴) 캡처

## 문제 해결

- **로그인 화면에서 타임아웃** → `BASE_URL`이 맞는지, 프론트/백엔드가 실제로 뜨는지 확인.
- **AMR 추가/삭제에서 멈춤** → 백엔드가 `/api/amr` 엔드포인트에 500을 반환하는지 확인(콘솔 오류).
- **PDF만 다시 만들고 싶음** → `node -e "require('./generate.mjs')"`가 아니라 `npm run generate:md` 사용.
- **스크린샷이 깨짐 / 폰트가 못생김** → `HEADLESS=0`으로 실행해 눈으로 확인. 한글 폰트가 시스템에 설치되어 있어야 합니다 (macOS 기본 폰트로도 잘 렌더됩니다).

## 커스터마이징

- **스크린샷 추가/제거** → `generate.mjs` 의 `runScenarios()` 함수.
- **매뉴얼 본문 수정** → `buildMarkdown()` 함수의 템플릿 문자열.
- **PDF 스타일(폰트, 여백, 색상)** → `buildHtmlFromMarkdown()` 안의 `<style>` 블록.
