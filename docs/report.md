# 프로젝트 보고서 (원고)

> 교수님 양식(`웹개보고서.hwp`) 순서대로 정리한 원고입니다. 한글에 붙여넣어 사용하세요.
> `[ ]` 로 표시한 곳은 직접 채워야 합니다.

팀명: [팀명]
팀원: [이름 (학번)], [이름 (학번)]

---

## 프로젝트 개요

이 프로젝트는 **"일한 기록이 그대로 인증 경력이 되는, 신뢰 기반 알바 매칭 플랫폼"** 의 백엔드 API 서버이다.

기존 알바 플랫폼은 공고를 보고 지원하는 데서 끝나서, 실제로 일했는지·얼마나 성실했는지·급여를 제대로 받았는지는 기록으로 남지 않는다. 이 프로젝트는 **지원 → 채용 확정 → 근무 기록(출퇴근) → 급여 정산 → 근무 완료 → 인증 경력 → 후기** 까지 알바의 전 과정을 서버가 기록하고, 각 단계마다 상대방에게 알림을 만든다.

- 알바생: 공고 검색, 이력서 작성, 지원, 출근·퇴근 체크, 정산서 확인·이의제기, 사장님 후기 작성
- 사장님: 공고 등록, 지원자 확정·거절, 근무 일정 등록, 근무 확인·결근 처리, 정산서 발행(주휴수당 자동 계산), 성실도 평가
- 인증 경력: 알바생이 직접 적는 경력이 아니라, 사장님이 확인한 근무 기록과 완료 처리에서 서버가 만들어 내는 경력이라 조작할 수 없다.

| 구분 | 내용 |
|---|---|
| 언어 / 런타임 | JavaScript, Node.js |
| 웹 프레임워크 | Express 4 |
| DB / ORM | MySQL / Sequelize 6 |
| 인증 | Passport(local, 이메일 로그인) + express-session 세션 쿠키, bcrypt 비밀번호 해시 |
| 테스트 | mocha + chai + supertest |

구조: 요청은 `routes → middlewares(로그인·권한 검사) → controllers(입력 검증·상태 규칙·DB) → models` 순서로 처리된다.
"할 수 있는 사람인가?"는 미들웨어가, "지금 해도 되는 상태인가?"는 컨트롤러가 검사한다.

라우터 8개, API 45개

| 라우터 | API 수 | 역할 |
|---|---|---|
| /users | 4 | 회원가입·로그인·로그아웃·내 정보 |
| /jobs | 6 | 공고 |
| /resumes | 6 | 이력서·인증 경력 |
| /applications | 6 | 지원·확정·거절·완료 |
| /reviews | 5 | 사장님 후기·평점 |
| /shifts | 7 | 근무 일정·출퇴근 |
| /payrolls | 6 | 급여 정산서 |
| /notifications | 5 | 알림 |

---

## API 설계

### 공통 규칙

- 성공: `{"result":"Success","data":…}` / 실패: `{"result":"Fail","error":"실패 이유"}`
- 상태 코드: 200·201 성공 / 400 입력 오류 / 401 로그인 필요 / 403 권한 없음 / 404 없음 / 409 중복·상태 충돌
- 🔒 표시 = 로그인 필요 (세션 쿠키). 로그인하지 않으면 `401 "로그인이 필요합니다."`
- `ownerId`, `userId`, `applicantId`, `authorId` 등 "누가" 에 해당하는 값은 클라이언트가 보내도 무시하고 서버가 로그인 정보로 채운다.
- 모든 Response 의 Depth 1 은 `result`, `data`(성공) 또는 `error`(실패) 이다. 아래 표에서는 Depth 2 이하로 `data` 안의 값을 적는다.

---

### User 라우터

#### - 회원 가입 요청 API

Request: POST, /users/join

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| email | String | 필수 | 이메일 (형식 검사, 100자 이하) |
| password | String | 필수 | 비밀번호 (6~50자) |
| name | String | 필수 | 이름 (20자 이하) |
| phone | String | 선택 | 전화번호 (20자 이하) |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 회원 가입 성공/실패 여부 |
| data | 1 | 객체 | 가입한 회원 정보 (비밀번호 제외) |
| id / email / name / phone | 2 | 숫자/문자열 | 회원 번호, 이메일, 이름, 전화번호 |
| error | 1 | 에러 문자열 | 실패 이유 (400 입력 오류, 400 이미 로그인, 409 이메일 중복) |

```json
{
  "result": "Fail",
  "error": "이미 가입된 이메일입니다."
}
```

#### - 로그인 API

Request: POST, /users/login

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| email | String | 필수 | 이메일 |
| password | String | 필수 | 비밀번호 |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 로그인 성공/실패 여부 |
| data | 1 | 객체 | 로그인한 회원 정보 (id, email, name, phone) |
| error | 1 | 에러 문자열 | 401 이메일·비밀번호 불일치, 400 이미 로그인한 상태 |

```json
{
  "result": "Success",
  "data": { "id": 1, "email": "a@test.com", "name": "가나다", "phone": "010-1111-2222" }
}
```

#### - 로그아웃 API 🔒

Request: POST, /users/logout

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| (없음) | | | 세션 쿠키로 판단 |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 로그아웃 성공 여부 |
| data | 1 | null | 없음 |
| error | 1 | 에러 문자열 | 401 로그인 필요 |

```json
{ "result": "Success", "data": null }
```

#### - 내 정보 조회 API 🔒

Request: GET, /users/me

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| (없음) | | | 세션 쿠키로 판단 |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 조회 성공 여부 |
| data | 1 | 객체 | id, email, name, phone |
| error | 1 | 에러 문자열 | 401 로그인 필요 |

```json
{
  "result": "Success",
  "data": { "id": 1, "email": "a@test.com", "name": "가나다", "phone": null }
}
```

---

### Job 라우터 (공고)

#### - ★ 공고 목록 조회 API

Request: GET, /jobs

| Parameter (Query) | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| region | String | 선택 | 지역 (부분 일치) |
| category | String | 선택 | 업종 (정확히 일치) |
| minPay | Number | 선택 | 최소 시급 (이상) |
| status | String | 선택 | open(기본) / closed / all |
| mine | String | 선택 | true 면 내가 올린 공고만 (로그인 필요) |
| page / limit | Number | 선택 | 페이지 (기본 1) / 개수 (기본 10, 최대 50) |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 조회 성공 여부 |
| data | 1 | 객체 | 목록 결과 |
| total / page / limit | 2 | 숫자 | 전체 개수, 현재 페이지, 페이지 크기 |
| jobs | 2 | 배열 | 공고 목록 (id, title, category, region, pay, headcount, status, owner{id,name}) |
| error | 1 | 에러 문자열 | 400 잘못된 쿼리, 401 mine=true 인데 비로그인 |

```json
{
  "result": "Success",
  "data": {
    "total": 1, "page": 1, "limit": 10,
    "jobs": [{ "id": 3, "title": "카페 서빙", "category": "서빙", "region": "서울 노원구",
               "pay": 10320, "headcount": 2, "status": "open", "owner": { "id": 1, "name": "김사장" } }]
  }
}
```

#### - 공고 상세 조회 API

Request: GET, /jobs/:id

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| id (Path) | Number | 필수 | 공고 번호 |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 조회 성공 여부 |
| data | 1 | 객체 | 공고 정보 + owner{id,name} |
| confirmedCount | 2 | 숫자 | 확정(accepted+completed)된 인원 |
| error | 1 | 에러 문자열 | 400 id 오류, 404 없는 공고 |

```json
{ "result": "Fail", "error": "공고를 찾을 수 없습니다." }
```

#### - 공고 등록 API 🔒

Request: POST, /jobs

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| title | String | 필수 | 제목 (100자 이하) |
| region | String | 필수 | 지역 (50자 이하) |
| pay | Number | 필수 | 시급 (2026년 최저임금 10,320원 이상) |
| headcount | Number | 필수 | 모집 인원 (1 이상) |
| category | String | 선택 | 업종 (50자 이하) |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 등록 성공 여부 (201) |
| data | 1 | 객체 | 등록된 공고 (id, ownerId=로그인 사용자, status=open …) |
| error | 1 | 에러 문자열 | 400 필수값 누락·최저임금 미만, 401 |

```json
{ "result": "Fail", "error": "pay 값이 올바르지 않습니다." }
```

#### - 공고 수정 API 🔒 (작성자만)

Request: PATCH, /jobs/:id

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| id (Path) | Number | 필수 | 공고 번호 |
| title / category / region / pay / headcount | | 선택 | 바꿀 값만 (등록과 같은 규칙). status 는 보낼 수 없음 |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 수정 성공 여부 |
| data | 1 | 객체 | 수정된 공고 |
| error | 1 | 에러 문자열 | 400 값 오류·status 포함, 403 남의 공고, 404, 409 확정 인원보다 적게 |

```json
{ "result": "Fail", "error": "이미 확정된 인원(2명)보다 적게 줄일 수 없습니다." }
```

#### - 공고 삭제 API 🔒 (작성자만)

Request: DELETE, /jobs/:id

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| id (Path) | Number | 필수 | 공고 번호 |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 삭제 성공 여부 |
| data.id | 2 | 숫자 | 삭제된 공고 번호 |
| error | 1 | 에러 문자열 | 403, 404, 409 확정·완료 지원이 있음 |

```json
{ "result": "Success", "data": { "id": 3 } }
```

#### - 모집 상태 변경 API 🔒 (작성자만)

Request: PATCH, /jobs/:id/status

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| id (Path) | Number | 필수 | 공고 번호 |
| status | String | 필수 | open(재오픈) / closed(조기 마감) |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 변경 성공 여부 |
| data | 1 | 객체 | 변경된 공고 |
| error | 1 | 에러 문자열 | 400 값 오류, 403, 404, 409 정원 찬 공고 재오픈 |

```json
{ "result": "Fail", "error": "정원이 찬 공고는 다시 열 수 없습니다. 모집인원을 먼저 늘려 주세요." }
```

---

### Resume 라우터 (이력서)

#### - 내 이력서 목록 API 🔒

Request: GET, /resumes/me

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| (없음) | | | |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 조회 성공 여부 |
| data | 1 | 배열 | 이력서 목록 (id, userId, title, intro, desiredRegion) |
| error | 1 | 에러 문자열 | 401 |

```json
{ "result": "Success", "data": [{ "id": 1, "userId": 2, "title": "성실한 알바생", "intro": "카페 경험이 있습니다.", "desiredRegion": "서울" }] }
```

#### - 이력서 상세 API 🔒 (본인 또는 지원받은 사장님)

Request: GET, /resumes/:id

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| id (Path) | Number | 필수 | 이력서 번호 |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 조회 성공 여부 |
| data | 1 | 객체 | 이력서 |
| error | 1 | 에러 문자열 | 401, 403 열람 권한 없음, 404 |

```json
{ "result": "Fail", "error": "열람 권한이 없습니다." }
```

#### - ★ 인증 경력 조회 API 🔒 (본인 또는 지원받은 사장님)

Request: GET, /resumes/:id/careers

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| id (Path) | Number | 필수 | 이력서 번호 (경력은 이력서 주인 기준으로 집계) |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 조회 성공 여부 |
| count | 2 | 숫자 | 완료된 근무 수 |
| avgRating | 2 | 숫자/null | 사장님 성실도 평균 |
| totalWorkedMinutes / totalWorkedDays / totalNoShowCount | 2 | 숫자 | 총 근무 분·일수·결근 수 |
| careers | 2 | 배열 | 경력 목록 |
| jobTitle, category, region, owner, startedAt, endedAt, workedMinutes, workedDays, noShowCount, ownerRating | 3 | | 공고·사장님·근무 기간·확인된 근무 시간·성실도 |
| error | 1 | 에러 문자열 | 401, 403, 404 |

```json
{
  "result": "Success",
  "data": {
    "count": 1, "avgRating": 5, "totalWorkedMinutes": 120, "totalWorkedDays": 1, "totalNoShowCount": 0,
    "careers": [{ "applicationId": 1, "jobId": 1, "jobTitle": "카페 서빙", "category": null, "region": "서울",
                  "owner": "boss", "ownerId": 1, "startedAt": "2026-11-23T05:00:00.000Z", "endedAt": "2026-11-23T09:00:00.000Z",
                  "workedMinutes": 120, "workedDays": 1, "noShowCount": 0, "ownerRating": 5 }]
  }
}
```

#### - 이력서 작성 API 🔒

Request: POST, /resumes

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| title | String | 필수 | 제목 (100자 이하) |
| intro | String | 필수 | 자기소개 (5000자 이하) |
| desiredRegion | String | 필수 | 희망 지역 (50자 이하) |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 작성 성공 여부 (201) |
| data | 1 | 객체 | 작성된 이력서 (userId=로그인 사용자) |
| error | 1 | 에러 문자열 | 400, 401 |

```json
{ "result": "Fail", "error": "intro은(는) 필수입니다." }
```

#### - 이력서 수정 API 🔒 (작성자만)

Request: PATCH, /resumes/:id

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| id (Path) | Number | 필수 | 이력서 번호 |
| title / intro / desiredRegion | String | 선택 | 바꿀 값만 |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 수정 성공 여부 |
| data | 1 | 객체 | 수정된 이력서 |
| error | 1 | 에러 문자열 | 400 수정할 값 없음, 403, 404 |

```json
{ "result": "Fail", "error": "이력서 작성자만 할 수 있습니다." }
```

#### - 이력서 삭제 API 🔒 (작성자만)

Request: DELETE, /resumes/:id

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| id (Path) | Number | 필수 | 이력서 번호 |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 삭제 성공 여부 |
| data.id | 2 | 숫자 | 삭제된 이력서 번호 |
| error | 1 | 에러 문자열 | 403, 404, 409 대기·확정 지원에 사용 중 |

```json
{ "result": "Fail", "error": "대기·확정 중인 지원에 쓰인 이력서는 삭제할 수 없습니다." }
```

---

### Application 라우터 (지원)

#### - 지원하기 API 🔒

Request: POST, /applications

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| jobId | Number | 필수 | 지원할 공고 번호 |
| resumeId | Number | 필수 | 내 이력서 번호 |
| message | String | 선택 | 지원 메시지 (500자 이하) |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 지원 성공 여부 (201) |
| data | 1 | 객체 | 지원 (id, jobId, resumeId, applicantId, status=pending, message) |
| error | 1 | 에러 문자열 | 400, 401, 403 본인 공고·남의 이력서, 404, 409 마감·중복 지원 |

```json
{ "result": "Fail", "error": "이미 지원한 공고입니다." }
```

#### - 내가 지원한 목록 API 🔒

Request: GET, /applications/sent

| Parameter (Query) | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| status | String | 선택 | pending / accepted / completed / rejected |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 조회 성공 여부 |
| data | 1 | 배열 | 지원 목록 (Job{…, owner{id,name}} 포함) |
| error | 1 | 에러 문자열 | 400 status 오류, 401 |

```json
{ "result": "Fail", "error": "status는 pending, accepted, completed, rejected 중 하나여야 합니다." }
```

#### - 내 공고로 온 지원 목록 API 🔒

Request: GET, /applications/received

| Parameter (Query) | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| status | String | 선택 | 지원 상태 필터 |
| jobId | Number | 선택 | 특정 공고만 |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 조회 성공 여부 |
| data | 1 | 배열 | 지원 목록 (Job, Resume, applicant{id,name} 포함). 남의 공고는 0건 |
| error | 1 | 에러 문자열 | 400, 401 |

```json
{ "result": "Success", "data": [{ "id": 1, "jobId": 1, "status": "pending", "applicant": { "id": 3, "name": "worker" } }] }
```

#### - ★ 채용 확정 API 🔒 (공고 작성자만)

Request: PATCH, /applications/:id/accept

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| id (Path) | Number | 필수 | 지원 번호 |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 확정 성공 여부 |
| application | 2 | 객체 | 확정된 지원 (status=accepted, acceptedAt) |
| job | 2 | 객체 | id, status(정원 차면 closed), headcount, confirmedCount |
| error | 1 | 에러 문자열 | 401, 403, 404, 409 대기 아님·마감·정원 참 |

```json
{
  "result": "Success",
  "data": {
    "application": { "id": 1, "status": "accepted", "acceptedAt": "2026-11-23T05:00:00.000Z" },
    "job": { "id": 1, "status": "closed", "headcount": 1, "confirmedCount": 1 }
  }
}
```

#### - 지원 거절 API 🔒 (공고 작성자만)

Request: PATCH, /applications/:id/reject

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| id (Path) | Number | 필수 | 지원 번호 |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 거절 성공 여부 |
| data | 1 | 객체 | 지원 (status=rejected) |
| error | 1 | 에러 문자열 | 403, 404, 409 대기 상태 아님 |

```json
{ "result": "Fail", "error": "대기 상태의 지원만 거절할 수 있습니다." }
```

#### - 근무 완료 처리 API 🔒 (공고 작성자만)

Request: PATCH, /applications/:id/complete

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| id (Path) | Number | 필수 | 지원 번호 |
| rating | Number | 필수 | 알바생 성실도 평점 (1~5 정수) |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 완료 성공 여부 |
| data | 1 | 객체 | 지원 (status=completed, ownerRating, completedAt) |
| error | 1 | 에러 문자열 | 400 평점 오류, 403, 404, 409 확정 아님·미처리 일정 있음·확인된 근무 없음 |

```json
{ "result": "Fail", "error": "아직 확인·결근 처리되지 않은 근무 일정이 있습니다." }
```

---

### Review 라우터 (후기)

#### - ★ 후기 작성 API 🔒

Request: POST, /reviews

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| applicationId | Number | 필수 | 근무 완료된 내 지원 번호 |
| score | Number | 필수 | 사장님 평점 (1~5 정수) |
| content | String | 선택 | 내용 (2000자 이하) |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 작성 성공 여부 (201) |
| data | 1 | 객체 | 후기 (authorId=로그인 사용자, ownerId=공고 사장님) |
| error | 1 | 에러 문자열 | 400, 401, 403 남의 지원, 404, 409 미완료·이미 작성 |

```json
{ "result": "Fail", "error": "근무 완료된 지원에만 후기를 쓸 수 있습니다." }
```

#### - 사장님별 후기 목록 API (로그인 불필요)

Request: GET, /reviews/owners/:ownerId

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| ownerId (Path) | Number | 필수 | 사장님 회원 번호 |
| page / limit (Query) | Number | 선택 | 페이지 / 개수 |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 조회 성공 여부 |
| ownerId / total / page / limit | 2 | 숫자 | |
| reviews | 2 | 배열 | 후기 목록 (score, content, author{id,name}) |
| error | 1 | 에러 문자열 | 400, 404 없는 사용자 |

```json
{ "result": "Fail", "error": "사용자를 찾을 수 없습니다." }
```

#### - 사장님 평균 평점 API (로그인 불필요)

Request: GET, /reviews/owners/:ownerId/score

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| ownerId (Path) | Number | 필수 | 사장님 회원 번호 |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 조회 성공 여부 |
| ownerId | 2 | 숫자 | 사장님 번호 |
| avgScore | 2 | 숫자/null | 평균 평점 (소수 둘째 자리, 후기 없으면 null) |
| count | 2 | 숫자 | 후기 수 |
| error | 1 | 에러 문자열 | 400, 404 |

```json
{ "result": "Success", "data": { "ownerId": 1, "avgScore": 4, "count": 2 } }
```

#### - 후기 수정 API 🔒 (작성자만)

Request: PATCH, /reviews/:id

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| id (Path) | Number | 필수 | 후기 번호 |
| score / content | | 선택 | 바꿀 값만 |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 수정 성공 여부 |
| data | 1 | 객체 | 수정된 후기 |
| error | 1 | 에러 문자열 | 400, 403, 404 |

```json
{ "result": "Fail", "error": "후기 작성자만 할 수 있습니다." }
```

#### - 후기 삭제 API 🔒 (작성자만)

Request: DELETE, /reviews/:id

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| id (Path) | Number | 필수 | 후기 번호 |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 삭제 성공 여부 |
| data.id | 2 | 숫자 | 삭제된 후기 번호 |
| error | 1 | 에러 문자열 | 403, 404 |

```json
{ "result": "Success", "data": { "id": 2 } }
```

---

### Shift 라우터 (근무 기록)

#### - 근무 일정 등록 API 🔒 (사장님)

Request: POST, /shifts

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| applicationId | Number | 필수 | 확정된 지원 번호 |
| startAt | String(ISO 날짜시간) | 필수 | 근무 시작 예정 시각 |
| endAt | String(ISO 날짜시간) | 필수 | 근무 종료 예정 시각 (startAt 이후) |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 등록 성공 여부 (201) |
| data | 1 | 객체 | 일정 (id, applicationId, startAt, endAt, status=scheduled) |
| error | 1 | 에러 문자열 | 400 시간 오류, 403 남의 공고, 404, 409 확정 아님·같은 알바생 일정과 겹침 |

```json
{ "result": "Fail", "error": "같은 알바생의 다른 근무 일정과 시간이 겹칩니다." }
```

#### - 내 근무 일정 API 🔒 (알바생)

Request: GET, /shifts/me

| Parameter (Query) | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| from / to | String(날짜) | 선택 | 시작 시각 기간 필터 |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 조회 성공 여부 |
| data | 1 | 배열 | 일정 목록 (Application{Job{id,title,region}} 포함, 시작 시각 순) |
| error | 1 | 에러 문자열 | 400 기간 오류, 401 |

```json
{ "result": "Success", "data": [{ "id": 1, "startAt": "2026-11-24T00:00:00.000Z", "endAt": "2026-11-24T06:00:00.000Z", "status": "scheduled" }] }
```

#### - 공고별 근무 일정 API 🔒 (사장님)

Request: GET, /shifts/jobs/:jobId

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| jobId (Path) | Number | 필수 | 공고 번호 |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 조회 성공 여부 |
| data | 1 | 배열 | 일정 목록 (Application{applicant{id,name}} 포함) |
| error | 1 | 에러 문자열 | 400, 403 남의 공고, 404 |

```json
{ "result": "Fail", "error": "내 공고의 일정만 볼 수 있습니다." }
```

#### - ★ 출근 체크 API 🔒 (일정의 알바생만)

Request: PATCH, /shifts/:id/check-in

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| id (Path) | Number | 필수 | 일정 번호 (출근 시각은 서버 시간) |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 출근 성공 여부 |
| data | 1 | 객체 | 일정 (status=checked_in, checkInAt) |
| error | 1 | 에러 문자열 | 403 남의 일정, 404, 409 예정 상태 아님·예정 시작 ±30분 밖 |

```json
{ "result": "Fail", "error": "출근은 예정 시작 시간 ±30분 안에서만 가능합니다." }
```

#### - 퇴근 체크 API 🔒 (일정의 알바생만)

Request: PATCH, /shifts/:id/check-out

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| id (Path) | Number | 필수 | 일정 번호 |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 퇴근 성공 여부 |
| data | 1 | 객체 | 일정 (status=checked_out, checkOutAt, workedMinutes = 퇴근-출근) |
| error | 1 | 에러 문자열 | 403, 404, 409 출근 상태 아님 |

```json
{ "result": "Success", "data": { "id": 1, "status": "checked_out", "workedMinutes": 120 } }
```

#### - 근무 확인 API 🔒 (사장님)

Request: PATCH, /shifts/:id/confirm

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| id (Path) | Number | 필수 | 일정 번호 |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 확인 성공 여부 |
| data | 1 | 객체 | 일정 (status=confirmed → 정산·경력에 반영) |
| error | 1 | 에러 문자열 | 403, 404, 409 퇴근 상태 아님 |

```json
{ "result": "Fail", "error": "퇴근 상태의 일정만 확인할 수 있습니다." }
```

#### - 결근 처리 API 🔒 (사장님)

Request: PATCH, /shifts/:id/no-show

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| id (Path) | Number | 필수 | 일정 번호 |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 처리 성공 여부 |
| data | 1 | 객체 | 일정 (status=no_show) |
| error | 1 | 에러 문자열 | 403, 404, 409 예정 아님·시작 시간 전 |

```json
{ "result": "Fail", "error": "시작 시간이 지난 일정만 결근 처리할 수 있습니다." }
```

---

### Payroll 라우터 (급여 정산)

#### - ★ 정산서 발행 API 🔒 (사장님)

Request: POST, /payrolls

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| applicationId | Number | 필수 | 지원 번호 |
| periodStart | String(YYYY-MM-DD) | 필수 | 정산 시작일 |
| periodEnd | String(YYYY-MM-DD) | 필수 | 정산 종료일 (시작일 이후) |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 발행 성공 여부 (201) |
| data | 1 | 객체 | 정산서 |
| totalMinutes | 2 | 숫자 | 확인된 근무 총 분 |
| hourlyPay | 2 | 숫자 | 발행 시점 시급 (스냅샷) |
| basePay / weeklyHolidayPay / totalPay | 2 | 숫자 | 기본급 / 주휴수당 / 총 지급액 |
| ownerId / workerId / status | 2 | | 발행 사장님 / 받는 알바생 / issued |
| error | 1 | 에러 문자열 | 400 기간 오류, 403 남의 공고, 404, 409 확인된 근무 없음·기간 중복 |

```json
{
  "result": "Success",
  "data": { "id": 1, "applicationId": 1, "ownerId": 1, "workerId": 2, "periodStart": "2026-11-02", "periodEnd": "2026-11-08",
            "totalMinutes": 1080, "hourlyPay": 10320, "basePay": 185760, "weeklyHolidayPay": 37152, "totalPay": 222912, "status": "issued" }
}
```

#### - 내 급여 목록 API 🔒 (알바생)

Request: GET, /payrolls/me

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| (없음) | | | |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 조회 성공 여부 |
| data | 1 | 배열 | 내가 받은 정산서 목록 |
| error | 1 | 에러 문자열 | 401 |

```json
{ "result": "Success", "data": [{ "id": 1, "totalPay": 222912, "status": "issued" }] }
```

#### - 발행한 정산서 목록 API 🔒 (사장님)

Request: GET, /payrolls/issued

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| (없음) | | | |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 조회 성공 여부 |
| data | 1 | 배열 | 내가 발행한 정산서 목록 |
| error | 1 | 에러 문자열 | 401 |

```json
{ "result": "Success", "data": [] }
```

#### - 정산서 상세 API 🔒 (발행자·수령자만)

Request: GET, /payrolls/:id

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| id (Path) | Number | 필수 | 정산서 번호 |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 조회 성공 여부 |
| data | 1 | 객체 | 정산서 전체 값 |
| days | 2 | 배열 | 일별 내역 (shiftId, startAt, endAt, workedMinutes, status) |
| error | 1 | 에러 문자열 | 403, 404 |

```json
{ "result": "Fail", "error": "열람 권한이 없습니다." }
```

#### - 지급 완료 API 🔒 (발행한 사장님만)

Request: PATCH, /payrolls/:id/pay

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| id (Path) | Number | 필수 | 정산서 번호 |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 처리 성공 여부 |
| data | 1 | 객체 | 정산서 (status=paid, paidAt) |
| error | 1 | 에러 문자열 | 403, 404, 409 발행 상태 아님 |

```json
{ "result": "Fail", "error": "발행 상태의 정산서만 지급 처리할 수 있습니다." }
```

#### - 이의제기 API 🔒 (받는 알바생만)

Request: PATCH, /payrolls/:id/dispute

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| id (Path) | Number | 필수 | 정산서 번호 |
| reason | String | 필수 | 이의제기 사유 (500자 이하) |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 처리 성공 여부 |
| data | 1 | 객체 | 정산서 (status=disputed, disputeReason) |
| error | 1 | 에러 문자열 | 400 사유 없음, 403, 404, 409 발행 상태 아님 |

```json
{ "result": "Fail", "error": "reason(이의제기 사유)은 필수입니다." }
```

---

### Notification 라우터 (알림)

#### - 알림 목록 API 🔒

Request: GET, /notifications

| Parameter (Query) | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| unread | String | 선택 | true 면 안 읽은 것만 |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 조회 성공 여부 |
| data | 1 | 배열 | 알림 목록 (id, type, message, targetId, isRead, createdAt) |
| error | 1 | 에러 문자열 | 401 |

```json
{ "result": "Success", "data": [{ "id": 1, "type": "application_received", "message": "worker님이 '카페 서빙' 공고에 지원했습니다.", "targetId": 1, "isRead": false }] }
```

#### - ★ 안 읽은 알림 개수 API 🔒

Request: GET, /notifications/unread-count

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| (없음) | | | |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 조회 성공 여부 |
| count | 2 | 숫자 | 안 읽은 알림 수 |
| error | 1 | 에러 문자열 | 401 |

```json
{ "result": "Success", "data": { "count": 3 } }
```

#### - 모두 읽음 API 🔒

Request: PATCH, /notifications/read-all

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| (없음) | | | |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 처리 성공 여부 |
| updated | 2 | 숫자 | 읽음으로 바뀐 개수 |
| error | 1 | 에러 문자열 | 401 |

```json
{ "result": "Success", "data": { "updated": 2 } }
```

#### - 알림 읽음 처리 API 🔒 (본인 알림만)

Request: PATCH, /notifications/:id/read

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| id (Path) | Number | 필수 | 알림 번호 |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 처리 성공 여부 |
| data | 1 | 객체 | 알림 (isRead=true) |
| error | 1 | 에러 문자열 | 403, 404 |

```json
{ "result": "Fail", "error": "본인의 알림만 처리할 수 있습니다." }
```

#### - 알림 삭제 API 🔒 (본인 알림만)

Request: DELETE, /notifications/:id

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| id (Path) | Number | 필수 | 알림 번호 |

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | Success/Fail | 삭제 성공 여부 |
| data.id | 2 | 숫자 | 삭제된 알림 번호 |
| error | 1 | 에러 문자열 | 403, 404 |

```json
{ "result": "Success", "data": { "id": 4 } }
```

---

## 라우터 별 핵심 API 코드

### 1. APPLICATION 라우터의 채용 확정 API (PATCH /applications/:id/accept)

```js
// routes/applications.js
router.patch('/:id/accept', isLoggedIn, isJobOwnerOfApplication, c.accept);

// controllers/applications.js
exports.accept = async (req, res, next) => {
    try {
        const result = await sequelize.transaction(async t => {
            // 같은 공고에 동시에 확정을 눌러도 하나씩 순서대로 처리되도록 공고 행을 잠근다
            const job = await Job.findByPk(req.application.jobId, { transaction: t, lock: t.LOCK.UPDATE });
            const application = await Application.findByPk(req.application.id, { transaction: t });

            if (application.status !== 'pending' || job.status === 'closed')
                throw new HttpError(409, '대기 상태의 지원이고 모집중인 공고만 확정할 수 있습니다.');

            const confirmed = await Application.count({
                where: { jobId: job.id, status: { [Op.in]: CONFIRMED_STATUSES } },
                transaction: t
            });
            if (confirmed >= job.headcount) throw new HttpError(409, '모집 정원이 가득 찼습니다.');

            application.status = 'accepted';
            application.acceptedAt = new Date();
            await application.save({ transaction: t });

            // 확정 인원 + 1 이 headcount 이상이면 공고를 마감한다
            if (confirmed + 1 >= job.headcount) {
                job.status = 'closed';
                await job.save({ transaction: t });
            }

            // 확정 처리와 알림 생성은 한 트랜잭션: 하나라도 실패하면 둘 다 취소된다
            await notify(application.applicantId, 'application_accepted',
                `'${job.title}' 지원이 확정되었습니다.`, application.id, { transaction: t });

            return { application, job, confirmedCount: confirmed + 1 };
        });

        ok(res, {
            application: result.application,
            job: { id: result.job.id, status: result.job.status,
                   headcount: result.job.headcount, confirmedCount: result.confirmedCount }
        });
    } catch (err) { next(err); }
};
```

코드 간단 설명
- `isLoggedIn`(401) → `isJobOwnerOfApplication`(지원이 없으면 404, 내 공고의 지원이 아니면 403) 미들웨어를 통과해야 컨트롤러에 들어온다.
- 확정·공고 마감·알림 생성을 **하나의 트랜잭션**으로 묶어, 중간에 실패하면 모두 취소된다.
- 공고 행에 `LOCK.UPDATE`(행 잠금)를 걸어, 사장님이 두 지원을 동시에 확정해도 정원을 넘지 않는다.
- 확정 인원이 모집 인원(headcount)에 도달하면 공고를 자동으로 `closed` 로 바꾼다.

### 2. SHIFT 라우터의 출근 체크 API (PATCH /shifts/:id/check-in)

```js
// routes/shifts.js
router.patch('/:id/check-in', isLoggedIn, isShiftWorker, c.checkIn);

// middlewares/owner.js - 일정의 지원자 === 나 → req.shift
exports.isShiftWorker = async (req, res, next) => {
    try {
        const shift = await Shift.findByPk(idOf(req), { include: shiftInclude });
        if (!shift) throw new HttpError(404, '근무 일정을 찾을 수 없습니다.');
        if (shift.Application.applicantId !== req.user.id)
            throw new HttpError(403, '본인의 근무 일정만 처리할 수 있습니다.');
        req.shift = shift;
        next();
    } catch (err) { next(err); }
};

// controllers/shifts.js
exports.checkIn = async (req, res, next) => {
    try {
        const shift = req.shift;
        if (shift.status !== 'scheduled') throw new HttpError(409, '예정 상태의 일정만 출근할 수 있습니다.');

        const now = new Date();
        const gapMinutes = Math.abs(now - new Date(shift.startAt)) / 60000;
        if (gapMinutes > CHECK_IN_WINDOW_MINUTES)   // 30분
            throw new HttpError(409, `출근은 예정 시작 시간 ±${CHECK_IN_WINDOW_MINUTES}분 안에서만 가능합니다.`);

        await shift.update({ checkInAt: now, status: 'checked_in' });
        ok(res, shift);
    } catch (err) { next(err); }
};
```

코드 간단 설명
- 미들웨어 `isShiftWorker` 가 일정을 찾고(404) 그 일정의 알바생이 본인인지(403) 확인한 뒤 `req.shift` 에 실어 준다. 컨트롤러는 다시 조회하지 않는다.
- 일정 상태가 `scheduled`(예정)일 때만 출근할 수 있다 (두 번 출근 방지, 409).
- 출근 시각은 클라이언트가 보낸 값이 아니라 **서버 시간**을 쓰고, 예정 시작 시간 ±30분 안에서만 허용해 근무 기록을 조작할 수 없게 했다.
- 이후 퇴근(check-out) 때 `workedMinutes = 퇴근 - 출근` 을 계산하고, 사장님이 확인(confirm)한 근무만 정산·경력에 들어간다.

### 3. PAYROLL 라우터의 정산서 발행 API (POST /payrolls)

```js
// routes/payrolls.js
router.post('/', isLoggedIn, c.issue);

// controllers/payrolls.js
exports.issue = async (req, res, next) => {
    try {
        const applicationId = positiveInt(req.body.applicationId);
        const periodStart = dateOnlyOf(req.body.periodStart);
        const periodEnd = dateOnlyOf(req.body.periodEnd);
        if (applicationId === null) throw new HttpError(400, 'applicationId는 필수입니다.');
        if (!periodStart || !periodEnd) throw new HttpError(400, 'periodStart, periodEnd는 YYYY-MM-DD 형식이어야 합니다.');
        if (periodStart > periodEnd) throw new HttpError(400, 'periodEnd는 periodStart보다 빠를 수 없습니다.');

        const application = await Application.findByPk(applicationId, { include: [Job] });
        if (!application) throw new HttpError(404, '지원을 찾을 수 없습니다.');
        if (application.Job.ownerId !== req.user.id) throw new HttpError(403, '내 공고의 지원에만 정산서를 발행할 수 있습니다.');

        const { from, to } = periodRange(periodStart, periodEnd);
        const shifts = await Shift.findAll({ where: { applicationId, startAt: { [Op.between]: [from, to] } } });
        if (!shifts.some(s => s.status === 'confirmed'))
            throw new HttpError(409, '기간 안에 확인된 근무가 없습니다.');

        // 같은 지원·겹치는 기간의 정산서가 있으면 409 (이의제기 상태면 재발행 허용)
        const duplicated = await Payroll.findOne({ where: {
            applicationId, status: { [Op.ne]: 'disputed' },
            periodStart: { [Op.lte]: periodEnd }, periodEnd: { [Op.gte]: periodStart }
        } });
        if (duplicated) throw new HttpError(409, '같은 기간에 이미 발행된 정산서가 있습니다.');

        // 시급 스냅샷: 발행 시점의 시급을 저장한다
        const hourlyPay = application.Job.pay;
        const calc = calculatePayroll(shifts, hourlyPay);   // utils/payroll.js

        const payroll = await sequelize.transaction(async t => {
            const created = await Payroll.create({
                applicationId, ownerId: req.user.id, workerId: application.applicantId,
                periodStart, periodEnd, hourlyPay, ...calc, status: 'issued'
            }, { transaction: t });
            await notify(application.applicantId, 'payroll_issued',
                `'${application.Job.title}' 정산서가 발행되었습니다. (${calc.totalPay.toLocaleString('ko-KR')}원)`,
                created.id, { transaction: t });
            return created;
        });
        ok(res, payroll, 201);
    } catch (err) { next(err); }
};

// utils/payroll.js - 급여 계산 (DB 없는 순수 함수)
const calculatePayroll = (shifts, hourlyPay) => {
    const confirmed = shifts.filter(s => s.status === 'confirmed');
    const totalMinutes = confirmed.reduce((sum, s) => sum + (s.workedMinutes || 0), 0);
    const basePay = Math.floor(totalMinutes * hourlyPay / 60);          // 기본급

    const weeks = new Map();                                             // 주(월~일) 단위로 묶기
    for (const s of shifts) {
        const key = weekKey(new Date(s.startAt));
        if (!weeks.has(key)) weeks.set(key, { minutes: 0, noShows: 0 });
        const week = weeks.get(key);
        if (s.status === 'confirmed') week.minutes += s.workedMinutes || 0;
        if (s.status === 'no_show') week.noShows += 1;
    }

    let weeklyHolidayPay = 0;                                            // 주휴수당
    for (const week of weeks.values()) {
        if (week.minutes >= WEEKLY_HOLIDAY_MIN_MINUTES && week.noShows === 0) {   // 주 15시간 이상 + 결근 없음
            const eligible = Math.min(week.minutes, WEEKLY_FULL_MINUTES);         // 40시간 상한
            weeklyHolidayPay += Math.floor(eligible * hourlyPay / 300);
        }
    }
    return { totalMinutes, basePay, weeklyHolidayPay, totalPay: basePay + weeklyHolidayPay };
};
```

코드 간단 설명
- 입력 검증(400) → 지원 존재(404) → 내 공고인지(403) → 확인된 근무 있는지(409) → 기간 중복(409) 순서로 검사한다.
- 금액은 클라이언트가 보내지 않고, 서버가 **사장님이 확인한 근무 기록**으로 직접 계산한다.
- 주휴수당은 주(월~일)마다 따로 계산한다: 그 주 확인 근무가 15시간 이상이고 결근이 없을 때만, `근무분 × 시급 ÷ 300`(40시간 상한) 을 준다.
- 발행 시점의 시급을 정산서에 저장(스냅샷)해, 나중에 공고 시급이 바뀌어도 이미 발행된 금액은 바뀌지 않는다.
- 정산서 생성과 알바생 알림을 한 트랜잭션으로 처리한다.

---

## 라우터 별 핵심 API 테스트 코드 및 그 결과

테스트 도구: mocha(테스트 실행) + chai(expect 검사) + supertest(실제 HTTP 요청).
`test/helper.js` 의 `createAgent()` 가 가입·로그인까지 마친 agent(세션 쿠키 유지)를 만들어 준다.
45개 API 는 모두 `test/api.js` 에 API 이름이 붙은 테스트 함수가 있다.

실행 명령: `npx mocha --exit test/api.js` (전체) / `npx mocha --exit -f "<테스트 이름>" test/api.js` (하나만)

### 1. APPLICATION 라우터의 채용 확정 API 테스트

```js
describe('PATCH /applications/:id/accept ★', () => {
    it('확정되고 acceptedAt이 기록되며 지원자에게 알림', async () => { … });
    it('정원이 차면 공고가 closed 로 바뀌고, 정원 초과 확정은 409', async () => { … });
    it('남의 공고 403, 없는 지원 404, 비로그인 401', async () => { … });
    it('이미 확정된 지원 409, 조기 마감된 공고의 대기 지원 409', async () => { … });
});
```
[여기에 test/api.js 의 `describe('PATCH /applications/:id/accept ★'` 블록 전체를 붙여넣기]

테스트 결과: [`npx mocha --exit -f "accept" test/api.js` 실행 화면 캡처]

### 2. SHIFT 라우터의 출근 체크 API 테스트

[여기에 test/api.js 의 `describe('PATCH /shifts/:id/check-in ★'` 블록 전체를 붙여넣기]

- 시간 창(예정 시작 ±30분) 안이면 200
- 창 밖이면 409 (너무 이르거나 너무 늦음)
- 남의 일정 403, 이미 출근한 일정 409, 없는 일정 404

테스트 결과: [`npx mocha --exit -f "check-in" test/api.js` 실행 화면 캡처]

### 3. PAYROLL 라우터의 정산서 발행 API 테스트

[여기에 test/api.js 의 `describe('POST /payrolls ★'` 블록 전체를 붙여넣기]

- 주 3일 × 6시간 확인 근무 → 기본급 185,760원 · 주휴수당 37,152원 · 총 222,912원 일치, 알바생에게 알림
- 결근이 있는 주는 주휴수당 0
- 403 남의 공고, 404 없는 지원, 400 기간 오류, 409 확인된 근무 없음
- 같은 기간(겹치는 기간 포함) 재발행 409, 이의제기 상태면 재발행 허용
- 시급 스냅샷: 나중에 공고 시급이 바뀌어도 발행된 금액은 그대로

테스트 결과: [`npx mocha --exit -f "POST /payrolls" test/api.js` 실행 화면 캡처]

---

## 부록. 프로젝트 수행 인증 사진

[대면 회의 사진 — 팀원 전원 얼굴이 나와야 함]
