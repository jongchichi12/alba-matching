const { Op } = require('sequelize');
const { sequelize, Job, User, Application } = require('../models');
const { HttpError, ok } = require('../utils/response');
const { intOf, positiveInt, text, parseFields, pageOf } = require('../utils/validate');
const { MIN_HOURLY_WAGE, CONFIRMED_STATUSES } = require('../utils/constants');

const ownerInclude = { model: User, as: 'owner', attributes: ['id', 'name'] };

// 확정 인원 = accepted 또는 completed 인 지원 수
// (근무를 마친 사람도 그 자리를 채운 것이므로 상세 조회, accept, 재오픈, headcount 수정 모두 이 정의를 쓴다)
const countConfirmed = (jobId, options = {}) =>
    Application.count({ where: { jobId, status: { [Op.in]: CONFIRMED_STATUSES } }, ...options });

// 시급은 최저임금 이상이어야 한다
const payOf = v => {
    const n = positiveInt(v);
    return n !== null && n >= MIN_HOURLY_WAGE ? n : null;
};

const jobSpec = {
    title: v => text(v, 100),
    category: v => text(v, 50),
    region: v => text(v, 50),
    pay: payOf,
    headcount: positiveInt
};

// ★ GET /jobs - 공고 목록
// ?region=&category=&minPay=&status=&page=&limit=
// region 은 부분 일치(LIKE), category 는 정확히 일치, minPay 는 이상, status 기본값은 open
exports.list = async (req, res, next) => {
    try {
        const { region, category, minPay, mine, status = 'open' } = req.query;
        const { page, limit, offset } = pageOf(req.query);
        const where = {};

        // ?mine=true : 내가 올린 공고만 (로그인 필요)
        if (mine === 'true') {
            if (!req.user) throw new HttpError(401, '로그인이 필요합니다.');
            where.ownerId = req.user.id;
        }

        if (status !== 'all') {
            if (!['open', 'closed'].includes(status))
                throw new HttpError(400, 'status는 open, closed, all 중 하나여야 합니다.');
            where.status = status;
        }
        if (region !== undefined) {
            if (typeof region !== 'string' || !region.trim()) throw new HttpError(400, 'region이 올바르지 않습니다.');
            where.region = { [Op.like]: `%${region.trim().replace(/[\\%_]/g, '\\$&')}%` };
        }
        if (category !== undefined) {
            if (typeof category !== 'string' || !category.trim()) throw new HttpError(400, 'category가 올바르지 않습니다.');
            where.category = category.trim();
        }
        if (minPay !== undefined) {
            const n = intOf(minPay);
            if (n === null || n < 0) throw new HttpError(400, 'minPay가 올바르지 않습니다.');
            where.pay = { [Op.gte]: n };
        }

        const { rows, count } = await Job.findAndCountAll({
            where,
            include: [ownerInclude],
            order: [['createdAt', 'DESC'], ['id', 'DESC']],
            limit,
            offset
        });
        ok(res, { total: count, page, limit, jobs: rows });
    } catch (err) { next(err); }
};

// GET /jobs/:id - 공고 상세 (확정 인원 / 모집인원 함께 반환)
exports.detail = async (req, res, next) => {
    try {
        const id = positiveInt(req.params.id);
        if (id === null) throw new HttpError(400, 'id가 올바르지 않습니다.');

        const job = await Job.findByPk(id, { include: [ownerInclude] });
        if (!job) throw new HttpError(404, '공고를 찾을 수 없습니다.');

        const confirmedCount = await countConfirmed(job.id);
        ok(res, { ...job.toJSON(), confirmedCount });
    } catch (err) { next(err); }
};

// POST /jobs - 공고 등록 (400: 제목·지역·시급·모집인원 필수, 시급은 최저임금 이상)
exports.create = async (req, res, next) => {
    try {
        const fields = parseFields(req.body, jobSpec, ['title', 'region', 'pay', 'headcount']);
        // ownerId 는 클라이언트가 보낸 값이 아니라 로그인한 사용자로 채운다
        const job = await Job.create({ ...fields, ownerId: req.user.id });
        ok(res, job, 201);
    } catch (err) { next(err); }
};

// PATCH /jobs/:id - 공고 수정 (400: body에 status 포함, 409: headcount < 확정 인원)
exports.update = async (req, res, next) => {
    try {
        if (req.body.status !== undefined)
            throw new HttpError(400, '모집상태는 PATCH /jobs/:id/status 로 변경하세요.');

        const fields = parseFields(req.body, jobSpec);
        if (Object.keys(fields).length === 0) throw new HttpError(400, '수정할 값이 없습니다.');

        if (fields.headcount !== undefined) {
            const confirmed = await countConfirmed(req.job.id);
            if (fields.headcount < confirmed)
                throw new HttpError(409, `이미 확정된 인원(${confirmed}명)보다 적게 줄일 수 없습니다.`);
        }

        await req.job.update(fields);
        ok(res, req.job);
    } catch (err) { next(err); }
};

// DELETE /jobs/:id - 공고 삭제 (409: 확정·완료 지원 있음)
// 대기·거절 지원만 있으면 공고와 함께 삭제된다
exports.remove = async (req, res, next) => {
    try {
        const confirmed = await countConfirmed(req.job.id);
        if (confirmed > 0)
            throw new HttpError(409, '확정·완료된 지원이 있는 공고는 삭제할 수 없습니다.');

        await sequelize.transaction(async t => {
            await Application.destroy({ where: { jobId: req.job.id }, transaction: t });
            await req.job.destroy({ transaction: t });
        });
        ok(res, { id: req.job.id });
    } catch (err) { next(err); }
};

// PATCH /jobs/:id/status - 모집상태 변경 (조기 마감 또는 재오픈)
// 400: 값 오류, 409: 정원 찬 공고 재오픈
exports.changeStatus = async (req, res, next) => {
    try {
        const { status } = req.body;
        if (!['open', 'closed'].includes(status))
            throw new HttpError(400, 'status는 open 또는 closed 여야 합니다.');

        if (status === 'open') {
            const confirmed = await countConfirmed(req.job.id);
            if (confirmed >= req.job.headcount)
                throw new HttpError(409, '정원이 찬 공고는 다시 열 수 없습니다. 모집인원을 먼저 늘려 주세요.');
        }

        await req.job.update({ status });
        ok(res, req.job);
    } catch (err) { next(err); }
};
