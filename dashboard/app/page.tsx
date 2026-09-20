'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type Telemetry = {
  timestamp: string;
  leads: { total: number; byZip: Record<string, number> };
  outreach: { total: number; successful: number };
  installations: { total: number; queued: number };
  revenue: { currency: string; bookedCents: number };
  providers: Record<string, boolean>;
};

type Status = { autonomous: boolean; telemetry: Telemetry };
type Session = { authenticated: boolean; login: string | null; configured: boolean };

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const fallbackZips = ['90210', '10021', '60043', '02108', '77019', '94123', '33109', '75205', '98039', '20007', '30327', '78746'];

function money(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="border-l border-line pl-4"><div className="text-[10px] tracking-[.22em] text-slate-500">{label}</div><div className="mt-1 text-2xl font-bold text-white">{value}</div><div className="text-[10px] text-slate-500">{detail}</div></div>;
}

export default function CommandCenter() {
  const [status, setStatus] = useState<Status | null>(null);
  const [logs, setLogs] = useState<string[]>(['SYSTEM // command center awaiting telemetry']);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`${API}/api/command-center/status`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`status ${response.status}`);
    setStatus(await response.json());
  }, []);

  useEffect(() => {
    fetch(`${API}/auth/session`, { credentials: 'include' })
      .then((response) => response.json())
      .then(setSession)
      .catch(() => setSession({ authenticated: false, login: null, configured: false }));
  }, []);

  useEffect(() => {
    if (!session?.authenticated) return undefined;
    load().catch((error) => setLogs((items) => [`ERROR // ${error.message}`, ...items]));
    const events = new EventSource(`${API}/api/command-center/live-log`, { withCredentials: true });
    events.addEventListener('snapshot', (event) => setStatus(JSON.parse((event as MessageEvent).data)));
    events.addEventListener('autonomous-control', (event) => {
      const data = JSON.parse((event as MessageEvent).data);
      setLogs((items) => [`CONTROL // autonomous mode ${data.autonomous ? 'engaged' : 'paused'}`, ...items].slice(0, 12));
      load().catch(() => undefined);
    });
    return () => events.close();
  }, [load, session?.authenticated]);

  async function toggleAutonomous() {
    if (!status) return;
    setBusy(true);
    try {
      await fetch(`${API}/api/command-center/autonomous-control`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: !status.autonomous }),
      });
    } finally { setBusy(false); }
  }

  if (session && !session.authenticated) {
    return <main className="scanline flex min-h-screen items-center justify-center bg-ink px-5">
      <section className="w-full max-w-xl border border-line bg-panel p-8">
        <div className="text-[11px] tracking-[.35em] text-signal">MARKET PLUS / AUTOMATION</div>
        <h1 className="mt-5 text-3xl font-bold text-white">Turn missed calls into booked jobs.</h1>
        <p className="mt-5 text-sm leading-7 text-slate-400">Our AI receptionist answers instantly, qualifies every opportunity, and sends a missed-call text back so local service businesses capture more revenue without adding another employee.</p>
        <a href={`${API}/auth/github`} className="mt-8 inline-flex border border-signal bg-signal/10 px-5 py-3 text-xs font-bold tracking-[.18em] text-signal hover:bg-signal/20">OPERATOR SIGN IN WITH GITHUB</a>
        {!session.configured && <p className="mt-4 text-xs text-amber-400">Operator authentication is not configured on this deployment.</p>}
      </section>
    </main>;
  }

  const telemetry = status?.telemetry;
  const zips = useMemo(() => fallbackZips.map((zip) => ({ zip, count: telemetry?.leads.byZip[zip] || 0 })), [telemetry]);

  return <main className="scanline min-h-screen bg-ink px-5 py-6 md:px-10">
    <header className="mx-auto flex max-w-[1500px] items-center justify-between border-b border-line pb-5">
      <div><div className="text-[11px] tracking-[.35em] text-signal">MARKET PLUS / OPS</div><h1 className="mt-2 text-xl font-bold tracking-tight text-white">COMMAND CENTER <span className="text-slate-600">// 01</span></h1></div>
      <div className="text-right text-[10px] tracking-[.18em] text-slate-500"><span className="mr-2 inline-block h-2 w-2 rounded-full bg-signal shadow-[0_0_12px_#b8ff2c]" />LIVE LINK<br /><span className="text-slate-600">{telemetry ? new Date(telemetry.timestamp).toLocaleTimeString() : 'CONNECTING'}</span></div>
    </header>

    <section className="mx-auto mt-7 grid max-w-[1500px] grid-cols-2 gap-5 border-y border-line py-5 md:grid-cols-4">
      <Metric label="LEADS CAPTURED" value={String(telemetry?.leads.total || 0)} detail="without AI infrastructure" />
      <Metric label="OUTREACH RUNS" value={String(telemetry?.outreach.total || 0)} detail={`${telemetry?.outreach.successful || 0} delivered / logged`} />
      <Metric label="AUTOMATIONS QUEUED" value={String(telemetry?.installations.queued || 0)} detail="provider installation queue" />
      <Metric label="BOOKED REVENUE" value={money(telemetry?.revenue.bookedCents || 0)} detail="tracked checkout fulfillment" />
    </section>

    <section className="mx-auto mt-7 grid max-w-[1500px] gap-6 lg:grid-cols-[1.4fr_.6fr]">
      <div className="rounded-sm border border-line bg-panel p-5">
        <div className="mb-5 flex items-center justify-between"><div><div className="text-[10px] tracking-[.25em] text-signal">NATIONWIDE SCAN MATRIX</div><div className="mt-1 text-xs text-slate-500">HIGH-INCOME ZIP TARGETS / OPPORTUNITY DENSITY</div></div><div className="text-[10px] text-slate-500">{zips.filter((item) => item.count).length} ACTIVE CELLS</div></div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">{zips.map(({ zip, count }) => <div key={zip} className={`border p-3 ${count ? 'border-signal/60 bg-signal/10' : 'border-line bg-black/20'}`}><div className="text-[10px] text-slate-500">{zip}</div><div className={`mt-2 text-xl font-bold ${count ? 'text-signal glow' : 'text-slate-600'}`}>{String(count).padStart(2, '0')}</div><div className="mt-1 text-[9px] uppercase text-slate-600">{count ? 'signals' : 'standby'}</div></div>)}</div>
      </div>
      <div className="rounded-sm border border-line bg-panel p-5">
        <div className="text-[10px] tracking-[.25em] text-signal">AUTONOMOUS CONTROL</div>
        <div className="mt-2 text-xs leading-5 text-slate-500">Allow the engine to move qualified opportunities into the configured outreach workflow.</div>
        <button onClick={toggleAutonomous} disabled={busy || !status} className={`mt-6 flex w-full items-center justify-between border px-4 py-3 text-left text-xs transition ${status?.autonomous ? 'border-signal bg-signal/10 text-signal' : 'border-line text-slate-400 hover:border-slate-500'}`}><span>{status?.autonomous ? 'AUTONOMOUS MODE ACTIVE' : 'AUTONOMOUS MODE PAUSED'}</span><span className={`h-3 w-3 rounded-full ${status?.autonomous ? 'bg-signal shadow-[0_0_14px_#b8ff2c]' : 'bg-slate-700'}`} /></button>
        <div className="mt-5 grid grid-cols-2 gap-2 text-[10px] text-slate-500">{Object.entries(telemetry?.providers || {}).slice(0, 4).map(([provider, ready]) => <div key={provider} className="border border-line px-2 py-2 uppercase">{provider} <span className={ready ? 'text-signal' : 'text-slate-700'}>{ready ? 'READY' : 'OFFLINE'}</span></div>)}</div>
      </div>
    </section>

    <section className="mx-auto mt-6 max-w-[1500px] rounded-sm border border-line bg-black/30 p-5">
      <div className="mb-3 flex items-center justify-between"><div className="text-[10px] tracking-[.25em] text-signal">LIVE LOG // EVENT STREAM</div><div className="text-[10px] text-slate-600">SSE / CONNECTED</div></div>
      <div className="h-40 overflow-hidden text-[11px] leading-6 text-slate-500">{logs.map((log, index) => <div key={`${log}-${index}`}><span className="mr-3 text-slate-700">{String(index + 1).padStart(2, '0')}</span><span className={log.includes('CONTROL') ? 'text-signal' : ''}>{log}</span></div>)}</div>
    </section>
    <div className="mx-auto mt-5 flex max-w-[1500px] justify-between text-[9px] tracking-[.2em] text-slate-700"><span>MPA / INTERNAL OPERATIONS SURFACE</span><span>TELEMETRY CONTRACT V1</span></div>
  </main>;
}
