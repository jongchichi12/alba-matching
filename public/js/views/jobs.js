// 공고: 목록 · 상세 · 등록 · 수정 · 내 공고
import { get, post, patch, del } from '../api.js';
import { h, actions, toast, badge, won, dt, options, esc } from '../ui.js';
import { state, go, qs, isOwnerOf } from '../state.js';
import { applicationsTable } from './applications.js';

const MIN_WAGE = 10320;

function jobCard(j) {
  return h`<a class="card link" href="#/jobs/${j.id}">
    <div class="row between"><b>${j.title}</b>${badge(j.status)}</div>
    <div class="muted small">${j.category || '기타'} · ${j.region}</div>
    <div class="row between" style="margin-top:6px"><span>시급 <b>${won(j.pay)}</b></span><span class="muted small">모집 ${j.headcount}명 · ${j.owner ? j.owner.name : ''}</span></div>
  </a>`;
}

const pager = (base, page, limit, total) => {
  const last = Math.max(1, Math.ceil(total / limit));
  return h`<div class="pager">
    ${page > 1 ? h`<a class="btn sm" href="#/jobs${qs({ ...base, page: page - 1 })}">← 이전</a>` : ''}
    <span class="muted">${page} / ${last} 쪽 · 총 ${total}건</span>
    ${page < last ? h`<a class="btn sm" href="#/jobs${qs({ ...base, page: page + 1 })}">다음 →</a>` : ''}
  </div>`;
};

export async function jobsList({ q }) {
  const f = { region: q.get('region') || '', category: q.get('category') || '', minPay: q.get('minPay') || '', status: q.get('status') || 'open' };
  const page = Number(q.get('page')) || 1;
  const limit = 10;
  const d = await get('/jobs', { ...f, page, limit });
  return h`<h1>공고 찾기</h1>
  <form class="filters" data-form="jobSearch">
    <label>지역 <input name="region" value="${f.region}" placeholder="예: 마포"></label>
    <label>카테고리 <input name="category" value="${f.category}" placeholder="예: 카페"></label>
    <label>최소 시급 <input name="minPay" type="number" min="0" value="${f.minPay}"></label>
    <label>상태 <select name="status">${options([['open', '모집중'], ['closed', '마감'], ['all', '전체']], f.status)}</select></label>
    <button class="primary" type="submit">검색</button>
  </form>
  ${d.jobs.length ? h`<div class="grid">${d.jobs.map(jobCard)}</div>` : h`<div class="empty">조건에 맞는 공고가 없습니다.</div>`}
  ${pager(f, d.page, d.limit, d.total)}`;
}
actions.jobSearch = async (_, f) => go('#/jobs' + qs({ region: f.region.trim(), category: f.category.trim(), minPay: f.minPay, status: f.status === 'open' ? '' : f.status }));

export async function myJobs() {
  const d = await get('/jobs', { mine: 'true', status: 'all', limit: 50 });
  return h`<div class="row between"><h1>내 공고</h1><a class="btn primary" href="#/jobs/new">+ 공고 등록</a></div>
  ${d.jobs.length ? h`<div class="grid">${d.jobs.map(jobCard)}</div>` : h`<div class="empty">등록한 공고가 없습니다.</div>`}`;
}

export async function jobDetail({ params }) {
  const id = params[0];
  const j = await get(`/jobs/${id}`);
  const mine = isOwnerOf(j.ownerId);
  const head = h`<div class="row between"><h1>${j.title}</h1>${badge(j.status)}</div>
  <div class="card"><dl class="kv">
    <dt>카테고리</dt><dd>${j.category || '-'}</dd>
    <dt>지역</dt><dd>${j.region}</dd>
    <dt>시급</dt><dd>${won(j.pay)}</dd>
    <dt>모집 / 확정</dt><dd>${j.headcount}명 / ${j.confirmedCount}명</dd>
    <dt>사장님</dt><dd><a href="#/owners/${j.owner.id}">${j.owner.name}</a> (후기 보기)</dd>
    <dt>등록일</dt><dd>${dt(j.createdAt)}</dd>
  </dl></div>`;

  if (mine) {
    const apps = await get('/applications/received', { jobId: j.id });
    return h`${head}
    <div class="row" style="margin-bottom:8px">
      <a class="btn" href="#/jobs/${j.id}/edit">수정</a>
      <button data-act="jobStatus" data-id="${j.id}" data-to="${j.status === 'open' ? 'closed' : 'open'}">${j.status === 'open' ? '조기 마감' : '다시 열기'}</button>
      <a class="btn" href="#/shifts/manage?jobId=${j.id}">근무 관리</a>
      <button class="danger" data-act="jobDelete" data-id="${j.id}" data-confirm="공고를 삭제할까요? 대기·거절 지원도 함께 삭제됩니다.">삭제</button>
    </div>
    <h2>이 공고의 지원자 (${apps.length})</h2>
    ${applicationsTable(apps, { showJob: false })}`;
  }

  // 지원 영역 (알바생)
  const sent = state.me ? (await get('/applications/sent')).find(a => a.jobId === j.id) : null;
  let apply;
  if (!state.me) apply = h`<div class="notice">지원하려면 <a href="#/login">로그인</a>이 필요합니다.</div>`;
  else if (sent) apply = h`<div class="notice">이미 지원한 공고입니다. 상태: ${badge(sent.status)} <a href="#/applications">내 지원 보기</a></div>`;
  else if (j.status !== 'open') apply = h`<div class="notice">마감된 공고입니다.</div>`;
  else {
    const resumes = await get('/resumes/me');
    apply = resumes.length ? h`<h2>지원하기</h2>
      <form class="form card" data-form="apply">
        <input type="hidden" name="jobId" value="${j.id}">
        <label>이력서 <select name="resumeId">${options(resumes.map(r => [r.id, r.title]))}</select></label>
        <label>지원 메시지 <textarea name="message" maxlength="500" placeholder="사장님께 한마디"></textarea></label>
        <button class="primary" type="submit">지원하기</button>
      </form>`
      : h`<div class="notice">지원하려면 먼저 <a href="#/resumes/new">이력서를 작성</a>하세요.</div>`;
  }
  return h`${head}${apply}`;
}

actions.apply = async (_, f) => {
  const body = { jobId: Number(f.jobId), resumeId: Number(f.resumeId) };
  if (f.message.trim()) body.message = f.message.trim();
  await post('/applications', body);
  toast('지원했습니다');
  go('#/applications');
};
actions.jobStatus = async el => { await patch(`/jobs/${el.dataset.id}/status`, { status: el.dataset.to }); toast('변경되었습니다'); state.rerender(); };
actions.jobDelete = async el => { await del(`/jobs/${el.dataset.id}`); toast('삭제되었습니다'); go('#/my-jobs'); };

// ---------- 등록 / 수정 ----------
function jobForm(j) {
  const edit = !!j;
  return h`<form class="form card" data-form="${edit ? 'jobUpdate' : 'jobCreate'}">
    ${edit ? h`<input type="hidden" name="id" value="${j.id}">` : ''}
    <label>제목 <input name="title" maxlength="100" required value="${edit ? j.title : ''}"></label>
    <label>카테고리 <input name="category" maxlength="50" value="${edit ? j.category || '' : ''}" placeholder="예: 카페, 편의점"></label>
    <label>지역 <input name="region" maxlength="50" required value="${edit ? j.region : ''}" placeholder="예: 서울 마포구"></label>
    <label>시급 (최저 ${won(MIN_WAGE)}) <input name="pay" type="number" min="${MIN_WAGE}" required value="${edit ? j.pay : MIN_WAGE}"></label>
    <label>모집 인원 <input name="headcount" type="number" min="1" required value="${edit ? j.headcount : 1}"></label>
    <button class="primary" type="submit">${edit ? '저장' : '등록'}</button>
  </form>`;
}
const jobBody = f => {
  const b = { title: f.title.trim(), region: f.region.trim(), pay: Number(f.pay), headcount: Number(f.headcount) };
  if (f.category.trim()) b.category = f.category.trim();
  return b;
};

export async function jobNew() { return h`<h1>공고 등록</h1>${jobForm()}`; }
export async function jobEdit({ params }) {
  const j = await get(`/jobs/${params[0]}`);
  return h`<h1>공고 수정</h1>${jobForm(j)}`;
}
actions.jobCreate = async (_, f) => { const j = await post('/jobs', jobBody(f)); toast('등록되었습니다'); go(`#/jobs/${j.id}`); };
actions.jobUpdate = async (_, f) => { await patch(`/jobs/${f.id}`, jobBody(f)); toast('저장되었습니다'); go(`#/jobs/${f.id}`); };
