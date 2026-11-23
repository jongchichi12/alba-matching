# 알바 매칭 플랫폼 API — 프로젝트 개요

> 일한 기록이 그대로 인증 경력이 되는, 신뢰 기반 알바 매칭 백엔드 API

지원·확정 → 근무 기록(출퇴근) → 급여 정산 → 완료 → 인증 경력 → 후기까지, 알바의 전 과정을 서버가 기록하고 각 단계에서 알림을 만듭니다.

> 이해하기 위한 문서 순서: **[state-flow.md](state-flow.md)** (상태 흐름도) → **[request-trace.md](request-trace.md)** (요청 한 건의 여정) → 이 문서(전체 레퍼런스)

---

## 1. 사용 언어와 기술 스택

| 구분 | 내용 |
|---|---|
| 언어 | **JavaScript (Node.js, CommonJS)** |
| 웹 프레임워크 | Express 4 |
| DB / ORM | MySQL (`mysql2`) / Sequelize 6 (클래스 기반 모델) |
| 인증 | Passport (`passport-local`, 이메일 로그인) + `express-session` 세션 쿠키 |
| 비밀번호 | `bcrypt` (cost 12) 해시 저장 |
| 설정 | `dotenv` (`.env`), `config/config.json` (DB 접속 정보, git 제외) |
| 로깅 | `morgan` (테스트 환경에서는 끔) |
| 개발 도구 | `nodemon` (`npm start`), `sequelize-cli` |
| 테스트 | `mocha` + `chai` + `supertest` |

백엔드는 JSON REST API이고, 같은 서버가 `public/` 의 프론트(서비스 화면 `index.html` + 시연용 API 콘솔 `console.html`)를 정적으로 제공합니다. 프론트는 프레임워크·빌드 없이 바닐라 JS(ES 모듈)로 만들었습니다 (9장). 스키마는 `sequelize.sync()`로 만들어지며(마이그레이션 파일 없음), `NODE_ENV=test`에서는 테스트가 `sync({ force: true })`로 초기화합니다.

## 2. 실행 방법

```bash
npm install
# config/config.example.json → config/config.json 으로 복사 후 DB 계정 수정
npx sequelize db:create                 # sample
npm start                               # http://localhost:3000
npm test                                # 전체 (test-unit / test-api 로 분리 실행 가능)
```

환경 변수(`.env`): `PORT`(기본 3000), `SECRET`(세션 비밀키).

## 3. 폴더 구조

```
app.js            공통 미들웨어, 라우터 연결, 404·에러 핸들러
config/           DB 접속 설정 (config.example.json)
models/           User, Job, Resume, Application, Review, Shift, Payroll, Notification + 관계 정의
passport/         serialize/deserialize, localStrategy
middlewares/      auth.js(로그인 검사), owner.js(리소스 주인/권한 검사)
routes/           URL → 미들웨어 체인 → 컨트롤러 연결
controllers/      입력 검증 → 상태 규칙 검사 → DB 처리 → 응답
utils/            response(ok, HttpError), validate, notify, payroll(급여 계산), constants
test/             helper.js, unit.js(DB 불필요), api.js(라우터별 통합 테스트)
_old/             이전 설정 보관(참고용, 사용 안 함)
```

### 요청 처리 흐름
`routes → middlewares → controllers → models`

- **미들웨어**: "이 일을 할 수 있는 사람인가?" (로그인·소유자 검사, 찾은 데이터를 `req`에 실어 전달)
- **컨트롤러**: "지금 해도 되는 상태인가?" (입력 검증, 상태 전이 규칙, 트랜잭션)

## 4. 공통 규칙

- 성공: `{"result":"Success","data":…}` / 실패: `{"result":"Fail","error":"…"}` (실패 응답은 `app.js` 에러 핸들러에서만 생성)
- 에러는 `throw new HttpError(status, message)` → `next(err)`로 전달
- 상태 코드: 200/201 성공 · 400 입력 오류 · 401 로그인 필요 · 403 권한 없음 · 404 없음 · 409 중복/상태 충돌 · 500 서버 오류(메시지 숨김)
- `ownerId`, `applicantId`, `authorId` 등은 클라이언트 값을 무시하고 `req.user`/DB 기준으로 서버가 채움
- Sequelize UNIQUE 위반은 자동으로 409로 변환
- 페이지네이션: `?page=&limit=` (limit 기본 10, 최대 50)
- 알림은 서버가 상태 변경 시 같은 트랜잭션 안에서 자동 생성 (알림 생성 API 없음)

## 5. 도메인 모델

| 모델 | 설명 | 주요 상태값 |
|---|---|---|
| User | 회원 (사장님·알바생 구분 없이 한 종류, 역할은 행위로 결정) | — |
| Job | 사장님의 공고 (제목, 카테고리, 지역, 시급, 모집인원) | `open` / `closed` |
| Resume | 알바생의 이력서 (한 사람이 여러 개 가능) | 없음 |
| Application | 공고 ↔ 이력서를 잇는 지원, 자체 상태 보유, 사장님 성실도 평점 | `pending` → `accepted` → `completed` / `rejected` |
| Shift | 근무 일정 + 출퇴근 기록 + 근무 분 | `scheduled` → `checked_in` → `checked_out` → `confirmed` / `no_show` |
| Payroll | 정산서 (발행 시점 시급 스냅샷, 기본급·주휴수당·총액) | `issued` → `paid` / `disputed` |
| Review | 완료된 지원 1건당 후기 1개 (사장님에게 평판 누적) | — |
| Notification | 서버가 만드는 알림 | `isRead` |

### 관계
> 그림으로 보기: [erd.md](erd.md) · 서버 실행 후 `http://localhost:3000/erd.html`
```
User 1─N Job (사장님)        User 1─N Resume (알바생)
User 1─N Application(지원자)  User 1─N Notification
Job 1─N Application          Resume 1─N Application (삭제 시 SET NULL)
Application 1─N Shift        Application 1─N Payroll
Application 1─1 Review
```
- 같은 공고에 같은 사람은 한 번만 지원 가능 (`UNIQUE(jobId, applicantId)`, 거절 후 재지원도 불가)
- 후기는 `applicationId` UNIQUE

## 6. 기능과 API (총 41개 + 회원 4개)

★ = 핵심 API

### 회원 `/users`
| API | 설명 |
|---|---|
| POST `/join` | 회원가입 (이메일 형식, 비밀번호 6~50자, 중복 시 409) |
| POST `/login` | 이메일 로그인 (세션 쿠키 발급) |
| POST `/logout` | 로그아웃 |
| GET `/me` | 내 정보 |

### 공고 `/jobs`
| API | 설명 |
|---|---|
| GET `/` ★ | 목록. 필터 `region`(부분 일치)·`category`·`minPay`·`status`(기본 open, `all` 가능)·`mine=true`(내 공고만, 로그인 필요, 비로그인 401), 페이지네이션 |
| GET `/:id` | 상세 (확정 인원 `confirmedCount` 포함) |
| POST `/` | 등록 (시급은 **2026 최저임금 10,320원 이상**) |
| PATCH `/:id` | 수정 (작성자만, 확정 인원보다 모집인원을 줄일 수 없음) |
| DELETE `/:id` | 삭제 (확정·완료 지원이 있으면 409) |
| PATCH `/:id/status` | 조기 마감 / 재오픈 (정원이 찬 공고는 재오픈 불가) |

### 이력서 `/resumes`
| API | 설명 |
|---|---|
| GET `/me` | 내 이력서 목록 |
| GET `/:id` | 상세 (본인 또는 이 이력서로 지원받은 공고의 사장님만) |
| GET `/:id/careers` ★ | **인증 경력** — 완료된 지원에서 조회 시점마다 계산(저장 안 함). 근무 분·일수, 결근 수, 사장님 평점, 평균 평점 집계 |
| POST / · PATCH `/:id` · DELETE `/:id` | 작성·수정·삭제 (대기/확정 지원에 쓰인 이력서는 삭제 불가) |

### 지원 `/applications`
| API | 설명 |
|---|---|
| POST `/` | 지원하기 (본인 이력서만, 본인 공고·마감 공고·중복 지원 불가) → 사장님에게 알림 |
| GET `/sent` | 내가 지원한 목록 (`?status=`) |
| GET `/received` | 내 공고로 온 지원 (`?status=&jobId=`) |
| PATCH `/:id/accept` ★ | 채용 확정. 공고 행 잠금(`LOCK.UPDATE`)으로 동시성 제어, 정원이 차면 공고 자동 마감, 알림 생성을 한 트랜잭션으로 처리 |
| PATCH `/:id/reject` | 거절 (대기 상태만) |
| PATCH `/:id/complete` | 근무 완료 + 성실도 평점(1~5). 모든 일정이 확인/결근 처리되고 확인된 근무가 1건 이상이어야 함 |

### 근무 기록 `/shifts`
| API | 설명 |
|---|---|
| POST `/` | 일정 등록 (사장님, 확정된 지원만, 같은 알바생의 다른 일정과 시간 겹치면 409) |
| GET `/me` | 내 일정 (`?from=&to=`) |
| GET `/jobs/:jobId` | 공고별 일정 (사장님) |
| PATCH `/:id/check-in` ★ | 출근 (예정 시작 ±30분 안에서만) |
| PATCH `/:id/check-out` | 퇴근 (근무 분 자동 계산) |
| PATCH `/:id/confirm` | 근무 확인 (사장님) |
| PATCH `/:id/no-show` | 결근 처리 (시작 시간이 지난 예정 일정만) |

### 급여 정산 `/payrolls`
| API | 설명 |
|---|---|
| POST `/` ★ | 정산서 발행 (사장님). 기간 내 **확인된 근무**로 서버가 계산, 시급 스냅샷 저장, 겹치는 기간 중복 발행 불가(이의제기 상태면 재발행 허용) |
| GET `/me` · GET `/issued` | 알바생이 받은 정산서 / 사장님이 발행한 정산서 |
| GET `/:id` | 상세 (일별 근무 내역 포함, 당사자만) |
| PATCH `/:id/pay` | 지급 완료 (사장님) |
| PATCH `/:id/dispute` | 이의제기 (알바생, 사유 필수) → 사장님에게 알림 |

**급여 계산 규칙** (`utils/payroll.js`, DB 없는 순수 함수)
- 기본급 = 확인된 근무 총 분 × 시급 ÷ 60 (원 단위 내림)
- 주(월~일) 단위 주휴수당: 그 주 확인 근무가 **15시간 이상이고 결근이 없을 때** `근무분 × 시급 ÷ 300` (40시간 상한)
- 총 지급액 = 기본급 + 주휴수당
- 야간·연장·휴일 수당, 5인 미만 사업장 구분은 범위 밖(단순화)

### 후기 `/reviews`
| API | 설명 |
|---|---|
| POST `/` ★ | 후기 작성 (완료된 본인 지원 1건당 1개, 평점 1~5) → 사장님에게 알림 |
| GET `/owners/:ownerId` | 사장님별 후기 목록 (공개, 페이지네이션) |
| GET `/owners/:ownerId/score` | 평균 평점·후기 수 (`avgScore`, `count`) |
| PATCH `/:id` · DELETE `/:id` | 수정·삭제 (작성자만) |

### 알림 `/notifications`
| API | 설명 |
|---|---|
| GET `/` | 내 알림 (`?unread=true`) |
| GET `/unread-count` ★ | 안읽은 알림 개수 |
| PATCH `/read-all` · PATCH `/:id/read` | 모두 읽음 / 개별 읽음 |
| DELETE `/:id` | 삭제 |

알림 종류: 지원 접수·확정·거절·완료, 일정 등록, 정산 발행, 정산 이의제기, 후기 등록.

## 7. 핵심 업무 흐름

```
공고 등록(사장님) ─▶ 지원(알바생) ─▶ 확정 accept ─▶ 일정 등록
      ─▶ 출근 · 퇴근(알바생) ─▶ 근무 확인 confirm(사장님)
      ─▶ 정산서 발행 ─▶ 지급 / 이의제기
      ─▶ 근무 완료 complete(+성실도 평점) ─▶ 인증 경력 반영 ─▶ 후기 작성
```

## 8. 설계상 특징

- **권한 검사 분리**: `middlewares/owner.js`의 소유자 검사 미들웨어 11개가 대상 조회 → 404 → 403 → `req`에 적재까지 담당, 컨트롤러는 재조회하지 않음
- **트랜잭션**: 상태 변경과 알림 생성을 한 트랜잭션으로 묶어 원자성 보장
- **동시성**: 채용 확정 시 공고 행 `SELECT … FOR UPDATE`로 정원 초과 방지
- **조작 방지 경력**: 경력은 저장하지 않고 완료된 지원·확정된 근무 기록에서 즉석 계산
- **입력 검증**: `utils/validate.js`의 파서(`parseFields` 등)로 필드별 검증, 실패 시 400
- **이력서 req 이름**: `req.resume`은 Node 내장 `IncomingMessage.resume()`과 충돌하므로 `req.resumeDoc` 사용
- **마감 공고 확정**: 정원 마감과 사장님 조기 마감을 구분하지 않고, 마감된 공고의 대기 지원은 accept 시 409

## 9. 프론트엔드 (`public/`)

`npm start` 후 `http://localhost:3000` 을 열면 서비스 화면이, `http://localhost:3000/console.html` 을 열면 시연용 API 콘솔이 뜹니다. 둘 다 `app.js` 의 `express.static('public')` 으로 같은 주소에서 제공되므로 세션 쿠키가 그대로 동작합니다.

### 9-1. 서비스 화면 (`index.html`)

기능 중심의 단순한 화면입니다. 프레임워크 없이 해시 라우팅(`#/jobs/3`) + ES 모듈로 구성했고, 사장님/알바생은 한 계정이 둘 다 할 수 있으므로 상단 메뉴가 **공통 / 알바생 / 사장님** 그룹으로 나뉩니다. 로그인하면 알림 개수가 30초마다 갱신됩니다.

```
public/
  index.html          셸 (헤더 + main)
  css/app.css
  js/
    app.js            해시 라우터, 헤더, 알림 배지, 오류 처리
    api.js            fetch 래퍼 (성공이면 data, 실패면 ApiError)
    ui.js             h`` 안전 템플릿(자동 이스케이프), 포맷터, 토스트, data-act / data-form 이벤트 위임
    state.js          로그인 사용자, 이동 도우미
    views/            jobs · applications · resumes · shifts · money(정산·후기) · misc(로그인·알림)
  console.html        시연용 API 콘솔
```

| 화면 | 해시 | 누가 | 사용하는 API |
|---|---|---|---|
| 공고 찾기 / 상세 | `#/jobs`, `#/jobs/:id` | 누구나 | `GET /jobs`, `GET /jobs/:id` |
| 로그인 · 가입 | `#/login`, `#/join` | 비로그인 | `POST /users/login·join·logout`, `GET /users/me` |
| 지원하기 · 내 지원 · 후기 쓰기 | `#/jobs/:id`, `#/applications` | 알바생 | `POST /applications`, `GET /applications/sent`, `POST /reviews` |
| 이력서 · 인증 경력 | `#/resumes`, `#/resumes/new`, `#/resumes/:id`, `#/resumes/:id/edit` | 알바생(경력은 지원받은 사장님도) | `/resumes` 6개 |
| 내 근무 (출·퇴근) | `#/shifts` | 알바생 | `GET /shifts/me`, `PATCH …/check-in·check-out` |
| 받은 정산서 · 이의제기 | `#/payrolls`, `#/payrolls/:id` | 알바생 | `GET /payrolls/me·:id`, `PATCH …/dispute` |
| 공고 등록 · 수정 · 마감 · 삭제 | `#/jobs/new`, `#/jobs/:id/edit`, `#/my-jobs` | 사장님 | `/jobs` 쓰기 API, `GET /jobs?mine=true` |
| 받은 지원 (확정·거절·완료+평점) | `#/applicants` | 사장님 | `GET /applications/received`, `PATCH …/accept·reject·complete` |
| 근무 관리 (일정 등록·확인·결근) | `#/shifts/manage?jobId=` | 사장님 | `POST /shifts`, `GET /shifts/jobs/:jobId`, `PATCH …/confirm·no-show` |
| 정산서 발행 · 지급 | `#/payrolls?tab=new·issued`, `#/payrolls/:id` | 사장님 | `POST /payrolls`, `GET /payrolls/issued`, `PATCH …/pay` |
| 사장님 평판 · 후기 수정/삭제 | `#/owners/:id` | 누구나(수정·삭제는 작성자) | `GET /reviews/owners/:id·score`, `PATCH·DELETE /reviews/:id` |
| 알림 | `#/notifications` | 로그인 | `/notifications` 5개 |

서버 응답이 403·409 등으로 거절되면 서버의 오류 메시지가 그대로 토스트로 표시되고, 401 이면 로그인 화면으로 보냅니다. 화면은 규칙을 다시 구현하지 않고 상태에 맞는 버튼만 보여줍니다 (규칙의 최종 판단은 항상 서버).

### 9-2. 시연용 API 콘솔 (`console.html`)

모든 API를 직접 실행할 수 있는 콘솔입니다. (`app.js` 의 `express.static('public')` 으로 같은 주소에서 제공 → 세션 쿠키가 그대로 동작)

- **라우터별 탭**: 8개 라우터, 45개 API를 카드로 표시. 카드마다 `routes → 미들웨어 체인 → 컨트롤러` 와 규칙 설명, 입력값, 실행 버튼
- **▶ 시나리오 탭**
  - 전체 업무 흐름 20단계를 한 번에 실행 (사장님 / 알바생 계정 자동 전환, 없으면 자동 가입)
  - 권한·상태 규칙 시연: 401 / 400 / 404 / 403 / 409 가 설계대로 나오는지 확인
- **현재 상태 패널** (오른쪽 위): 공고·지원·일정·정산서의 `status` 가 지금 어디에 있는지 보여주고, API 를 실행해 상태가 바뀌면 그 줄이 초록색으로 반짝입니다. 안읽은 알림 개수도 표시
- **ID 자동 입력**: 방금 만든 공고·이력서·지원·일정·정산서 ID를 다음 요청에 자동으로 채움
- **요청 / 응답 기록**: 오른쪽 패널에 메서드, URL, 상태 코드, 요청 body, 응답 JSON 표시
- 데모 계정: `boss@alba.test`(사장님), `worker@alba.test`(알바생), `other@alba.test`(제3자), 비밀번호 `password123`
- 한계: 근무 시간은 실제 흐른 시간으로 계산되므로 바로 퇴근하면 0분·0원 ("1분 기다리기" 옵션 제공). 주휴수당(주 15시간 이상)은 콘솔로 시연할 수 없어 `npm run test-unit` 으로 확인

## 10. 테스트

- `test/unit.js`: 로그인 미들웨어, 검증 유틸, 급여 계산 (DB 불필요)
- `test/api.js`: 라우터별 통합 테스트(supertest) + 전체 업무 흐름 시나리오. 실행 전 `sample` DB 필요 (테스트는 시작할 때 테이블을 초기화하므로 데이터가 지워진다)
- `test/helper.js`: 가입 + 로그인된 agent 생성 헬퍼
