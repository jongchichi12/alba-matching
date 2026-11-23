const dotenv = require('dotenv');
dotenv.config();            // models 보다 위에서 불러야 .env 값이 먼저 올라온다

const path = require('path');
const express = require('express');
const morgan = require('morgan');
const session = require('express-session');
const passport = require('passport');

const { sequelize } = require('./models');
const passportConfig = require('./passport');
const { HttpError } = require('./utils/response');

const usersRouter = require('./routes/users');
const jobsRouter = require('./routes/jobs');
const resumesRouter = require('./routes/resumes');
const applicationsRouter = require('./routes/applications');
const reviewsRouter = require('./routes/reviews');
const shiftsRouter = require('./routes/shifts');
const payrollsRouter = require('./routes/payrolls');
const notificationsRouter = require('./routes/notifications');

const isTest = process.env.NODE_ENV === 'test';

passportConfig();

const app = express();
app.set('port', process.env.PORT || 3000);

if (!isTest) app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(session({
    resave: false,
    saveUninitialized: false,
    secret: process.env.SECRET || 'alba-matching-dev-secret',
    cookie: { httpOnly: true, secure: false },
    name: 'session-cookie'
}));
app.use(passport.initialize());
app.use(passport.session());

// 시연용 API 콘솔 (public/index.html). 같은 주소에서 열려야 세션 쿠키가 붙는다
app.use(express.static(path.join(__dirname, 'public')));

app.use('/users', usersRouter);                  // 회원 관리 (라우터 개수 제외)
app.use('/jobs', jobsRouter);                    // 공고
app.use('/resumes', resumesRouter);              // 이력서
app.use('/applications', applicationsRouter);    // 지원
app.use('/reviews', reviewsRouter);              // 후기
app.use('/shifts', shiftsRouter);                // 근무 기록
app.use('/payrolls', payrollsRouter);            // 급여 정산
app.use('/notifications', notificationsRouter);  // 알림

// 매칭되는 라우터가 없으면 404 로 넘긴다
app.use((req, res, next) => next(new HttpError(404, '존재하지 않는 경로입니다.')));

// 에러 핸들러: Fail 형식을 만드는 유일한 곳
app.use((err, req, res, next) => {
    let status = err.status;
    let message = err.message;

    if (err.name === 'SequelizeUniqueConstraintError') {
        status = 409;                                   // 이메일·지원·후기 중복을 막는 마지막 장치
        message = '이미 존재하는 데이터입니다.';
    }
    if (!status) {                                      // err.status 가 없으면 500, 메시지는 가리고 콘솔에만 기록
        console.error(err);
        status = 500;
        message = '서버 오류가 발생했습니다.';
    }
    res.status(status).json({ result: 'Fail', error: message });
});

// 테스트 환경에서는 sync 와 listen 을 건너뛴다 (테스트의 before() 가 sync({ force: true }) 로 초기화)
if (!isTest) {
    sequelize.sync({ force: false })
        .then(() => {
            console.log('데이터베이스 연결 성공');
            app.listen(app.get('port'), () => console.log(`${app.get('port')}번 포트에서 대기 중`));
        })
        .catch(err => console.error(err));
}

module.exports = app;
