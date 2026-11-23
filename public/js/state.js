// 앱 전역 상태와 이동 도우미 (순환 import 를 피하려고 분리)
export const state = { me: null, rerender: () => {}, unread: 0, refreshBell: () => {} };

export const go = hash => { if (location.hash === hash) state.rerender(); else location.hash = hash; };
export const isOwnerOf = ownerId => !!state.me && state.me.id === ownerId;

// 해시 쿼리 만들기: qs({page: 2, region: ''}) → "?page=2"
export function qs(obj) {
  const s = new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== '' && v != null)).toString();
  return s ? `?${s}` : '';
}
