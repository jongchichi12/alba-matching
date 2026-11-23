// 라우터별 API 테스트. 실행: npm run test-api   (특정 라우터만: npx mocha --exit -f "/applications" test/api.js)
// 미리 만들어 둘 것: npx sequelize db:create --env test   (describe 마다 테이블을 새로 만든다)
process.env.NODE_ENV = 'test';

const { expect } = require('chai');
const {
    db, request, resetDb, createAgent, minutesFromNow,
    createJob, createResume, createApplication, createShift
} = require('./helper');

const FAIL = body => { expect(body.result).to.equal('Fail'); expect(body.error).to.be.a('string'); };
const day = (y, m, d, h = 9) => new Date(y, m - 1, d, h, 0);   // 로컬 시간

describe('API: /users', () => {
    let agent;   // 아래 it 들이 순서대로 같은 세션(가입 → 로그인 → me → 로그아웃)을 이어 쓴다

    before(async () => {
        await resetDb();
        agent = request.agent(require('../app'));
    });

    it('POST /users/join - 400 이메일 형식 오류', async () => {
        const res = await request(require('../app')).post('/users/join').send({ email: 'abc', password: 'pass1234', name: '가나다' });
        expect(res.status).to.equal(400);
        FAIL(res.body);
    });

    it('POST /users/join - 201 가입(비밀번호는 응답에 없음), 409 중복 이메일', async () => {
        let res = await agent.post('/users/join').send({ email: 'a@test.com', password: 'pass1234', name: '가나다', phone: '010-1111-2222' });
        expect(res.status).to.equal(201);
        expect(res.body.data).to.not.have.property('password');

        res = await agent.post('/users/join').send({ email: 'a@test.com', password: 'pass1234', name: '중복' });
        expect(res.status).to.equal(409);
    });

    it('POST /users/login - 401 비밀번호 틀림, 200 로그인, 400 이미 로그인한 상태', async () => {
        let res = await agent.post('/users/login').send({ email: 'a@test.com', password: 'wrong' });
        expect(res.status).to.equal(401);

        res = await agent.post('/users/login').send({ email: 'a@test.com', password: 'pass1234' });
        expect(res.status).to.equal(200);
        res = await agent.post('/users/login').send({ email: 'a@test.com', password: 'pass1234' });
        expect(res.status).to.equal(400);
    });

    it('GET /users/me - 로그인한 사용자 정보', async () => {
        const res = await agent.get('/users/me');
        expect(res.status).to.equal(200);
        expect(res.body.data.email).to.equal('a@test.com');
    });

    it('POST /users/logout - 200, 로그아웃 후 /users/me 는 401', async () => {
        let res = await agent.post('/users/logout');
        expect(res.status).to.equal(200);
        res = await agent.get('/users/me');
        expect(res.status).to.equal(401);
    });

    it('없는 경로는 Fail 형식 404', async () => {
        const res = await request(require('../app')).get('/nothing');
        expect(res.status).to.equal(404);
        FAIL(res.body);
    });
});

describe('API: /jobs', () => {
    let boss, other, jobs;

    before(async () => {
        await resetDb();
        boss = await createAgent('boss');
        other = await createAgent('other');
        jobs = {
            A: await createJob(boss.user.id, { title: 'A', region: '서울 노원구', category: '서빙', pay: 10320 }),
            B: await createJob(boss.user.id, { title: 'B', region: '서울 강남구', category: '서빙', pay: 12000 }),
            C: await createJob(boss.user.id, { title: 'C', region: '부산 해운대구', category: '주방', pay: 11000 }),
            D: await createJob(boss.user.id, { title: 'D', region: '서울 노원구', category: '서빙', pay: 10320, status: 'closed' })
        };
    });

    describe('GET /jobs ★', () => {
        it('기본은 모집중만 나온다', async () => {
            const res = await request(require('../app')).get('/jobs');
            expect(res.status).to.equal(200);
            expect(res.body.data.total).to.equal(3);
            expect(res.body.data.jobs.every(j => j.status === 'open')).to.equal(true);
        });

        it('region 부분 일치, category 정확 일치, minPay 이상', async () => {
            const app = require('../app');
            let res = await request(app).get('/jobs').query({ region: '노원' });
            expect(res.body.data.jobs.map(j => j.title)).to.deep.equal(['A']);

            res = await request(app).get('/jobs').query({ category: '주방' });
            expect(res.body.data.jobs.map(j => j.title)).to.deep.equal(['C']);

            res = await request(app).get('/jobs').query({ minPay: 11000 });
            expect(res.body.data.total).to.equal(2);
        });

        it('status=closed·all, page/limit과 total', async () => {
            const app = require('../app');
            let res = await request(app).get('/jobs').query({ status: 'closed' });
            expect(res.body.data.jobs.map(j => j.title)).to.deep.equal(['D']);

            res = await request(app).get('/jobs').query({ status: 'all' });
            expect(res.body.data.total).to.equal(4);

            res = await request(app).get('/jobs').query({ limit: 2, page: 2 });
            expect(res.body.data.jobs).to.have.length(1);
            expect(res.body.data.total).to.equal(3);
            expect(res.body.data.page).to.equal(2);
        });

        it('mine=true 는 내 공고만 (모든 상태), 비로그인은 401', async () => {
            const app = require('../app');
            let res = await boss.agent.get('/jobs').query({ mine: 'true', status: 'all' });
            expect(res.status).to.equal(200);
            expect(res.body.data.total).to.equal(4);

            res = await other.agent.get('/jobs').query({ mine: 'true', status: 'all' });
            expect(res.status).to.equal(200);
            expect(res.body.data.total).to.equal(0);

            expect((await request(app).get('/jobs').query({ mine: 'true' })).status).to.equal(401);
        });

        it('400 잘못된 쿼리', async () => {
            const app = require('../app');
            expect((await request(app).get('/jobs').query({ status: 'zzz' })).status).to.equal(400);
            expect((await request(app).get('/jobs').query({ minPay: 'abc' })).status).to.equal(400);
        });
    });

    describe('POST /jobs', () => {
        it('201, ownerId는 로그인한 사용자로 채운다', async () => {
            const res = await boss.agent.post('/jobs').send({
                title: '편의점', region: '서울', pay: 10320, headcount: 1, ownerId: 9999
            });
            expect(res.status).to.equal(201);
            expect(res.body.data.ownerId).to.equal(boss.user.id);
            expect(res.body.data.status).to.equal('open');
        });

        it('400 필수값 누락, 400 최저임금 미만, 401 비로그인', async () => {
            let res = await boss.agent.post('/jobs').send({ title: '편의점', region: '서울', pay: 10320 });
            expect(res.status).to.equal(400);
            res = await boss.agent.post('/jobs').send({ title: '편의점', region: '서울', pay: 10319, headcount: 1 });
            expect(res.status).to.equal(400);
            res = await request(require('../app')).post('/jobs').send({});
            expect(res.status).to.equal(401);
        });
    });

    describe('상세 · 수정 · 삭제 · 모집상태', () => {
        let job;
        before(async () => {
            job = await createJob(boss.user.id, { headcount: 3 });
            const worker = await createAgent('worker');
            const resume = await createResume(worker.user.id);
            await createApplication(job.id, worker.user.id, resume.id, { status: 'accepted' });
            const worker2 = await createAgent('worker2');
            const resume2 = await createResume(worker2.user.id);
            await createApplication(job.id, worker2.user.id, resume2.id, { status: 'completed' });
        });

        it('GET /jobs/:id - 확정(accepted+completed) 인원과 모집인원', async () => {
            const res = await request(require('../app')).get(`/jobs/${job.id}`);
            expect(res.body.data.confirmedCount).to.equal(2);
            expect(res.body.data.headcount).to.equal(3);
            expect((await request(require('../app')).get('/jobs/99999')).status).to.equal(404);
        });

        it('PATCH /jobs/:id - 403 남의 공고, 400 status 포함, 409 확정 인원보다 적게', async () => {
            expect((await other.agent.patch(`/jobs/${job.id}`).send({ title: 'x' })).status).to.equal(403);
            expect((await boss.agent.patch(`/jobs/${job.id}`).send({ status: 'closed' })).status).to.equal(400);
            expect((await boss.agent.patch(`/jobs/${job.id}`).send({ pay: 100 })).status).to.equal(400);
            expect((await boss.agent.patch(`/jobs/${job.id}`).send({ headcount: 1 })).status).to.equal(409);

            const res = await boss.agent.patch(`/jobs/${job.id}`).send({ title: '수정됨', headcount: 4 });
            expect(res.status).to.equal(200);
            expect(res.body.data.title).to.equal('수정됨');
        });

        it('PATCH /jobs/:id/status - 400 값 오류, 409 정원 찬 공고 재오픈', async () => {
            expect((await boss.agent.patch(`/jobs/${job.id}/status`).send({ status: 'x' })).status).to.equal(400);

            let res = await boss.agent.patch(`/jobs/${job.id}/status`).send({ status: 'closed' });
            expect(res.body.data.status).to.equal('closed');
            res = await boss.agent.patch(`/jobs/${job.id}/status`).send({ status: 'open' });
            expect(res.body.data.status).to.equal('open');

            const full = await createJob(boss.user.id, { headcount: 1, status: 'closed' });
            const w = await createAgent('w3');
            await createApplication(full.id, w.user.id, null, { status: 'accepted' });
            expect((await boss.agent.patch(`/jobs/${full.id}/status`).send({ status: 'open' })).status).to.equal(409);
        });

        it('DELETE /jobs/:id - 409 확정·완료 지원 있음, 대기 지원만 있으면 함께 삭제', async () => {
            expect((await boss.agent.delete(`/jobs/${job.id}`)).status).to.equal(409);

            const clean = await createJob(boss.user.id);
            const w = await createAgent('w4');
            await createApplication(clean.id, w.user.id, null, { status: 'pending' });
            expect((await other.agent.delete(`/jobs/${clean.id}`)).status).to.equal(403);
            expect((await boss.agent.delete(`/jobs/${clean.id}`)).status).to.equal(200);
            expect((await request(require('../app')).get(`/jobs/${clean.id}`)).status).to.equal(404);
            expect(await db.Application.count({ where: { jobId: clean.id } })).to.equal(0);
        });
    });
});

describe('API: /resumes', () => {
    let boss, worker, third, job, resume;

    before(async () => {
        await resetDb();
        boss = await createAgent('boss');
        worker = await createAgent('worker');
        third = await createAgent('third');
        job = await createJob(boss.user.id);
    });

    it('POST /resumes - 201, 400, 401', async () => {
        let res = await worker.agent.post('/resumes').send({ title: '이력서', intro: '안녕하세요', desiredRegion: '서울', userId: 999 });
        expect(res.status).to.equal(201);
        expect(res.body.data.userId).to.equal(worker.user.id);
        resume = res.body.data;

        res = await worker.agent.post('/resumes').send({ title: '제목만' });
        expect(res.status).to.equal(400);
        res = await request(require('../app')).post('/resumes').send({});
        expect(res.status).to.equal(401);
    });

    it('GET /resumes/me', async () => {
        const res = await worker.agent.get('/resumes/me');
        expect(res.status).to.equal(200);
        expect(res.body.data).to.have.length(1);
    });

    it('GET /resumes/:id - 본인·지원받은 사장님만 열람', async () => {
        expect((await worker.agent.get(`/resumes/${resume.id}`)).status).to.equal(200);
        expect((await boss.agent.get(`/resumes/${resume.id}`)).status).to.equal(403);   // 아직 지원 전

        await createApplication(job.id, worker.user.id, resume.id);
        expect((await boss.agent.get(`/resumes/${resume.id}`)).status).to.equal(200);
        expect((await third.agent.get(`/resumes/${resume.id}`)).status).to.equal(403);
        expect((await worker.agent.get('/resumes/99999')).status).to.equal(404);
        expect((await request(require('../app')).get(`/resumes/${resume.id}`)).status).to.equal(401);
    });

    it('PATCH /resumes/:id - 400, 403', async () => {
        expect((await worker.agent.patch(`/resumes/${resume.id}`).send({ title: '' })).status).to.equal(400);
        expect((await third.agent.patch(`/resumes/${resume.id}`).send({ title: 'x' })).status).to.equal(403);
        const res = await worker.agent.patch(`/resumes/${resume.id}`).send({ intro: '수정한 소개' });
        expect(res.body.data.intro).to.equal('수정한 소개');
    });

    it('DELETE /resumes/:id - 409 대기·확정 지원에 사용 중', async () => {
        expect((await worker.agent.delete(`/resumes/${resume.id}`)).status).to.equal(409);
    });

    describe('GET /resumes/:id/careers ★', () => {
        let worker2, resume2, bossB, resumeB;

        before(async () => {
            await resetDb();
            boss = await createAgent('boss');
            bossB = await createAgent('bossB');
            worker2 = await createAgent('worker');
            third = await createAgent('third');
            resume2 = await createResume(worker2.user.id);
            resumeB = await createResume(worker2.user.id, { title: '두 번째 이력서' });   // 지원에는 쓰지 않은 이력서

            // 완료 A: 확정 근무 180분 + 120분(다른 날), 결근 1회, 성실도 5
            const jobA = await createJob(boss.user.id, { title: '카페 야간', category: '서빙', region: '서울 노원구' });
            const appA = await createApplication(jobA.id, worker2.user.id, resume2.id, {
                status: 'completed', ownerRating: 5, acceptedAt: day(2026, 10, 1), completedAt: day(2026, 10, 30)
            });
            await createShift(appA.id, { startAt: day(2026, 10, 5), endAt: day(2026, 10, 5, 12), status: 'confirmed', workedMinutes: 180 });
            await createShift(appA.id, { startAt: day(2026, 10, 6), endAt: day(2026, 10, 6, 11), status: 'confirmed', workedMinutes: 120 });
            await createShift(appA.id, { startAt: day(2026, 10, 7), endAt: day(2026, 10, 7, 11), status: 'no_show' });

            // 완료 B: 확정 근무 60분, 성실도 4
            const jobB = await createJob(bossB.user.id, { title: '편의점', category: '판매', region: '서울 강남구' });
            const appB = await createApplication(jobB.id, worker2.user.id, resume2.id, {
                status: 'completed', ownerRating: 4, acceptedAt: day(2026, 9, 1), completedAt: day(2026, 9, 20)
            });
            await createShift(appB.id, { startAt: day(2026, 9, 5), endAt: day(2026, 9, 5, 10), status: 'confirmed', workedMinutes: 60 });

            // 집계에서 빠져야 하는 지원: 대기·거절
            const jobC = await createJob(boss.user.id);
            await createApplication(jobC.id, worker2.user.id, resume2.id, { status: 'pending' });
            const jobD = await createJob(bossB.user.id);
            await createApplication(jobD.id, worker2.user.id, resume2.id, { status: 'rejected' });
        });

        it('완료된 지원만 집계한다 (대기·거절 제외)', async () => {
            const res = await worker2.agent.get(`/resumes/${resume2.id}/careers`);
            expect(res.status).to.equal(200);
            const d = res.body.data;
            expect(d.count).to.equal(2);
            expect(d.avgRating).to.equal(4.5);
            expect(d.totalWorkedMinutes).to.equal(360);
            expect(d.totalWorkedDays).to.equal(3);
            expect(d.totalNoShowCount).to.equal(1);

            const a = d.careers.find(c => c.jobTitle === '카페 야간');
            expect(a.owner).to.equal(boss.user.name);
            expect(a.category).to.equal('서빙');
            expect(a.region).to.equal('서울 노원구');
            expect(a.ownerRating).to.equal(5);
            expect(a.workedMinutes).to.equal(300);
            expect(a.workedDays).to.equal(2);
            expect(a.noShowCount).to.equal(1);
            expect(a.startedAt).to.be.a('string');
            expect(a.endedAt).to.be.a('string');
        });

        it('이력서가 아니라 사람 기준: 지원에 쓰지 않은 이력서로 조회해도 같은 경력', async () => {
            const res = await worker2.agent.get(`/resumes/${resumeB.id}/careers`);
            expect(res.body.data.count).to.equal(2);
        });

        it('지원받은 사장님은 200, 제3자는 403, 비로그인은 401', async () => {
            expect((await boss.agent.get(`/resumes/${resume2.id}/careers`)).status).to.equal(200);
            expect((await bossB.agent.get(`/resumes/${resume2.id}/careers`)).status).to.equal(200);
            expect((await third.agent.get(`/resumes/${resume2.id}/careers`)).status).to.equal(403);
            expect((await request(require('../app')).get(`/resumes/${resume2.id}/careers`)).status).to.equal(401);
        });

        it('완료 경력이 없으면 빈 목록, 평점은 null', async () => {
            const res = await third.agent.post('/resumes').send({ title: 't', intro: 'i', desiredRegion: 'r' });
            const careers = await third.agent.get(`/resumes/${res.body.data.id}/careers`);
            expect(careers.body.data.count).to.equal(0);
            expect(careers.body.data.avgRating).to.equal(null);
        });

        it('완료·거절 지원만 있는 이력서는 삭제할 수 있고, 지원 기록과 경력은 남는다', async () => {
            const w = await createAgent('delworker');
            const r = await createResume(w.user.id);
            const j = await createJob(boss.user.id);
            const app = await createApplication(j.id, w.user.id, r.id, { status: 'rejected' });

            expect((await w.agent.delete(`/resumes/${r.id}`)).status).to.equal(200);
            const kept = await db.Application.findByPk(app.id);
            expect(kept).to.not.equal(null);
            expect(kept.resumeId).to.equal(null);

            // 경력은 applicantId 로 조회하므로 이력서가 지워져도 끊기지 않는다
            const res = await worker2.agent.get(`/resumes/${resume2.id}/careers`);
            expect(res.body.data.count).to.equal(2);
        });
    });
});

describe('API: /applications', () => {
    let boss, other, worker, worker2, resume, resume2, job;

    beforeEach(async () => {
        await resetDb();
        boss = await createAgent('boss');
        other = await createAgent('other');
        worker = await createAgent('worker');
        worker2 = await createAgent('worker2');
        resume = await createResume(worker.user.id);
        resume2 = await createResume(worker2.user.id);
        job = await createJob(boss.user.id, { headcount: 2 });
    });

    describe('POST /applications', () => {
        it('201, applicantId는 로그인한 사용자, 사장님에게 알림', async () => {
            const res = await worker.agent.post('/applications').send({
                jobId: job.id, resumeId: resume.id, message: '열심히 하겠습니다', applicantId: 999
            });
            expect(res.status).to.equal(201);
            expect(res.body.data.applicantId).to.equal(worker.user.id);
            expect(res.body.data.status).to.equal('pending');

            const notifications = await db.Notification.findAll({ where: { userId: boss.user.id } });
            expect(notifications).to.have.length(1);
            expect(notifications[0].type).to.equal('application_received');
            expect(notifications[0].targetId).to.equal(res.body.data.id);
        });

        it('400 필수값, 404 없는 공고·이력서, 401 비로그인', async () => {
            expect((await worker.agent.post('/applications').send({ jobId: job.id })).status).to.equal(400);
            expect((await worker.agent.post('/applications').send({ jobId: 9999, resumeId: resume.id })).status).to.equal(404);
            expect((await worker.agent.post('/applications').send({ jobId: job.id, resumeId: 9999 })).status).to.equal(404);
            expect((await request(require('../app')).post('/applications').send({})).status).to.equal(401);
        });

        it('403 본인 공고·남의 이력서', async () => {
            const bossResume = await createResume(boss.user.id);
            expect((await boss.agent.post('/applications').send({ jobId: job.id, resumeId: bossResume.id })).status).to.equal(403);
            expect((await worker2.agent.post('/applications').send({ jobId: job.id, resumeId: resume.id })).status).to.equal(403);
        });

        it('409 마감된 공고·중복 지원 (다른 이력서로도 불가)', async () => {
            const closed = await createJob(boss.user.id, { status: 'closed' });
            expect((await worker.agent.post('/applications').send({ jobId: closed.id, resumeId: resume.id })).status).to.equal(409);

            expect((await worker.agent.post('/applications').send({ jobId: job.id, resumeId: resume.id })).status).to.equal(201);
            expect((await worker.agent.post('/applications').send({ jobId: job.id, resumeId: resume.id })).status).to.equal(409);
            const another = await createResume(worker.user.id);
            expect((await worker.agent.post('/applications').send({ jobId: job.id, resumeId: another.id })).status).to.equal(409);
        });
    });

    describe('GET /applications/sent', () => {
        it('내가 지원한 것만, 상태 필터, 400 잘못된 상태값', async () => {
            await createApplication(job.id, worker.user.id, resume.id);
            await createApplication(job.id, worker2.user.id, resume2.id, { status: 'rejected' });

            let res = await worker.agent.get('/applications/sent');
            expect(res.status).to.equal(200);
            expect(res.body.data).to.have.length(1);
            res = await worker.agent.get('/applications/sent').query({ status: 'accepted' });
            expect(res.body.data).to.have.length(0);
            expect((await worker.agent.get('/applications/sent').query({ status: 'bad' })).status).to.equal(400);
            expect((await request(require('../app')).get('/applications/sent')).status).to.equal(401);
        });
    });

    describe('GET /applications/received', () => {
        it('내 공고로 온 지원만, 상태·jobId 필터', async () => {
            const app1 = await createApplication(job.id, worker.user.id, resume.id);
            await createApplication(job.id, worker2.user.id, resume2.id, { status: 'rejected' });

            let res = await boss.agent.get('/applications/received');
            expect(res.body.data).to.have.length(2);
            res = await boss.agent.get('/applications/received').query({ status: 'pending', jobId: job.id });
            expect(res.body.data.map(a => a.id)).to.deep.equal([app1.id]);
            expect(res.body.data[0].applicant.name).to.equal('worker');

            // 남의 공고 jobId 를 넣어도 결과는 0건
            res = await other.agent.get('/applications/received').query({ jobId: job.id });
            expect(res.status).to.equal(200);
            expect(res.body.data).to.have.length(0);
        });
    });

    describe('PATCH /applications/:id/accept ★', () => {
        it('확정되고 acceptedAt이 기록되며 지원자에게 알림', async () => {
            const app = await createApplication(job.id, worker.user.id, resume.id);
            const res = await boss.agent.patch(`/applications/${app.id}/accept`);
            expect(res.status).to.equal(200);
            expect(res.body.data.application.status).to.equal('accepted');
            expect(res.body.data.application.acceptedAt).to.be.a('string');
            expect(res.body.data.job.confirmedCount).to.equal(1);
            expect(res.body.data.job.status).to.equal('open');

            const n = await db.Notification.findOne({ where: { userId: worker.user.id, type: 'application_accepted' } });
            expect(n).to.not.equal(null);
        });

        it('정원이 차면 공고가 closed 로 바뀌고, 정원 초과 확정은 409', async () => {
            const oneSeat = await createJob(boss.user.id, { headcount: 1 });
            const a1 = await createApplication(oneSeat.id, worker.user.id, resume.id);
            const a2 = await createApplication(oneSeat.id, worker2.user.id, resume2.id);

            let res = await boss.agent.patch(`/applications/${a1.id}/accept`);
            expect(res.status).to.equal(200);
            expect(res.body.data.job.status).to.equal('closed');
            expect((await db.Job.findByPk(oneSeat.id)).status).to.equal('closed');

            res = await boss.agent.patch(`/applications/${a2.id}/accept`);
            expect(res.status).to.equal(409);
            expect((await db.Application.findByPk(a2.id)).status).to.equal('pending');
        });

        it('남의 공고 403, 없는 지원 404, 비로그인 401', async () => {
            const app = await createApplication(job.id, worker.user.id, resume.id);
            expect((await other.agent.patch(`/applications/${app.id}/accept`)).status).to.equal(403);
            expect((await boss.agent.patch('/applications/9999/accept')).status).to.equal(404);
            expect((await request(require('../app')).patch(`/applications/${app.id}/accept`)).status).to.equal(401);
            expect((await db.Application.findByPk(app.id)).status).to.equal('pending');
        });

        it('이미 확정된 지원 409, 조기 마감된 공고의 대기 지원 409', async () => {
            const app = await createApplication(job.id, worker.user.id, resume.id);
            expect((await boss.agent.patch(`/applications/${app.id}/accept`)).status).to.equal(200);
            expect((await boss.agent.patch(`/applications/${app.id}/accept`)).status).to.equal(409);

            const app2 = await createApplication(job.id, worker2.user.id, resume2.id);
            await boss.agent.patch(`/jobs/${job.id}/status`).send({ status: 'closed' });
            expect((await boss.agent.patch(`/applications/${app2.id}/accept`)).status).to.equal(409);
        });
    });

    describe('reject · complete', () => {
        it('reject: 대기일 때만, 지원자에게 알림', async () => {
            const app = await createApplication(job.id, worker.user.id, resume.id);
            const res = await boss.agent.patch(`/applications/${app.id}/reject`);
            expect(res.body.data.status).to.equal('rejected');
            expect(await db.Notification.count({ where: { userId: worker.user.id, type: 'application_rejected' } })).to.equal(1);

            expect((await boss.agent.patch(`/applications/${app.id}/reject`)).status).to.equal(409);
            expect((await boss.agent.patch(`/applications/${app.id}/accept`)).status).to.equal(409);
        });

        it('complete: 400 평점 오류, 409 확정 아님', async () => {
            const app = await createApplication(job.id, worker.user.id, resume.id);
            expect((await boss.agent.patch(`/applications/${app.id}/complete`).send({ rating: 6 })).status).to.equal(400);
            expect((await boss.agent.patch(`/applications/${app.id}/complete`).send({ rating: 5 })).status).to.equal(409);
        });

        it('complete: 일정이 확인·결근으로 끝나 있고 확인된 근무가 1건 이상이어야 한다 (409)', async () => {
            const app = await createApplication(job.id, worker.user.id, resume.id, { status: 'accepted' });

            // 일정이 하나도 없으면 확인된 근무가 없다
            expect((await boss.agent.patch(`/applications/${app.id}/complete`).send({ rating: 5 })).status).to.equal(409);

            // 아직 퇴근만 한 일정이 있으면 완료 불가
            const open = await createShift(app.id, { status: 'checked_out', workedMinutes: 60 });
            expect((await boss.agent.patch(`/applications/${app.id}/complete`).send({ rating: 5 })).status).to.equal(409);

            // 결근만 있으면 확인된 근무가 없다
            await open.update({ status: 'no_show', workedMinutes: null });
            expect((await boss.agent.patch(`/applications/${app.id}/complete`).send({ rating: 5 })).status).to.equal(409);

            // 확인된 근무가 생기면 완료
            await createShift(app.id, { status: 'confirmed', workedMinutes: 120, startAt: minutesFromNow(-600), endAt: minutesFromNow(-480) });
            const res = await boss.agent.patch(`/applications/${app.id}/complete`).send({ rating: 4 });
            expect(res.status).to.equal(200);
            expect(res.body.data.status).to.equal('completed');
            expect(res.body.data.ownerRating).to.equal(4);
            expect(res.body.data.completedAt).to.be.a('string');
            expect(await db.Notification.count({ where: { userId: worker.user.id, type: 'application_completed' } })).to.equal(1);

            expect((await other.agent.patch(`/applications/${app.id}/complete`).send({ rating: 5 })).status).to.equal(403);
        });
    });
});

describe('API: /reviews', () => {
    let boss, other, worker, worker2, job, completedApp, pendingApp;

    before(async () => {
        await resetDb();
        boss = await createAgent('boss');
        other = await createAgent('other');
        worker = await createAgent('worker');
        worker2 = await createAgent('worker2');
        const resume = await createResume(worker.user.id);
        const resume2 = await createResume(worker2.user.id);
        job = await createJob(boss.user.id, { headcount: 5 });
        completedApp = await createApplication(job.id, worker.user.id, resume.id, { status: 'completed', ownerRating: 5, completedAt: new Date() });
        pendingApp = await createApplication(job.id, worker2.user.id, resume2.id, { status: 'accepted' });
    });

    describe('POST /reviews ★', () => {
        it('400 입력 오류', async () => {
            expect((await worker.agent.post('/reviews').send({ applicationId: completedApp.id })).status).to.equal(400);
            expect((await worker.agent.post('/reviews').send({ applicationId: completedApp.id, score: 7 })).status).to.equal(400);
            expect((await worker.agent.post('/reviews').send({ score: 5 })).status).to.equal(400);
        });

        it('404 없는 지원, 403 남의 지원, 409 미완료', async () => {
            expect((await worker.agent.post('/reviews').send({ applicationId: 9999, score: 5 })).status).to.equal(404);
            expect((await worker2.agent.post('/reviews').send({ applicationId: completedApp.id, score: 5 })).status).to.equal(403);
            expect((await worker2.agent.post('/reviews').send({ applicationId: pendingApp.id, score: 5 })).status).to.equal(409);
            expect((await request(require('../app')).post('/reviews').send({})).status).to.equal(401);
        });

        it('201이고 score API의 평균·개수에 반영되며 사장님에게 알림', async () => {
            let res = await request(require('../app')).get(`/reviews/owners/${boss.user.id}/score`);
            expect(res.body.data).to.deep.equal({ ownerId: boss.user.id, avgScore: null, count: 0 });

            res = await worker.agent.post('/reviews').send({ applicationId: completedApp.id, score: 5, content: '좋은 사장님', authorId: 999, ownerId: 999 });
            expect(res.status).to.equal(201);
            expect(res.body.data.authorId).to.equal(worker.user.id);
            expect(res.body.data.ownerId).to.equal(boss.user.id);   // 지원한 공고의 사장님으로 서버가 채운다

            res = await request(require('../app')).get(`/reviews/owners/${boss.user.id}/score`);
            expect(res.body.data.avgScore).to.equal(5);
            expect(res.body.data.count).to.equal(1);

            expect(await db.Notification.count({ where: { userId: boss.user.id, type: 'review_created' } })).to.equal(1);
        });

        it('같은 지원에 두 번 쓰면 409', async () => {
            const res = await worker.agent.post('/reviews').send({ applicationId: completedApp.id, score: 4 });
            expect(res.status).to.equal(409);
        });
    });

    describe('조회 · 수정 · 삭제', () => {
        let review;

        before(async () => {
            review = await db.Review.findOne({ where: { applicationId: completedApp.id } });
            await pendingApp.update({ status: 'completed' });
            await worker2.agent.post('/reviews').send({ applicationId: pendingApp.id, score: 3 });
        });

        it('GET /reviews/owners/:ownerId - 사장님별 후기 목록(비로그인도 조회), 404 없는 사용자', async () => {
            const res = await request(require('../app')).get(`/reviews/owners/${boss.user.id}`);
            expect(res.status).to.equal(200);
            expect(res.body.data.total).to.equal(2);
            expect(res.body.data.reviews[0].author.name).to.be.a('string');
            expect((await request(require('../app')).get('/reviews/owners/99999')).status).to.equal(404);
        });

        it('GET /reviews/owners/:ownerId/score - 평균 평점·후기 수, 404 없는 사용자', async () => {
            const res = await request(require('../app')).get(`/reviews/owners/${boss.user.id}/score`);
            expect(res.status).to.equal(200);
            expect(res.body.data.avgScore).to.equal(4);
            expect(res.body.data.count).to.equal(2);
            expect((await request(require('../app')).get('/reviews/owners/99999/score')).status).to.equal(404);
        });

        it('PATCH /reviews/:id - 작성자만(403), 400 평점 오류, 200 수정', async () => {
            expect((await other.agent.patch(`/reviews/${review.id}`).send({ score: 1 })).status).to.equal(403);
            expect((await worker.agent.patch(`/reviews/${review.id}`).send({ score: 9 })).status).to.equal(400);
            const res = await worker.agent.patch(`/reviews/${review.id}`).send({ score: 4, content: '수정' });
            expect(res.status).to.equal(200);
            expect(res.body.data.score).to.equal(4);
        });

        it('DELETE /reviews/:id - 작성자만(403), 삭제하면 평점에서 빠진다', async () => {
            expect((await other.agent.delete(`/reviews/${review.id}`)).status).to.equal(403);
            expect((await worker.agent.delete(`/reviews/${review.id}`)).status).to.equal(200);

            const res = await request(require('../app')).get(`/reviews/owners/${boss.user.id}/score`);
            expect(res.body.data.count).to.equal(1);
            expect(res.body.data.avgScore).to.equal(3);
        });
    });
});

describe('API: /shifts', () => {
    let boss, other, worker, worker2, job, app, app2;

    beforeEach(async () => {
        await resetDb();
        boss = await createAgent('boss');
        other = await createAgent('other');
        worker = await createAgent('worker');
        worker2 = await createAgent('worker2');
        job = await createJob(boss.user.id, { headcount: 3 });
        const resume = await createResume(worker.user.id);
        const resume2 = await createResume(worker2.user.id);
        app = await createApplication(job.id, worker.user.id, resume.id, { status: 'accepted' });
        app2 = await createApplication(job.id, worker2.user.id, resume2.id, { status: 'pending' });
    });

    describe('POST /shifts', () => {
        const body = (applicationId, start, end) => ({
            applicationId, startAt: start.toISOString(), endAt: end.toISOString()
        });

        it('201 일정 등록, 알바생에게 알림', async () => {
            const res = await boss.agent.post('/shifts').send(body(app.id, minutesFromNow(60), minutesFromNow(300)));
            expect(res.status).to.equal(201);
            expect(res.body.data.status).to.equal('scheduled');
            expect(await db.Notification.count({ where: { userId: worker.user.id, type: 'shift_created' } })).to.equal(1);
        });

        it('400 시간 오류, 404 없는 지원', async () => {
            const bad = await boss.agent.post('/shifts').send({ applicationId: app.id, startAt: 'abc', endAt: 'def' });
            expect(bad.status).to.equal(400);
            const reversed = await boss.agent.post('/shifts').send(body(app.id, minutesFromNow(300), minutesFromNow(60)));
            expect(reversed.status).to.equal(400);
            const missing = await boss.agent.post('/shifts').send(body(9999, minutesFromNow(60), minutesFromNow(300)));
            expect(missing.status).to.equal(404);
        });

        it('403 남의 공고, 409 확정 아님', async () => {
            expect((await other.agent.post('/shifts').send(body(app.id, minutesFromNow(60), minutesFromNow(300)))).status).to.equal(403);
            expect((await boss.agent.post('/shifts').send(body(app2.id, minutesFromNow(60), minutesFromNow(300)))).status).to.equal(409);
        });

        it('409 같은 알바생의 다른 일정과 시간이 겹침 (맞닿는 시간은 허용, 결근은 제외)', async () => {
            const first = await boss.agent.post('/shifts').send(body(app.id, minutesFromNow(60), minutesFromNow(180)));
            expect(first.status).to.equal(201);

            const overlapped = await boss.agent.post('/shifts').send(body(app.id, minutesFromNow(120), minutesFromNow(240)));
            expect(overlapped.status).to.equal(409);

            const adjacent = await boss.agent.post('/shifts').send({
                applicationId: app.id, startAt: first.body.data.endAt, endAt: minutesFromNow(300).toISOString()
            });
            expect(adjacent.status).to.equal(201);

            await db.Shift.update({ status: 'no_show' }, { where: { id: first.body.data.id } });
            const again = await boss.agent.post('/shifts').send(body(app.id, minutesFromNow(70), minutesFromNow(170)));
            expect(again.status).to.equal(201);
        });
    });

    describe('조회', () => {
        it('GET /shifts/me - 기간 필터', async () => {
            await createShift(app.id, { startAt: day(2026, 12, 1), endAt: day(2026, 12, 1, 13) });
            await createShift(app.id, { startAt: day(2026, 12, 10), endAt: day(2026, 12, 10, 13) });

            let res = await worker.agent.get('/shifts/me');
            expect(res.body.data).to.have.length(2);
            res = await worker.agent.get('/shifts/me').query({ from: day(2026, 12, 5).toISOString(), to: day(2026, 12, 31).toISOString() });
            expect(res.body.data).to.have.length(1);
            expect((await worker.agent.get('/shifts/me').query({ from: 'bad' })).status).to.equal(400);
            expect((await worker2.agent.get('/shifts/me')).body.data).to.have.length(0);
        });

        it('GET /shifts/jobs/:jobId - 사장님만, 403 남의 공고', async () => {
            await createShift(app.id);
            const res = await boss.agent.get(`/shifts/jobs/${job.id}`);
            expect(res.status).to.equal(200);
            expect(res.body.data).to.have.length(1);
            expect(res.body.data[0].Application.applicant.name).to.equal('worker');
            expect((await other.agent.get(`/shifts/jobs/${job.id}`)).status).to.equal(403);
            expect((await boss.agent.get('/shifts/jobs/9999')).status).to.equal(404);
        });
    });

    describe('PATCH /shifts/:id/check-in ★', () => {
        it('시간 창(예정 시작 ±30분) 안이면 200', async () => {
            const early = await createShift(app.id, { startAt: minutesFromNow(20), endAt: minutesFromNow(260) });
            const res = await worker.agent.patch(`/shifts/${early.id}/check-in`);
            expect(res.status).to.equal(200);
            expect(res.body.data.status).to.equal('checked_in');
            expect(res.body.data.checkInAt).to.be.a('string');
        });

        it('창 밖이면 409 (너무 이르거나 너무 늦음)', async () => {
            const tooEarly = await createShift(app.id, { startAt: minutesFromNow(120), endAt: minutesFromNow(360) });
            const tooLate = await createShift(app.id, { startAt: minutesFromNow(-120), endAt: minutesFromNow(120) });
            expect((await worker.agent.patch(`/shifts/${tooEarly.id}/check-in`)).status).to.equal(409);
            expect((await worker.agent.patch(`/shifts/${tooLate.id}/check-in`)).status).to.equal(409);
        });

        it('남의 일정 403, 이미 출근한 일정 409, 없는 일정 404', async () => {
            const shift = await createShift(app.id);
            expect((await worker2.agent.patch(`/shifts/${shift.id}/check-in`)).status).to.equal(403);
            expect((await boss.agent.patch(`/shifts/${shift.id}/check-in`)).status).to.equal(403);
            expect((await worker.agent.patch(`/shifts/${shift.id}/check-in`)).status).to.equal(200);
            expect((await worker.agent.patch(`/shifts/${shift.id}/check-in`)).status).to.equal(409);
            expect((await worker.agent.patch('/shifts/9999/check-in')).status).to.equal(404);
        });
    });

    describe('check-out · confirm · no-show', () => {
        it('check-out: 출근 상태가 아니면 409, 퇴근하면 workedMinutes 계산', async () => {
            const shift = await createShift(app.id);
            expect((await worker.agent.patch(`/shifts/${shift.id}/check-out`)).status).to.equal(409);

            await worker.agent.patch(`/shifts/${shift.id}/check-in`);
            await shift.reload();
            await shift.update({ checkInAt: minutesFromNow(-95) });   // 95분 전에 출근한 것으로

            const res = await worker.agent.patch(`/shifts/${shift.id}/check-out`);
            expect(res.status).to.equal(200);
            expect(res.body.data.status).to.equal('checked_out');
            expect(res.body.data.workedMinutes).to.be.within(94, 96);
            expect((await worker.agent.patch(`/shifts/${shift.id}/check-out`)).status).to.equal(409);
        });

        it('confirm: 퇴근 상태만 409, 사장님만 403', async () => {
            const shift = await createShift(app.id, { status: 'checked_in', checkInAt: minutesFromNow(-60) });
            expect((await boss.agent.patch(`/shifts/${shift.id}/confirm`)).status).to.equal(409);

            await shift.update({ status: 'checked_out', workedMinutes: 60 });
            expect((await other.agent.patch(`/shifts/${shift.id}/confirm`)).status).to.equal(403);
            expect((await worker.agent.patch(`/shifts/${shift.id}/confirm`)).status).to.equal(403);
            const res = await boss.agent.patch(`/shifts/${shift.id}/confirm`);
            expect(res.body.data.status).to.equal('confirmed');
        });

        it('no-show: 예정 상태이고 시작 시간이 지난 일정만 (409), 사장님만 (403)', async () => {
            const future = await createShift(app.id, { startAt: minutesFromNow(60), endAt: minutesFromNow(240) });
            expect((await boss.agent.patch(`/shifts/${future.id}/no-show`)).status).to.equal(409);

            const past = await createShift(app.id, { startAt: minutesFromNow(-300), endAt: minutesFromNow(-60) });
            expect((await other.agent.patch(`/shifts/${past.id}/no-show`)).status).to.equal(403);
            const res = await boss.agent.patch(`/shifts/${past.id}/no-show`);
            expect(res.body.data.status).to.equal('no_show');
            expect((await boss.agent.patch(`/shifts/${past.id}/no-show`)).status).to.equal(409);
        });
    });
});

describe('API: /payrolls', () => {
    let boss, other, worker, job, app;
    const week = (dayOfMonth, minutes, status = 'confirmed') => ({
        startAt: day(2026, 11, dayOfMonth), endAt: day(2026, 11, dayOfMonth, 15),
        status, workedMinutes: status === 'confirmed' ? minutes : null
    });
    const issue = (agent, applicationId, periodStart = '2026-11-02', periodEnd = '2026-11-08') =>
        agent.post('/payrolls').send({ applicationId, periodStart, periodEnd });

    beforeEach(async () => {
        await resetDb();
        boss = await createAgent('boss');
        other = await createAgent('other');
        worker = await createAgent('worker');
        job = await createJob(boss.user.id, { pay: 10320 });
        const resume = await createResume(worker.user.id);
        app = await createApplication(job.id, worker.user.id, resume.id, { status: 'accepted' });
    });

    describe('POST /payrolls ★', () => {
        it('주 3일 × 6시간 확인 근무 → 기본급·주휴수당 금액 일치, 알바생에게 알림', async () => {
            await db.Shift.bulkCreate([2, 3, 4].map(d => ({ applicationId: app.id, ...week(d, 360) })));

            const res = await issue(boss.agent, app.id);
            expect(res.status).to.equal(201);
            const p = res.body.data;
            expect(p.totalMinutes).to.equal(1080);
            expect(p.hourlyPay).to.equal(10320);
            expect(p.basePay).to.equal(185760);
            expect(p.weeklyHolidayPay).to.equal(37152);
            expect(p.totalPay).to.equal(222912);
            expect(p.status).to.equal('issued');
            expect(p.ownerId).to.equal(boss.user.id);
            expect(p.workerId).to.equal(worker.user.id);

            expect(await db.Notification.count({ where: { userId: worker.user.id, type: 'payroll_issued' } })).to.equal(1);
        });

        it('결근이 있는 주는 주휴수당 0', async () => {
            await db.Shift.bulkCreate([
                { applicationId: app.id, ...week(2, 360) },
                { applicationId: app.id, ...week(3, 360) },
                { applicationId: app.id, ...week(4, 360) },
                { applicationId: app.id, ...week(5, 0, 'no_show') }
            ]);
            const res = await issue(boss.agent, app.id);
            expect(res.body.data.basePay).to.equal(185760);
            expect(res.body.data.weeklyHolidayPay).to.equal(0);
            expect(res.body.data.totalPay).to.equal(185760);
        });

        it('403 남의 공고, 404 없는 지원, 400 기간 오류, 409 확인된 근무 없음', async () => {
            await db.Shift.create({ applicationId: app.id, ...week(2, 360) });
            expect((await issue(other.agent, app.id)).status).to.equal(403);
            expect((await issue(boss.agent, 9999)).status).to.equal(404);
            expect((await issue(boss.agent, app.id, '2026-11-08', '2026-11-02')).status).to.equal(400);
            expect((await issue(boss.agent, app.id, '2026/11/02', '2026-11-08')).status).to.equal(400);
            expect((await boss.agent.post('/payrolls').send({ periodStart: '2026-11-02', periodEnd: '2026-11-08' })).status).to.equal(400);
            expect((await issue(boss.agent, app.id, '2026-12-01', '2026-12-07')).status).to.equal(409);
            expect((await request(require('../app')).post('/payrolls').send({})).status).to.equal(401);
        });

        it('같은 기간(겹치는 기간 포함) 재발행은 409, 이의제기 상태면 재발행 허용', async () => {
            await db.Shift.bulkCreate([2, 3, 4].map(d => ({ applicationId: app.id, ...week(d, 360) })));
            const first = await issue(boss.agent, app.id);
            expect(first.status).to.equal(201);

            expect((await issue(boss.agent, app.id)).status).to.equal(409);
            expect((await issue(boss.agent, app.id, '2026-11-04', '2026-11-10')).status).to.equal(409);

            await worker.agent.patch(`/payrolls/${first.body.data.id}/dispute`).send({ reason: '금액이 다릅니다' });
            expect((await issue(boss.agent, app.id)).status).to.equal(201);
        });

        it('시급 스냅샷: 나중에 공고 시급이 바뀌어도 발행된 금액은 그대로', async () => {
            await db.Shift.bulkCreate([2, 3, 4].map(d => ({ applicationId: app.id, ...week(d, 360) })));
            const issued = await issue(boss.agent, app.id);
            await boss.agent.patch(`/jobs/${job.id}`).send({ pay: 20000 });

            const res = await worker.agent.get(`/payrolls/${issued.body.data.id}`);
            expect(res.body.data.hourlyPay).to.equal(10320);
            expect(res.body.data.totalPay).to.equal(222912);
        });
    });

    describe('조회 · 지급 · 이의제기', () => {
        let payroll;
        beforeEach(async () => {
            await db.Shift.bulkCreate([2, 3, 4].map(d => ({ applicationId: app.id, ...week(d, 360) })));
            payroll = (await issue(boss.agent, app.id)).body.data;
        });

        it('GET /payrolls/me - 알바생이 받은 정산서만', async () => {
            const res = await worker.agent.get('/payrolls/me');
            expect(res.status).to.equal(200);
            expect(res.body.data).to.have.length(1);
            expect((await boss.agent.get('/payrolls/me')).body.data).to.have.length(0);
        });

        it('GET /payrolls/issued - 사장님이 발행한 정산서만', async () => {
            const res = await boss.agent.get('/payrolls/issued');
            expect(res.status).to.equal(200);
            expect(res.body.data).to.have.length(1);
            expect((await worker.agent.get('/payrolls/issued')).body.data).to.have.length(0);
        });

        it('GET /payrolls/:id - 발행자·수령자만, 일별 내역 포함', async () => {
            const res = await worker.agent.get(`/payrolls/${payroll.id}`);
            expect(res.status).to.equal(200);
            expect(res.body.data.days).to.have.length(3);
            expect(res.body.data.days[0].workedMinutes).to.equal(360);
            expect((await boss.agent.get(`/payrolls/${payroll.id}`)).status).to.equal(200);
            expect((await other.agent.get(`/payrolls/${payroll.id}`)).status).to.equal(403);
            expect((await boss.agent.get('/payrolls/9999')).status).to.equal(404);
        });

        it('pay: 사장님만(403), 발행 상태일 때만(409)', async () => {
            expect((await worker.agent.patch(`/payrolls/${payroll.id}/pay`)).status).to.equal(403);
            const res = await boss.agent.patch(`/payrolls/${payroll.id}/pay`);
            expect(res.body.data.status).to.equal('paid');
            expect(res.body.data.paidAt).to.be.a('string');
            expect((await boss.agent.patch(`/payrolls/${payroll.id}/pay`)).status).to.equal(409);
        });

        it('dispute: 알바생만(403), 사유 필수(400), 발행 상태일 때만(409), 사장님에게 알림', async () => {
            expect((await boss.agent.patch(`/payrolls/${payroll.id}/dispute`).send({ reason: 'x' })).status).to.equal(403);
            expect((await worker.agent.patch(`/payrolls/${payroll.id}/dispute`).send({})).status).to.equal(400);

            const res = await worker.agent.patch(`/payrolls/${payroll.id}/dispute`).send({ reason: '주휴수당이 빠졌습니다' });
            expect(res.body.data.status).to.equal('disputed');
            expect(res.body.data.disputeReason).to.equal('주휴수당이 빠졌습니다');
            expect(await db.Notification.count({ where: { userId: boss.user.id, type: 'payroll_disputed' } })).to.equal(1);

            expect((await worker.agent.patch(`/payrolls/${payroll.id}/dispute`).send({ reason: '다시' })).status).to.equal(409);
            expect((await boss.agent.patch(`/payrolls/${payroll.id}/pay`)).status).to.equal(409);
        });
    });
});

describe('API: /notifications', () => {
    let boss, worker, job, resume;

    before(async () => {
        await resetDb();
        boss = await createAgent('boss');
        worker = await createAgent('worker');
        job = await createJob(boss.user.id);
        resume = await createResume(worker.user.id);
    });

    it('GET /notifications/unread-count ★ - 지원이 들어오면 사장님 개수 +1, 읽음 처리 후 −1', async () => {
        let res = await boss.agent.get('/notifications/unread-count');
        expect(res.body.data.count).to.equal(0);

        await worker.agent.post('/applications').send({ jobId: job.id, resumeId: resume.id });
        res = await boss.agent.get('/notifications/unread-count');
        expect(res.body.data.count).to.equal(1);

        const list = await boss.agent.get('/notifications').query({ unread: 'true' });
        expect(list.body.data).to.have.length(1);
        expect(list.body.data[0].type).to.equal('application_received');

        const read = await boss.agent.patch(`/notifications/${list.body.data[0].id}/read`);
        expect(read.body.data.isRead).to.equal(true);
        res = await boss.agent.get('/notifications/unread-count');
        expect(res.body.data.count).to.equal(0);
    });

    it('남의 알림은 403, 없는 알림은 404, 비로그인은 401', async () => {
        const mine = await db.Notification.findOne({ where: { userId: boss.user.id } });
        expect((await worker.agent.patch(`/notifications/${mine.id}/read`)).status).to.equal(403);
        expect((await worker.agent.delete(`/notifications/${mine.id}`)).status).to.equal(403);
        expect((await boss.agent.patch('/notifications/9999/read')).status).to.equal(404);
        expect((await request(require('../app')).get('/notifications/unread-count')).status).to.equal(401);
    });

    // 아래 4개는 같은 데이터(알바생 알림 3건)를 순서대로 이어 쓴다
    it('GET /notifications - 내 알림 목록, unread=true 필터', async () => {
        await db.Notification.bulkCreate([
            { userId: worker.user.id, type: 'shift_created', message: 'a' },
            { userId: worker.user.id, type: 'shift_created', message: 'b' },
            { userId: worker.user.id, type: 'shift_created', message: 'c', isRead: true }
        ]);
        const res = await worker.agent.get('/notifications');
        expect(res.status).to.equal(200);
        expect(res.body.data).to.have.length(3);
        expect((await worker.agent.get('/notifications').query({ unread: 'true' })).body.data).to.have.length(2);
    });

    it('PATCH /notifications/:id/read - 내 알림 하나 읽음 처리', async () => {
        const target = (await worker.agent.get('/notifications').query({ unread: 'true' })).body.data[0];
        const res = await worker.agent.patch(`/notifications/${target.id}/read`);
        expect(res.status).to.equal(200);
        expect(res.body.data.isRead).to.equal(true);
        expect((await worker.agent.get('/notifications/unread-count')).body.data.count).to.equal(1);
    });

    it('PATCH /notifications/read-all - 내 안 읽은 알림만 모두 읽음 (남의 알림은 그대로)', async () => {
        const res = await worker.agent.patch('/notifications/read-all');
        expect(res.status).to.equal(200);
        expect(res.body.data.updated).to.equal(1);
        expect((await worker.agent.get('/notifications/unread-count')).body.data.count).to.equal(0);
        expect((await boss.agent.get('/notifications')).body.data.length).to.be.greaterThan(0);
    });

    it('DELETE /notifications/:id - 내 알림 삭제', async () => {
        const target = (await worker.agent.get('/notifications')).body.data[0];
        expect((await worker.agent.delete(`/notifications/${target.id}`)).status).to.equal(200);
        expect((await worker.agent.get('/notifications')).body.data).to.have.length(2);
    });
});

describe('API: 전체 흐름', () => {
    it('공고 등록 → 지원 → 확정 → 근무 → 정산 → 완료 → 경력 → 후기', async () => {
        await resetDb();
        const boss = await createAgent('boss');
        const worker = await createAgent('worker');
        const pad = n => String(n).padStart(2, '0');
        const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

        // 1~2. 공고 등록, 이력서 작성
        const job = (await boss.agent.post('/jobs').send({ title: '카페 서빙', region: '서울', pay: 11000, headcount: 1 })).body.data;
        const resume = (await worker.agent.post('/resumes').send({ title: '이력서', intro: '안녕하세요', desiredRegion: '서울' })).body.data;

        // 3. 지원 → 4. 확정(정원이 차서 공고 자동 마감)
        const application = (await worker.agent.post('/applications').send({ jobId: job.id, resumeId: resume.id })).body.data;
        let res = await boss.agent.patch(`/applications/${application.id}/accept`);
        expect(res.body.data.job.status).to.equal('closed');

        // 5. 일정 등록 → 출근 → 퇴근 → 확인
        const shift = (await boss.agent.post('/shifts').send({
            applicationId: application.id,
            startAt: minutesFromNow(5).toISOString(),
            endAt: minutesFromNow(125).toISOString()
        })).body.data;
        expect((await worker.agent.patch(`/shifts/${shift.id}/check-in`)).status).to.equal(200);
        await db.Shift.update({ checkInAt: minutesFromNow(-120) }, { where: { id: shift.id } });
        res = await worker.agent.patch(`/shifts/${shift.id}/check-out`);
        expect(res.body.data.workedMinutes).to.be.within(119, 121);
        expect((await boss.agent.patch(`/shifts/${shift.id}/confirm`)).status).to.equal(200);

        // 6. 정산서 발행 → 지급
        const from = ymd(minutesFromNow(-60 * 24)), to = ymd(minutesFromNow(60 * 24 * 2));
        res = await boss.agent.post('/payrolls').send({ applicationId: application.id, periodStart: from, periodEnd: to });
        expect(res.status).to.equal(201);
        expect(res.body.data.basePay).to.equal(Math.floor(res.body.data.totalMinutes * 11000 / 60));
        expect((await boss.agent.patch(`/payrolls/${res.body.data.id}/pay`)).body.data.status).to.equal('paid');

        // 7. 완료 처리 → 인증 경력
        expect((await boss.agent.patch(`/applications/${application.id}/complete`).send({ rating: 5 })).status).to.equal(200);
        res = await worker.agent.get(`/resumes/${resume.id}/careers`);
        expect(res.body.data.count).to.equal(1);
        expect(res.body.data.careers[0].workedMinutes).to.be.within(119, 121);
        expect(res.body.data.careers[0].ownerRating).to.equal(5);

        // 8. 후기 → 사장님 평점에 반영
        expect((await worker.agent.post('/reviews').send({ applicationId: application.id, score: 4, content: '좋았어요' })).status).to.equal(201);
        res = await request(require('../app')).get(`/reviews/owners/${boss.user.id}/score`);
        expect(res.body.data).to.deep.equal({ ownerId: boss.user.id, avgScore: 4, count: 1 });

        // 알림: 사장님은 지원·후기, 알바생은 확정·일정·정산·완료
        const types = async id => (await db.Notification.findAll({ where: { userId: id } })).map(n => n.type).sort();
        expect(await types(boss.user.id)).to.deep.equal(['application_received', 'review_created']);
        expect(await types(worker.user.id)).to.deep.equal(['application_accepted', 'application_completed', 'payroll_issued', 'shift_created']);
    });
});
