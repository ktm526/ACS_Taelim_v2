#!/usr/bin/env node
/**
 * ACS 사용자 매뉴얼 자동 생성기
 *
 * 사용법:
 *   node generate.mjs                  # 스크린샷 + Markdown + PDF 모두 생성
 *   node generate.mjs --md-only        # 기존 스크린샷으로 Markdown/PDF만 재생성
 *   node generate.mjs --screenshots-only
 *
 * 환경변수 (선택):
 *   BASE_URL   : 프론트엔드 주소 (기본 http://localhost:3000)
 *   ADMIN_ID   : 로그인 아이디 (기본 admin)
 *   ADMIN_PW   : 로그인 비밀번호 (기본 admin1234)
 *   HEADLESS   : 0이면 브라우저 창을 보여줌 (기본 1 = headless)
 */

import { chromium } from 'playwright';
import { marked } from 'marked';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.join(__dirname, 'images');
const MD_OUT = path.join(__dirname, 'USER_MANUAL.md');
const HTML_OUT = path.join(__dirname, 'USER_MANUAL.html');
const PDF_OUT = path.join(__dirname, 'USER_MANUAL.pdf');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_ID = process.env.ADMIN_ID || 'admin';
const ADMIN_PW = process.env.ADMIN_PW || 'admin1234';
const HEADLESS = process.env.HEADLESS !== '0';

const args = new Set(process.argv.slice(2));
const MD_ONLY = args.has('--md-only');
const SHOT_ONLY = args.has('--screenshots-only');

/* ─────────────────────────────────────────────────────────
 *  스크린샷 메타데이터: 시나리오 스크립트가 기록, 템플릿이 참조
 * ───────────────────────────────────────────────────────── */
const shots = [];

async function shot(page, name, options = {}) {
  const {
    caption = '',
    clip = null,
    selector = null,
    fullPage = false,
    delay = 300,
  } = options;

  await page.waitForTimeout(delay);

  const file = path.join(IMAGES_DIR, `${name}.png`);
  if (selector) {
    const el = await page.$(selector);
    if (!el) throw new Error(`selector not found: ${selector}`);
    await el.screenshot({ path: file });
  } else if (clip) {
    await page.screenshot({ path: file, clip });
  } else {
    await page.screenshot({ path: file, fullPage });
  }
  shots.push({ name, caption });
  console.log(`   📸  ${name}.png  —  ${caption || '(no caption)'}`);
}

/* 이전 실행의 데모 AMR 정리 (prefix MANUAL-DEMO-) */
async function cleanupStaleDemoAmrs(page) {
  const result = await page.evaluate(async () => {
    const res = await fetch('/api/amrs');
    if (!res.ok) return { removed: 0, error: `list status ${res.status}` };
    const list = await res.json();
    const targets = (Array.isArray(list) ? list : []).filter(
      (a) => typeof a.amr_name === 'string' && a.amr_name.startsWith('MANUAL-DEMO-')
    );
    let removed = 0;
    for (const a of targets) {
      try {
        const r = await fetch(`/api/amrs/${a.amr_id}`, { method: 'DELETE' });
        if (r.ok) removed++;
      } catch {}
    }
    return { removed, total: targets.length };
  });
  if (result?.removed) {
    console.log(`   🧹  이전 데모 AMR ${result.removed}건 정리`);
    await page.waitForTimeout(2500);
  }
}

/* ─────────────────────────────────────────────────────────
 *  시나리오: 실제 프론트엔드와 상호작용하며 스크린샷 캡처
 * ───────────────────────────────────────────────────────── */
async function runScenarios() {
  await fs.mkdir(IMAGES_DIR, { recursive: true });

  console.log(`\n🚀  매뉴얼 스크린샷 생성 시작`);
  console.log(`    BASE_URL = ${BASE_URL}`);
  console.log(`    계정      = ${ADMIN_ID} / ********`);
  console.log(`    HEADLESS = ${HEADLESS}\n`);

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: 'ko-KR',
  });
  // 모든 action/navigation 기본 타임아웃을 넉넉하게
  context.setDefaultTimeout(30000);
  context.setDefaultNavigationTimeout(30000);
  const page = await context.newPage();

  try {
    /* ── 1. 로그인 페이지 ── */
    console.log('── 1. 로그인 페이지');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForSelector('input[placeholder="아이디"]', { timeout: 15000 });
    await shot(page, '01-login-empty', { caption: '로그인 페이지 초기 화면' });

    await page.fill('input[placeholder="아이디"]', ADMIN_ID);
    await page.fill('input[placeholder="비밀번호"]', ADMIN_PW);
    await shot(page, '02-login-filled', { caption: '아이디/비밀번호 입력 완료' });

    await page.click('button:has-text("로그인")');
    await page.waitForURL(`${BASE_URL}/`, { timeout: 15000 });
    await page.waitForTimeout(2500); // 대시보드 폴링 데이터 대기

    /* ── 2. 대시보드 전체 ── */
    console.log('── 2. 대시보드');
    await shot(page, '03-dashboard-overview', {
      caption: '로그인 후 대시보드 화면 (상단 AMR 리스트 + 지도)',
      fullPage: false,
    });

    /* ── 3. AMR 추가 ── */
    console.log('── 3. AMR 추가');
    const testAmrName = `MANUAL-DEMO-${Date.now().toString().slice(-5)}`;
    const testAmrIp = '192.168.99.199';

    // 이전 실행에서 남은 MANUAL-DEMO-* AMR이 있으면 먼저 제거 (중복 방지)
    await cleanupStaleDemoAmrs(page).catch((e) => console.warn('  (cleanup skip:', e.message, ')'));

    // AMR 추가 (+) 버튼 클릭 - 대시보드 상단 우측의 대시 박스
    const plusBtn = page.locator('div[style*="1.5px dashed"]').first();
    await plusBtn.click();
    // "AMR 추가" 타이틀을 가진 모달이 실제로 visible 해질 때까지
    const addModal = page.locator('.ant-modal:visible', { has: page.locator('.ant-modal-title:has-text("AMR 추가")') }).first();
    await addModal.waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(400);
    await shot(page, '04-amr-add-modal-empty', { caption: 'AMR 추가 모달 (초기)' });

    await page.fill('input[placeholder="예: AMR-01"]', testAmrName);
    await page.fill('input[placeholder="예: 192.168.1.100"]', testAmrIp);
    await shot(page, '05-amr-add-modal-filled', { caption: 'AMR 정보 입력 완료' });

    // "추가" 버튼 (AMR 추가 모달의 footer primary button) 클릭
    await addModal.locator('.ant-modal-footer button.ant-btn-primary:has-text("추가")').click();
    // 모달이 사라질 때까지 대기 (AD는 destroyOnClose 미지정이라 DOM은 남지만 숨김 처리됨)
    await addModal.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    // 폴링(2초)으로 리스트가 갱신되기를 충분히 대기
    await page.waitForTimeout(3000);
    await shot(page, '06-amr-add-done', { caption: '추가된 AMR이 상단 리스트에 표시됨' });

    /* ── 4. AMR 상세 모달 ── */
    console.log('── 4. AMR 상세');
    // 새로 추가된 AMR 카드 클릭 (AMR 이름 Text 엘리먼트 클릭 → 부모 div의 onClick 버블링)
    const amrNameEl = page.getByText(testAmrName, { exact: true }).first();
    await amrNameEl.waitFor({ state: 'visible', timeout: 15000 });
    await amrNameEl.scrollIntoViewIfNeeded().catch(() => {});
    await amrNameEl.click();

    // 상세 모달은 "ClearError" 버튼으로 유일하게 식별됨
    const detailModal = page.locator('.ant-modal:visible', { has: page.locator('button:has-text("ClearError")') }).first();
    await detailModal.waitFor({ state: 'visible', timeout: 20000 });
    // 모달 내 데이터가 2초 폴링으로 채워지기를 대기
    await page.waitForTimeout(2500);
    await shot(page, '07-amr-detail', {
      caption: 'AMR 상세 모달 (배터리 · 좌표 · 에러/정지 · 태스크 · 로봇팔)',
    });

    /* ── 5. AMR 삭제 (Popconfirm) ── */
    console.log('── 5. AMR 삭제');
    // 상세 모달 footer 안의 danger 삭제 버튼만 대상으로
    const deleteTrigger = detailModal.locator('.ant-modal-footer .ant-btn-dangerous:has-text("삭제")').first();
    await deleteTrigger.click();
    // Popconfirm은 body 직하단에 렌더링되므로 page 전체에서 찾되, visible 한정
    const popconfirm = page.locator('.ant-popover:visible .ant-popconfirm-buttons').first();
    await popconfirm.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);
    await shot(page, '08-amr-delete-confirm', { caption: 'AMR 삭제 확인 Popconfirm' });

    // Popconfirm 내의 최종 "삭제" 확정 버튼
    const confirmBtn = popconfirm.locator('.ant-btn-dangerous:has-text("삭제")').first();
    await confirmBtn.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
    await confirmBtn.click({ force: true }).catch(async () => {
      // fallback: 보이는 danger 삭제 버튼 중 가장 마지막(보통 popconfirm)
      const all = await page.locator('button.ant-btn-dangerous:has-text("삭제"):visible').all();
      const target = all[all.length - 1];
      if (target) await target.click({ force: true });
    });
    // 상세 모달이 사라질 때까지 대기
    await detailModal.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await shot(page, '09-amr-delete-done', { caption: '삭제 후 AMR 리스트' });

    /* ── 6. 지도 조작 — AMR 이동 명령 설명 ── */
    console.log('── 6. 지도 캔버스');
    await shot(page, '10-map-canvas', {
      caption: '지도 캔버스 (드래그 이동, 휠 확대/축소, 우클릭으로 이동 명령)',
      selector: '.ant-card',
    });

    /* ── 7. 맵 관리 페이지 ── */
    console.log('── 7. 맵 관리 페이지');
    await page.click('li[role="menuitem"]:has-text("맵 관리")');
    await page.waitForTimeout(1500);
    await shot(page, '11-map-management', { caption: '맵 관리 페이지' });

    /* ── 8. 통신 로그 페이지 ── */
    console.log('── 8. 통신 로그 페이지');
    await page.click('li[role="menuitem"]:has-text("통신 로그")');
    await page.waitForTimeout(1500);
    await shot(page, '12-log-page', { caption: '통신 로그 페이지' });

    /* ── 9. 설정 페이지 ── */
    console.log('── 9. 설정 페이지');
    await page.click('li[role="menuitem"]:has-text("설정")');
    await page.waitForTimeout(1500);

    // 탭1: 시스템 설정
    await shot(page, '13-settings-system', { caption: '설정 > 시스템 설정 탭' });

    // 탭2: 사용자 관리
    await page.click('.ant-tabs-tab:has-text("사용자 관리")');
    await page.waitForTimeout(1200);
    await shot(page, '14-settings-users', { caption: '설정 > 사용자 관리 탭' });

    // 탭3: 이동 지시 테스트 (태스크 생성/삭제)
    await page.click('.ant-tabs-tab:has-text("이동 지시 테스트")');
    await page.waitForTimeout(1500);
    await shot(page, '15-settings-move-cmd', {
      caption: '설정 > 이동 지시 테스트 (태스크 EXECUTE/CANCEL)',
    });

    // Task ID 자동 채우기
    await page.locator('text=자동').first().click().catch(() => {});
    await page.waitForTimeout(300);
    // Action 드롭다운 열고 CANCEL 선택
    const actionSelect = page.locator('.ant-form-item:has(label:text("Action")) .ant-select').first();
    await actionSelect.click().catch(() => {});
    await page.waitForTimeout(300);
    await page.locator('.ant-select-item-option:has-text("CANCEL")').first().click().catch(() => {});
    await page.waitForTimeout(400);
    await shot(page, '16-settings-task-cancel-form', {
      caption: 'Task ID만 채우고 Action을 CANCEL로 전환한 상태 (태스크 취소 요청)',
    });

    // 탭4: 로봇 팔 테스트
    await page.click('.ant-tabs-tab:has-text("로봇 팔 테스트")');
    await page.waitForTimeout(1200);
    await shot(page, '17-settings-arm-cmd', { caption: '설정 > 로봇 팔 테스트 탭' });

    /* ── 10. 사용자 드롭다운 (로그아웃) ── */
    console.log('── 10. 사용자 메뉴');
    await page.locator('.ant-layout-header .ant-avatar').first().click();
    await page.waitForTimeout(600);
    await shot(page, '18-user-dropdown', { caption: '우측 상단 사용자 메뉴 (로그아웃)' });

    console.log('\n✅  스크린샷 캡처 완료\n');
  } finally {
    await browser.close();
  }
}

/* ─────────────────────────────────────────────────────────
 *  Markdown 매뉴얼 템플릿
 * ───────────────────────────────────────────────────────── */
function buildMarkdown() {
  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const img = (name, caption) =>
    `![${caption}](images/${name}.png)\n\n*${caption}*\n`;

  return `# ACS (AMR Control System) 사용자 매뉴얼

> **발행일**: ${today}
> **대상 버전**: frontend ${readPkgVersion('../../frontend/package.json')}, backend ${readPkgVersion('../../backend/package.json')}
> **접속 주소 예시**: ${BASE_URL}

본 매뉴얼은 ACS 시스템의 화면별 사용법을 실제 렌더링된 UI 스크린샷과 함께 설명합니다.

---

## 목차

1. [로그인](#1-로그인)
2. [대시보드 개요](#2-대시보드-개요)
3. [AMR 추가](#3-amr-추가)
4. [AMR 상세 확인](#4-amr-상세-확인)
5. [AMR 제거](#5-amr-제거)
6. [AMR 이동 명령](#6-amr-이동-명령)
7. [태스크 확인 및 취소(삭제)](#7-태스크-확인-및-취소삭제)
8. [맵 관리](#8-맵-관리)
9. [통신 로그](#9-통신-로그)
10. [설정 페이지](#10-설정-페이지)
11. [시스템 재시작(PM2)](#11-시스템-재시작pm2)
12. [로그아웃](#12-로그아웃)

---

## 1. 로그인

\`/login\` 경로에서 관리자 계정으로 로그인합니다.

${img('01-login-empty', '로그인 페이지 초기 화면')}

아이디와 비밀번호를 입력하고 **로그인** 버튼을 클릭합니다.

${img('02-login-filled', '아이디/비밀번호 입력 완료')}

- 입력값이 비어있으면 필드 하단에 “아이디를 입력하세요” / “비밀번호를 입력하세요” 검증 메시지가 표시됩니다.
- 인증 실패 시 우측 상단 토스트로 “로그인에 실패했습니다.” 메시지가 표시됩니다.
- 로그인이 성공하면 \`/\` (대시보드)로 이동합니다. \`role === 'admin'\` 계정만 사이드바(맵 관리 / 통신 로그 / 설정)가 표시됩니다.

---

## 2. 대시보드 개요

대시보드는 상단의 **AMR 가로 리스트**와 하단의 **맵 캔버스**로 구성됩니다.

${img('03-dashboard-overview', '대시보드 전체 레이아웃')}

- **AMR 카드**: 아이콘 + 이름 + 상태 태그(대기/이동/오류/정지/비상정지/연결 끊김), 배터리, 현재 위치, 목적지를 한 줄에 표시합니다.
- **추적 버튼(조준 아이콘)**: AMR 카드 우측의 정사각형 영역을 누르면 해당 AMR을 따라 지도 카메라가 이동합니다. 다시 누르면 추적 해제.
- **+ 버튼**: AMR 리스트 맨 끝의 점선 테두리 박스. 새로운 AMR을 추가합니다.
- **맵 변경 버튼**: 지도 카드 우측 상단의 톱니 아이콘 버튼. 업로드된 맵 중 하나를 선택합니다.

${img('10-map-canvas', '지도 캔버스')}

- **드래그**: 지도를 이동합니다.
- **마우스 휠**: 확대/축소.
- **우클릭**: 빈 공간이 아닌 **스테이션 위에서** 우클릭하면 AMR을 선택해 이동 명령을 전송할 수 있는 메뉴가 뜹니다.

---

## 3. AMR 추가

대시보드 상단의 **+ 버튼**(점선 테두리)을 클릭합니다.

${img('04-amr-add-modal-empty', 'AMR 추가 모달 초기 상태')}

**AMR 이름**과 **IP 주소**를 입력합니다.

${img('05-amr-add-modal-filled', '입력 완료')}

- 이름과 IP는 필수입니다.
- **추가** 버튼을 누르면 \`POST /api/amr\` 요청이 전송되고, 초기 상태는 \`NO_CONN\`으로 등록됩니다.
- 백엔드의 AMR 모니터 서비스가 해당 IP로 연결되면 상태가 \`IDLE / MOVING / STOP / ERROR / E-STOP\` 등으로 갱신됩니다.

${img('06-amr-add-done', '추가 완료 화면')}

---

## 4. AMR 상세 확인

상단 리스트에서 AMR 카드의 **정보 영역**(좌측, 추적 버튼이 아닌 부분)을 클릭하면 상세 모달이 열립니다.

${img('07-amr-detail', 'AMR 상세 모달')}

모달은 다음 섹션으로 구성됩니다:

1. **상단 헤더**: 이름, 상태 태그, IP, **ClearError** 버튼(DI 11/12 에러 초기화).
2. **요약 카드 4개**: 배터리, 현재 위치, 목적지, 좌표(\`x, y\`).
3. **에러 / 정지 상태 테이블**: 발생한 에러 코드와 메시지, \`stop_code\`, \`task_status_raw\`를 표시. 이슈가 있으면 붉은 톤으로 강조됩니다.
4. **상세 정보 (접기)**: AMR ID, IP, 각도(°), 맵, 마지막 수신 시간.
5. **태스크**: 해당 AMR에 할당된 태스크 최근 20건. \`RUNNING\` 태스크는 좌측 파란색 바로 강조되고 상단에 뱃지 카운트가 뜹니다. 20건을 넘으면 “이전 태스크 N건 더보기” 버튼으로 확장 가능.
6. **로봇 팔 (Doosan)**: 관절별 온도/위치/토크/전류 표, ROBOT_STATUS, VISION_ERROR 등. 온도가 50도 이상이면 붉은색, 40도 이상이면 노란색으로 표시됩니다. 2초 주기 폴링.

---

## 5. AMR 제거

**상세 모달 하단 좌측**의 빨간색 **삭제** 버튼을 누르면 확인 Popconfirm이 표시됩니다.

${img('08-amr-delete-confirm', 'AMR 삭제 확인')}

**삭제**를 최종 확인하면 \`DELETE /api/amr/:id\`가 호출되고, 리스트에서 해당 AMR이 사라집니다.

${img('09-amr-delete-done', '삭제 완료')}

> ⚠️ 삭제 후에는 복구할 수 없습니다. 해당 AMR의 기존 태스크 이력은 DB에 남아있을 수 있습니다.

---

## 6. AMR 이동 명령

AMR을 특정 스테이션으로 보내는 방법은 두 가지입니다.

### 방법 A — 지도에서 우클릭 (권장)

1. 대시보드 하단 지도 캔버스에서 목적지로 사용할 **스테이션 아이콘 위에서 우클릭**합니다.
2. 표시되는 컨텍스트 메뉴에서 **해당 스테이션으로 보낼 AMR**을 선택합니다.
3. 백엔드가 \`POST /api/amr/:id/navigate\`를 호출해 이동 명령을 전송하고, 성공 시 상단 토스트에 “\`<AMR 이름>\` → \`<스테이션>\` 이동 명령 전송 완료” 메시지가 표시됩니다.

> ℹ️ 빈 공간이 아닌 **스테이션 위에서** 우클릭해야 메뉴가 뜹니다.

### 방법 B — 설정 > 이동 지시 테스트 탭 (MES API 시뮬레이션)

${img('15-settings-move-cmd', '설정 > 이동 지시 테스트')}

1. **Task ID**: 고유 숫자. 우측의 **자동** 텍스트를 클릭하면 현재 시각 기준으로 6자리가 자동 입력됩니다.
2. **AMR**: 목록에서 선택(상태가 함께 표시됨).
3. **Action**: \`EXECUTE\` — 태스크 생성 및 이동 시작. \`CANCEL\` — 해당 Task ID 태스크 취소.
4. **목적지**: 현재 맵의 스테이션 중 선택.
5. **전송** 버튼을 누르면 \`POST /api/move-command\`가 호출되고, 하단에 \`result_msg\`와 \`server_time\`이 표시됩니다.

---

## 7. 태스크 확인 및 취소(삭제)

### 7-1. AMR 상세 모달에서 확인

AMR 상세 모달의 **태스크** 섹션에서 해당 AMR에 할당된 최근 태스크를 확인할 수 있습니다. 각 행은 Task ID, 타입(\`MOVE\`/\`ARM\`), 상태(\`PENDING\`/\`RUNNING\`/\`DONE\`/\`FAILED\`/\`CANCELED\`), 에러 코드, 생성 시각을 표시합니다.

### 7-2. 설정 > 이동 지시 테스트 탭의 태스크 목록

${img('15-settings-move-cmd', '태스크 목록 표시')}

- **상태별 색상**: RUNNING(파랑 processing), FINISHED(초록), ERROR(빨강), CANCELLED(회색), PENDING(주황).
- **새로고침** 버튼 또는 3초 주기 폴링으로 자동 갱신됩니다.

### 7-3. 태스크 취소(삭제)

태스크를 삭제(취소)하려면 해당 태스크의 **Task ID**를 그대로 넣고 Action을 **CANCEL**로 바꿔 전송합니다.

${img('16-settings-task-cancel-form', 'CANCEL 요청 폼')}

- \`EXECUTE\`로 만들어진 태스크라도 \`RUNNING\` 중간에 \`CANCEL\`을 보내면 백엔드가 태스크를 중단 처리하고 상태가 \`CANCELLED\`로 바뀝니다.
- 로봇 팔 태스크는 **설정 > 로봇 팔 테스트** 탭에서 동일한 방식으로 \`CANCEL\`을 전송합니다.

${img('17-settings-arm-cmd', '설정 > 로봇 팔 테스트')}

---

## 8. 맵 관리

관리자 계정만 접근 가능합니다. 좌측 사이드바에서 **맵 관리**를 선택합니다.

${img('11-map-management', '맵 관리 페이지')}

- **업로드**: \`.json\` 또는 \`.smap\` 파일 업로드. 업로드 즉시 목록에 추가되며, DB에 스테이션/경로 정보가 함께 저장됩니다.
- **미리보기**: 맵 행의 👁 버튼으로 캔버스에서 스테이션/경로 확인.
- **현재 맵 지정**: ✓ 버튼을 누르면 해당 맵이 대시보드의 기본 맵으로 설정됩니다.
- **AMR 맵 불러오기**: AMR 컨트롤러에서 저장된 맵을 내려받아 ACS에 등록할 수 있습니다.
- **삭제**: 🗑 버튼, 확인 후 DB에서 제거됩니다.

---

## 9. 통신 로그

관리자 전용. ACS 서버가 MES/로봇과 주고받은 요청/응답 로그를 확인합니다.

${img('12-log-page', '통신 로그 페이지')}

- 방향(IN/OUT), 시간, 엔드포인트, 페이로드, 상태 코드 등을 시간순으로 표시합니다.
- 문제가 의심되는 구간의 요청·응답 원문을 그대로 확인할 수 있어 트러블슈팅에 사용됩니다.

---

## 10. 설정 페이지

관리자 전용. 4개의 탭이 있습니다.

### 10-1. 시스템 설정

${img('13-settings-system', '시스템 설정 탭')}

키–값 형태로 시스템 동작에 필요한 파라미터(예: \`mes_ip\`, 폴링 주기, 타임아웃 등)를 관리합니다. **설정 추가 / 수정(연필 버튼) / 삭제(휴지통)** 기능을 제공합니다.

### 10-2. 사용자 관리

${img('14-settings-users', '사용자 관리 탭')}

- 시스템 접속 계정을 추가/수정/삭제합니다.
- **역할**: \`admin\` 또는 \`user\`. 일반 사용자는 대시보드만 볼 수 있습니다.
- \`admin\` 계정은 삭제할 수 없도록 보호되어 있습니다.
- 비밀번호는 **수정 시 공란이면 유지**되고, 값이 있으면 새 비밀번호로 교체됩니다.

### 10-3. 이동 지시 테스트

앞서 **6. AMR 이동 명령**, **7. 태스크 확인/취소**에서 설명한 MOVE_COMMAND 시뮬레이터입니다.

### 10-4. 로봇 팔 테스트

${img('17-settings-arm-cmd', '로봇 팔 테스트 탭')}

ARM_COMMAND(로봇 팔 이송 작업)를 시뮬레이션합니다. 입력 파라미터는 \`from_location_id1/2\`, \`to_location_id1/2\`, \`vision_check\`(0 또는 1)이며, 완료 시점은 DI11 신호 수신을 기다립니다.

---

## 11. 시스템 재시작(PM2)

ACS 백엔드/프론트엔드는 **PM2**로 관리됩니다(\`ecosystem.config.cjs\` 기준: \`acs-backend\`, \`acs-frontend-dev\`).

터미널에서 다음 명령을 사용합니다.

\`\`\`bash
# 현재 상태 조회
pm2 status

# 전체 재시작
pm2 restart all

# 개별 재시작
pm2 restart acs-backend
pm2 restart acs-frontend-dev

# 실시간 로그 확인
pm2 logs acs-backend --lines 100
pm2 logs acs-frontend-dev --lines 100

# 멈춘 프로세스만 되살리기
pm2 resurrect

# 시스템 부팅 시 자동 실행 등록
pm2 startup
pm2 save
\`\`\`

> ⚠️ **\`pm2 restart all\`**은 서비스가 재기동되는 수 초 동안 프론트엔드 화면이 일시적으로 응답하지 않을 수 있습니다.
> - 연결이 끊긴 AMR은 재기동 후 자동으로 다시 연결 시도됩니다(\`autorestart: true\`).
> - 긴급 정지가 필요할 땐 \`pm2 stop all\`, 재개는 \`pm2 start all\`을 사용합니다.

### 트러블슈팅 체크리스트

1. \`pm2 status\`에서 \`errored\`/\`stopped\` 프로세스가 없는지 확인
2. \`pm2 logs acs-backend --lines 200\` 로 스택 트레이스 확인
3. 포트 충돌 여부 확인: \`lsof -i :3000 -i :5173 -i :8080\`
4. DB 접속 가능 여부, 설정 페이지 > **시스템 설정** 값 검증
5. 필요 시 \`pm2 flush\`로 로그 초기화 후 \`pm2 restart all\`

---

## 12. 로그아웃

우측 상단 **사용자 아바타**를 클릭하면 드롭다운 메뉴가 나타납니다.

${img('18-user-dropdown', '사용자 메뉴')}

**로그아웃**을 선택하면 localStorage의 세션 정보가 제거되고 \`/login\` 페이지로 이동합니다.

---

### 부록 A — AMR 상태 값 정의

| 상태 | 한글 | 설명 |
|---|---|---|
| \`IDLE\` | 대기 | 정상 연결됨, 명령 대기 중 |
| \`MOVING\` | 이동 | 이동 명령 수행 중 |
| \`STOP\` | 정지 | \`stop_code\` 기반 의도적 정지 |
| \`ERROR\` | 오류 | 에러 발생 (\`additional_info.errors\` 참조) |
| \`E-STOP\` | 비상정지 | 물리 비상정지 버튼 눌림 |
| \`NO_CONN\` | 연결 끊김 | 네트워크 단절 또는 전원 오프 |

### 부록 B — 태스크 상태 값 정의

| 상태 | 색상 | 의미 |
|---|---|---|
| \`PENDING\` | 주황 | 접수됨, 실행 대기 |
| \`RUNNING\` | 파랑 | 실행 중 |
| \`FINISHED\` / \`DONE\` | 초록 | 정상 완료 |
| \`ERROR\` / \`FAILED\` | 빨강 | 실패 (\`error_code\` 참조) |
| \`CANCELLED\` / \`CANCELED\` | 회색 | \`CANCEL\` 요청 또는 취소됨 |

_본 매뉴얼은 \`docs/manual/generate.mjs\`에 의해 실제 화면을 캡처해 자동 생성되었습니다._
`;
}

import { readFileSync } from 'node:fs';
function readPkgVersion(relPath) {
  try {
    const p = path.join(__dirname, relPath);
    const json = JSON.parse(readFileSync(p, 'utf-8'));
    return json.version || '-';
  } catch {
    return '-';
  }
}

/* ─────────────────────────────────────────────────────────
 *  Markdown → HTML → PDF
 * ───────────────────────────────────────────────────────── */
async function buildHtmlFromMarkdown(md) {
  marked.setOptions({ gfm: true, breaks: false });
  const body = marked.parse(md);
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>ACS 사용자 매뉴얼</title>
<style>
  @page { size: A4; margin: 18mm 15mm; }
  html, body { background: #fff; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Pretendard', 'Noto Sans KR',
                 'Apple SD Gothic Neo', 'Malgun Gothic', Arial, sans-serif;
    color: #222;
    line-height: 1.7;
    font-size: 11.5pt;
    max-width: 960px;
    margin: 0 auto;
    padding: 8mm 4mm;
  }
  h1 { font-size: 22pt; border-bottom: 3px solid #1677ff; padding-bottom: 6px; }
  h2 { font-size: 16pt; margin-top: 28px; border-bottom: 1px solid #d9d9d9; padding-bottom: 4px; }
  h3 { font-size: 13pt; margin-top: 20px; color: #1677ff; }
  p, li { font-size: 11pt; }
  code { background: #f5f5f5; padding: 1px 5px; border-radius: 3px; font-size: 90%; }
  pre code { display: block; padding: 10px 12px; background: #263238; color: #eceff1; border-radius: 6px; overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0 14px; font-size: 10.5pt; }
  th, td { border: 1px solid #d9d9d9; padding: 6px 8px; text-align: left; }
  th { background: #fafafa; }
  img { max-width: 100%; border: 1px solid #e5e7eb; border-radius: 6px; margin: 6px 0; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
  em { display: block; color: #666; font-size: 9.5pt; margin: -4px 0 14px; text-align: center; }
  blockquote { margin: 8px 0; padding: 8px 12px; background: #f0f7ff; border-left: 4px solid #1677ff; border-radius: 4px; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 20px 0; }
  a { color: #1677ff; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

async function saveMarkdownAndHtml() {
  const md = buildMarkdown();
  await fs.writeFile(MD_OUT, md, 'utf-8');
  console.log(`📝  Markdown 저장: ${path.relative(process.cwd(), MD_OUT)}`);

  const html = await buildHtmlFromMarkdown(md);
  await fs.writeFile(HTML_OUT, html, 'utf-8');
  console.log(`🌐  HTML 저장    : ${path.relative(process.cwd(), HTML_OUT)}`);
}

async function renderPdf() {
  console.log(`\n🖨   PDF 생성 중 ...`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const fileUrl = 'file://' + HTML_OUT;
  await page.goto(fileUrl, { waitUntil: 'networkidle' });
  await page.pdf({
    path: PDF_OUT,
    format: 'A4',
    printBackground: true,
    margin: { top: '18mm', right: '15mm', bottom: '18mm', left: '15mm' },
  });
  await browser.close();
  console.log(`📕  PDF 저장    : ${path.relative(process.cwd(), PDF_OUT)}`);
}

/* ─────────────────────────────────────────────────────────
 *  Entrypoint
 * ───────────────────────────────────────────────────────── */
async function main() {
  const t0 = Date.now();

  if (!MD_ONLY) {
    await runScenarios();
  } else {
    console.log('(\u2014-md-only) 스크린샷 단계 건너뜀, 기존 images/ 사용');
  }

  if (!SHOT_ONLY) {
    await saveMarkdownAndHtml();
    await renderPdf();
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n🎉  완료 (${elapsed}s)`);
}

main().catch((err) => {
  console.error('\n❌  오류 발생:', err);
  process.exit(1);
});
