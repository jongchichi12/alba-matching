# ERD (엔티티 관계도)

> 기준: `models/*.js`. 서버를 켠 뒤 `http://localhost:3000/erd.html` 에서도 같은 그림을 볼 수 있습니다.
> 표기: `||` 정확히 1 · `o|` 0 또는 1 · `o{` 0개 이상(N) · PK 기본키 · FK 외래키 · UK 유일

```mermaid
erDiagram
    USER ||--o{ JOB : "공고 등록 (ownerId)"
    USER ||--o{ RESUME : "이력서 작성 (userId)"
    USER ||--o{ APPLICATION : "지원 (applicantId)"
    USER ||--o{ NOTIFICATION : "알림 수신 (userId)"
    USER ||--o{ PAYROLL : "정산서 발행 (ownerId)"
    USER ||--o{ PAYROLL : "정산서 수령 (workerId)"
    USER ||--o{ REVIEW : "후기 작성 (authorId)"
    USER ||--o{ REVIEW : "평판 수신 (ownerId)"
    JOB ||--o{ APPLICATION : "받은 지원"
    RESUME |o--o{ APPLICATION : "지원에 사용 (삭제 시 NULL)"
    APPLICATION ||--o{ SHIFT : "근무 일정"
    APPLICATION ||--o{ PAYROLL : "정산"
    APPLICATION ||--o| REVIEW : "후기 (지원당 1개)"

    USER {
        int id PK
        string email UK
        string password "bcrypt 해시"
        string name
        string phone
    }
    JOB {
        int id PK
        int ownerId FK
        string title
        string category
        string region
        int pay "시급"
        int headcount "모집 인원"
        string status "open / closed"
    }
    RESUME {
        int id PK
        int userId FK
        string title
        text intro
        string desiredRegion
    }
    APPLICATION {
        int id PK
        int jobId FK
        int resumeId FK "NULL 허용"
        int applicantId FK
        string status "pending / accepted / completed / rejected"
        string message
        int ownerRating "성실도 1~5"
        datetime acceptedAt
        datetime completedAt
    }
    SHIFT {
        int id PK
        int applicationId FK
        datetime startAt
        datetime endAt
        datetime checkInAt
        datetime checkOutAt
        int workedMinutes
        string status "scheduled / checked_in / checked_out / confirmed / no_show"
    }
    PAYROLL {
        int id PK
        int applicationId FK
        int ownerId FK
        int workerId FK
        date periodStart
        date periodEnd
        int totalMinutes
        int hourlyPay "발행 시점 시급"
        int basePay
        int weeklyHolidayPay
        int totalPay
        string status "issued / paid / disputed"
        string disputeReason
        datetime paidAt
    }
    REVIEW {
        int id PK
        int applicationId FK "UK"
        int authorId FK
        int ownerId FK
        int score "1~5"
        text content
    }
    NOTIFICATION {
        int id PK
        int userId FK
        string type
        string message
        int targetId "관련 지원·일정·정산서·후기 id"
        boolean isRead
    }
```

## 읽는 법
- **User** 가 중심입니다. 사장님·알바생 구분 없이 한 종류이고, 하는 행동(공고 등록 / 지원)으로 역할이 정해집니다.
- **Application(지원)** 이 두 번째 중심입니다. 공고(Job)와 이력서(Resume)를 이어 주는 N:M 연결 역할을 하면서 자체 상태·평점을 가지며, Shift / Payroll / Review 가 모두 여기에 매달립니다.
- **1:1** 은 `Application — Review` 하나뿐입니다 (`applicationId` UNIQUE).
- **Payroll / Review** 는 User 를 두 번 가리킵니다 (발행자·수령자 / 작성자·평판 대상).
- 제약: `UNIQUE(jobId, applicantId)` — 같은 공고에 같은 사람은 한 번만 지원 (거절 후 재지원도 불가).
- 삭제 규칙: 공고 삭제 시 지원 CASCADE, 이력서 삭제 시 지원의 `resumeId` 만 NULL (완료된 지원의 경력은 유지).
