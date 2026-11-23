// 정산서 + 사장님 후기(평판)
import { get, post, patch, del } from '../api.js';
import { h, actions, toast, badge, won, day, dt, mins, options, todayStr, stars } from '../ui.js';
import { state, go, qs } from '../state.js';

// ---------- 정산서 ----------
function payTable(list, who) {
  if (!list.length) return h`<div class="empty">정산서가 없습니다.</div>`;
  return h`<div class="scroll"><table>
    <tr><th>#</th><th>지원</th><th>기간</th><th>근무</th><th>총액</th><th>상태</th><th></th></tr>
    ${list.map(p => h`<tr>
      <td>${p.id}</td><td>#${p.applicationId}</td>
      <td class="small">${day(p.periodStart)} ~ ${day(p.periodEnd)}</td>
      <td>${mins(p.totalMinutes)}</td><td><b>${won(p.totalPay)}</b></td><td>${badge(p.status)}</td>
      <td><a class="btn sm" href="#/payrolls/${p.id}">상세</a></td></tr>`)}
  </table></div>`;
}

export async function payrolls({ q }) {
  const tab = q.get('tab') || 'mine';
  const tabs = h`<div class="tabs">${[['mine', '받은 정산서'], ['issued', '발행한 정산서'], ['new', '+ 정산서 발행']]
    .map(([v, t]) => h`<a class="${tab === v ? 'on' : ''}" href="#/payrolls?tab=${v}">${t}</a>`)}</div>`;

  if (tab === 'issued') return h`<h1>정산</h1>${tabs}${payTable(await get('/payrolls/issued'))}`;
  if (tab === 'new') {
    const apps = (await get('/applications/received')).filter(a => ['accepted', 'completed'].includes(a.status));
    const pre = q.get('applicationId') || '';
    return h`<h1>정산</h1>${tabs}
    ${apps.length ? h`<form class="form card" data-form="payrollIssue">
      <label>대상 지원 <select name="applicationId">${options(apps.map(a => [a.id, `#${a.id} ${a.applicant.name} · ${a.Job.title}`]), pre)}</select></label>
      <label>기간 시작 <input type="date" name="periodStart" value="${todayStr()}" required></label>
      <label>기간 끝 <input type="date" name="periodEnd" value="${todayStr()}" required></label>
      <button class="primary" type="submit">발행</button>
      <div class="muted small" style="margin-top:6px">기간 안의 <b>확인된</b> 근무만 계산됩니다 (기본급 + 주휴수당). 같은 기간 중복 발행은 불가, 이의제기된 기간은 재발행할 수 있습니다.</div>
    </form>` : h`<div class="empty">확정된 지원이 없습니다.</div>`}`;
  }
  return h`<h1>정산</h1>${tabs}${payTable(await get('/payrolls/me'))}`;
}
actions.payrollIssue = async (_, f) => {
  const p = await post('/payrolls', { applicationId: Number(f.applicationId), periodStart: f.periodStart, periodEnd: f.periodEnd });
  toast(`발행했습니다 (${won(p.totalPay)})`);
  go(`#/payrolls/${p.id}`);
};

export async function payrollDetail({ params }) {
  const p = await get(`/payrolls/${params[0]}`);
  const isOwner = state.me && state.me.id === p.ownerId;
  const isWorker = state.me && state.me.id === p.workerId;
  return h`<div class="row between"><h1>정산서 #${p.id}</h1>${badge(p.status)}</div>
  <div class="card"><dl class="kv">
    <dt>지원</dt><dd>#${p.applicationId}</dd>
    <dt>기간</dt><dd>${day(p.periodStart)} ~ ${day(p.periodEnd)}</dd>
    <dt>총 근무</dt><dd>${mins(p.totalMinutes)}</dd>
    <dt>시급 (발행 시점)</dt><dd>${won(p.hourlyPay)}</dd>
    <dt>기본급</dt><dd>${won(p.basePay)}</dd>
    <dt>주휴수당</dt><dd>${won(p.weeklyHolidayPay)}</dd>
    <dt>총 지급액</dt><dd><b>${won(p.totalPay)}</b></dd>
    ${p.paidAt ? h`<dt>지급일</dt><dd>${dt(p.paidAt)}</dd>` : ''}
    ${p.disputeReason ? h`<dt>이의제기 사유</dt><dd>${p.disputeReason}</dd>` : ''}
  </dl></div>
  ${p.status === 'issued' && isOwner ? h`<button class="primary" data-act="payrollPay" data-id="${p.id}" data-confirm="지급 완료 처리할까요?">지급 완료 처리</button>` : ''}
  ${p.status === 'issued' && isWorker ? h`<details open><summary>이의제기</summary>
    <form class="form card" data-form="payrollDispute"><input type="hidden" name="id" value="${p.id}">
      <label>사유 <textarea name="reason" maxlength="500" required></textarea></label>
      <button class="danger" type="submit">이의제기</button></form></details>` : ''}
  <h2>일별 근무 내역</h2>
  ${p.days.length ? h`<div class="scroll"><table><tr><th>날짜</th><th>시간</th><th>근무</th><th>상태</th></tr>
    ${p.days.map(d => h`<tr><td>${day(d.startAt)}</td><td class="small">${dt(d.startAt)} ~ ${dt(d.endAt)}</td><td>${mins(d.workedMinutes)}</td><td>${badge(d.status)}</td></tr>`)}
  </table></div>` : h`<div class="empty">내역이 없습니다.</div>`}`;
}
actions.payrollPay = async el => { await patch(`/payrolls/${el.dataset.id}/pay`); toast('지급 완료 처리했습니다'); state.rerender(); };
actions.payrollDispute = async (_, f) => { await patch(`/payrolls/${f.id}/dispute`, { reason: f.reason.trim() }); toast('이의제기를 접수했습니다'); state.rerender(); };

// ---------- 사장님 평판 / 후기 ----------
export async function owner({ params, q }) {
  const id = params[0];
  const page = Number(q.get('page')) || 1;
  const [s, d] = await Promise.all([get(`/reviews/owners/${id}/score`), get(`/reviews/owners/${id}`, { page, limit: 10 })]);
  const last = Math.max(1, Math.ceil(d.total / d.limit));
  return h`<h1>사장님 #${id} 평판</h1>
  <div class="card"><b>평균 ${stars(s.avgScore)}</b> <span class="muted">· 후기 ${s.count}개</span></div>
  ${d.reviews.length ? d.reviews.map(r => {
    const mine = state.me && state.me.id === r.authorId;
    return h`<div class="card">
      <div class="row between"><b>${stars(r.score)}</b><span class="muted small">${r.author ? r.author.name : ''} · ${day(r.createdAt)}</span></div>
      <div style="white-space:pre-wrap">${r.content || ''}</div>
      ${mine ? h`<details><summary>수정 / 삭제</summary>
        <form class="form" data-form="reviewUpdate" style="margin-top:6px"><input type="hidden" name="id" value="${r.id}">
          <label>평점 <select name="score">${options([5, 4, 3, 2, 1].map(n => [n, '★'.repeat(n)]), r.score)}</select></label>
          <label>내용 <textarea name="content" maxlength="1000">${r.content || ''}</textarea></label>
          <div class="row"><button class="primary sm" type="submit">수정</button>
          <button class="danger sm" type="button" data-act="reviewDelete" data-id="${r.id}" data-confirm="후기를 삭제할까요?">삭제</button></div>
        </form></details>` : ''}
    </div>`;
  }) : h`<div class="empty">후기가 없습니다.</div>`}
  <div class="pager">
    ${page > 1 ? h`<a class="btn sm" href="#/owners/${id}${qs({ page: page - 1 })}">← 이전</a>` : ''}
    <span class="muted">${page} / ${last}</span>
    ${page < last ? h`<a class="btn sm" href="#/owners/${id}${qs({ page: page + 1 })}">다음 →</a>` : ''}
  </div>`;
}
actions.reviewUpdate = async (_, f) => {
  const b = { score: Number(f.score) };
  if (f.content.trim()) b.content = f.content.trim();
  await patch(`/reviews/${f.id}`, b); toast('수정되었습니다'); state.rerender();
};
actions.reviewDelete = async el => { await del(`/reviews/${el.dataset.id}`); toast('삭제되었습니다'); state.rerender(); };
