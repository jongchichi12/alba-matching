// 테스트 공통 도구. 모든 테스트 파일은 첫 줄에 NODE_ENV='test' 를 넣어 models 가 DB(sample)를 쓰게 한다
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../app');
const db = require('../models');

let seq = 0;

// 테이블 초기화 (app.js 는 test 환경에서 sync 를 건너뛴다 → describe 의 before() 에서 호출)
const resetDb = () => db.sequelize.sync({ force: true });

// 가입 + 로그인까지 해 둔 agent. agent 는 세션 쿠키를 계속 들고 요청한다
const createAgent = async (name = 'user') => {
    seq += 1;
    const email = `${name}${seq}@test.com`;
    const agent = request.agent(app);

    const joined = await agent.post('/users/join').send({ email, password: 'pass1234', name });
    if (joined.status !== 201) throw new Error(`가입 실패: ${JSON.stringify(joined.body)}`);
    const login = await agent.post('/users/login').send({ email, password: 'pass1234' });
    if (login.status !== 200) throw new Error(`로그인 실패: ${JSON.stringify(login.body)}`);

    return { agent, user: joined.body.data };
};

// ---------- 사전 데이터: 모델에 바로 넣는다 (테스트 대상이 아닌 API 의 버그 때문에 테스트가 깨지지 않도록) ----------
const minutesFromNow = minutes => new Date(Date.now() + minutes * 60000);

const createJob = (ownerId, overrides = {}) => db.Job.create({
    ownerId, title: '카페 서빙', category: '서빙', region: '서울 노원구', pay: 10320, headcount: 2, ...overrides
});

const createResume = (userId, overrides = {}) => db.Resume.create({
    userId, title: '성실한 알바생', intro: '카페 경험이 있습니다.', desiredRegion: '서울', ...overrides
});

const createApplication = (jobId, applicantId, resumeId, overrides = {}) => db.Application.create({
    jobId, applicantId, resumeId, status: 'pending', ...overrides
});

const createShift = (applicationId, overrides = {}) => db.Shift.create({
    applicationId, startAt: minutesFromNow(10), endAt: minutesFromNow(250), status: 'scheduled', ...overrides
});

module.exports = {
    app, db, request,
    resetDb, createAgent, minutesFromNow,
    createJob, createResume, createApplication, createShift
};
