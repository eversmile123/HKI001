import { useState, useEffect } from "react";
import { CheckCircle2, XCircle, Activity, ShieldAlert } from "lucide-react";

export default function DebugView() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkHealth() {
      try {
        const res = await fetch("/api/health");
        const contentType = res.headers.get("content-type");
        
        if (contentType && contentType.includes("application/json")) {
           const data = await res.json();
           setStatus(data);
        } else {
           const text = await res.text();
           if (text.includes("Starting Server")) {
              setError("System Registry is currently booting... Please stand by.");
           } else {
              setError("Diagnostic node returned non-JSON response.");
           }
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    checkHealth();
  }, []);

  if (loading) return <div className="p-10 font-mono text-sm">PROBING SYSTEM STATUS...</div>;

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black italic uppercase tracking-tighter italic">System Diagnostic</h1>
        <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${status?.sheetsClient ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
          {status?.sheetsClient ? 'Authenticated' : 'Auth Failure'}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Activity size={12} />
            Sheet Connection
          </p>
          <div className="flex items-center gap-2">
            {status?.spreadsheetConnection === "OK" ? (
              <CheckCircle2 className="text-emerald-500" size={20} />
            ) : (
              <XCircle className="text-rose-500" size={20} />
            )}
            <span className="text-lg font-bold">{status?.spreadsheetConnection || "UNKNOWN"}</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <ShieldAlert size={12} />
            Auth Client
          </p>
          <div className="flex items-center gap-2">
            {status?.sheetsClient ? (
              <CheckCircle2 className="text-emerald-500" size={20} />
            ) : (
              <XCircle className="text-rose-500" size={20} />
            )}
            <span className="text-lg font-bold">{status?.sheetsClient ? "INITIALIZED" : "FAILED"}</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl">
          <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-1">Network Error</p>
          <p className="text-xs font-medium text-rose-800">{error}</p>
        </div>
      )}

      {status?.headers && (
        <div className="bg-slate-900 p-6 rounded-2xl text-white font-mono text-[10px] space-y-4 shadow-xl">
           <div>
              <p className="text-blue-400 mb-2 font-black uppercase tracking-widest text-[9px]">Inspection Headers</p>
              <div className="flex flex-wrap gap-2 text-slate-300">
                {status.headers.inspections.map((h: string, i: number) => (
                  <span key={i} className="px-1.5 py-0.5 bg-white/10 rounded">"{h}"</span>
                ))}
              </div>
           </div>
           <div>
              <p className="text-amber-400 mb-2 font-black uppercase tracking-widest text-[9px]">Observation Headers</p>
              <div className="flex flex-wrap gap-2 text-slate-300">
                {status.headers.observations.map((h: string, i: number) => (
                  <span key={i} className="px-1.5 py-0.5 bg-white/10 rounded">"{h}"</span>
                ))}
              </div>
           </div>
        </div>
      )}

      <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">System Context</p>
        <div className="space-y-1">
          <div className="flex justify-between text-xs font-medium">
            <span className="text-slate-500">Node Environment:</span>
            <span className="font-bold">{status?.env || "unknown"}</span>
          </div>
          <div className="flex justify-between text-xs font-medium">
            <span className="text-slate-500">Spreadsheet ID Presence:</span>
            <span className="font-bold">{status?.spreadsheetId ? "DETECTED" : "MISSING"}</span>
          </div>
          <div className="flex justify-between text-xs font-medium">
            <span className="text-slate-500">Creds Diagnostic:</span>
            <span className="font-bold text-[10px]">{status?.credsInfo || "N/A"}</span>
          </div>
          <div className="flex justify-between text-xs font-medium">
            <span className="text-slate-500">Debug Mode:</span>
            <span className="font-bold">{status?.debug ? "ENABLED" : "DISABLED"}</span>
          </div>
        </div>
      </div>

      <button 
        onClick={() => window.location.reload()}
        className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-xs hover:bg-black transition-all shadow-xl shadow-slate-900/20"
      >
        RE-PROBE REGISTRY
      </button>
    </div>
  );
}
