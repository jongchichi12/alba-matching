# 알바 매칭 플랫폼 API

일한 기록이 그대로 인증 경력이 되는, 신뢰 기반 알바 매칭. (Node.js · Express 4 · Sequelize · MySQL · Passport local)

지원·확정 → 근무 기록(출퇴근) → 급여 정산 → 완료 → 인증 경력 → 후기 까지 알바의 전 과정을 서버가 기록하고, 각 단계에서 알림을 만듭니다.

## 실행 방법
```bash
npm install
# MySQL 서버를 켠 뒤 config/config.json 의 username / password 를 본인 값으로 수정
npx sequelize db:create                 # sample
npm start                               # http://localhost:3000  ("데이터베이스 연결 성공"이 뜨면 테이블이 만들어진 것)
npm test                                # 전체 테스트 (npm run test-unit / test-api 로 나눠 실행)
npx mocha --exit -f "/applications" test/api.js    # 라우터 하나만
```
`.env` 의 `SECRET` 은 세션 비밀키입니다. 필요하면 바꾸세요.

## 폴더 구조
```
app.js                공통 미들웨어, 라우터 연결, 404 · 에러 핸들러(Fail 형식은 여기서만 만든다)
config/config.json    DB 접속 정보 (development / test)
models/               User Job Resume Application Review Shift Payroll Notification + 관계(associate)
passport/             serialize / deserialize, localStrategy (이메일 로그인)
middlewares/          auth.js (isLoggedIn, isNotLoggedIn) · owner.js (리소스 주인 검사 11개)
routes/               URL → 미들웨어 체인 → 컨트롤러 연결
controllers/          입력 검증 → 상태 규칙 → DB → 응답
utils/                response.js(ok, HttpError) · validate.js · notify.js · payroll.js(급여 계산) · constants.js
test/                 helper.js(가입+로그인 agent) · unit.js(DB 없이) · api.js(라우터별 API)
```
요청은 `routes → middlewares → controllers → models` 순서로 처리됩니다.
"할 수 있는 사람인가?"는 미들웨어가, "지금 해도 되는 상태인가?"는 컨트롤러가 검사합니다.

## 공통 규칙
- 성공 `{"result":"Success","data":…}` / 실패 `{"result":"Fail","error":"…"}`
- 상태 코드: 200/201 성공 · 400 입력 오류 · 401 로그인 필요 · 403 권한 없음 · 404 없음 · 409 중복·상태 충돌
- 컨트롤러·미들웨어는 `try { … } catch (err) { next(err); }`, 실패는 `throw new HttpError(status, message)`
- ownerId, userId, applicantId, authorId, 후기의 ownerId 는 `req.user` 와 DB 에서 서버가 채운다 (클라이언트 값 무시)
- 상태값은 DB 에 영어로 저장: open/closed · pending/accepted/completed/rejected · scheduled/checked_in/checked_out/confirmed/no_show · issued/paid/disputed

## API (41개, /users 제외)
| 라우터 | API |
|---|---|
| /users (회원) | POST /join · POST /login · POST /logout · GET /me |
| /jobs (6) | GET / ★ · GET /:id · POST / · PATCH /:id · DELETE /:id · PATCH /:id/status |
| /resumes (6) | GET /me · GET /:id · GET /:id/careers ★ · POST / · PATCH /:id · DELETE /:id |
| /applications (6) | POST / · GET /sent · GET /received · PATCH /:id/accept ★ · PATCH /:id/reject · PATCH /:id/complete |
| /reviews (5) | POST / ★ · GET /owners/:ownerId · GET /owners/:ownerId/score · PATCH /:id · DELETE /:id |
| /shifts (7) | POST / · GET /me · GET /jobs/:jobId · PATCH /:id/check-in ★ · check-out · confirm · no-show |
| /payrolls (6) | POST / ★ · GET /me · GET /issued · GET /:id · PATCH /:id/pay · PATCH /:id/dispute |
| /notifications (5) | GET / · GET /unread-count ★ · PATCH /read-all · PATCH /:id/read · DELETE /:id |

★ = 테스트 대상 핵심 API

## 설계서와 달라진 점
- 이력서 주인 검사는 `req.resume` 대신 `req.resumeDoc` 에 싣습니다. `req.resume` 은 Node 내장 `IncomingMessage.resume()` 과 이름이 같아, 덮어쓰면 응답이 끝날 때 서버가 에러를 냅니다.
- `accept` 는 설계서대로 마감된 공고의 대기 지원도 409 로 거부합니다. 정원이 차서 자동 마감된 공고와 사장님이 조기 마감한 공고를 구분하지 않습니다.
- 정산서 기간(`periodStart`, `periodEnd`)은 날짜만 저장합니다(DATEONLY). 같은 지원의 겹치는 기간은 정확히 같은 기간이 아니어도 중복(409)으로 봅니다.
- `GET /reviews/owners/:ownerId/score` 의 응답 키는 `{ ownerId, avgScore, count }` 입니다.
