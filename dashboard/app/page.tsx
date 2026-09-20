'use client';

import { useEffect, useState } from 'react';
import {
  Activity,
  Cpu,
  Crosshair,
  Globe,
  Radio,
  Server,
  Wifi,
  Zap,
} from 'lucide-react';

export default function CommandCenter() {
  const [mounted, setMounted] = useState(false);
  const [activeFleet, setActiveFleet] = useState([
    { id: 'NODE-US-EAST-1', status: 'HEALTHY', latency: '12ms', load: 42, rps: 1840 },
    { id: 'NODE-US-WEST-2', status: 'HEALTHY', latency: '24ms', load: 58, rps: 2150 },
    { id: 'NODE-EU-CENTRAL', status: 'OPTIMAL', latency: '88ms', load: 31, rps: 940 },
    { id: 'NODE-AP-SOUTH-1', status: 'SYNCING', latency: '142ms', load: 76, rps: 1210 },
  ]);

  const [zipMatrix, setZipMatrix] = useState([
    { zip: '90210', name: 'Beverly Hills, CA', score: 98.4, status: 'SCANNING', leads: 412 },
    { zip: '10021', name: 'Manhattan, NY', score: 99.1, status: 'ACTIVE', leads: 890 },
    { zip: '60043', name: 'Kenilworth, IL', score: 94.2, status: 'ACTIVE', leads: 231 },
    { zip: '02108', name: 'Boston, MA', score: 96.8, status: 'SCANNING', leads: 512 },
    { zip: '77019', name: 'Houston, TX', score: 91.5, status: 'QUEUED', leads: 189 },
    { zip: '33139', name: 'Miami Beach, FL', score: 97.3, status: 'ACTIVE', leads: 674 },
    { zip: '94102', name: 'San Francisco, CA', score: 95.9, status: 'SCANNING', leads: 430 },
    { zip: '98101', name: 'Seattle, WA', score: 93.7, status: 'ACTIVE', leads: 315 },
  ]);

  const [pipelineFeed, setPipelineFeed] = useState([
    { id: 'EVT-9041', time: '14:22:01', type: 'ENRICHMENT', desc: 'Verified high-intent lead in 90210 ($2.4M ARR pool)', status: 'SUCCESS' },
    { id: 'EVT-9040', time: '14:21:58', type: 'TELEMETRY', desc: 'Fleet East-1 scaled node pool +4 instances', status: 'INFO' },
    { id: 'EVT-9039', time: '14:21:52', type: 'ZIP MATRIX', desc: 'Re-indexed scan quadrant 10021 - 89 new targets', status: 'SUCCESS' },
    { id: 'EVT-9038', time: '14:21:45', type: 'DISPATCH', desc: 'CRM Sync batch delivered to Enterprise Pipeline', status: 'SUCCESS' },
    { id: 'EVT-9037', time: '14:21:39', type: 'CRAWLER', desc: 'Scraped commercial permit registry (Zone TX-77019)', status: 'ACTIVE' },
  ]);

  useEffect(() => {
    setMounted(true);

    const interval = setInterval(() => {
      setPipelineFeed(prev => [
        {
          id: `EVT-${Math.floor(8000 + Math.random() * 2000)}`,
          time: new Date().toLocaleTimeString(),
          type: ['ZIP MATRIX', 'ENRICHMENT', 'TELEMETRY', 'DISPATCH'][Math.floor(Math.random() * 4)],
          desc: `Automated signal pulse detected in quadrant ${['90210', '10021', '33139', '02108'][Math.floor(Math.random() * 4)]}`,
          status: 'SUCCESS',
        },
        ...prev.slice(0, 7),
      ]);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  return (
    <main className="min-h-screen bg-black text-slate-100 font-mono select-none overflow-x-hidden p-4 md:p-6">
      <header className="border-b border-cyan-900/50 bg-slate-950/80 backdrop-blur-md p-4 rounded-xl mb-6 flex flex-wrap items-center justify-between gap-4 shadow-2xl shadow-cyan-950/20">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-cyan-950 border border-cyan-500/30 rounded-lg text-cyan-400 animate-pulse">
            <Radio className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-wider bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent">
              COMMAND CENTER v4.0
            </h1>
            <p className="text-xs text-slate-500 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              SYSTEM OVERWATCH ACTIVE // CLOUD TELEMETRY ONLINE
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6 text-xs text-slate-400">
          <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800">
            <Wifi className="w-4 h-4 text-emerald-400" />
            <span>
              LATENCY: <strong className="text-white">14ms</strong>
            </span>
          </div>
          <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span>
              NODES: <strong className="text-white">128/128</strong>
            </span>
          </div>
          <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>
              THROUGHPUT: <strong className="text-white">6,140 RPS</strong>
            </span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="relative h-80 rounded-2xl border border-cyan-900/40 bg-gradient-to-b from-slate-950 to-black overflow-hidden shadow-2xl">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(6,182,212,0.18),transparent_40%),linear-gradient(180deg,rgba(2,6,23,0.3),rgba(2,6,23,0.8))]" />
            <div className="absolute inset-0 opacity-60">
              <div className="absolute inset-x-8 top-10 bottom-10 rounded-full border border-cyan-500/20" />
              <div className="absolute inset-x-16 top-16 bottom-16 rounded-full border border-cyan-500/15" />
              <div className="absolute inset-x-24 top-20 bottom-20 rounded-full border border-cyan-500/10" />
              <div className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-400/30" />
              <div className="absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-400/20" />
            </div>

            <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-cyan-500/30 text-xs">
              <Globe className="w-4 h-4 text-cyan-400" />
              <span className="font-bold text-cyan-300">TOPOGRAPHY MATRIX</span>
            </div>

            <div className="absolute top-4 right-4 z-10 text-[10px] text-slate-500 bg-slate-950/70 px-2.5 py-1 rounded border border-slate-800">
              ORBIT READY // GEO SIGNAL 99.8%
            </div>

            <div className="absolute inset-0 flex items-center justify-center">
              <div className="grid grid-cols-6 gap-3 opacity-80">
                {Array.from({ length: 24 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-12 w-12 rounded-full border border-cyan-500/20 bg-cyan-500/5 shadow-[0_0_20px_rgba(34,211,238,0.15)]"
                    style={{ transform: `translateY(${(i % 3) * 4}px) scale(${0.8 + ((i % 5) * 0.08)})` }}
                  />
                ))}
              </div>
            </div>

            <div className="absolute bottom-3 left-4 right-4 flex justify-between items-center text-[11px] text-slate-400 bg-slate-950/80 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-slate-800">
              <span className="text-emerald-400 font-semibold">● TOPOLOGY STABLE</span>
              <span>GEOSPATIAL MESH SIGNAL: 99.8%</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/90 p-5 backdrop-blur-xl shadow-xl">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <Server className="w-5 h-5 text-cyan-400" />
                <h2 className="text-base font-bold text-slate-200 tracking-wide">API FLEET TELEMETRY</h2>
              </div>
              <span className="text-xs bg-cyan-950 text-cyan-400 border border-cyan-800 px-2.5 py-1 rounded-full">
                4 REGIONAL CLUSTERS
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {activeFleet.map(node => (
                <div key={node.id} className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-cyan-500/40 transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-300">{node.id}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                        node.status === 'HEALTHY'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : node.status === 'OPTIMAL'
                            ? 'bg-cyan-950 text-cyan-400 border border-cyan-800'
                            : 'bg-amber-950 text-amber-400 border border-amber-800'
                      }`}
                    >
                      {node.status}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-400">
                    <div className="flex justify-between">
                      <span>Latency:</span>
                      <strong className="text-slate-200">{node.latency}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Throughput:</span>
                      <strong className="text-cyan-400">{node.rps} RPS</strong>
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] mb-1">
                        <span>Cluster Load</span>
                        <span>{node.load}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full"
                          style={{ width: `${node.load}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/90 p-5 backdrop-blur-xl shadow-xl flex-1">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <Crosshair className="w-5 h-5 text-emerald-400" />
                <h2 className="text-base font-bold text-slate-200 tracking-wide">ZIP SCAN MATRIX</h2>
              </div>
              <span className="text-xs text-slate-400">HIGH-INCOME TARGETS</span>
            </div>

            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {zipMatrix.map(item => (
                <div key={item.zip} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/40 border border-slate-800/60 hover:bg-slate-900/80 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="font-bold text-cyan-400 bg-slate-900 px-2 py-1 rounded border border-slate-800 text-xs">
                      {item.zip}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-200">{item.name}</div>
                      <div className="text-[10px] text-slate-500">Yield Index: {item.score}</div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xs font-bold text-emerald-400">{item.leads} leads</div>
                    <div className="text-[10px] text-slate-400 flex items-center justify-end gap-1">
                      <span
                        className={`inline-block w-1.5 h-1.5 rounded-full ${
                          item.status === 'ACTIVE'
                            ? 'bg-emerald-400 animate-ping'
                            : item.status === 'SCANNING'
                              ? 'bg-cyan-400 animate-pulse'
                              : 'bg-slate-600'
                        }`}
                      />
                      {item.status}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/90 p-5 backdrop-blur-xl shadow-xl">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-purple-400 animate-pulse" />
                <h2 className="text-base font-bold text-slate-200 tracking-wide">LIVE PIPELINE FEED</h2>
              </div>
              <span className="text-[10px] bg-purple-950 text-purple-300 border border-purple-800 px-2 py-0.5 rounded">
                REAL-TIME STREAM
              </span>
            </div>

            <div className="space-y-3">
              {pipelineFeed.map(evt => (
                <div key={evt.id} className="p-2.5 rounded-lg bg-slate-900/50 border border-slate-800/80 text-xs flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span className="font-mono text-purple-300 font-bold">{evt.type}</span>
                    <span>{evt.time}</span>
                  </div>
                  <p className="text-slate-200 font-sans text-xs">{evt.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
