# ACS Taelim v2

**AMR Control System (ACS)** — AMR(자율 이동 로봇) 제어 및 MES 인터페이스 시스템

## 📋 목차

- [시스템 개요](#시스템-개요)
- [기술 스택](#기술-스택)
- [프로젝트 구조](#프로젝트-구조)
- [설치 방법](#설치-방법)
- [실행 방법](#실행-방법)
- [API 문서 (Swagger)](#api-문서-swagger)
- [주요 기능](#주요-기능)
- [MES 인터페이스](#mes-인터페이스)
- [환경 변수](#환경-변수)
- [테스트](#테스트)
- [기본 계정](#기본-계정)

---

## 시스템 개요

ACS Taelim v2는 AMR 로봇을 제어하고 MES(Manufacturing Execution System)와 통신하는 웹 기반 시스템입니다.

- **AMR 모니터링**: TCP 소켓을 통한 실시간 AMR 상태 수집 및 대시보드 표시
- **이동 제어**: MES로부터 이동 지시를 수신하여 AMR에 TCP 네비게이션 명령 전송
- **로봇 팔 제어**: MES로부터 로봇 팔 명령을 수신하여 매니퓰레이터 TCP 명령 + DO/DI 신호 처리
- **MES 상태 전송**: AMR 상태를 1Hz 주기로 MES에 전송, 태스크 결과 이벤트 전송
- **맵 관리**: AMR에서 TCP로 맵 다운로드 및 웹 UI에서 맵 시각화
- **통신 로그**: 모든 API/TCP 통신 기록 및 조회

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| **Backend** | Node.js, Express.js |
| **Frontend** | React 19, Vite 7, Ant Design 6 |
| **Database** | SQLite (Sequelize ORM) |
| **AMR 통신** | TCP/IP 소켓 |
| **MES 통신** | HTTP REST API |
| **API 문서** | Swagger (OpenAPI 3.0) |

---

## 프로젝트 구조

```
ACS_Taelim_v2/
├── backend/                  # 백엔드 (Express.js API 서버)
│   ├── server.js             # 서버 엔트리포인트
│   ├── app.js                # Express 앱 설정
│   ├── config/
│   │   ├── db.js             # Sequelize DB 설정
│   │   └── swagger.js        # Swagger API 명세
│   ├── controller/           # API 컨트롤러
│   ├── model/                # Sequelize 모델
│   ├── routes/               # Express 라우트
│   └── services/             # 비즈니스 로직 서비스
│       ├── amrMonitorService.js   # AMR TCP 모니터링
│       ├── armService.js          # 로봇 팔 제어
│       ├── mesStatusService.js    # MES 상태/결과 전송
│       ├── navService.js          # AMR 내비게이션
│       ├── mapTcpService.js       # AMR 맵 TCP 통신
│       └── logService.js          # 통신 로그 관리
├── frontend/                 # 프론트엔드 (React SPA)
│   ├── src/
│   │   ├── pages/            # 페이지 컴포넌트
│   │   ├── components/       # 공용 컴포넌트
│   │   ├── layouts/          # 레이아웃
│   │   └── api/              # API 호출 모듈
│   └── public/               # 정적 파일
└── test/
    └── fake-amr-server.js    # AMR 시뮬레이터 (테스트용)
```

---

## 설치 방법

### 사전 요구 사항

- **Node.js** 18 이상 (권장: 20+)
- **npm** 9 이상

### 1. 저장소 클론

```bash
git clone https://github.com/ktm526/ACS_Taelim_v2.git
cd ACS_Taelim_v2
```

### 2. 백엔드 의존성 설치

```bash
cd backend
npm install
```

### 3. 프론트엔드 의존성 설치

```bash
cd ../frontend
npm install
```

---

## 실행 방법

### 개발 모드 (권장)

백엔드와 프론트엔드를 **각각 별도 터미널**에서 실행합니다.

**터미널 1 — 백엔드 서버:**

```bash
cd backend
npm run dev
```

- 서버가 `http://localhost:4000` 에서 실행됩니다.
- `nodemon`이 파일 변경을 감지하여 자동 재시작합니다.
- SQLite DB 파일(`database.sqlite`)이 자동 생성됩니다.

**터미널 2 — 프론트엔드 개발 서버:**

```bash
cd frontend
npm run dev
```

- 개발 서버가 `http://localhost:3000` 에서 실행됩니다.
- API 요청은 자동으로 백엔드(`localhost:4000`)로 프록시됩니다.

### 프로덕션 모드

**1. 프론트엔드 빌드:**

```bash
cd frontend
npm run build
```

`dist/` 폴더에 빌드된 정적 파일이 생성됩니다.

**2. 백엔드 서버 실행:**

```bash
cd backend
npm start
```

> 프로덕션 환경에서는 빌드된 프론트엔드를 nginx 등의 웹 서버로 서빙하거나,
> Express의 `express.static`으로 `frontend/dist`를 서빙하도록 설정할 수 있습니다.

---

## API 문서 (Swagger)

백엔드 서버가 실행된 상태에서 브라우저로 접속합니다:

```
http://localhost:4000/api-docs
```

### Swagger UI 기능

- **모든 API 엔드포인트** 목록 확인 (태그별 분류)
- **요청/응답 스키마** 확인
- **Try it out** 버튼으로 API 직접 테스트
- 필터 검색 지원 (상단 검색 바)

### API 태그 분류

| 태그 | 설명 |
|------|------|
| **AMR** | AMR CRUD, 모니터링 상태, 재연결, 이동 명령 |
| **Task** | 태스크 CRUD |
| **Map** | 맵 CRUD, 파일 업로드, AMR 맵 목록/다운로드 |
| **Setting** | 시스템 설정 (MES IP 등) |
| **User** | 사용자 CRUD, 로그인 |
| **SimAmr** | 시뮬레이션 AMR 관리 |
| **MoveCommand** | MES → ACS 이동 지시 (`POST /api/move_command`) |
| **ArmCommand** | MES → ACS 로봇 팔 명령 (`POST /api/arm_command`) |
| **Log** | 통신 로그 조회 (`GET /api/logs`) |
| **MES (참조)** | ACS → MES 송신 인터페이스 (monitoring, task_result) |

---

## 주요 기능

### 대시보드
- 실시간 AMR 위치 및 상태 표시 (맵 시각화)
- AMR 배터리, 에러 상태 모니터링

### 맵 관리
- SMAP/JSON 맵 파일 업로드
- AMR에서 TCP로 직접 맵 다운로드
- 스테이션/경로 시각화 편집

### 통신 로그
- **통신 로그 탭**: API/TCP 통신 기록 (MOVE_COMMAND, ARM_COMMAND, TASK_RESULT, NAV_CMD 등)
- **연결 상태 탭**: AMR/MES 연결/끊김 이벤트
- **모니터링 탭**: MES 주기 전송 기록
- 인터페이스 다중 필터, 날짜 범위, 키워드 검색 지원

### 설정
- MES IP 주소 설정
- 이동/로봇팔 명령 테스트 UI

### 사용자 관리
- 관리자 / 일반 사용자 역할 구분
- 일반 사용자: 대시보드만 접근 가능
- 관리자: 전체 메뉴 접근 가능

---

## MES 인터페이스

### 수신 API (MES → ACS)

| 엔드포인트 | 설명 |
|-----------|------|
| `POST /api/move_command` | AMR 이동 지시 (EXECUTE / CANCEL) |
| `POST /api/arm_command` | 로봇 팔 동작 명령 (EXECUTE / CANCEL) |

### 송신 API (ACS → MES)

| 엔드포인트 | 설명 | 주기 |
|-----------|------|------|
| `POST http://<mes_ip>/api/monitoring` | AMR 상태 전송 | 1초 |
| `POST http://<mes_ip>/api/task_result` | 태스크 결과 전송 | 이벤트 |

> MES IP는 설정 페이지(`/settings`)에서 `mes_ip` 키로 관리합니다.

---

## 환경 변수

백엔드는 `.env` 파일 또는 환경 변수로 설정할 수 있습니다.

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `PORT` | `4000` | 백엔드 서버 포트 |
| `NODE_ENV` | `development` | 실행 환경 |
| `MANI_CMD_PORT` | `19207` | 매니퓰레이터 TCP 포트 |
| `MANI_CMD_API` | `4021` | 매니퓰레이터 API 코드 |
| `ROBOT_IO_PORT` | `19210` | 로봇 IO TCP 포트 |
| `ROBOT_DO_API` | `6001` | DO 설정 API 코드 |
| `ROBOT_DI_API` | `6020` | DI 설정 API 코드 |
| `MANI_WORK_TIMEOUT_MS` | `3000000` | 로봇 팔 작업 타임아웃 (ms) |

---

## 테스트

### 가상 AMR 서버 (fake-amr-server)

실제 AMR 없이 테스트하려면 가상 AMR 서버를 실행합니다:

```bash
cd test
node fake-amr-server.js
```

- 기본적으로 `127.0.0.1`에서 AMR TCP 서버를 에뮬레이션합니다.
- 네비게이션 명령, 로봇 팔 명령, DO/DI 신호를 시뮬레이션합니다.
- 로봇 팔 작업은 약 10초 후 자동 완료됩니다.

### 설정 페이지 테스트 UI

웹 UI의 **설정 페이지** (`/settings`)에서:
- **이동 명령 테스트**: AMR 이름과 목적지를 입력하여 `move_command` API 테스트
- **로봇 팔 명령 테스트**: AMR 이름과 파라미터를 입력하여 `arm_command` API 테스트

---

## 기본 계정

서버 최초 실행 시 기본 관리자 계정이 자동 생성됩니다:

| 항목 | 값 |
|------|------|
| **ID** | `admin` |
| **비밀번호** | `admin1234` |
| **역할** | `admin` |

> ⚠️ 보안을 위해 운영 환경에서는 반드시 비밀번호를 변경하세요.

---

## 라이선스

Private Repository
