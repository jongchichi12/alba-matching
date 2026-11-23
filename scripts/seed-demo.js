// 알바생 시점 시연용 시드: NODE_ENV=demo node scripts/seed-demo.js
// sample_demo DB 를 (없으면 만들고) 비운 뒤, 여러 사장님 계정과 다양한 공고를 넣는다.
process.env.NODE_ENV = 'demo';
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
const config = require('../config/config.json').demo;

const PASSWORD = 'demo1234';

const owners = [
    { email: 'cafe@demo.com', name: '김카페' },
    { email: 'cvs@demo.com', name: '박편의' },
    { email: 'food@demo.com', name: '이식당' },
    { email: 'event@demo.com', name: '최행사' },
    { email: 'edu@demo.com', name: '정학원' },
];

// [사장 index, 제목, 카테고리, 지역, 시급, 인원, 상태]
const jobs = [
    [0, '주말 오픈 바리스타 (경력 우대)', '카페', '서울 마포구', 11000, 2, 'open'],
    [0, '평일 오후 카페 서빙', '카페', '서울 마포구', 10200, 1, 'open'],
    [0, '디저트 카페 주방 보조', '카페', '서울 성동구', 10500, 1, 'open'],
    [0, '시즌 한정 팝업 카페 스태프', '카페', '서울 강남구', 12000, 3, 'closed'],
    [1, '야간 편의점 (22시~06시)', '편의점', '서울 관악구', 13500, 1, 'open'],
    [1, '주중 오전 편의점 스태프', '편의점', '서울 마포구', 10030, 2, 'open'],
    [1, '주말 편의점 단기', '편의점', '경기 성남시', 10300, 1, 'open'],
    [2, '삼겹살집 홀 서빙', '음식점', '서울 마포구', 11000, 3, 'open'],
    [2, '주방 설거지·보조 (식사 제공)', '음식점', '서울 종로구', 10800, 2, 'open'],
    [2, '배달 포장 담당', '음식점', '경기 수원시', 10500, 2, 'open'],
    [2, '호프집 저녁 홀 알바', '음식점', '서울 홍대', 12000, 2, 'open'],
    [3, '콘서트 현장 안내 스태프 (1일)', '행사', '서울 송파구', 15000, 10, 'open'],
    [3, '전시회 도슨트 보조', '행사', '서울 용산구', 13000, 4, 'open'],
    [3, '박람회 부스 운영 (3일)', '행사', '경기 고양시', 14000, 6, 'closed'],
    [4, '초등 방과후 학습 도우미', '교육', '서울 강남구', 14000, 2, 'open'],
    [4, '학원 데스크 상담 보조', '교육', '서울 노원구', 11500, 1, 'open'],
    [4, '물류센터 야간 상하차', '물류', '인천 서구', 16000, 8, 'open'],
    [1, '마트 진열·재고 정리', '유통', '서울 은평구', 10500, 3, 'open'],
];

(async () => {
    // DB 가 없으면 만든다 (models 를 불러오기 전에)
    const conn = await mysql.createConnection({
        host: config.host, user: config.username, password: config.password
    });
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
    await conn.end();

    const db = require('../models');
    await db.sequelize.sync({ force: true });

    const hash = await bcrypt.hash(PASSWORD, 12);
    const users = [];
    for (const o of owners) users.push(await db.User.create({ ...o, password: hash }));

    for (const [i, title, category, region, pay, headcount, status] of jobs) {
        await db.Job.create({ ownerId: users[i].id, title, category, region, pay, headcount, status });
    }

    console.log(`${config.database}: 사장님 ${users.length}명, 공고 ${jobs.length}개 생성 (비밀번호 ${PASSWORD})`);
    await db.sequelize.close();
})().catch(e => { console.error(e); process.exit(1); });
