// 지원: 사장님이 받은 지원 처리 / 알바생이 보낸 지원 / 후기 작성
import { get, post, patch } from '../api.js';
import { h, actions, toast, badge, options, dt, day } from '../ui.js';
import { state, go, qs } from '../state.js';

// 사장님용 표: 상태별로 가능한 일을 버튼으로 보여준다
export function applicationsTable(list, { showJob = true } = {}) {
  if (!list.length) return h`<div class="empty">지원이 없습니다.</div>`;
  return h`<div class="scroll"><table>
    <tr><th>#</th>${showJob ? h`<th>공고</th>` : ''}<th>지원자</th><th>이력서</th><th>메시지</th><th>상태</th><th>작업</th></tr>
    ${list.map(a => h`<tr>
      <td>${a.id}</td>
      ${showJob ? h`<td><a href="#/jobs/${a.jobId}">${a.Job ? a.Job.title : a.jobId}</a></td>` : ''}
      <td>${a.applicant ? a.applicant.name : a.applicantId}</td>
      <td>${a.Resume ? h`<a href="#/resumes/${a.Resume.id}">${a.Resume.title}</a>` : '-'}</td>
      <td class="small">${a.message || ''}</td>
      <td>${badge(a.status)}${a.ownerRating ? h` <span class="small muted">성실도 ${a.ownerRating}점</span>` : ''}</td>
      <td>${rowActions(a)}</td>
    </tr>`)}
  </table></div>`;
}

function rowActions(a) {
  if (a.status === 'pending') return h`<div class="row">
    <button class="sm primary" data-act="accept" data-id="${a.id}">채용 확정</button>
    <button class="sm danger" data-act="reject" data-id="${a.id}" data-confirm="이 지원을 거절할까요?">거절</button></div>`;
  if (a.status === 'accepted') return h`<div class="row">
    <a class="btn sm" href="#/shifts/manage?jobId=${a.jobId}">일정</a>
    <a class="btn sm" href="#/payrolls?tab=new&applicationId=${a.id}">정산</a>
    <form class="row" data-form="complete"><input type="hidden" name="id" value="${a.id}">
      <select name="rating" style="width:auto;margin:0" title="성실도">${options([5, 4, 3, 2, 1].map(n => [n, `${n}점`]))}</select>
      <button class="sm" type="submit">근무 완료</button></form></div>`;
  if (a.status === 'completed') return h`<a class="btn sm" href="#/payrolls?tab=issued">정산서</a>`;
  return '';
}

export async function applicants({ q }) {
  const status = q.get('status') || '';
  const jobId = q.get('jobId') || '';
  const list = await get('/applications/received', { status, jobId });
  return h`<h1>받은 지원</h1>
  <div class="tabs">${[['', '전체'], ['pending', '대기'], ['accepted', '확정'], ['completed', '완료'], ['rejected', '거절']]
    .map(([v, t]) => h`<a class="${status === v ? 'on' : ''}" href="#/applicants${qs({ status: v, jobId })}">${t}</a>`)}</div>
  ${jobId ? h`<div class="muted small" style="margin-bottom:8px">공고 #${jobId} 만 보는 중 · <a href="#/applicants${qs({ status })}">전체 공고 보기</a></div>` : ''}
  ${applicationsTable(list)}`;
}

actions.accept = async el => {
  const r = await patch(`/applications/${el.dataset.id}/accept`);
  toast(`확정했습니다 (${r.job.confirmedCount}/${r.job.headcount}명${r.job.status === 'closed' ? ' · 공고 자동 마감' : ''})`);
  state.rerender();
};
actions.reject = async el => { await patch(`/applications/${el.dataset.id}/reject`); toast('거절했습니다'); state.rerender(); };
actions.complete = async (_, f) => { await patch(`/applications/${f.id}/complete`, { rating: Number(f.rating) }); toast('근무 완료 처리했습니다'); state.rerender(); };

// ---------- 알바생: 내 지원 ----------
export async function myApplications({ q }) {
  const status = q.get('status') || '';
  const list = await get('/applications/sent', { status });
  return h`<h1>내 지원</h1>
  <div class="tabs">${[['', '전체'], ['pending', '대기'], ['accepted', '확정'], ['completed', '완료'], ['rejected', '거절']]
    .map(([v, t]) => h`<a class="${status === v ? 'on' : ''}" href="#/applications${qs({ status: v })}">${t}</a>`)}</div>
  ${list.length ? list.map(a => h`<div class="card">
    <div class="row between"><a href="#/jobs/${a.jobId}"><b>${a.Job.title}</b></a>${badge(a.status)}</div>
    <div class="muted small">${a.Job.region} · 사장님 <a href="#/owners/${a.Job.owner.id}">${a.Job.owner.name}</a> · 지원일 ${day(a.createdAt)}</div>
    ${a.message ? h`<div class="small">“${a.message}”</div>` : ''}
    ${a.ownerRating ? h`<div class="small">사장님 성실도 평가: <b>${a.ownerRating}점</b></div>` : ''}
    <div class="row" style="margin-top:6px">
      ${a.status === 'accepted' ? h`<a class="btn sm" href="#/shifts">내 근무</a>` : ''}
      ${['accepted', 'completed'].includes(a.status) ? h`<a class="btn sm" href="#/payrolls">정산서</a>` : ''}
    </div>
    ${a.status === 'completed' ? reviewForm(a) : ''}
  </div>`) : h`<div class="empty">지원 내역이 없습니다. <a href="#/jobs">공고 찾기</a></div>`}`;
}

function reviewForm(a) {
  return h`<details><summary>후기 쓰기</summary>
    <form class="form" data-form="reviewCreate" style="margin-top:6px">
      <input type="hidden" name="applicationId" value="${a.id}">
      <label>평점 <select name="score">${options([5, 4, 3, 2, 1].map(n => [n, '★'.repeat(n)]))}</select></label>
      <label>내용 <textarea name="content" maxlength="1000"></textarea></label>
      <button class="primary sm" type="submit">후기 등록</button>
      <span class="muted small"> 지원 1건당 후기는 1개만 쓸 수 있습니다.</span>
    </form></details>`;
}
actions.reviewCreate = async (_, f) => {
  const body = { applicationId: Number(f.applicationId), score: Number(f.score) };
  if (f.content.trim()) body.content = f.content.trim();
  const r = await post('/reviews', body);
  toast('후기를 등록했습니다');
  go(`#/owners/${r.ownerId}`);
};
