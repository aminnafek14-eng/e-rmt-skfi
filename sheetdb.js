/* ═══════════════════════════════════════════════════════════════
   SheetDB — sambungan ke Google Sheet melalui Google Apps Script
   Pengganti Supabase. Dikongsi oleh index.html & form.html.

   ► Tampal URL Web App Apps Script anda di bawah (berakhir dengan /exec)
   ═══════════════════════════════════════════════════════════════ */
const SHEET_API_URL = 'https://script.google.com/macros/s/AKfycbwm1HrmyXMQYL0o0FYGYqkQLTX7nOvP4jsRiirqZak8n1vIcmwn6I-eWKw7rQqkYfu1/exec';

const SHEET_READY = /^https:\/\/script\.google\.com\//.test(SHEET_API_URL);
const SB_URL = SHEET_READY ? SHEET_API_URL : 'YOUR_SHEET_URL';   // serasi dengan semakan lama

const SheetDB = (() => {
  let pending = 0;          // bilangan penulisan sedang berjalan (elak polling timpa data optimistik)

  async function call(body, retry) {
    pending++;
    try {
      const r = await fetch(SHEET_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // elak preflight CORS
        body: JSON.stringify(body)
      });
      const j = await r.json();
      if (j.error) return { data: null, error: j.error };
      return { data: j.data === undefined ? null : j.data, error: null };
    } catch (e) {
      if (retry !== false && body.op !== 'insert') return call(body, false);   // cuba sekali lagi (tidak untuk insert)
      return { data: null, error: { message: String((e && e.message) || e) } };
    } finally { pending--; }
  }

  /* ── Pembina pertanyaan serasi sintaks Supabase ── */
  class Q {
    constructor(t) { this.t = t; this.op = 'select'; this.filters = []; this.ord = []; this.cols = '*'; this.vals = null; this.conf = ''; }
    select(c) { if (this.op === 'select') this.cols = c || '*'; return this; }
    insert(v) { this.op = 'insert'; this.vals = Array.isArray(v) ? v : [v]; return this; }
    update(v) { this.op = 'update'; this.vals = v; return this; }
    upsert(v, o) { this.op = 'upsert'; this.vals = Array.isArray(v) ? v : [v]; this.conf = (o && o.onConflict) || ''; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(c, v) { this.filters.push(['eq', c, v]); return this; }
    neq(c, v) { this.filters.push(['neq', c, v]); return this; }
    gte(c, v) { this.filters.push(['gte', c, v]); return this; }
    lte(c, v) { this.filters.push(['lte', c, v]); return this; }
    like(c, v) { this.filters.push(['like', c, v]); return this; }
    in(c, arr) { this.filters.push(['in', c, arr]); return this; }
    order(c, o) { this.ord.push([c, !(o && o.ascending === false)]); return this; }
    then(res, rej) {
      return call({ op: this.op, table: this.t, filters: this.filters, order: this.ord, cols: this.cols, values: this.vals, onConflict: this.conf }).then(res, rej);
    }
  }

  /* ── Polling versi (setiap 5 saat) ── */
  let timer = null, last = null, busy = false, onChange = null;

  async function poll() {
    if (busy || pending > 0 || (typeof document !== 'undefined' && document.hidden)) return;
    busy = true;
    try {
      const r = await fetch(SHEET_API_URL + '?a=ver&_=' + Date.now());
      const ver = (await r.json()).data;
      if (!ver) return;
      if (last) {
        const ch = {}; let any = false;
        ['murid', 'kehadiran', 'config'].forEach(k => { if (ver[k] !== last[k]) { ch[k] = true; any = true; } });
        if (any && onChange) { await onChange(ch); }
        last = ver;
      } else { last = ver; }
    } catch (e) { /* rangkaian terputus — cuba lagi pada giliran seterusnya */ }
    finally { busy = false; }
  }
  function onVisible() { if (!document.hidden) poll(); }

  return {
    from: t => new Q(t),
    rpc: (fn, params) => call({ op: 'rpc', fn, params }),
    get pending() { return pending; },
    startPolling(cb, ms) {
      this.stopPolling();
      onChange = cb; last = null;
      poll();
      timer = setInterval(poll, ms || 5000);
      document.addEventListener('visibilitychange', onVisible);
    },
    stopPolling() {
      if (timer) clearInterval(timer);
      timer = null; onChange = null; last = null;
      document.removeEventListener('visibilitychange', onVisible);
    }
  };
})();

const sb = SHEET_READY ? SheetDB : null;
