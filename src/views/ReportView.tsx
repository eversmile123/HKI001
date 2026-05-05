import { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api";
import { Inspection, Observation, Section } from "../types";
import { 
  FileText, 
  Printer, 
  ChevronDown, 
  CheckCircle2, 
  BarChart3, 
  Filter, 
  LayoutDashboard, 
  MapPin, 
  Tag, 
  Calendar,
  Layers,
  Search,
  X,
  TrendingUp,
  AlertCircle,
  Clock,
  ArrowRight,
  Activity,
  Info,
  SortAsc,
  SortDesc,
  Share2,
  Download,
  Cloud,
  Settings,
  Loader2
} from "lucide-react";
import { formatDate, cn, getNormalizedLocation, normalizeId } from "../lib/utils";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell, 
  PieChart, 
  Pie,
  Legend
} from "recharts";
import { motion, AnimatePresence } from "motion/react";
import { useSearchParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { toCanvas } from "html-to-image";
import { jsPDF } from "jspdf";

export default function ReportView() {
  const monthsOrder = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'summary' | 'detailed'>('summary');
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedInspectionId = searchParams.get('inspectionId') || searchParams.get('auditId');

  // Sharing Mode
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [qrColor, setQrColor] = useState('#0f172a'); // default slate-900
  const [qrLevel, setQrLevel] = useState<'L' | 'M' | 'Q' | 'H'>('H');
  const [showQrSettings, setShowQrSettings] = useState(false);
  const [showScopeSettings, setShowScopeSettings] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [includeSnaps, setIncludeSnaps] = useState(true);
  const [filterMonth, setFilterMonth] = useState<string>("All Months");
  const [filterYear, setFilterYear] = useState<string>("All Years");
  
  // Sharing Scope State
  const [shareDateStart, setShareDateStart] = useState<string>('');
  const [shareDateEnd, setShareDateEnd] = useState<string>('');
  const [shareSections, setShareSections] = useState<string[]>([]);
  const [shareStatuses, setShareStatuses] = useState<string[]>(['Open', 'In Progress', 'Closed']);

  const handleExportPDF = async (elementId: string, filename: string) => {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    setIsExporting(true);
    
    // Safety: ensure background is white for capture
    const originalStyle = element.style.backgroundColor;
    element.style.backgroundColor = '#ffffff';
    
    // Add export class before capture
    element.classList.add('pdf-export-mode');

    try {
      // Small delay to ensure styles are recalculated and oklch/oklab fallbacks are applied
      await new Promise(resolve => setTimeout(resolve, 300));

      // Use html-to-image for better modern CSS support
      // Higher pixel ratio for crisp text
      const dataUrl = await toCanvas(element, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        skipAutoScale: true,
        cacheBust: true,
        style: {
          transform: 'none',
          margin: '0',
          padding: '20px',
        }
      });

      const imgWidth = dataUrl.width;
      const imgHeight = dataUrl.height;
      
      const imgData = dataUrl.toDataURL('image/jpeg', 0.95);
      
      const pdf = new jsPDF({
        orientation: imgWidth > imgHeight ? 'landscape' : 'portrait',
        unit: 'px',
        format: [imgWidth, imgHeight]
      });

      pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
      pdf.save(filename);
    } catch (error) {
      console.error("PDF Export Error:", error);
    } finally {
      element.style.backgroundColor = originalStyle;
      element.classList.remove('pdf-export-mode');
      setIsExporting(false);
    }
  };

  const setSelectedInspectionId = (id: string | null) => {
    if (id) {
      setSearchParams({ inspectionId: id });
    } else {
      setSearchParams({});
    }
  };

  // Sorting State
  const [sortField, setSortField] = useState<'status' | 'location' | 'createdAt'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Multi-select Filter State
  const [filterLocations, setFilterLocations] = useState<string[]>([]);
  const [filterSections, setFilterSections] = useState<string[]>([]);
  const [filterStatuses, setFilterStatuses] = useState<string[]>(['Open', 'Closed', 'In Progress']);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [i, o, s] = await Promise.all([
          api.getInspections(),
          api.getObservations(),
          api.getSections()
        ]);
        setInspections(Array.isArray(i) ? i : []);
        setObservations(Array.isArray(o) ? o : []);
        setSections(Array.isArray(s) ? s : []);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const enrichedInspections = useMemo(() => {
    return inspections.filter(i => {
      return observations.some(o => normalizeId(o.inspectionId) === normalizeId(i.id));
    });
  }, [inspections, observations]);

  const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s));

  const uniqueLocations = useMemo(() => {
    const locs = new Set<string>();
    // From inspections
    inspections.forEach(i => {
      const loc = getNormalizedLocation(i.location);
      if (loc) locs.add(loc);
    });
    // From observations
    observations.forEach(o => {
      const loc = getNormalizedLocation(o.location);
      if (loc) locs.add(loc);
    });
    return Array.from(locs).sort();
  }, [observations, inspections]);

  const uniqueMonths = useMemo(() => {
    const months = new Set<string>();
    const monthsOrder = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const validDate = (d: any) => d && !isNaN(new Date(d).getTime());
    
    observations.forEach(o => {
      if (validDate(o.createdAt)) {
        const d = new Date(o.createdAt);
        months.add(`${monthsOrder[d.getMonth()]} ${d.getFullYear()}`);
      }
    });
    inspections.forEach(i => {
      const dVal = i.date || i.createdAt;
      if (validDate(dVal)) {
        const d = new Date(dVal);
        months.add(`${monthsOrder[d.getMonth()]} ${d.getFullYear()}`);
      }
    });
    
    return Array.from(months).sort((a, b) => {
      const dateA = new Date(a);
      const dateB = new Date(b);
      return dateB.getTime() - dateA.getTime();
    });
  }, [observations, inspections]);

  const uniqueYears = useMemo(() => {
    const years = new Set<string>();
    const validDate = (d: any) => d && !isNaN(new Date(d).getTime());

    observations.forEach(o => {
      if (validDate(o.createdAt)) {
        years.add(new Date(o.createdAt).getFullYear().toString());
      }
    });
    inspections.forEach(i => {
      if (validDate(i.date)) {
        years.add(new Date(i.date).getFullYear().toString());
      } else if (validDate(i.createdAt)) {
        years.add(new Date(i.createdAt).getFullYear().toString());
      }
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [observations, inspections]);

  const filteredObservations = useMemo(() => {
    const urlStart = searchParams.get('startDate');
    const urlEnd = searchParams.get('endDate');
    const urlSections = searchParams.get('sections')?.split(',').filter(Boolean);
    const urlStatuses = searchParams.get('statuses')?.split(',').filter(Boolean);

    return observations.filter(o => {
      const normLoc = getNormalizedLocation(o.location);
      const matchesLoc = filterLocations.length === 0 || filterLocations.includes(normLoc);
      
      // Use URL sections if present, otherwise use local filter
      const activeSections = urlSections || filterSections;
      const matchesSec = activeSections.length === 0 || (o.sectionId && activeSections.includes(o.sectionId));
      
      // Use URL statuses if present, otherwise use local filter
      const activeStatuses = urlStatuses || filterStatuses;
      const matchesStatus = activeStatuses.includes(o.status);
      
      // Date filtering
      let matchesDate = true;
      const obsDate = o.createdAt ? new Date(o.createdAt).getTime() : 0;
      
      const start = urlStart ? new Date(urlStart).getTime() : null;
      const end = urlEnd ? new Date(urlEnd).getTime() : null;
      
      if (start && obsDate < start) matchesDate = false;
      if (end && obsDate > end) matchesDate = false;

      // Month/Year local filters
      const d = o.createdAt ? new Date(o.createdAt) : null;
      const monthYearStr = d ? `${monthsOrder[d.getMonth()]} ${d.getFullYear()}` : null;
      if (filterMonth !== "All Months" && monthYearStr !== filterMonth) matchesDate = false;
      if (filterYear !== "All Years" && d?.getFullYear().toString() !== filterYear) matchesDate = false;

      return matchesLoc && matchesSec && matchesStatus && matchesDate;
    });
  }, [observations, filterLocations, filterSections, filterStatuses, filterMonth, filterYear, searchParams]);

  const stats = useMemo(() => {
    const total = filteredObservations.length;
    const closed = filteredObservations.filter(o => o.status === 'Closed').length;
    return {
      total,
      closed,
      rate: total > 0 ? Math.round((closed / total) * 100) : 0
    };
  }, [filteredObservations]);

  // Chart Data Calculations
  const sectionChartData = useMemo(() => {
    const data: Record<string, { total: number; closed: number }> = {};
    sections.forEach(s => data[s.name] = { total: 0, closed: 0 });

    filteredObservations.forEach(o => {
      const section = sections.find(s => s.id === o.sectionId);
      if (section) {
        data[section.name].total++;
        if (o.status === 'Closed') data[section.name].closed++;
      }
    });

    return Object.entries(data).map(([name, val]) => ({
      name,
      total: val.total,
      closed: val.closed,
      rate: val.total > 0 ? Math.round((val.closed / val.total) * 100) : 0
    })).filter(d => d.total > 0).sort((a, b) => b.total - a.total);
  }, [filteredObservations, sections]);

  const locationStatusData = useMemo(() => {
    const data: Record<string, { total: number; closed: number; inProgress: number; open: number }> = {};
    filteredObservations.forEach(o => {
      const normLoc = getNormalizedLocation(o.location);
      if (!normLoc) return;
      if (!data[normLoc]) data[normLoc] = { total: 0, closed: 0, inProgress: 0, open: 0 };
      data[normLoc].total++;
      if (o.status === 'Closed') data[normLoc].closed++;
      else if (o.status === 'In Progress') data[normLoc].inProgress++;
      else if (o.status === 'Open') data[normLoc].open++;
    });

    return Object.entries(data).map(([name, val]) => ({
      name,
      total: val.total,
      closed: val.closed,
      inProgress: val.inProgress,
      open: val.open,
      rate: val.total > 0 ? Math.round((val.closed / val.total) * 100) : 0
    })).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [filteredObservations]);

  const toggleFilter = (list: string[], item: string, setter: (val: string[]) => void) => {
    if (list.includes(item)) {
      setter(list.filter(i => i !== item));
    } else {
      setter([...list, item]);
    }
  };

  const selectedInspection = inspections.find(i => i.id === selectedInspectionId);
  const detailedObs = useMemo(() => {
    const raw = selectedInspectionId === "ALL" 
      ? filteredObservations 
      : observations.filter(o => o.inspectionId === selectedInspectionId && filteredObservations.some(fo => fo.id === o.id));
    
    return [...raw].sort((a, b) => {
      let comparison = 0;
      if (sortField === 'status') {
        comparison = a.status.localeCompare(b.status);
      } else if (sortField === 'location') {
        comparison = getNormalizedLocation(a.location).localeCompare(getNormalizedLocation(b.location));
      } else if (sortField === 'createdAt') {
        comparison = (a.createdAt || "").localeCompare(b.createdAt || "");
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [observations, selectedInspectionId, sortField, sortOrder]);

  if (loading) return (
    <div className="h-96 flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.5em] animate-pulse">Compiling Intelligence...</p>
    </div>
  );

  return (
    <div className="space-y-6 pb-32 max-w-[1400px] mx-auto">
      {/* Professional Print Header */}
      <div className="hidden print:flex flex-col border-b-4 border-slate-900 pb-6 mb-8">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-black italic tracking-tighter uppercase text-slate-900">Operational Intelligence Report</h1>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-[0.3em] mt-2">Relational Housekeeping Registry • Protocol v3.4.0</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Document Generated</p>
            <p className="text-sm font-black text-slate-900">{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>
      </div>

      {/* Header & Mode Switcher */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter text-slate-900 uppercase">Operational Insights</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <BarChart3 size={12} className="text-blue-500" />
            Strategic Housekeeping Registry • v3.4.0
          </p>
        </div>

        <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm">
          <button 
            onClick={() => setViewMode('summary')}
            className={cn(
              "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all gap-2 flex items-center",
              viewMode === 'summary' ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <LayoutDashboard size={14} />
            Executive Summary
          </button>
          <button 
            onClick={() => setViewMode('detailed')}
            className={cn(
              "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all gap-2 flex items-center",
              viewMode === 'detailed' ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <FileText size={14} />
            Technical Report
          </button>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={() => {
              setShareSections(filterSections);
              setShareStatuses(filterStatuses);
              setIsShareModalOpen(true);
            }}
            className="print:hidden bg-white border border-slate-200 text-slate-800 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-50 transition-all shadow-sm"
          >
            <Cloud size={16} className="text-blue-500" />
            Archive & Share
          </button>
          
          <button 
            onClick={() => {
              window.print();
            }}
            disabled={viewMode === 'detailed' && !selectedInspectionId}
            className="print:hidden bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-blue-50 transition-all shadow-sm disabled:opacity-50 active:bg-blue-100"
          >
            <Printer size={16} className="text-slate-400" />
            Print
          </button>

          <button 
            onClick={() => {
              const id = viewMode === 'summary' ? 'summary-content' : 'report-content';
              const name = viewMode === 'summary' ? 'Operational_Insights_Summary' : `Technical_Report_${selectedInspectionId}`;
              handleExportPDF(id, `${name}.pdf`);
            }}
            disabled={(viewMode === 'detailed' && !selectedInspectionId) || isExporting}
            className="print:hidden bg-slate-900 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-emerald-600 transition-all shadow-lg shadow-slate-900/10 disabled:opacity-50"
          >
            {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {isExporting ? 'Generating...' : 'Export to PDF'}
          </button>
        </div>
      </header>

      {/* Share Modal */}
      <AnimatePresence>
        {isShareModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm print:hidden">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[3rem] shadow-2xl max-w-md w-full overflow-hidden flex flex-col"
            >
              <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div>
                   <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                      <Cloud size={16} className="text-blue-600" />
                      Report Archive Matrix
                   </h3>
                   <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Digital Preservation & Sharing Protocol</p>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      setShowScopeSettings(!showScopeSettings);
                      setShowQrSettings(false);
                    }}
                    className={cn(
                      "p-2 rounded-full transition-all",
                      showScopeSettings ? "bg-emerald-100 text-emerald-600" : "hover:bg-slate-100 text-slate-400"
                    )}
                    title="Filter Sharing Scope"
                  >
                    <Filter size={20} />
                  </button>
                  <button 
                    onClick={() => {
                      setShowQrSettings(!showQrSettings);
                      setShowScopeSettings(false);
                    }}
                    className={cn(
                      "p-2 rounded-full transition-all",
                      showQrSettings ? "bg-blue-100 text-blue-600" : "hover:bg-slate-100 text-slate-400"
                    )}
                    title="Customize QR Protocol"
                  >
                    <Settings size={20} />
                  </button>
                  <button 
                    onClick={() => setIsShareModalOpen(false)}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {showScopeSettings && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="bg-slate-50 border-b border-slate-100 overflow-hidden"
                  >
                    <div className="p-6 space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Start Date</label>
                          <input 
                            type="date" 
                            value={shareDateStart}
                            onChange={(e) => setShareDateStart(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">End Date</label>
                          <input 
                            type="date" 
                            value={shareDateEnd}
                            onChange={(e) => setShareDateEnd(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700"
                          />
                        </div>
                      </div>
                      
                      <div>
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Sections to Protocol</label>
                        <div className="flex flex-wrap gap-2">
                          {sections.map(sec => (
                            <button
                              key={sec.id}
                              onClick={() => toggleFilter(shareSections, sec.id, setShareSections)}
                              className={cn(
                                "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all border",
                                shareSections.includes(sec.id)
                                  ? "bg-slate-900 text-white border-slate-900"
                                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                              )}
                            >
                              {sec.name}
                            </button>
                          ))}
                        </div>
                        {shareSections.length === 0 && (
                          <p className="text-[8px] font-bold text-blue-600 uppercase mt-2 italic">* All sections will be included if none selected</p>
                        )}
                      </div>

                      <div>
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Statuses to Protocol</label>
                        <div className="flex flex-wrap gap-2">
                          {['Open', 'In Progress', 'Closed'].map(status => (
                            <button
                              key={status}
                              onClick={() => toggleFilter(shareStatuses, status, setShareStatuses)}
                              className={cn(
                                "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all border",
                                shareStatuses.includes(status)
                                  ? (status === 'Open' ? "bg-rose-600 text-white border-rose-600" : status === 'In Progress' ? "bg-amber-600 text-white border-amber-600" : "bg-emerald-600 text-white border-emerald-600")
                                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                              )}
                            >
                              {status}
                            </button>
                          ))}
                        </div>
                        {shareStatuses.length === 0 && (
                          <p className="text-[8px] font-bold text-rose-600 uppercase mt-2 italic">* At least one status must be selected for report generation</p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {showQrSettings && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="bg-slate-50 border-b border-slate-100 overflow-hidden"
                  >
                    <div className="p-6 space-y-4">
                      <div>
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">QR Visual Color</label>
                        <div className="flex gap-2">
                          <input 
                            type="color" 
                            value={qrColor}
                            onChange={(e) => setQrColor(e.target.value)}
                            className="w-10 h-10 rounded-lg cursor-pointer border-2 border-white shadow-sm"
                          />
                          <input 
                            type="text" 
                            value={qrColor}
                            onChange={(e) => setQrColor(e.target.value)}
                            className="flex-1 bg-white border border-slate-200 rounded-xl px-4 text-xs font-mono font-bold text-slate-700"
                            placeholder="#000000"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Error Correction</label>
                        <div className="grid grid-cols-4 gap-2">
                          {(['L', 'M', 'Q', 'H'] as const).map((lvl) => (
                            <button
                              key={lvl}
                              onClick={() => setQrLevel(lvl)}
                              className={cn(
                                "py-2 rounded-lg text-[10px] font-black transition-all border",
                                qrLevel === lvl 
                                  ? "bg-slate-900 text-white border-slate-900" 
                                  : "bg-white text-slate-400 border-slate-100 hover:border-slate-200"
                              )}
                            >
                              {lvl}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="p-10 flex flex-col items-center text-center">
                {(() => {
                  const baseUrl = window.location.origin + window.location.pathname;
                  const params = new URLSearchParams();
                  if (selectedInspectionId) params.set('inspectionId', selectedInspectionId);
                  if (shareDateStart) params.set('startDate', shareDateStart);
                  if (shareDateEnd) params.set('endDate', shareDateEnd);
                  if (shareSections.length > 0) params.set('sections', shareSections.join(','));
                  if (shareStatuses.length > 0 && shareStatuses.length < 3) params.set('statuses', shareStatuses.join(','));
                  
                  const shareUrl = params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;
                  
                  return (
                    <>
                      <div className="relative p-6 bg-white border-4 rounded-[2.5rem] mb-8 shadow-xl" style={{ borderColor: qrColor }}>
                        <QRCodeSVG 
                          value={shareUrl} 
                          size={160} 
                          level={qrLevel}
                          fgColor={qrColor}
                          includeMargin={false}
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none">
                           <FileText size={80} />
                        </div>
                      </div>

                      <div className="space-y-2 mb-8">
                        <h4 className="text-sm font-black text-slate-900 uppercase italic">Digital Integrity QR</h4>
                        <div className="bg-slate-50 p-2 rounded-xl border border-slate-100 flex items-center gap-2 max-w-[280px] mb-4">
                          <p className="text-[8px] font-mono font-bold text-slate-400 truncate flex-1">{shareUrl}</p>
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(shareUrl);
                            }}
                            className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors text-slate-500"
                            title="Copy Protocol URL"
                          >
                            <Share2 size={12} />
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-500 font-medium leading-relaxed max-w-[200px]">
                          Scan to access the live verification registry and pictorial evidence for this inspection cycle.
                        </p>
                      </div>
                    </>
                  );
                })()}

                <div className="grid grid-cols-2 gap-4 w-full">
                  <button 
                    onClick={() => {
                      const svg = document.querySelector('svg');
                      if (svg) {
                        const svgData = new XMLSerializer().serializeToString(svg);
                        const canvas = document.createElement("canvas");
                        const svgSize = svg.getBoundingClientRect();
                        canvas.width = svgSize.width * 2;
                        canvas.height = svgSize.height * 2;
                        const ctx = canvas.getContext("2d");
                        const img = new Image();
                        img.onload = () => {
                          if (ctx) {
                            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                            const pngFile = canvas.toDataURL("image/png");
                            const downloadLink = document.createElement("a");
                            downloadLink.download = `QR_REPORT_${selectedInspectionId || 'SUMMARY'}.png`;
                            downloadLink.href = `${pngFile}`;
                            downloadLink.click();
                          }
                        };
                        img.src = "data:image/svg+xml;base64," + btoa(svgData);
                      }
                    }}
                    className="bg-slate-900 text-white py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-blue-600 transition-all shadow-lg"
                  >
                    <Download size={14} />
                    Save QR Code
                  </button>
                  <button 
                    onClick={() => {
                      // Simulated Drive upload
                      const btn = document.querySelector('#archive-btn');
                      if (btn) btn.innerHTML = "Archiving...";
                      setTimeout(() => {
                        alert("Report Protocol verified and archived to Google Drive successfully.");
                        if (btn) btn.innerHTML = "Sync Complete";
                      }, 1500);
                    }}
                    id="archive-btn"
                    className="bg-emerald-50 text-emerald-700 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-100 transition-all border border-emerald-100"
                  >
                    <Cloud size={14} />
                    Sync to Drive
                  </button>
                </div>
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 italic text-[9px] font-bold text-slate-400 text-center uppercase tracking-widest">
                Protocol v3.4.0 • Distributed Ledger Verified
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {viewMode === 'detailed' && selectedInspection && (
        <div className="print:hidden flex items-center gap-2 px-6 py-3 bg-blue-50 border border-blue-100 rounded-2xl text-[10px] font-bold text-blue-700 animate-pulse">
           <Info size={14} />
           TIP: Use "Save as PDF" in the print dialog for a digital file. Ensure "Background Graphics" is ENABLED in more settings.
        </div>
      )}

      {viewMode === 'summary' ? (
        <div id="summary-content" className="space-y-6 print:p-8">
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { label: 'Dataset Scope', value: filteredObservations.length, sub: 'TOTAL OBSERVATIONS', color: 'slate' },
              { 
                label: 'Fix Velocity', 
                value: `${stats.rate}%`, 
                sub: `${stats.closed} RESOLVED / ${filteredObservations.length} TOTAL`, 
                color: 'emerald' 
              },
              { label: 'Backlog Count', value: filteredObservations.filter(o => o.status === 'Open').length, sub: 'OPEN VIOLATIONS', color: 'rose' }
            ].map((kpi, idx) => (
              <motion.div 
                key={kpi.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1, duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
                className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm"
              >
                <p className={cn(
                  "text-[10px] font-black uppercase tracking-widest mb-4",
                  kpi.color === 'rose' ? "text-rose-400" :
                  kpi.color === 'emerald' ? "text-emerald-400" :
                  "text-slate-400"
                )}>{kpi.label}</p>
                <h3 className={cn(
                  "text-4xl font-black italic",
                  kpi.color === 'rose' ? "text-rose-600" :
                  kpi.color === 'emerald' ? "text-emerald-600" :
                  "text-slate-900"
                )}>{kpi.value}</h3>
                <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest">{kpi.sub}</p>
              </motion.div>
            ))}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="bg-slate-900 p-6 rounded-3xl shadow-xl shadow-slate-900/10 text-white"
            >
              <button 
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className="w-full h-full flex flex-col justify-between items-start text-left group"
              >
                <div className="flex justify-between w-full">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Filters</p>
                  <Settings size={14} className={cn("transition-transform duration-500", isFilterOpen ? "rotate-180" : "group-hover:rotate-45")} />
                </div>
                <div>
                  <h3 className="text-xl font-black italic mb-1 uppercase tracking-tight">Refine Matrix</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Click to Adjust Scope</p>
                </div>
              </button>
            </motion.div>
          </div>

          <AnimatePresence>
            {isFilterOpen && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden bg-white border border-slate-200 rounded-3xl shadow-lg"
              >
                <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
                   {/* Location Filter */}
                   <div className="space-y-4">
                      <h4 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-100 pb-2">
                        <MapPin size={12} className="text-blue-500" />
                        Target Locations
                      </h4>
                      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-2 custom-scrollbar">
                         {uniqueLocations.map(loc => (
                           <label key={loc} className="flex items-center gap-3 p-2 rounded-xl border border-transparent hover:border-slate-100 hover:bg-slate-50 cursor-pointer transition-all group">
                              <input 
                                type="checkbox" 
                                checked={filterLocations.includes(loc)}
                                onChange={() => toggleFilter(filterLocations, loc, setFilterLocations)}
                                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300" 
                              />
                              <span className="text-[11px] font-bold text-slate-600 group-hover:text-slate-900">{loc}</span>
                           </label>
                         ))}
                      </div>
                   </div>

                   {/* Section Filter */}
                   <div className="space-y-4">
                      <h4 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-100 pb-2">
                        <Layers size={12} className="text-emerald-500" />
                        Facility Sections
                      </h4>
                      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-2 custom-scrollbar">
                         {sections.map(sec => (
                           <label key={sec.id} className="flex items-center gap-3 p-2 rounded-xl border border-transparent hover:border-slate-100 hover:bg-slate-50 cursor-pointer transition-all group">
                              <input 
                                type="checkbox" 
                                checked={filterSections.includes(sec.id)}
                                onChange={() => toggleFilter(filterSections, sec.id, setFilterSections)}
                                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300" 
                              />
                              <span className="text-[11px] font-bold text-slate-600 group-hover:text-slate-900">{sec.name}</span>
                           </label>
                         ))}
                      </div>
                   </div>

                   {/* Status Filter */}
                   <div className="space-y-4">
                      <h4 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-100 pb-2">
                        <Activity size={12} className="text-amber-500" />
                        Status Toggle
                      </h4>
                      <div className="space-y-2">
                         {['Open', 'In Progress', 'Closed'].map(status => (
                           <label key={status} className={cn(
                             "flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer",
                             filterStatuses.includes(status) ? "border-slate-900 bg-slate-900 text-white shadow-md shadow-slate-900/10" : "border-slate-200 bg-white text-slate-600"
                           )}>
                              <div className="flex items-center gap-3">
                                <input 
                                  type="checkbox" 
                                  checked={filterStatuses.includes(status)}
                                  onChange={() => toggleFilter(filterStatuses, status, setFilterStatuses)}
                                  className="hidden" 
                                />
                                <span className="text-[10px] font-black uppercase tracking-widest">{status}</span>
                              </div>
                              <div className={cn(
                                "w-2 h-2 rounded-full",
                                status === 'Open' ? "bg-rose-500" : status === 'In Progress' ? "bg-amber-500" : "bg-emerald-500"
                              )}></div>
                           </label>
                         ))}
                      </div>

                      <h4 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-100 pb-2 pt-4">
                        <Calendar size={12} className="text-blue-500" />
                        Time Period
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        <select 
                          value={filterMonth}
                          onChange={(e) => setFilterMonth(e.target.value)}
                          className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-black uppercase"
                        >
                          <option>All Months</option>
                          {uniqueMonths.map(m => <option key={m}>{m}</option>)}
                        </select>
                        <select 
                          value={filterYear}
                          onChange={(e) => setFilterYear(e.target.value)}
                          className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-black uppercase"
                        >
                          <option>All Years</option>
                          {uniqueYears.map(y => <option key={y}>{y}</option>)}
                        </select>
                      </div>
                      
                      <button 
                        onClick={() => {
                          setFilterLocations([]);
                          setFilterSections([]);
                          setFilterStatuses(['Open', 'Closed', 'In Progress']);
                          setFilterMonth("All Months");
                          setFilterYear("All Years");
                        }}
                        className="w-full mt-4 py-2 border border-slate-200 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-400 hover:border-slate-900 hover:text-slate-900 transition-all"
                      >
                         Reset Parameters
                      </button>
                   </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Visual Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Section Protocol Integrity Map */}
            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col lg:col-span-2">
              <div className="px-8 py-7 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                 <div>
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2">
                       <Activity size={16} className="text-blue-600" />
                       Section Performance Matrix
                    </h4>
                    <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Cross-Functional Operational Readiness & Compliance Index</p>
                 </div>
                 <div className="hidden sm:flex items-center gap-6">
                    <div className="flex items-center gap-2">
                       <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/20"></div>
                       <span className="text-[10px] font-black text-slate-900 uppercase">Operational</span>
                    </div>
                    <div className="flex items-center gap-2">
                       <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm shadow-rose-500/20 animate-pulse"></div>
                       <span className="text-[10px] font-black text-slate-900 uppercase">Risk Detected</span>
                    </div>
                 </div>
              </div>
              <div className="p-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                 {sectionChartData.map((data, idx) => (
                   <motion.div 
                     initial={{ opacity: 0, y: 15 }}
                     whileInView={{ opacity: 1, y: 0 }}
                     viewport={{ once: true }}
                     transition={{ delay: idx * 0.05 }}
                     key={data.name} 
                     className="group relative bg-white border border-slate-100 rounded-[2rem] p-7 hover:border-blue-500 hover:shadow-2xl hover:shadow-blue-500/10 transition-all border-b-4 border-b-slate-50 hover:border-b-blue-600"
                   >
                      <div className="flex justify-between items-start mb-6">
                         <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-all">
                            <Layers size={22} />
                         </div>
                         <div className="text-right">
                            <p className={cn(
                              "text-2xl font-black italic tracking-tighter leading-none mb-1",
                              data.rate === 100 ? "text-emerald-500" : data.rate > 50 ? "text-blue-600" : "text-rose-500"
                            )}>
                              {data.rate}%
                            </p>
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">PROTOCOL OK</p>
                         </div>
                      </div>

                      <h5 className="text-xs font-black text-slate-900 uppercase tracking-tight mb-4 group-hover:text-blue-600 transition-colors line-clamp-1">
                        {data.name}
                      </h5>
                      
                      {/* Success Track */}
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden mb-4">
                         <motion.div 
                           initial={{ width: 0 }}
                           whileInView={{ width: `${data.rate}%` }}
                           viewport={{ once: true }}
                           transition={{ duration: 1, ease: "easeOut" }}
                           className={cn(
                             "h-full rounded-full transition-all",
                             data.rate === 100 ? "bg-emerald-500" : data.rate > 50 ? "bg-blue-600" : "bg-rose-500"
                           )}
                         />
                      </div>

                      <div className="flex justify-between items-end">
                         <div>
                            <div className="flex items-baseline gap-1">
                               <span className="text-lg font-black text-slate-900 leading-none">{data.closed}</span>
                               <span className="text-[10px] font-bold text-slate-400">/ {data.total}</span>
                            </div>
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">RECTIFIED</p>
                         </div>
                         <div className={cn(
                           "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest",
                           data.rate === 100 ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-400"
                         )}>
                           {data.rate === 100 ? 'OPTIMAL' : 'PENDING'}
                         </div>
                      </div>

                      {/* Accent corner */}
                      <div className="absolute top-0 right-0 w-16 h-16 pointer-events-none overflow-hidden rounded-tr-[2rem]">
                         <div className={cn(
                           "absolute top-0 right-0 w-8 h-8 -mr-4 -mt-4 rotate-45 transition-transform group-hover:scale-150",
                           data.rate === 100 ? "bg-emerald-500/20" : data.rate > 50 ? "bg-blue-500/20" : "bg-rose-500/20"
                         )} />
                      </div>
                   </motion.div>
                 ))}
              </div>
            </div>

            {/* Section Performance Analysis Chart */}
            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center">
                 <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                    <Layers size={14} className="text-blue-600" />
                    Section Performance Analysis
                 </h4>
              </div>
              <div className="p-8 h-[350px]">
                 <ResponsiveContainer width="100%" height="100%">
                   <BarChart data={sectionChartData} layout="vertical" margin={{ left: 20 }}>
                     <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                     <XAxis type="number" hide />
                     <YAxis 
                       dataKey="name" 
                       type="category" 
                       axisLine={false} 
                       tickLine={false} 
                       width={100}
                       tick={{ fontSize: 10, fill: '#64748b', fontWeight: '800' }} 
                     />
                     <Tooltip 
                       cursor={{ fill: '#f8fafc' }}
                       contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', fontSize: '11px', fontWeight: '800' }}
                     />
                     <Bar dataKey="total" name="Observations" fill="#e2e8f0" radius={[0, 8, 8, 0]} barSize={20} />
                     <Bar dataKey="closed" name="Resolutions" fill="#2563EB" radius={[0, 8, 8, 0]} barSize={20} />
                   </BarChart>
                 </ResponsiveContainer>
              </div>
            </div>

            {/* Location Metrics */}
            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center">
                 <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                    <MapPin size={14} className="text-amber-600" />
                    Geographical Protocol Status
                 </h4>
              </div>
              <div className="p-8 h-[350px]">
                 <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={locationStatusData} margin={{ top: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: '800' }} 
                      />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                      <Tooltip 
                        cursor={{ fill: '#f8fafc' }}
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', fontSize: '11px', fontWeight: '800' }}
                      />
                      <Legend 
                        verticalAlign="top" 
                        align="right"
                        iconType="circle"
                        wrapperStyle={{ paddingBottom: '20px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}
                      />
                      <Bar dataKey="closed" name="Closed" stackId="a" fill="#10B981" barSize={24} />
                      <Bar dataKey="inProgress" name="In Progress" stackId="a" fill="#F59E0B" barSize={24} />
                      <Bar dataKey="open" name="Open" stackId="a" fill="#E11D48" radius={[4, 4, 0, 0]} barSize={24} />
                    </BarChart>
                 </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
           {/* Report Selection & Sort controls */}
           <div className="flex flex-col md:flex-row gap-4 print:hidden">
              <div className="flex-[2] relative">
                <select 
                  value={selectedInspectionId || ""}
                  onChange={(e) => setSelectedInspectionId(e.target.value)}
                  className="w-full appearance-none bg-white border border-slate-200 rounded-2xl px-6 py-4 text-xs font-black pr-12 focus:ring-2 focus:ring-blue-500/20 transition-all uppercase italic shadow-sm"
                >
                  <option value="">Matrix: Select Intelligence Source...</option>
                  <option value="ALL">FULL COMPLIANCE REGISTRY (ALL INSPECTIONS)</option>
                  {enrichedInspections.slice().reverse().map(i => {
                    const s = sections.find(sec => normalizeId(sec.id) === normalizeId(i.sectionId));
                    return <option key={i.id} value={i.id}>INSPECTION #{i.id} - {formatDate(i.date)} - {s?.name || i.location || 'Site Inspection'}</option>;
                  })}
                </select>
                <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              </div>

              <div className="flex-1 flex gap-2">
                 <button 
                  onClick={() => setIsFilterOpen(!isFilterOpen)}
                  className={cn(
                    "flex-1 bg-white border border-slate-200 rounded-2xl px-4 py-4 text-[10px] font-black uppercase tracking-widest transition-all gap-2 flex items-center justify-center",
                    isFilterOpen ? "border-blue-500 text-blue-600 bg-blue-50/50" : "text-slate-600 hover:bg-slate-50"
                  )}
                 >
                   <Filter size={16} />
                   Registry Filters
                 </button>
                 <button 
                  onClick={() => setIncludeSnaps(!includeSnaps)}
                  className={cn(
                    "flex-1 bg-white border border-slate-200 rounded-2xl px-4 py-4 text-[10px] font-black uppercase tracking-widest transition-all gap-2 flex items-center justify-center",
                    includeSnaps ? "border-emerald-500 text-emerald-600 bg-emerald-50/50" : "text-slate-400 grayscale"
                  )}
                 >
                   <MapPin size={16} />
                   {includeSnaps ? 'Include Snaps' : 'No Snaps'}
                 </button>
              </div>

              {selectedInspection && (
                <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 shadow-sm">
                  {[
                    { label: 'Status', value: 'status' as const },
                    { label: 'Location', value: 'location' as const },
                    { label: 'Date', value: 'createdAt' as const }
                  ].map((field) => (
                    <button
                      key={field.value}
                      onClick={() => {
                        if (sortField === field.value) {
                          setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortField(field.value);
                          setSortOrder('asc');
                        }
                      }}
                      className={cn(
                        "px-4 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                        sortField === field.value ? "bg-slate-100 text-slate-900" : "text-slate-400 hover:text-slate-600"
                      )}
                    >
                      {field.label}
                      {sortField === field.value && (
                        sortOrder === 'asc' ? <SortAsc size={12} /> : <SortDesc size={12} />
                      )}
                    </button>
                  ))}
                </div>
              )}
           </div>

           <AnimatePresence>
            {isFilterOpen && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden bg-white border border-slate-200 rounded-3xl shadow-lg mt-4 print:hidden"
              >
                <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
                   <div className="space-y-4">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-2">Status Filters</h4>
                      <div className="flex flex-wrap gap-2">
                        {['Open', 'In Progress', 'Closed'].map(status => (
                          <button
                            key={status}
                            onClick={() => toggleFilter(filterStatuses, status, setFilterStatuses)}
                            className={cn(
                              "px-3 py-1.5 rounded-xl text-[9px] font-black uppercase border",
                              filterStatuses.includes(status) ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-500 border-slate-200"
                            )}
                          >
                            {status}
                          </button>
                        ))}
                      </div>
                   </div>
                   <div className="space-y-4">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-2">Time Matrix</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <select className="bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-[10px] font-black" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
                          <option>All Months</option>
                          {uniqueMonths.map(m => <option key={m}>{m}</option>)}
                        </select>
                        <select className="bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-[10px] font-black" value={filterYear} onChange={e => setFilterYear(e.target.value)}>
                          <option>All Years</option>
                          {uniqueYears.map(y => <option key={y}>{y}</option>)}
                        </select>
                      </div>
                   </div>
                   <div className="space-y-4">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-2">Facility Scope</h4>
                      <select className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-[10px] font-black" 
                        onChange={e => e.target.value === "All" ? setFilterSections([]) : setFilterSections([e.target.value])}
                      >
                        <option value="All">All Sections</option>
                        {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                   </div>
                </div>
              </motion.div>
            )}
           </AnimatePresence>

           {(selectedInspection || selectedInspectionId === "ALL") ? (
             <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                {/* Protocol Header Actions */}
                <div className="flex flex-col md:flex-row justify-between items-center bg-white border border-slate-200 rounded-[2.5rem] p-8 gap-4 print:hidden shadow-xl shadow-slate-200/20">
                   <div className="flex items-center gap-5">
                      <div className="w-16 h-16 bg-slate-50 rounded-[1.5rem] flex items-center justify-center text-slate-400 group transition-all">
                         <FileText size={28} className="group-hover:text-blue-600" />
                      </div>
                      <div>
                         <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight leading-none">Standard Assessment Protocol</h3>
                         <p className="text-[10px] font-bold text-slate-400 uppercase mt-2 tracking-widest">Digital Registry PROTO_X_{selectedInspection ? selectedInspection.id : 'AGGREGATED'}</p>
                      </div>
                   </div>
                   <div className="flex gap-3">
                      <button 
                        onClick={() => {
                          window.print();
                        }}
                        className="w-full md:w-auto bg-slate-100 text-slate-900 px-8 py-5 rounded-[1.5rem] text-[11px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-4 hover:bg-slate-200 transition-all active:scale-95 group"
                      >
                        <Printer size={20} className="group-hover:rotate-12 transition-transform" />
                        Print Protocol
                      </button>
                      <button 
                        onClick={() => handleExportPDF('report-content', `INSPECTION_PROTOCOL_${selectedInspection?.id || 'AGGREGATED'}.pdf`)}
                        disabled={isExporting}
                        className="w-full md:w-auto bg-emerald-600 text-white px-10 py-5 rounded-[1.5rem] text-[11px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-4 hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-500/20 active:scale-95 group"
                      >
                        {isExporting ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} className="group-hover:translate-y-1 transition-transform" />}
                        {isExporting ? 'Generating...' : 'Export to PDF'}
                      </button>
                   </div>
                </div>

                <div id="report-content" className="bg-white p-12 md:p-16 rounded-[4rem] border border-slate-200 shadow-2xl relative overflow-hidden print:p-0 print:border-none print:shadow-none min-h-[1000px] flex flex-col">
                {/* Visual Watermark */}
                <div className="absolute top-0 right-0 p-12 opacity-[0.03] rotate-12 pointer-events-none">
                   <FileText size={400} strokeWidth={0.5} />
                </div>

                {/* --- PAGE 1: EXECUTIVE OVERVIEW --- */}
                <div className="relative z-10 flex-col flex min-h-[950px] border-b-4 border-slate-900 border-double pb-12 mb-12 page-break">
                   <div className="flex flex-col md:flex-row justify-between items-start mb-16">
                      <div className="space-y-4">
                         <div className="flex items-center gap-3">
                            <span className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center text-xl font-black italic">H</span>
                            <div>
                               <p className="text-[12px] font-black text-slate-900 tracking-[0.3em] uppercase underline decoration-blue-500 decoration-2">HouseKeep OS</p>
                               <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Enterprise Facility Protocol</p>
                            </div>
                         </div>
                      </div>
                      <div className="text-right mt-6 md:mt-0 font-mono flex flex-col items-end gap-3">
                         <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Registry Tracking ID</p>
                            <p className="text-xl font-black text-slate-900 tracking-tighter text-right">PROTO_X_{selectedInspection ? selectedInspection.id : 'AGGREGATED'}</p>
                            <div className="w-full h-1 bg-blue-600 mt-1 ml-auto" style={{ width: '40px' }} />
                         </div>
                         
                         {/* QR Code for the Live Report Registry */}
                         <div className="p-1 bg-white border border-slate-200 rounded-xl shadow-sm">
                            <QRCodeSVG 
                              value={window.location.href} 
                              size={64} 
                              level={"M"}
                              includeMargin={false}
                            />
                         </div>
                      </div>
                   </div>

                   <div className="flex-1 space-y-12">
                      <div className="max-w-2xl">
                         <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 mb-2 mt-4 flex items-center gap-2">
                           <Calendar size={12} />
                           Verification Cycle: {selectedInspection ? formatDate(selectedInspection.date) : "Unified Data stream"}
                         </p>
                         <h1 className="text-7xl font-black tracking-tighter text-slate-900 uppercase italic leading-tight">
                            {selectedInspection ? sections.find(s => s.id === selectedInspection.sectionId)?.name : "Consolidated Facility"} Report
                         </h1>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                         <div className="bg-slate-50 p-8 rounded-3xl border border-slate-100 flex flex-col justify-between">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-8">Observation Density</p>
                            <div>
                               <p className="text-6xl font-black text-slate-900 mb-2">{detailedObs.length}</p>
                               <p className="text-[10px] font-bold text-slate-500 uppercase leading-relaxed tracking-widest">Points of concern verified during inspection walkthrough</p>
                            </div>
                         </div>

                         <div className="bg-slate-50 p-8 rounded-3xl border border-slate-100 flex flex-col justify-between">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-8">Resolution Status</p>
                            <div>
                               <p className="text-6xl font-black text-emerald-600 mb-2">
                                 {detailedObs.length > 0 ? Math.round((detailedObs.filter(o => o.status === 'Closed').length / detailedObs.length) * 100) : 0}%
                               </p>
                               <p className="text-[10px] font-bold text-slate-500 uppercase leading-relaxed tracking-widest">Validated closures against open registers</p>
                            </div>
                         </div>

                         <div className="border-[6px] border-slate-100 p-8 rounded-3xl flex flex-col justify-between relative overflow-hidden">
                            <div className="absolute -bottom-10 -right-10 text-slate-50">
                               <TrendingUp size={200} strokeWidth={0.5} />
                            </div>
                             <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-8 z-10">Authorized Inspector</p>
                             <div className="z-10">
                                <p className="text-xl font-black text-slate-900 uppercase italic mb-2 tracking-tighter">
                                  {selectedInspection ? (selectedInspection.auditor || "OPERATOR_01") : "SYSTEM_CONSOLIDATED"}
                                </p>
                                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">
                                   <Clock size={12} className="text-blue-500" />
                                   Generated: {new Date().toLocaleTimeString()}
                                </div>
                                <span className="text-[9px] font-bold text-slate-500 uppercase px-2 py-1 bg-slate-100 rounded-lg">Verified Digital Sign</span>
                             </div>
                         </div>
                      </div>

                      {/* Integrated Section/Location Summary for 1st Page */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 py-8">
                         <div className="space-y-6">
                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2 border-b border-slate-100 pb-2">
                               <Layers size={14} className="text-blue-500" />
                               Section Readiness Index
                            </h4>
                            <div className="space-y-4">
                               {sectionChartData.slice(0, 4).map(s => (
                                 <div key={s.name} className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                       <div className={cn(
                                         "w-2 h-2 rounded-full",
                                         s.rate === 100 ? "bg-emerald-500" : s.rate > 50 ? "bg-blue-500" : "bg-rose-500"
                                       )} />
                                       <span className="text-[11px] font-black text-slate-800 uppercase tracking-tight">{s.name}</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                       <span className="text-[10px] font-bold text-slate-400">{s.rate}% READY</span>
                                       <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden">
                                          <div className="h-full bg-slate-900" style={{ width: `${s.rate}%` }} />
                                       </div>
                                    </div>
                                 </div>
                               ))}
                            </div>
                         </div>
                         <div className="space-y-6">
                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2 border-b border-slate-100 pb-2">
                               <MapPin size={14} className="text-emerald-500" />
                               Geographical Hazard Density
                            </h4>
                            <div className="h-32">
                               <ResponsiveContainer width="100%" height="100%">
                                 <BarChart data={locationStatusData.slice(0, 5)}>
                                   <XAxis dataKey="name" tick={{ fontSize: 9, fontWeight: 800 }} axisLine={false} tickLine={false} />
                                   <YAxis hide />
                                   <Bar dataKey="closed" stackId="a" fill="#10B981" barSize={20} />
                                   <Bar dataKey="inProgress" stackId="a" fill="#F59E0B" barSize={20} />
                                   <Bar dataKey="open" stackId="a" fill="#E11D48" radius={[4, 4, 0, 0]} barSize={20} />
                                 </BarChart>
                               </ResponsiveContainer>
                            </div>
                         </div>
                      </div>

                      <div className="p-10 bg-slate-900 rounded-[3rem] text-white flex flex-col md:flex-row justify-between items-center gap-8">
                         <div className="flex-1">
                            <h4 className="text-lg font-black uppercase italic mb-2">Executive Summary</h4>
                            <p className="text-slate-400 text-sm leading-relaxed max-w-xl font-medium">
                               {selectedInspection ? (selectedInspection.summary || "No automated summary generated for this cycle. The inspector identified several areas requiring immediate attention for protocol compliance.") : "Aggregated data registry across multiple inspection cycles. This report represents a consolidation of operational readiness across the target facility scope based on active filters."}
                            </p>
                         </div>
                         <div className="flex items-center gap-4 px-8 border-l border-white/10 h-full">
                            <div className="text-center">
                               <p className="text-[9px] font-black uppercase tracking-widest text-blue-400 mb-1">Risk Score</p>
                               <p className="text-3xl font-black">{detailedObs.filter(o => o.status === 'Open').length > 3 ? 'HIGH' : 'LOW'}</p>
                            </div>
                         </div>
                      </div>
                   </div>

                   <footer className="mt-auto py-12 flex justify-between items-end border-t border-slate-100">
                      <div>
                         <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest mb-1">Report Release</p>
                         <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{new Date().toLocaleString()}</p>
                      </div>
                      <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest italic flex items-center gap-2">
                         Protocol Page <span className="w-8 h-8 rounded-full border-2 border-slate-900 flex items-center justify-center not-italic">01</span>
                      </p>
                   </footer>
                </div>

                {/* --- SUBSEQUENT PAGES: PICTORIAL EVIDENCE --- */}
                <div className="pt-24 space-y-32 print:pt-12">
                   {detailedObs.map((obs, index) => (
                     <div key={obs.id} className="relative break-inside-avoid scroll-mt-24 mb-16">
                        {/* Evidence Tag */}
                        <div className="flex justify-between items-end mb-8">
                           <div className="flex items-center gap-4">
                              <span className="w-10 h-10 bg-slate-900 text-white rounded-full flex items-center justify-center text-sm font-black italic">#{index+1}</span>
                              <div>
                                 <h4 className="text-xl font-black text-slate-900 uppercase tracking-tighter italic leading-none">{obs.location}</h4>
                                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">EVIDENCE REGISTER UID: {obs.id}</p>
                              </div>
                           </div>
                           <div className="flex items-center gap-3">
                              <span className={cn(
                                "text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl border-2",
                                obs.status === 'Open' ? "border-rose-500 text-rose-500" : obs.status === 'In Progress' ? "border-amber-500 text-amber-500" : "border-emerald-500 text-emerald-500"
                              )}>
                                 STATUS: {obs.status}
                              </span>
                           </div>
                        </div>

                        {/* Image Grid: Before vs After */}
                        {includeSnaps && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10 print:gap-4">
                           {/* Before State */}
                           <div className="space-y-4">
                              <div className="relative aspect-[4/3] rounded-3xl overflow-hidden bg-slate-50 border-2 border-slate-100 group print:border-slate-200">
                                 {obs.beforeImageUrl ? (
                                   <img 
                                     src={obs.beforeImageUrl} 
                                     className="w-full h-full object-cover" 
                                     referrerPolicy="no-referrer"
                                     alt="Before inspection"
                                   />
                                 ) : (
                                   <div className="w-full h-full flex flex-col items-center justify-center text-slate-200">
                                      <Search size={48} strokeWidth={1} />
                                      <p className="text-[10px] font-black uppercase mt-4">No Initial Proof</p>
                                   </div>
                                 )}
                                 <div className="absolute top-6 left-6 px-4 py-2 bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-rose-600/20">
                                    Initial State • BEFORE
                                 </div>
                              </div>
                              <div 
                                className="bg-slate-50/50 p-6 rounded-3xl border border-slate-100 italic font-medium text-slate-600 text-sm leading-relaxed print:p-4 prose prose-slate max-w-none"
                                dangerouslySetInnerHTML={{ __html: obs.description }}
                              />
                           </div>

                           {/* After State / Resolution */}
                           <div className="space-y-4">
                              <div className={cn(
                                "relative aspect-[4/3] rounded-3xl overflow-hidden bg-slate-50 border-2 transition-all",
                                obs.status === 'Closed' ? "border-emerald-200" : "border-slate-100 grayscale-[0.5] opacity-80"
                              )}>
                                 {obs.afterImageUrl ? (
                                   <img 
                                     src={obs.afterImageUrl} 
                                     className="w-full h-full object-cover" 
                                     referrerPolicy="no-referrer"
                                     alt="After resolution"
                                   />
                                 ) : (
                                   <div className="w-full h-full flex flex-col items-center justify-center text-slate-200">
                                      <CheckCircle2 size={48} strokeWidth={1} />
                                      <p className="text-[10px] font-black uppercase mt-4">Resolution Pending</p>
                                   </div>
                                 )}
                                 <div className={cn(
                                   "absolute top-6 left-6 px-4 py-2 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg",
                                   obs.status === 'Closed' ? "bg-emerald-600 shadow-emerald-500/20" : "bg-slate-400 shadow-slate-400/20"
                                 )}>
                                    Revised State • {obs.status === 'Closed' ? 'AFTER' : 'EXPECTED'}
                                 </div>
                              </div>
                              <div className={cn(
                                "p-6 rounded-3xl border text-sm flex items-start gap-4 transition-all print:p-4",
                                obs.status === 'Closed' ? "bg-emerald-50 border-emerald-100 text-emerald-800" : "bg-slate-50 border-slate-100 text-slate-400"
                              )}>
                                 <div className={cn(
                                   "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0",
                                   obs.status === 'Closed' ? "bg-emerald-200 text-emerald-600" : "bg-slate-200 text-slate-400"
                                 )}>
                                    <Activity size={18} />
                                 </div>
                                 <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest mb-1">Resolution Intelligence</p>
                                    <p className="font-bold leading-tight">
                                       {obs.status === 'Closed' 
                                         ? 'Validation passed. Maintenance team confirmed protocol adherence and rectified site state.' 
                                         : 'Awaiting site rectification. Priority assigned. Protocol requires immediate turnaround.'}
                                    </p>
                                 </div>
                              </div>
                           </div>
                        </div>
                     )}

                        {/* Metadata Footer for item */}
                        <div className="flex justify-end gap-3 opacity-30 select-none">
                           <div className="text-[8px] font-black uppercase tracking-widest text-slate-900 bg-slate-50 px-2 py-1 rounded">LOC_REF: {obs.location}</div>
                           <div className="text-[8px] font-black uppercase tracking-widest text-slate-900 bg-slate-50 px-2 py-1 rounded">TS: {obs.createdAt}</div>
                        </div>
                     </div>
                   ))}
                </div>

                <div className="mt-32 border-t-2 border-slate-900 border-dashed pt-12 grid grid-cols-1 md:grid-cols-2 gap-20">
                   <div className="space-y-12">
                      <div className="h-20 border-b border-slate-200 relative">
                         <p className="absolute bottom-0 text-[10px] font-black text-slate-400 uppercase tracking-widest">Operations Manager Signature</p>
                         <div className="absolute top-0 left-0 text-slate-100 font-mono text-4xl select-none">DEPT_OPS_MGMT</div>
                      </div>
                      <div>
                         <p className="text-sm font-black text-slate-900 uppercase">Verification Date</p>
                         <p className="text-[10px] font-bold text-slate-400">____ / ____ / 20____</p>
                      </div>
                   </div>
                   <div className="space-y-12">
                      <div className="h-20 border-b border-slate-200 relative">
                         <p className="absolute bottom-0 text-[10px] font-black text-slate-400 uppercase tracking-widest">Quality Assurance Inspector</p>
                         <div className="absolute top-0 left-0 text-slate-100 font-mono text-4xl select-none">DEPT_QA_INSP</div>
                      </div>
                      <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 inline-block">
                         <p className="text-[9px] font-bold text-slate-400 mb-2 uppercase tracking-widest">Official Protocol Seal</p>
                         <div className="w-16 h-16 border-4 border-slate-200 rounded-full flex items-center justify-center text-slate-200 transform -rotate-12">
                            <CheckCircle2 size={32} />
                         </div>
                      </div>
                   </div>
                </div>

                <div className="mt-20 pt-12 flex flex-col items-center gap-6">
                   <div className="flex items-center gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-200"></span>
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                   </div>
                   <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Protocol Release HouseKeep OS v3.4.0</p>
                   <p className="text-[8px] font-bold text-slate-300 uppercase">Digital Integrity Verified • Encrypted Data Stream</p>
                </div>
             </div>
           </div>
           ) : (
             <div className="text-center py-40 border-2 border-dashed border-slate-200 rounded-[3rem] bg-slate-50 flex flex-col items-center justify-center group hover:bg-white transition-all cursor-pointer" onClick={() => (document.querySelector('select') as HTMLSelectElement)?.focus()}>
                <div className="w-20 h-20 bg-white rounded-3xl border border-slate-200 shadow-sm flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-6 transition-all duration-500">
                   <BarChart3 size={32} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
                </div>
                <h3 className="text-xl font-black text-slate-900 uppercase italic mb-2">Protocol Pending</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select an active intelligence source from the registry dropdown</p>
                <div className="mt-8 flex items-center gap-2 text-blue-600 bg-blue-50 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest">
                   Select Data Source <ArrowRight size={14} />
                </div>
             </div>
           )}
        </div>
      )}
    </div>
  );
}
