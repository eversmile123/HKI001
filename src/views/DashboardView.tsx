import { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api";
import { Inspection, Observation, Section } from "../types";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, AreaChart, Area, LineChart, Line, Legend } from "recharts";
import { CheckCircle2, CircleDashed, TrendingUp, ClipboardList, ArrowRight, Activity, Calendar, MapPin, X, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDate, cn, getNormalizedLocation, normalizeId } from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";

export default function DashboardView() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonthId, setSelectedMonthId] = useState<string | null>(null);

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  useEffect(() => {
    async function loadData() {
      setError(null);
      try {
        const [i, o, s] = await Promise.all([
          api.getInspections(),
          api.getObservations(),
          api.getSections()
        ]);
        
        setInspections(Array.isArray(i) ? i : []);
        setObservations(Array.isArray(o) ? o : []);
        setSections(Array.isArray(s) ? s : []);
      } catch (e: any) {
        console.error(e);
        setError(e.message || "Failed to load dashboard data. Please check your data source connection.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Safe access to observations
  const obsArray = Array.isArray(observations) ? observations : [];

  const { openCount, inProgressCount, closedCount } = useMemo(() => {
    return {
      openCount: obsArray.filter(o => o.status === 'Open').length,
      inProgressCount: obsArray.filter(o => o.status === 'In Progress').length,
      closedCount: obsArray.filter(o => o.status === 'Closed').length,
    };
  }, [obsArray]);

  const totalTargetIssues = openCount + inProgressCount;

  const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s));

  // Calculate High Risk Locations (Hotspots)
  const locationRisks = useMemo(() => {
    return obsArray.reduce((acc, obs) => {
      if (obs.status === 'Open' || obs.status === 'In Progress') {
        const loc = getNormalizedLocation(obs.location);
        if (loc) {
          acc[loc] = (acc[loc] || 0) + 1;
        }
      }
      return acc;
    }, {} as Record<string, number>);
  }, [obsArray]);

  const topHotspots = useMemo(() => {
    return Object.entries(locationRisks)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 3);
  }, [locationRisks]);

  const locationStatusData = useMemo(() => {
    const locationsHandled = new Set<string>();
    obsArray.forEach(o => {
      const loc = getNormalizedLocation(o.location);
      if (loc) locationsHandled.add(loc);
    });
    const uniqueLocations = Array.from(locationsHandled);
    
    return uniqueLocations.map(loc => {
      const obs = obsArray.filter(o => getNormalizedLocation(o.location) === loc);
      const open = obs.filter(o => o.status === 'Open').length;
      const inProgress = obs.filter(o => o.status === 'In Progress').length;
      const closed = obs.filter(o => o.status === 'Closed').length;
      return {
        name: loc,
        open,
        inProgress,
        closed,
        total: obs.length
      };
    }).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [obsArray]);

  const sectionData = useMemo(() => {
    // Collect all unique sections mentioned in observations or the master sections list
    const uniqueSectionIds = Array.from(new Set([
      ...obsArray.map(o => o.sectionId).filter(Boolean),
      ...sections.map(s => s.id)
    ]));
    
    return uniqueSectionIds.map(secId => {
      const section = sections.find(s => normalizeId(s.id) === normalizeId(secId));
      const displayName = section ? section.name : (secId as string || "Unknown Section");

      // Find all observations for this sectionid
      const obs = obsArray.filter(o => normalizeId(o.sectionId) === normalizeId(secId));
      const closed = obs.filter(o => o.status === 'Closed').length;
      
      return {
        id: secId,
        name: displayName,
        total: obs.length,
        closed,
        rate: obs.length > 0 ? (closed / obs.length) * 100 : 0
      };
    }).filter(s => s.total > 0) // Only show sections with actual data
      .sort((a, b) => b.rate - a.rate);
  }, [obsArray, sections]);

  const pieData = [
    { name: 'Open', value: openCount },
    { name: 'In Progress', value: inProgressCount },
    { name: 'Closed', value: closedCount }
  ];

  const PIE_COLORS = ['#E11D48', '#F59E0B', '#10B981'];

  const enrichedInspections = useMemo(() => {
    const insArray = Array.isArray(inspections) ? inspections : [];
    return insArray.map(ins => {
      const insObs = obsArray.filter(o => normalizeId(o.inspectionId) === normalizeId(ins.id));
      return {
        ...ins,
        obsCount: insObs.length,
        observations: insObs
      };
    }).filter(ins => ins.obsCount > 0);
  }, [inspections, obsArray, normalizeId]);

  const trendData = useMemo(() => {
    const insArray = enrichedInspections;
    const last30Days: Record<string, { date: string; dateObj: Date; count: number; closures: number }> = {};
    
    // Last 15 unique dates found in data
    const dates = insArray
      .map(i => i.date)
      .filter(Boolean)
      .map(d => new Date(d))
      .sort((a, b) => a.getTime() - b.getTime());
    
    if (dates.length === 0) return [];

    insArray.forEach(ins => {
      const d = new Date(ins.date);
      const key = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      if (!last30Days[key]) {
        last30Days[key] = { date: key, dateObj: d, count: 0, closures: 0 };
      }
      last30Days[key].count++;
    });

    // Also count closures per day for observations
    obsArray.forEach(obs => {
      if (obs.status === 'Closed' && obs.createdAt) {
        const d = new Date(obs.createdAt);
        const key = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        if (last30Days[key]) {
          last30Days[key].closures++;
        }
      }
    });

    return Object.values(last30Days)
      .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime())
      .map(d => ({
        name: d.date,
        inspections: d.count,
        closures: d.closures
      }))
      .slice(-10);
  }, [inspections, obsArray]);

  const monthlyActivityData = useMemo(() => {
    const parseSafeDate = (dateStr: any) => {
      if (!dateStr) return null;
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? null : d;
    };

    const monthYears = Array.from(new Set([
      ...inspections.map(i => {
        const d = parseSafeDate(i.date);
        return d ? `${d.getMonth()}-${d.getFullYear()}` : null;
      }),
      ...obsArray.map(o => {
        const d = parseSafeDate(o.createdAt);
        return d ? `${d.getMonth()}-${d.getFullYear()}` : null;
      })
    ].filter(Boolean) as string[]));

    const sortedDiscovered = monthYears.sort((a, b) => {
      const [mA, yA] = a.split('-').map(Number);
      const [mB, yB] = b.split('-').map(Number);
      return yA !== yB ? yA - yB : mA - mB;
    }).slice(-24); // Show last 24 active months

    return sortedDiscovered.map(my => {
      const [m, y] = my.split('-').map(Number);
      const monthName = months[m];

      // Robust date resolution logic matching InspectionsView
      const resolveInsDate = (ins: Inspection, insObs: Observation[]) => {
        let finalDate = ins.date;
        const vDate = (dateVal: any) => dateVal && !isNaN(new Date(dateVal).getTime());
        
        if (!vDate(finalDate)) {
          const obsDates = insObs
            .map(o => o.createdAt)
            .filter(vDate)
            .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
          
          if (obsDates.length > 0) {
            finalDate = obsDates[0];
          } else if (ins.createdAt && vDate(ins.createdAt)) {
            finalDate = ins.createdAt;
          }
        }
        return parseSafeDate(finalDate);
      };

      // Find all inspections that "belong" to this month
      const monthInspections = inspections.map(ins => {
        const insObs = obsArray.filter(o => normalizeId(o.inspectionId) === normalizeId(ins.id));
        const resolvedDate = resolveInsDate(ins, insObs);
        return { ...ins, resolvedDate, inspectionObservations: insObs };
      }).filter(ins => {
        return ins.resolvedDate && ins.resolvedDate.getMonth() === m && ins.resolvedDate.getFullYear() === y;
      });

      const inspectionIds = new Set(monthInspections.map(i => normalizeId(i.id)));

      // Observations created in this month
      const createdInMonthObs = obsArray.filter(o => {
        const d = parseSafeDate(o.createdAt);
        return d && d.getMonth() === m && d.getFullYear() === y;
      });

      // Observations belonging to inspections resolved to this month
      const inspectionsObs = obsArray.filter(o => inspectionIds.has(normalizeId(o.inspectionId)));

      // Combined set of all observations relevant to this month
      const allMonthObs = Array.from(new Set([...inspectionsObs, ...createdInMonthObs]));
      const observationCount = allMonthObs.length;

      const locationsSet = new Set<string>();
      
      monthInspections.forEach(ins => {
        const loc = getNormalizedLocation(ins.location);
        if (loc) locationsSet.add(loc);
        
        ins.inspectionObservations.forEach(o => {
          const oLoc = getNormalizedLocation(o.location);
          if (oLoc) locationsSet.add(oLoc);
        });
      });

      createdInMonthObs.forEach(o => {
        const oLoc = getNormalizedLocation(o.location);
        if (oLoc) locationsSet.add(oLoc);
      });

      return {
        id: my,
        month: monthName,
        year: y,
        monthYear: `${monthName} ${y}`,
        index: m,
        inspectionCount: monthInspections.length,
        observationCount,
        siteCount: locationsSet.size,
        sites: Array.from(locationsSet).sort(),
        inspections: monthInspections.map(ins => {
          const locs = new Set<string>();
          const startLoc = getNormalizedLocation(ins.location);
          if (startLoc) locs.add(startLoc);
          
          const relevantObs = ins.inspectionObservations;
          relevantObs.forEach(o => {
            const oLoc = getNormalizedLocation(o.location);
            if (oLoc) locs.add(oLoc);
          });

          return {
            ...ins,
            actionLocations: Array.from(locs),
            obsCount: relevantObs.length,
            section: sections.find(sec => normalizeId(sec.id) === normalizeId(ins.sectionId))
          };
        }),
        observations: allMonthObs,
        unlinkedObservations: allMonthObs.filter(o => !inspectionIds.has(normalizeId(o.inspectionId)))
      };
    });
  }, [inspections, obsArray, months, normalizeId, sections]);

  const selectedMonthData = useMemo(() => {
    if (selectedMonthId === null) return null;
    return monthlyActivityData.find(d => d.id === selectedMonthId);
  }, [selectedMonthId, monthlyActivityData]);

  if (loading) return <div className="flex items-center justify-center h-64 font-medium italic animate-pulse text-slate-400 uppercase tracking-widest text-xs">Syncing sync_pulse_v2...</div>;
 
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 p-8 bg-rose-50 border border-rose-100 rounded-2xl text-center">
        <p className="text-rose-600 font-black uppercase tracking-widest text-xs mb-2">Sync Error</p>
        <p className="text-rose-800 text-sm font-medium mb-4">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-rose-600 text-white rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-rose-700 transition-colors"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Top KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Total Coverage</p>
          <div className="flex items-center justify-between">
            <span className="text-3xl font-black text-slate-800 italic uppercase">{inspections.length}</span>
            <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
               <ClipboardList size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-[10px] font-bold text-emerald-600">
             <TrendingUp size={12} />
             <span>Registry Active</span>
          </div>
        </div>

        <div className="bg-amber-50 p-5 rounded-2xl border border-amber-100 shadow-sm hover:shadow-md transition-all group">
          <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-3">Global Register</p>
          <div className="flex items-center justify-between">
            <span className="text-3xl font-black text-slate-800 italic uppercase">{obsArray.length}</span>
            <div className="bg-white p-2 rounded-lg text-amber-600 shadow-sm shadow-amber-200 group-hover:scale-110 transition-transform">
               <Activity size={18} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1">
             <div className="h-1.5 w-1.5 rounded-full bg-amber-400"></div>
             <span className="text-[9px] font-black text-amber-700 uppercase tracking-widest tracking-tighter">Total Observations Recorded</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Target Issues</p>
          <div className="flex items-center justify-between">
            <span className="text-3xl font-black text-rose-600 italic uppercase">{totalTargetIssues}</span>
            <div className="bg-rose-50 p-2 rounded-lg text-rose-600 animate-pulse">
               <CircleDashed size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-[10px] font-bold text-rose-400">
             <span>{openCount} NEW • {inProgressCount} IN PROGRESS</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Protocol Health</p>
          <div className="flex items-center justify-between mb-2">
            <span className="text-3xl font-black text-emerald-600 italic uppercase">{obsArray.length > 0 ? Math.round((closedCount / obsArray.length) * 100) : 0}%</span>
            <div className="bg-emerald-50 p-2 rounded-lg text-emerald-600">
               <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="space-y-2">
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
               <motion.div 
                 initial={{ width: 0 }}
                 animate={{ width: `${obsArray.length > 0 ? (closedCount / obsArray.length) * 100 : 0}%` }}
                 className="h-full bg-emerald-500 rounded-full" 
               />
            </div>
            <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-tighter">
               <span className="text-emerald-600">{closedCount} RESOLVED</span>
               <span className="text-slate-400">/ {obsArray.length} FIELD OBS</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 p-5 rounded-2xl shadow-xl shadow-slate-900/10 text-white group">
          <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-3">Sites Coverage</p>
          <div className="flex items-center justify-between">
            <span className="text-3xl font-black text-white italic uppercase">
              {new Set([
                ...enrichedInspections.map(i => getNormalizedLocation(i.location)).filter(Boolean),
                ...obsArray.map(o => getNormalizedLocation(o.location)).filter(Boolean)
              ]).size}
            </span>
            <div className="bg-white/10 p-2 rounded-lg text-blue-400 group-hover:scale-110 transition-transform">
               <MapPin size={18} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
             <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
             <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Unique Locations Inspected</span>
          </div>
        </div>
      </div>

      {/* Monthly Activity Matrix */}
      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2">
               <Calendar size={14} className="text-blue-600" />
               Operational Site Coverage Matrix
            </h3>
            <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Unique sites visited per operational month</p>
          </div>
          <span className="text-[10px] font-black text-slate-300 font-mono italic">{new Date().getFullYear()}</span>
        </div>
        
        <div className="p-8">
          <div className="flex flex-wrap justify-center gap-4">
            {monthlyActivityData.map((data) => (
              <motion.button
                key={data.id}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelectedMonthId(data.id)}
                className={cn(
                  "relative min-w-[120px] p-5 rounded-2xl border transition-all flex flex-col items-center justify-center gap-2 group text-center shadow-sm cursor-pointer",
                  selectedMonthId === data.id ? "bg-blue-600 border-blue-600 shadow-blue-500/20" : "bg-white border-slate-200 hover:border-blue-500 hover:shadow-xl hover:shadow-blue-500/10"
                )}
              >
                <p className={cn(
                  "text-[9px] font-black uppercase tracking-[0.15em]",
                  selectedMonthId === data.id ? "text-blue-100" : "text-slate-400 group-hover:text-blue-600"
                )}>
                  {data.month.substring(0, 3)} <span className={cn(
                    selectedMonthId === data.id ? "text-white" : "text-slate-300 group-hover:text-blue-400"
                  )}>{data.year}</span>
                </p>
                <div className="flex items-baseline gap-1">
                  <span className={cn(
                    "text-2xl font-black italic tracking-tighter group-hover:scale-110 transition-transform",
                    selectedMonthId === data.id ? "text-white" : "text-slate-900"
                  )}>
                    {data.siteCount}
                  </span>
                </div>
                <div className={cn(
                  "text-[8px] font-black uppercase tracking-widest",
                  selectedMonthId === data.id ? "text-blue-100" : "text-slate-400"
                )}>
                  {data.siteCount === 1 ? 'Site' : 'Sites'}
                </div>
                {data.siteCount > 0 && selectedMonthId !== data.id && (
                  <div className="absolute top-3 right-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                  </div>
                )}
              </motion.button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inspection Trends */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col"
        >
          <div className="px-5 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h3 className="text-sm font-bold flex items-center gap-2">
               <TrendingUp size={14} className="text-blue-600" />
               Operational Velocity
            </h3>
            <span className="text-[9px] text-slate-400 font-mono italic">trend_analysis_v1</span>
          </div>
          <div className="p-6 h-[250px]">
             <ResponsiveContainer width="100%" height="100%">
               <AreaChart data={trendData}>
                 <defs>
                   <linearGradient id="colorIns" x1="0" y1="0" x2="0" y2="1">
                     <stop offset="5%" stopColor="#2563EB" stopOpacity={0.1}/>
                     <stop offset="95%" stopColor="#2563EB" stopOpacity={0}/>
                   </linearGradient>
                   <linearGradient id="colorClo" x1="0" y1="0" x2="0" y2="1">
                     <stop offset="5%" stopColor="#10B981" stopOpacity={0.1}/>
                     <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                   </linearGradient>
                 </defs>
                 <XAxis 
                   dataKey="name" 
                   axisLine={false} 
                   tickLine={false} 
                   tick={{ fontSize: 9, fill: '#94A3B8' }}
                 />
                 <YAxis hide />
                 <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', fontSize: '10px' }}
                 />
                 <Area type="monotone" dataKey="inspections" stroke="#2563EB" fillOpacity={1} fill="url(#colorIns)" strokeWidth={2} name="Inspections" />
                 <Area type="monotone" dataKey="closures" stroke="#10B981" fillOpacity={1} fill="url(#colorClo)" strokeWidth={2} name="Closures" />
               </AreaChart>
             </ResponsiveContainer>
          </div>
          <div className="px-5 py-3 border-t border-slate-50 flex gap-4">
             <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-600"></div>
                <span className="text-[8px] font-bold text-slate-500 uppercase">Input Velocity</span>
             </div>
             <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                <span className="text-[8px] font-bold text-slate-500 uppercase">Resolution Velocity</span>
             </div>
          </div>
        </motion.div>

        {/* Observation Status Distribution */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col"
        >
          <div className="px-5 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h3 className="text-sm font-bold flex items-center gap-2">
               <TrendingUp size={14} className="text-slate-400" />
               Current Status Mix
            </h3>
            <span className="text-[9px] text-slate-400 font-mono italic">status_distribution_v2</span>
          </div>
          <div className="p-6 h-[250px]">
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={pieData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                 <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#64748B', fontWeight: 'bold' }} 
                 />
                 <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94A3B8' }} />
                 <Tooltip 
                    cursor={{ fill: '#F8FAFC' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', fontSize: '10px' }}
                 />
                 <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={40}>
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                 </Bar>
               </BarChart>
             </ResponsiveContainer>
          </div>
          <div className="px-5 py-3 border-t border-slate-50 flex justify-between">
             <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Total Observations: {obsArray.length}</p>
             <Link to="/inspections" className="text-[9px] font-bold text-blue-600 uppercase tracking-widest hover:underline">View Details →</Link>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Section Readiness Matrix */}
        <div className="lg:col-span-4 bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div>
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2">
                 <Activity size={14} className="text-blue-600" />
                 Operational Section Integrity
              </h3>
              <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Cross-departmental Protocol Compliance & Success Rate</p>
            </div>
          </div>
          
          <div className="p-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {sectionData.map((data, idx) => (
                <motion.div
                  key={data.id || data.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="group relative bg-white border border-slate-100 rounded-[2rem] p-6 hover:shadow-2xl hover:shadow-blue-500/10 hover:border-blue-200 transition-all border-b-4 border-b-slate-100 hover:border-b-blue-500"
                >
                  <div className="flex justify-between items-start mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-all">
                      <ClipboardList size={22} />
                    </div>
                    <div className="text-right">
                      <div className={cn(
                        "text-2xl font-black italic leading-none mb-1",
                        data.rate > 80 ? "text-emerald-500" : data.rate > 50 ? "text-blue-600" : "text-rose-500"
                      )}>
                        {Math.round(data.rate)}%
                      </div>
                      <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">READY</div>
                    </div>
                  </div>

                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-tight mb-4 group-hover:text-blue-600 transition-colors line-clamp-1">
                    {data.name}
                  </h4>

                  {/* Progress visualization */}
                  <div className="space-y-3">
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${data.rate}%` }}
                        className={cn(
                          "h-full rounded-full transition-all duration-1000",
                          data.rate > 80 ? "bg-emerald-500" : data.rate > 50 ? "bg-blue-600" : "bg-rose-500"
                        )}
                      />
                    </div>
                    <div className="flex justify-between items-end">
                      <div>
                        <span className="text-[14px] font-black text-slate-900">{data.closed}</span>
                        <span className="text-[10px] font-bold text-slate-400 mx-1">/</span>
                        <span className="text-[10px] font-bold text-slate-400">{data.total}</span>
                        <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Resolutions</div>
                      </div>
                      <div className={cn(
                        "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest",
                        data.rate === 100 ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-400"
                      )}>
                        {data.rate === 100 ? "OPTIMAL" : "PENDING"}
                      </div>
                    </div>
                  </div>

                  {/* Top-right decorative accent */}
                  <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping"></div>
                  </div>
                </motion.div>
              ))}
              
              {sectionData.length === 0 && (
                <div className="col-span-full py-12 text-center bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Initial Assessment Pending</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Location Performance Chart */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h3 className="text-sm font-bold flex items-center gap-2">
               <TrendingUp size={14} className="text-slate-400" />
               Location-wise Protocol Status (Top 10)
            </h3>
            <span className="text-[9px] text-slate-400 font-mono italic">location_status_matrix_v1</span>
          </div>
          <div className="p-6 h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={locationStatusData} 
                layout="vertical" 
                margin={{ left: 20, right: 30, top: 20, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#F1F5F9" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94A3B8' }} />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false} 
                  width={140}
                  tick={{ fontSize: 10, fill: '#64748B', fontWeight: 'bold' }} 
                />
                <Tooltip 
                  cursor={{ fill: '#F8FAFC' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', fontSize: '11px' }}
                />
                <Legend 
                  verticalAlign="top" 
                  align="right"
                  iconType="circle"
                  wrapperStyle={{ paddingBottom: '20px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}
                />
                <Bar 
                  dataKey="closed" 
                  name="Closed" 
                  stackId="a" 
                  fill="#10B981" 
                  barSize={16}
                  radius={[0, 0, 0, 0]}
                />
                <Bar 
                  dataKey="inProgress" 
                  name="In Progress" 
                  stackId="a" 
                  fill="#F59E0B" 
                  barSize={16}
                />
                <Bar 
                  dataKey="open" 
                  name="Open" 
                  stackId="a" 
                  fill="#E11D48" 
                  barSize={16}
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Hotspots & Mix */}
        <div className="space-y-6">
           <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <CircleDashed className="text-rose-500 animate-spin-slow" size={14} />
                Critical Hotspots
              </h3>
              <div className="space-y-3">
                 {topHotspots.map(([loc, count], idx) => (
                   <div key={loc} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 group hover:border-rose-200 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black text-rose-500 bg-rose-50 w-6 h-6 flex items-center justify-center rounded">#{idx + 1}</span>
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-tight">{loc}</span>
                      </div>
                      <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-100">{count} OPEN</span>
                   </div>
                 ))}
                 {topHotspots.length === 0 && (
                   <div className="text-center py-8">
                     <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Zone Status: CLEAR</p>
                   </div>
                 )}
              </div>
           </div>

           <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col flex-1">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-sm font-bold uppercase tracking-widest text-[10px]">Observation Resolution Mix</h3>
              </div>
              <div className="p-4 flex flex-col items-center">
                  <div className="h-48 w-full relative">
                     <ResponsiveContainer width="100%" height="100%">
                       <PieChart>
                         <Pie
                           data={pieData}
                           innerRadius={55}
                           outerRadius={75}
                           paddingAngle={8}
                           dataKey="value"
                           stroke="none"
                         >
                           {pieData.map((entry, index) => (
                             <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                           ))}
                         </Pie>
                         <Tooltip 
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', fontSize: '10px', fontWeight: 'bold' }}
                         />
                       </PieChart>
                     </ResponsiveContainer>
                     <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-2">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1 text-center">Protocol<br/>Closure</p>
                        <p className="text-2xl font-black text-slate-900 leading-none italic">{obsArray.length > 0 ? Math.round((closedCount / obsArray.length) * 100) : 0}%</p>
                     </div>
                  </div>
                  <div className="flex flex-wrap gap-3 mt-4 justify-center">
                     <div className="flex items-center gap-1.5">
                       <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                       <span className="text-[9px] font-bold text-slate-500 uppercase">Open</span>
                     </div>
                     <div className="flex items-center gap-1.5">
                       <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                       <span className="text-[9px] font-bold text-slate-500 uppercase">In Progress</span>
                     </div>
                     <div className="flex items-center gap-1.5">
                       <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                       <span className="text-[9px] font-bold text-slate-500 uppercase">Closed</span>
                     </div>
                  </div>
              </div>
           </div>
        </div>
      </div>

      {/* Protocol Observation Stream */}
      <div className="space-y-4">
        <div className="flex justify-between items-center px-1">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
            <ClipboardList size={14} className="text-blue-500" />
            Observation Intelligence Stream
          </h3>
          <Link to="/inspections" className="text-[10px] font-bold text-blue-600 hover:underline uppercase tracking-widest">View Archives</Link>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {obsArray.slice(-4).reverse().map((obs) => {
            const displayImage = obs.beforeImageUrl || obs.afterImageUrl;
            return (
              <div key={obs.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden group hover:shadow-lg transition-all flex flex-col">
                 <div className="relative aspect-video bg-slate-100 overflow-hidden">
                   {displayImage ? (
                     <img src={displayImage} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" referrerPolicy="no-referrer" />
                   ) : (
                     <div className="w-full h-full flex items-center justify-center text-slate-300">
                       <ClipboardList size={24} strokeWidth={1} />
                     </div>
                   )}
                   <div className="absolute top-3 left-3">
                     <span className={cn(
                       "px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-tighter shadow-sm",
                       obs.status === 'Open' ? "bg-rose-500 text-white" : 
                       obs.status === 'In Progress' ? "bg-amber-500 text-white" : 
                       "bg-emerald-500 text-white"
                     )}>
                       {obs.status === 'Open' ? 'PENDING' : 
                        obs.status === 'In Progress' ? 'IN PROGRESS' : 
                        'RESOLVED'}
                     </span>
                   </div>
                 </div>
                   <div className="p-4 flex-1 flex flex-col justify-between">
                     <div>
                       <div className="flex justify-between items-start mb-1">
                         <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest line-clamp-1">{getNormalizedLocation(obs.location) || `Inspection ID: ${obs.id}`}</p>
                         <span className="text-[8px] font-mono text-slate-300 shrink-0 ml-2">#{obs.id}</span>
                       </div>
                      <p className="text-xs text-slate-700 font-medium line-clamp-2 italic mb-3">
                        "{obs.description.replace(/<[^>]*>/g, '')}"
                      </p>
                     </div>
                   <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                      <span className="text-[8px] font-mono text-slate-400">{formatDate(obs.createdAt || new Date())}</span>
                      <Link to="/inspections" className="text-slate-300 group-hover:text-blue-600 transition-colors">
                        <ArrowRight size={14} />
                      </Link>
                   </div>
                 </div>
              </div>
            );
          })}
          {obsArray.length === 0 && (
            <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-dashed border-slate-200">
               <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">No observations recorded in register</p>
            </div>
          )}
        </div>
      </div>

      {/* Month Details Modal */}
      <AnimatePresence>
        {selectedMonthData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedMonthId(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-200">
                    <Calendar size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 uppercase italic leading-none">{selectedMonthData.month} Review</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Operational Summary • {selectedMonthData.year}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedMonthId(null)}
                  className="p-2 hover:bg-slate-200 rounded-xl transition-colors text-slate-400 hover:text-slate-800"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-8 overflow-y-auto flex-1 custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-4">Sites Visited ({selectedMonthData.siteCount})</label>
                      <div className="grid grid-cols-1 gap-2">
                        {selectedMonthData.sites.map(site => (
                          <div key={site} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <MapPin size={14} className="text-blue-500" />
                            <span className="text-xs font-bold text-slate-700 uppercase tracking-tight">{site}</span>
                          </div>
                        ))}
                        {selectedMonthData.sites.length === 0 && (
                          <p className="text-[10px] font-bold text-slate-300 italic uppercase">No site activity recorded</p>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-6">
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-4">Activity Log</label>
                      <div className="space-y-3">
                        {selectedMonthData.inspections.map((ins: any) => (
                          <div key={ins.id} className="group p-4 border border-slate-100 rounded-2xl hover:border-blue-400 hover:shadow-lg hover:shadow-blue-500/5 transition-all bg-white relative overflow-hidden">
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase">{ins.id}</span>
                              <span className="text-[10px] font-bold text-slate-400">{formatDate(new Date(ins.date))}</span>
                            </div>
                            
                            <div className="space-y-1">
                               {ins.actionLocations && ins.actionLocations.length > 1 ? (
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-1.5">
                                      <MapPin size={10} className="text-blue-500" />
                                      <span className="text-[8px] font-black text-blue-600 uppercase tracking-widest">Multi-Site Inspection</span>
                                    </div>
                                    <p className="text-[11px] font-black text-slate-900 uppercase tracking-tight leading-tight">
                                      {ins.actionLocations.join(' + ')}
                                    </p>
                                  </div>
                               ) : (
                                  <p className="text-xs font-bold text-slate-800 uppercase tracking-tight line-clamp-1">
                                    {getNormalizedLocation(ins.location) || (ins.actionLocations && ins.actionLocations[0]) || `Project: ${ins.id}`}
                                  </p>
                               )}
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                               <div className="flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded text-[8px] font-bold text-slate-500">
                                 <Activity size={10} className="text-blue-400" />
                                 <span>{ins.obsCount} OBS</span>
                               </div>
                               {ins.section?.name && (
                                 <div className="flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded text-[8px] font-bold text-blue-600">
                                   <ClipboardList size={10} />
                                   <span>{ins.section.name}</span>
                                 </div>
                               )}
                            </div>
                            <div className="mt-3 flex items-center justify-between pt-3 border-t border-slate-50">
                               <div className="flex items-center gap-1.5">
                                 <Users size={12} className="text-slate-300" />
                                 <span className="text-[9px] font-bold text-slate-400 uppercase truncate max-w-[100px]">{ins.auditor || 'System Inspection'}</span>
                               </div>
                               <Link 
                                 to={`/inspections?search=${ins.id}`} 
                                 className="text-[9px] font-black text-blue-600 uppercase hover:underline flex items-center gap-1"
                                 onClick={() => setSelectedMonthId(null)}
                               >
                                 Details <ArrowRight size={10} />
                               </Link>
                            </div>
                          </div>
                        ))}
                        {selectedMonthData.inspections.length === 0 && (
                          <p className="text-[10px] font-bold text-slate-300 italic uppercase underline decoration-dotted">Historical data unavailable</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Orphan Observations Section */}
                {selectedMonthData.unlinkedObservations && selectedMonthData.unlinkedObservations.length > 0 && (
                  <div className="mt-8 pt-8 border-t border-slate-100">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-4">Direct Observations ({selectedMonthData.unlinkedObservations.length})</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedMonthData.unlinkedObservations.map((obs: any) => (
                        <div key={obs.id} className="p-4 bg-slate-50/50 border border-slate-100 rounded-2xl flex items-start gap-3">
                          <Activity size={16} className="text-amber-500 mt-1 shrink-0" />
                          <div className="flex-1">
                            <div className="flex justify-between items-start mb-1">
                              <span className="text-[8px] font-black text-slate-400 uppercase">Independent • {formatDate(new Date(obs.createdAt))}</span>
                              <span className={cn(
                                "text-[7px] font-black uppercase px-1.5 py-0.5 rounded",
                                obs.status === 'Open' ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-600"
                              )}>{obs.status}</span>
                            </div>
                            <p className="text-xs font-medium text-slate-700 italic line-clamp-2 mb-2">"{obs.description.replace(/<[^>]*>/g, '')}"</p>
                            <div className="flex justify-between items-end">
                              <p className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1">
                                <MapPin size={8} /> {getNormalizedLocation(obs.location) || 'Unknown Location'}
                              </p>
                              <Link 
                                to={`/inspections?location=${getNormalizedLocation(obs.location)}&month=${selectedMonthData.month}&year=${selectedMonthData.year}`}
                                className="text-[8px] font-black text-blue-600 uppercase hover:underline flex items-center gap-1"
                                onClick={() => setSelectedMonthId(null)}
                              >
                                View Record Set <ArrowRight size={8} />
                              </Link>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="p-8 bg-slate-900 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-6 text-white shrink-0">
                <div className="flex gap-8">
                  <div className="text-center md:text-left">
                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">Total Activities</p>
                    <p className="text-2xl font-black italic text-blue-400">{selectedMonthData.inspections.length} Projects</p>
                  </div>
                  <div className="text-center md:text-left">
                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">Total Observations</p>
                    <p className="text-2xl font-black italic text-amber-400">{selectedMonthData.observationCount} Found</p>
                  </div>
                  <div className="text-center md:text-left">
                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">Coverage Area</p>
                    <p className="text-2xl font-black italic text-emerald-400">{selectedMonthData.siteCount} Unique</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    to={`/inspections?month=${selectedMonthData.month}&year=${selectedMonthData.year}`}
                    className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2 group"
                    onClick={() => setSelectedMonthId(null)}
                  >
                    View All Record Set <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                  </Link>
                  <button 
                    onClick={() => setSelectedMonthId(null)}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-500/20 transition-all active:scale-95 flex items-center gap-2"
                  >
                    Close Summary
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
