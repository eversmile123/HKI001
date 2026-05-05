import { useState, useEffect, useMemo, useCallback, MouseEvent } from "react";
import { api } from "../lib/api";
import { Inspection, Observation, Section } from "../types";
import { Calendar, MapPin, ArrowRight, Image as ImageIcon, ClipboardList, X, CheckCircle2, ChevronDown, Activity, Info, CheckSquare, Square, Download, Loader2, Share2, Printer, Cloud, FileText, Settings, Filter, Users, FileDown } from "lucide-react";
import { formatDate, cn, getNormalizedLocation, normalizeId } from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { jsPDF } from 'jspdf';
import { toPng } from 'html-to-image';

export default function InspectionsView() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedInspectionId, setSelectedInspectionId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Observation Sort State
  const [obsSortField, setObsSortField] = useState<keyof Observation | 'sectionName'>('createdAt');
  const [obsSortDirection, setObsSortDirection] = useState<'asc' | 'desc'>('desc');
  
  // Sharing Mode
  const [shareInspectionId, setShareInspectionId] = useState<string | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [qrColor, setQrColor] = useState('#0f172a'); // default slate-900
  const [qrLevel, setQrLevel] = useState<'L' | 'M' | 'Q' | 'H'>('H');
  const [showQrSettings, setShowQrSettings] = useState(false);
  const [showScopeSettings, setShowScopeSettings] = useState(false);

  // Sharing Scope State
  const [shareDateStart, setShareDateStart] = useState<string>('');
  const [shareDateEnd, setShareDateEnd] = useState<string>('');
  const [shareSections, setShareSections] = useState<string[]>([]);
  
  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Filter States
  const [selectedLocation, setSelectedLocation] = useState<string>("All Locations");
  const [selectedMonth, setSelectedMonth] = useState<string>("All Time");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Sync with search params
  useEffect(() => {
    const month = searchParams.get('month');
    const year = searchParams.get('year');
    const loc = searchParams.get('location');
    const search = searchParams.get('search');
    const q = searchParams.get('q');

    if (month && year) {
      setSelectedMonth(`${month} ${year}`);
    }
    if (loc) {
      setSelectedLocation(loc);
    }
    if (search) {
      setSelectedInspectionId(normalizeId(search));
    }
    if (q) {
      setSearchQuery(q);
    }
  }, [searchParams]);

  const loadData = useCallback(async () => {
    try {
      const [i, o, s] = await Promise.all([
        api.getInspections(),
        api.getObservations(),
        api.getSections()
      ]);
      setInspections(Array.isArray(i) ? i : []);
      setObservations(Array.isArray(o) ? o : []);
      setSections(Array.isArray(s) ? s : []);
    } catch (err: any) {
      console.error("Failed to load inspection data:", err);
      setError(err.message || "Failed to load inspections.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleExportPDF = useCallback(async (inspectionId: string, elementId: string = 'inspection-registry-entry') => {
    const element = document.getElementById(elementId);
    if (!element) return;

    setIsExporting(true);
    
    try {
      // Force classic colors for PDF engine compatibility (replaces oklch which causes parser rejections)
      const originalStyle = element.getAttribute('style');
      element.style.color = '#0f172a'; // slate-900
      element.classList.add('pdf-export-mode');
      
      // Wait for any layout shifts and ensure images are fully cached/rendered
      await new Promise(resolve => setTimeout(resolve, 500));

      const dataUrl = await toPng(element, {
        backgroundColor: '#ffffff',
        style: {
          transform: 'scale(1)',
          transformOrigin: 'top left',
          borderRadius: '0',
          background: '#ffffff',
          // Disable filters/blur during capture as they can cause parser errors in some engines
          filter: 'none',
          backdropFilter: 'none'
        },
        pixelRatio: 2.5, // Even higher fidelity
        skipAutoScale: true,
        cacheBust: true,
      });

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true
      });

      const imgProps = pdf.getImageProperties(dataUrl);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      const pageHeight = pdf.internal.pageSize.getHeight();
      let heightLeft = pdfHeight;
      let position = 0;

      // Use HIGH compression for better results with PNG
      pdf.addImage(dataUrl, 'PNG', 0, position, pdfWidth, pdfHeight, undefined, 'SLOW');
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - pdfHeight;
        pdf.addPage();
        pdf.addImage(dataUrl, 'PNG', 0, position, pdfWidth, pdfHeight, undefined, 'SLOW');
        heightLeft -= pageHeight;
      }

      const timestamp = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
      pdf.save(`PROTOCOL_${inspectionId}_${timestamp}.pdf`);
      
      // Restore original state
      element.classList.remove('pdf-export-mode');
      if (originalStyle) element.setAttribute('style', originalStyle);
      else element.removeAttribute('style');
      
      setIsExporting(false);
    } catch (err: any) {
      console.error('PDF Export Error:', err);
      const target = document.getElementById(elementId);
      if (target) {
        target.classList.remove('pdf-export-mode');
      }
      setIsExporting(false);
      
      // Aesthetic error fall-back
      alert("DIGITAL EXPORT PROTOCOL ERROR: Modern CSS color functions (OKLCH) detected. Attempting legacy system print bypass. Please save as PDF from the print dialog.");
      setShowPrintPreview(true);
      setTimeout(() => window.print(), 500);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, refreshKey]);

  const insData = useMemo(() => {
    const insArray = Array.isArray(inspections) ? inspections : [];
    const obsArray = Array.isArray(observations) ? observations : [];
    const secArray = Array.isArray(sections) ? sections : [];

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    const mappedInspections = insArray.map(ins => {
      const inspectionObservations = obsArray.filter(o => normalizeId(o.inspectionId) === normalizeId(ins.id));
      
      const section = secArray.find(s => normalizeId(s.id) === normalizeId(ins.sectionId)) || { id: ins.sectionId || 'unknown', name: ins.sectionId || 'Unassigned' };

      const normLoc = getNormalizedLocation(ins.location);
      const actionLocs = new Set<string>();
      if (normLoc) actionLocs.add(normLoc);
      inspectionObservations.forEach(o => {
        const l = getNormalizedLocation(o.location);
        if (l) actionLocs.add(l);
      });

      // Simple primary location
      const displayLocation = normLoc || (inspectionObservations[0] ? getNormalizedLocation(inspectionObservations[0].location) : null) || "Unspecified Area";

      const validDate = (d: any) => d && !isNaN(new Date(d).getTime());
      const rawDate = validDate(ins.date) ? ins.date : (validDate(ins.createdAt) ? ins.createdAt : (inspectionObservations[0]?.createdAt || null));
      const dateObj = validDate(rawDate) ? new Date(rawDate as string) : new Date(NaN);

      const monthYear = !isNaN(dateObj.getTime()) 
        ? `${monthNames[dateObj.getMonth()]} ${dateObj.getFullYear()}`
        : "Unknown Date";

      const actionMonths = new Set<string>();
      if (monthYear !== "Unknown Date") actionMonths.add(monthYear);
      inspectionObservations.forEach(o => {
        const d = new Date(o.createdAt);
        if (!isNaN(d.getTime())) actionMonths.add(`${monthNames[d.getMonth()]} ${d.getFullYear()}`);
      });

      return {
        ...ins,
        section,
        displayLocation,
        actionLocations: Array.from(actionLocs),
        inspectionObservations,
        monthYear,
        actionMonths: Array.from(actionMonths),
        fullDate: !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString('en-GB') : "N/A",
        timestamp: dateObj.getTime() || 0
      };
    });

    // Handle Orphan Observations
    const linkedObsIds = new Set(mappedInspections.flatMap(i => i.inspectionObservations.map(o => o.id)));
    const orphanObs = obsArray.filter(o => !linkedObsIds.has(o.id));

    if (orphanObs.length > 0) {
      orphanObs.forEach((o, idx) => {
        const d = new Date(o.createdAt);
        const my = isNaN(d.getTime()) ? "Unknown Date" : `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
        const loc = getNormalizedLocation(o.location) || "Unspecified Area";
        
        mappedInspections.push({
          id: `ORPHAN-${idx}`,
          displayLocation: loc,
          location: loc,
          monthYear: my,
          fullDate: isNaN(d.getTime()) ? "N/A" : d.toLocaleDateString('en-GB'),
          auditor: "Ad-hoc Entry",
          inspectionObservations: [o],
          section: { id: 'ad-hoc', name: 'Field Entry' },
          actionLocations: [loc],
          actionMonths: [my],
          isOrphan: true,
          timestamp: d.getTime() || 0
        } as any);
      });
    }

    return mappedInspections;
  }, [inspections, observations, sections]);

  // Derived Filter Options
  const locations = useMemo(() => {
    const locs = new Set<string>();
    
    // Base data: Filter by selected month first if we want dynamic filtering
    const baseData = selectedMonth === "All Time" 
      ? insData 
      : insData.filter(i => i.monthYear === selectedMonth || (i.actionMonths && i.actionMonths.includes(selectedMonth)));

    baseData.forEach(ins => {
      const primaryLoc = getNormalizedLocation(ins.location);
      if (primaryLoc) locs.add(primaryLoc);
      
      (ins.actionLocations || []).forEach((l: string) => {
        if (l) locs.add(l);
      });
    });
    return ["All Locations", ...Array.from(locs).sort()];
  }, [insData, selectedMonth]);

  const months = useMemo(() => {
    const allKnownMonths = new Set<string>();
    
    // Base data: Filter by selected location first if we want dynamic filtering
    const baseData = selectedLocation === "All Locations" 
      ? insData 
      : insData.filter(i => 
          getNormalizedLocation(i.location) === selectedLocation || 
          (i.actionLocations && i.actionLocations.includes(selectedLocation))
        );

    baseData.forEach(ins => {
      // @ts-ignore
      (ins.actionMonths || [ins.monthYear]).forEach(m => {
        if (m !== "Unknown Date") allKnownMonths.add(m);
      });
    });

    const mths = Array.from(allKnownMonths);
    
    const sortedMths = mths.sort((a, b) => {
      const dateA = new Date(a);
      const dateB = new Date(b);
      return dateB.getTime() - dateA.getTime();
    });

    const finalMonths = ["All Time", ...sortedMths];
    if (baseData.some(i => i.monthYear === "Unknown Date")) {
      finalMonths.push("Unknown Date");
    }
    
    return finalMonths;
  }, [insData, selectedLocation]);

  const filteredInsData = useMemo(() => {
    const monthNamesLocal = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    const getMetrics = (obs: Observation[]) => {
      const obsCount = obs.length;
      const openCount = obs.filter(o => o.status === 'Open').length;
      const inProgressCount = obs.filter(o => o.status === 'In Progress').length;
      const closedCount = obs.filter(o => o.status === 'Closed').length;
      const totalUnresolved = openCount + inProgressCount;
      const closureRate = obsCount > 0 ? Math.round((closedCount / obsCount) * 100) : 100;
      return { obsCount, openCount, inProgressCount, closedCount, totalUnresolved, closureRate };
    };

    // 1. Group observations by strictly NormalizedLocation + Month
    const groups: Record<string, {
      location: string;
      monthYear: string;
      observations: Observation[];
      auditors: Set<string>;
      sections: Set<string>;
      inspectionIds: Set<string>;
      timestamp: number;
    }> = {};

    insData.forEach(ins => {
      ins.inspectionObservations.forEach(obs => {
        const obsLoc = getNormalizedLocation(obs.location) || getNormalizedLocation(ins.location) || "Unspecified Area";
        const d = new Date(obs.createdAt);
        const mth = isNaN(d.getTime()) ? "Unknown Date" : `${monthNamesLocal[d.getMonth()]} ${d.getFullYear()}`;

        // Apply filters strictly
        const matchesLoc = selectedLocation === "All Locations" || obsLoc === selectedLocation;
        const matchesMonth = selectedMonth === "All Time" || mth === selectedMonth;
        
        const q = searchQuery.toLowerCase();
        const matchesSearch = searchQuery === "" || 
                             obsLoc.toLowerCase().includes(q) ||
                             (obs.observation && obs.observation.toLowerCase().includes(q)) ||
                             ins.auditor.toLowerCase().includes(q);

        if (!matchesLoc || !matchesMonth || !matchesSearch) return;

        const key = `${obsLoc}|${mth}`;
        if (!groups[key]) {
          groups[key] = {
            location: obsLoc,
            monthYear: mth,
            observations: [],
            auditors: new Set(),
            sections: new Set(),
            inspectionIds: new Set(),
            timestamp: d.getTime() || 0
          };
        }
        
        groups[key].observations.push(obs);
        groups[key].inspectionIds.add(String(ins.id));
        if (ins.auditor) groups[key].auditors.add(ins.auditor);
        if (ins.section?.name) groups[key].sections.add(ins.section.name);
        if (d.getTime() > groups[key].timestamp) groups[key].timestamp = d.getTime();
      });
    });

    // 2. Convert groups to processed cards
    const processedCards = Object.values(groups).map(group => {
      const metrics = getMetrics(group.observations);
      const auditors = Array.from(group.auditors);
      const sections = Array.from(group.sections);
      
      return {
        id: `GROUP-${group.location.replace(/\s+/g, '-')}-${group.monthYear.replace(/\s+/g, '-')}`,
        displayLocation: group.location,
        location: group.location,
        monthYear: group.monthYear,
        auditor: auditors.length > 1 ? `${auditors[0]} (+${auditors.length - 1})` : (auditors[0] || "System"),
        section: { id: 'multi', name: sections.length > 1 ? `${sections[0]} (+${sections.length - 1})` : (sections[0] || "General") },
        fullDate: group.timestamp > 0 ? new Date(group.timestamp).toLocaleDateString('en-GB') : "N/A",
        ...metrics,
        inspectionObservations: group.observations,
        inspectionIds: Array.from(group.inspectionIds),
        timestamp: group.timestamp,
        isGrouped: true,
        groupedCount: group.inspectionIds.size,
        summary: `Month-wise report for ${group.location} (${group.monthYear}).`
      };
    }).sort((a, b) => b.timestamp - a.timestamp);

    // 3. Scenario: Specific Location Selected - Prepend Site Summary
    if (selectedLocation !== "All Locations" && processedCards.length > 0) {
      const allObs = processedCards.flatMap(c => c.inspectionObservations);
      const metrics = getMetrics(allObs);
      const latestTs = Math.max(...processedCards.map(c => c.timestamp));
      const allUniqueInsIds = Array.from(new Set(processedCards.flatMap(c => c.inspectionIds || [])));
      
      const summaryCard = {
        id: `SUMMARY-${selectedLocation.replace(/\s+/g, '-')}`,
        displayLocation: selectedLocation,
        auditor: "Performance Summary",
        section: { id: 'agg', name: 'Site-Wide Analysis' },
        fullDate: latestTs > 0 ? new Date(latestTs).toLocaleDateString('en-GB') : "N/A",
        monthYear: selectedMonth === "All Time" ? "Cumulative History" : selectedMonth,
        ...metrics,
        inspectionObservations: allObs,
        inspectionIds: allUniqueInsIds,
        isGrouped: true,
        isSummary: true,
        groupedCount: allUniqueInsIds.length,
        summary: `Consolidated performance overview for ${selectedLocation} across all selected periods.`,
        timestamp: latestTs + 1
      };

      return [summaryCard, ...processedCards];
    }

    return processedCards;
  }, [insData, selectedLocation, selectedMonth, searchQuery]);

  const toggleSelection = (e: MouseEvent, id: string) => {
    e.stopPropagation();
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredInsData.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredInsData.map(i => i.id)));
    }
  };

  const handleBulkResolve = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkProcessing(true);
    
    // Resolve any grouped IDs into their constituent observation IDs for precision
    const allObsIdsToResolve = new Set<string>();
    selectedIds.forEach(id => {
      const found = filteredInsData.find(f => f.id === id);
      if (found && found.inspectionObservations) {
        found.inspectionObservations.forEach((o: Observation) => {
          if (o.status !== 'Closed') {
            allObsIdsToResolve.add(String(o.id));
          }
        });
      }
    });

    if (allObsIdsToResolve.size === 0) {
      setIsBulkProcessing(false);
      setSelectedIds(new Set());
      return;
    }

    try {
      await api.bulkResolveObservationsByIds(Array.from(allObsIdsToResolve));
      setSelectedIds(new Set());
      setRefreshKey(prev => prev + 1);
    } catch (err) {
      alert("Failed to batch resolve items.");
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleExportCSV = () => {
    const selectedData = filteredInsData.filter(i => selectedIds.has(i.id));
    const headers = ["ID", "Location", "Date", "Total Observations", "Open", "Fixed", "Closure Rate"];
    const csvContent = [
      headers.join(","),
      ...selectedData.map(i => [
        i.id,
        `"${i.displayLocation}"`,
        i.fullDate,
        i.obsCount,
        i.openCount,
        i.closedCount,
        `${i.closureRate}%`
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `inspection_export_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const sortedObservations = useMemo(() => {
    const ins = (filteredInsData.find(i => normalizeId(i.id) === normalizeId(selectedInspectionId)) || 
                 insData.find(i => normalizeId(i.id) === normalizeId(selectedInspectionId)));
    if (!ins) return [];
    
    const obs = [...ins.inspectionObservations];
    
    return obs.sort((a, b) => {
      let valA: any = a[obsSortField as keyof Observation];
      let valB: any = b[obsSortField as keyof Observation];

      if (obsSortField === 'sectionName') {
        valA = sections.find(s => s.id === a.sectionId)?.name || 'Unknown';
        valB = sections.find(s => s.id === b.sectionId)?.name || 'Unknown';
      }

      if (obsSortField === 'createdAt') {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return obsSortDirection === 'asc' ? dateA - dateB : dateB - dateA;
      }

      const stringA = String(valA || '').toLowerCase();
      const stringB = String(valB || '').toLowerCase();
      
      if (stringA < stringB) return obsSortDirection === 'asc' ? -1 : 1;
      if (stringA > stringB) return obsSortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [selectedInspectionId, insData, obsSortField, obsSortDirection, sections]);

  const toggleObsSort = (field: keyof Observation | 'sectionName') => {
    if (obsSortField === field) {
      setObsSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setObsSortField(field);
      setObsSortDirection('desc');
    }
  };

  if (loading && refreshKey === 0) return (
    <div className="h-64 flex flex-col items-center justify-center gap-4">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest animate-pulse">Hydrating Inspection Logs...</p>
    </div>
  );

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 p-8 bg-slate-50 border border-slate-200 rounded-2xl text-center">
        <p className="text-rose-600 font-black uppercase tracking-widest text-[10px] mb-2">Inspection Registry Connection Failure</p>
        <p className="text-slate-600 text-[11px] font-medium mb-4 max-w-sm italic">"{error}"</p>
        <button 
          onClick={() => setRefreshKey(prev => prev + 1)}
          className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition-colors shadow-lg shadow-slate-900/10"
        >
          Attempt Re-Sync
        </button>
      </div>
    );
  }

  return (
    <div className={cn("space-y-6 relative min-h-[calc(100vh-140px)] pb-24", showPrintPreview && "print:hidden")}>
      {/* Professional Print Header */}
      {!showPrintPreview && (
        <div className="hidden print:flex flex-col border-b-4 border-slate-900 pb-6 mb-8">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-black italic tracking-tighter uppercase text-slate-900">Inspection Intelligence Log</h1>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-[0.3em] mt-2">Operational Registry • Dynamic Evidence Repository</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Document Generated</p>
            <p className="text-sm font-black text-slate-900">{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>
      </div>
    )}

      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <div 
             onClick={toggleSelectAll}
             className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center cursor-pointer hover:bg-slate-50 transition-colors shadow-sm"
             title={selectedIds.size === filteredInsData.length ? "Deselect All" : "Select All"}
          >
             {selectedIds.size === filteredInsData.length && selectedIds.size > 0 ? (
               <CheckSquare size={18} className="text-blue-600" />
             ) : (
               <Square size={18} className="text-slate-300" />
             )}
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tighter text-slate-900 uppercase italic">Inspection Intelligence Log</h2>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">
              Relational Housekeeping Database • {(() => {
                const uniqueIds = new Set(filteredInsData.flatMap(i => i.inspectionIds || []));
                return uniqueIds.size;
              })()} Audits Identified
            </p>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative group">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <ClipboardList size={12} />
            </div>
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Records..."
              className="pl-8 pr-10 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-bold uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm w-full md:w-64"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="relative group">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <MapPin size={12} />
            </div>
            <select 
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="pl-8 pr-10 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-bold uppercase tracking-widest appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer shadow-sm min-w-[140px]"
            >
              {locations.map(loc => <option key={loc} value={loc || ''}>{loc}</option>)}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              <ChevronDown size={12} />
            </div>
          </div>

          <div className="relative group">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <Calendar size={12} />
            </div>
            <select 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="pl-8 pr-10 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-bold uppercase tracking-widest appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer shadow-sm"
            >
              {months.map(mth => <option key={mth} value={mth}>{mth}</option>)}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              <ChevronDown size={12} />
            </div>
          </div>

          {(selectedLocation !== "All Locations" || selectedMonth !== "All Time" || searchQuery !== "") && (
             <button 
              onClick={() => { setSelectedLocation("All Locations"); setSelectedMonth("All Time"); setSearchQuery(""); }}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl transition-all"
              title="Reset Filters"
             >
                <X size={14} />
             </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <AnimatePresence mode="popLayout">
          {filteredInsData.map((ins) => (
            <motion.div
              key={ins.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={() => setSelectedInspectionId(ins.id)}
              className={cn(
                "group relative bg-white rounded-[2.5rem] border transition-all duration-500 flex flex-col h-full overflow-hidden cursor-pointer",
                selectedIds.has(ins.id) 
                  ? "border-blue-500 shadow-2xl ring-4 ring-blue-500/10 -translate-y-1" 
                  : "border-slate-200 hover:border-slate-300 hover:shadow-xl hover:-translate-y-1"
              )}
            >
               {/* Selection Overlay */}
               <div className="absolute top-6 left-6 z-30">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelection(e, ins.id);
                    }}
                    className={cn(
                      "w-6 h-6 rounded-lg border transition-all flex items-center justify-center backdrop-blur-sm shadow-sm",
                      selectedIds.has(ins.id)
                        ? "bg-blue-600 border-blue-500 text-white"
                        : "bg-white/80 border-slate-200 text-transparent hover:border-blue-400"
                    )}
                  >
                    <CheckSquare size={14} className={selectedIds.has(ins.id) ? "opacity-100" : "opacity-0"} />
                  </button>
               </div>

               {/* QR & Date Layer */}
               <div className="absolute top-6 right-6 flex items-start gap-4 z-30">
                  <div className="text-right">
                    <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Last Audit</p>
                    <span className="text-[10px] font-black text-slate-900 uppercase tracking-tighter italic bg-slate-100 px-2 py-1 rounded shadow-sm whitespace-nowrap">
                      {ins.fullDate}
                    </span>
                  </div>
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setShareInspectionId(ins.id);
                      setIsShareModalOpen(true);
                    }}
                    className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white hover:bg-blue-600 hover:border-blue-500 transition-all shadow-lg"
                  >
                    <QRCodeSVG 
                      value={`${window.location.origin}/reports?inspectionId=${ins.inspectionIds?.[0] || ins.id}`} 
                      size={28} 
                      level="H"
                      fgColor="#ffffff"
                      bgColor="transparent"
                    />
                  </div>
               </div>

               {/* Header Section */}
               <div className="p-8 pb-4 space-y-6 flex-1 text-left relative">
                  <div className="mt-8">
                    <p className="text-[8px] font-black text-blue-600 uppercase tracking-[0.2em] mb-1">{ins.groupedCount > 1 ? `Aggregated Site Data (${ins.groupedCount} Audits)` : "Site Asset Analysis"}</p>
                    <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter line-clamp-2 leading-[0.9] italic group-hover:text-blue-600 transition-colors">
                      {ins.displayLocation}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                     <span className="text-[9px] font-black text-slate-500 bg-slate-50 px-2.5 py-1 rounded-full uppercase tracking-widest border border-slate-100">
                        {ins.section?.name || 'General Operations'}
                     </span>
                     <div className="flex items-center gap-1.5 ml-auto">
                        <Users size={12} className="text-slate-400" />
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">
                           {ins.auditor}
                        </span>
                     </div>
                  </div>

                  {/* Simplified Status Metrics */}
                  <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100">
                    <div className="bg-rose-50/50 rounded-3xl p-4 border border-rose-100/50 text-left">
                       <p className="text-[8px] font-black text-rose-500 uppercase tracking-widest mb-2">Unresolved</p>
                       <p className={cn("text-3xl font-black leading-none italic", ins.totalUnresolved > 0 ? "text-rose-600" : "text-slate-300")}>{ins.totalUnresolved}</p>
                    </div>
                    <div className="bg-emerald-50/50 rounded-3xl p-4 border border-emerald-100/50 text-left">
                       <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest mb-2">Resolved</p>
                       <p className={cn("text-3xl font-black leading-none italic", ins.closedCount > 0 ? "text-emerald-600" : "text-emerald-300")}>{ins.closedCount}</p>
                    </div>
                  </div>
                  
                  {ins.summary && <p className="text-[11px] text-slate-500 mt-2 line-clamp-2 italic leading-relaxed border-l-2 border-slate-200 pl-3">"{ins.summary}"</p>}
               </div>

               {/* Footer / Results Section */}
               <div className="px-8 pb-8">
                  <div className="bg-slate-900 group-hover:bg-blue-600 transition-colors duration-500 rounded-[2rem] p-6 text-white shadow-xl shadow-slate-900/10">
                    <div className="flex items-center justify-between mb-4">
                       <div className="flex-1 pr-4">
                         <div className="flex justify-between items-center mb-1.5">
                           <span className="text-[8px] font-black text-white/40 uppercase tracking-widest">Site Clearance</span>
                           <span className="text-lg font-black italic">{ins.closureRate}%</span>
                         </div>
                         <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                           <motion.div 
                             initial={{ width: 0 }}
                             animate={{ width: `${ins.closureRate}%` }}
                             className={cn(
                               "h-full rounded-full transition-all",
                               ins.closureRate === 100 ? "bg-emerald-400" : "bg-white"
                             )}
                           />
                         </div>
                       </div>

                       <div className="flex -space-x-2">
                         {ins.inspectionObservations
                            .filter(o => o.beforeImageUrl || o.afterImageUrl)
                            .slice(0, 3)
                            .map((o, idx) => (
                               <div key={idx} className="w-8 h-8 rounded-full border-2 border-slate-900 overflow-hidden shadow-lg group-hover:border-blue-600 transition-colors bg-slate-800">
                                  <img src={o.beforeImageUrl || o.afterImageUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                               </div>
                            ))}
                         {ins.obsCount > 3 && (
                           <div className="w-8 h-8 rounded-full border-2 border-slate-900 bg-white flex items-center justify-center text-[10px] font-black text-slate-900 shadow-md z-10 group-hover:border-blue-600 transition-colors italic">
                              +{ins.obsCount - 3}
                           </div>
                         )}
                       </div>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                       <div className="flex items-center gap-2">
                          <Activity size={14} className="text-white/40" />
                          <span className="text-[9px] font-bold uppercase tracking-widest">{ins.obsCount} Total Records Filtered</span>
                       </div>
                       <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center group-hover:bg-white/20 transition-all">
                          <ArrowRight size={18} />
                       </div>
                    </div>
                  </div>
               </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Bulk Action Bar */}
      <AnimatePresence>
        {isExporting && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm"
          >
            <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl flex flex-col items-center text-center max-w-sm mx-4">
              <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white mb-6 animate-bounce shadow-2xl shadow-blue-600/30">
                <FileDown size={32} />
              </div>
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter italic mb-2">Generating Protocol</h3>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-6">Compiling evidence transcript & digital assets...</p>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="h-full bg-blue-600 rounded-full"
                />
              </div>
              <p className="text-[8px] font-black text-blue-600 uppercase tracking-widest mt-4 animate-pulse">Encoding Digital Certificate</p>
            </div>
          </motion.div>
        )}

        {selectedIds.size > 0 && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[60] bg-slate-900 text-white px-6 py-4 rounded-3xl shadow-2xl flex items-center gap-8 border border-white/10 backdrop-blur-xl"
          >
             <div className="flex flex-col">
               <span className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-400">Bulk Control Active</span>
               <span className="text-xs font-black italic">{selectedIds.size} Inspections Selected</span>
             </div>

             <div className="h-8 w-px bg-white/10"></div>

             <div className="flex items-center gap-3">
                <button 
                  onClick={handleBulkResolve}
                  disabled={isBulkProcessing}
                  className="flex items-center gap-2 px-6 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                >
                   {isBulkProcessing ? (
                     <Loader2 className="animate-spin" size={14} />
                   ) : (
                     <CheckCircle2 size={14} />
                   )}
                   Mark Resolved
                </button>

                <button 
                  onClick={handleExportCSV}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                   <Download size={14} />
                   Export CSV
                </button>

                <button 
                  onClick={() => setSelectedIds(new Set())}
                  className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all"
                >
                   <X size={16} />
                </button>
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Share & QR Modal */}
      <AnimatePresence>
        {showPrintPreview && selectedInspectionId && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md overflow-y-auto print:bg-white print:p-0 print:static print:block print:z-0">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="flex flex-col gap-4 w-full max-w-4xl my-8 pointer-events-auto print:my-0 print:max-w-none print:gap-0"
            >
              {/* Control Bar */}
              <div className="bg-white/10 backdrop-blur-xl border border-white/20 p-4 rounded-3xl flex justify-between items-center sticky top-0 z-20 shadow-2xl print:hidden">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-white backdrop-blur-md border border-white/30">
                    <Printer size={24} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] leading-none">Document Protocol Preview</h3>
                    <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest mt-1.5">Manual Inspection Review • Reference: #{selectedInspectionId}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setShowPrintPreview(false)}
                    className="px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/10"
                  >
                    Return to Register
                  </button>
                  <button 
                    onClick={() => handleExportPDF(selectedInspectionId, 'print-preview-surface')}
                    disabled={isExporting}
                    className="px-6 py-2.5 bg-sky-500 hover:bg-sky-400 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-2xl shadow-sky-500/40 disabled:opacity-50"
                  >
                    {isExporting ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                    PDF Capture
                  </button>
                  <button 
                    onClick={() => window.print()}
                    className="px-8 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-2xl shadow-emerald-500/40"
                  >
                    <Printer size={14} />
                    Confirm & Execute Print
                  </button>
                </div>
              </div>

              {/* Paper Surface Preview */}
              <div id="print-preview-surface" className="bg-white shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] p-12 w-full rounded-sm flex flex-col relative text-slate-900 min-h-[11in] print:shadow-none print:p-0">
                {/* Simulated Paper Edge Shadow */}
                <div className="absolute top-0 left-0 w-1 h-full bg-slate-100/50"></div>
                
                {(() => {
                   const ins = (filteredInsData.find(i => normalizeId(i.id) === normalizeId(selectedInspectionId)) || 
                                insData.find(i => normalizeId(i.id) === normalizeId(selectedInspectionId)));
                   if (!ins) return null;
                   
                   return (
                     <div className="space-y-8">
                       <div className="flex justify-between items-start border-b-4 border-slate-900 pb-8">
                         <div>
                           <div className="flex items-center gap-2 mb-3">
                             <div className="w-10 h-10 bg-slate-900 flex items-center justify-center text-white font-black italic rounded">H</div>
                             <h2 className="text-3xl font-black italic tracking-tighter uppercase text-slate-900 leading-none">HouseKeep OS</h2>
                           </div>
                           <h2 className="text-xl font-black italic tracking-tighter uppercase text-slate-900">Inspection Protocol Registry</h2>
                           <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Detailed Evidence Transcript • Ref: {ins.id}</p>
                         </div>
                         <div className="text-right">
                           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Verification Date</p>
                           <p className="text-lg font-black text-slate-900">{ins.fullDate}</p>
                           <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Location: {ins.displayLocation}</p>
                         </div>
                       </div>

                       <div className="grid grid-cols-2 gap-8 py-4">
                          <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-900 flex flex-col justify-center">
                              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-3">Aggregation Summary</p>
                              <div className="flex items-end gap-2 mb-4">
                                <span className="text-5xl font-black text-slate-900 leading-none">{ins.inspectionObservations.length}</span>
                                <span className="text-sm font-black text-slate-500 uppercase pb-1 tracking-tighter italic whitespace-nowrap">Observations Processed</span>
                              </div>
                              <div className="flex gap-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">{ins.openCount} Critical</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">{ins.closedCount} Resolved</span>
                                </div>
                              </div>
                          </div>
                          <div className="p-4 border-2 border-slate-100 rounded-2xl flex items-center gap-6">
                             <QRCodeSVG 
                               value={`${window.location.origin}/reports?inspectionId=${ins.id}`} 
                               size={100} 
                               level="H"
                             />
                             <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Digital Certificate</p>
                                <p className="text-sm font-black text-slate-900 leading-none">ID: #{ins.id}</p>
                                <p className="text-[9px] text-slate-500 font-medium mt-3 italic leading-tight">This report is a verified digital transcript of the operational audit registry.</p>
                             </div>
                          </div>
                       </div>

                       <div className="space-y-6">
                         <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 pb-2">Granular Findings Register</h4>

                         {sortedObservations.map((obs, idx) => (
                           <div key={obs.id} className="border-b border-slate-100 pb-6 last:border-0 last:pb-0 page-break-inside-avoid">
                             <div className="flex justify-between items-start mb-4">
                               <div className="flex items-start gap-4">
                                 <span className="text-sm font-black italic text-slate-300">0{idx + 1}</span>
                                 <div>
                                   <div className="flex items-center gap-2 mb-1">
                                     <span className="text-[9px] font-black uppercase tracking-widest text-blue-600">{obs.location}</span>
                                     <span className="text-[9px] font-bold text-slate-300 px-2">•</span>
                                     <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">#{obs.id}</span>
                                   </div>
                                   <h4 className="text-base font-black text-slate-900 uppercase tracking-tight leading-none mb-1">Finding Analysis</h4>
                                   <p className="text-[10px] font-bold text-slate-400 uppercase">Timestamp: {formatDate(obs.createdAt)}</p>
                                 </div>
                               </div>
                               <span className="px-3 py-1 bg-slate-900 text-white text-[9px] font-black uppercase tracking-tighter rounded italic">
                                 {obs.status}
                               </span>
                             </div>
                             
                             <div 
                               className="text-sm text-slate-700 leading-relaxed bg-slate-50 p-6 rounded-2xl border border-slate-100 mb-6 font-medium italic"
                               dangerouslySetInnerHTML={{ __html: obs.description }}
                             />

                             {(obs.beforeImageUrl || obs.afterImageUrl) && (
                               <div className="grid grid-cols-2 gap-4">
                                 {obs.beforeImageUrl && (
                                   <div className="space-y-2">
                                     <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Baseline Evidence</p>
                                     <div className="aspect-video rounded-xl overflow-hidden border border-slate-200">
                                       <img src={obs.beforeImageUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                     </div>
                                   </div>
                                 )}
                                 {obs.afterImageUrl && (
                                   <div className="space-y-2">
                                     <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Resolution Proof</p>
                                     <div className="aspect-video rounded-xl overflow-hidden border border-emerald-200">
                                       <img src={obs.afterImageUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                     </div>
                                   </div>
                                 )}
                               </div>
                             )}
                           </div>
                         ))}
                       </div>

                       {/* Footer for print preview */}
                       <div className="mt-12 pt-8 border-t-4 border-slate-900 flex justify-between items-end">
                         <div>
                           <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Authorized Signature Registry</p>
                           <div className="flex gap-12">
                             <div>
                               <div className="h-10 border-b border-slate-300 w-48 mb-1"></div>
                               <p className="text-[8px] font-bold text-slate-400 uppercase">Inspector General</p>
                             </div>
                             <div>
                               <div className="h-10 border-b border-slate-300 w-48 mb-1"></div>
                               <p className="text-[8px] font-bold text-slate-400 uppercase">Facility Representative</p>
                             </div>
                           </div>
                         </div>
                         <div className="text-right">
                           <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Protocol OS v3.4.0</p>
                           <p className="text-[8px] font-bold text-slate-300 uppercase">Verification Page 1 / 1</p>
                         </div>
                       </div>
                     </div>
                   );
                })()}
              </div>
            </motion.div>
          </div>
        )}

        {isShareModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
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
                      Digital Inspection Registry
                   </h3>
                   <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Inspection Verification Protocol • #{shareInspectionId}</p>
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
                              onClick={() => {
                                setShareSections(prev => 
                                  prev.includes(sec.id) 
                                    ? prev.filter(id => id !== sec.id) 
                                    : [...prev, sec.id]
                                );
                              }}
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
                  const baseUrl = window.location.origin + '/reports';
                  const params = new URLSearchParams();
                  if (shareInspectionId) params.set('inspectionId', shareInspectionId);
                  if (shareDateStart) params.set('startDate', shareDateStart);
                  if (shareDateEnd) params.set('endDate', shareDateEnd);
                  if (shareSections.length > 0) params.set('sections', shareSections.join(','));
                  
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
                        <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none text-slate-900">
                           <ClipboardList size={80} />
                        </div>
                      </div>

                      <div className="space-y-2 mb-8">
                        <h4 className="text-sm font-black text-slate-900 uppercase italic">Verification QR Entry</h4>
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
                          Authorized scanning directs to the localized pictographical evidence and rectification status for this specific inspection record.
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4 w-full">
                        <button 
                          onClick={() => {
                            const actualSvg = document.querySelector('svg');
                            if (actualSvg) {
                               const svgData = new XMLSerializer().serializeToString(actualSvg);
                               const svgBlob = new Blob([svgData], {type:"image/svg+xml;charset=utf-8"});
                               const url = URL.createObjectURL(svgBlob);
                               const downloadLink = document.createElement("a");
                               downloadLink.download = `QR_INSPECTION_VERIFY_${shareInspectionId}.svg`;
                               downloadLink.href = url;
                               downloadLink.click();
                            }
                          }}
                          className="bg-slate-900 text-white py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-blue-600 transition-all shadow-lg"
                        >
                          <Download size={14} />
                          Save Digital ID
                        </button>
                        <button 
                          onClick={() => {
                            setShowPrintPreview(true);
                          }}
                          className="bg-slate-100 text-slate-900 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-200 transition-all border border-slate-200"
                        >
                          <Printer size={14} />
                          Print
                        </button>
                        <button 
                          onClick={() => {
                            navigate(`/reports?${params.toString()}`);
                          }}
                          className="bg-emerald-50 text-emerald-700 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-100 transition-all border border-emerald-100 col-span-2"
                        >
                          <FileText size={14} />
                          Launch Configured Report
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 italic text-[9px] font-bold text-slate-400 text-center uppercase tracking-widest">
                Compliance Node: {window.location.hostname} • Registry v1.2
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {filteredInsData.length === 0 && (
        <div className="text-center py-24 bg-white rounded-3xl border border-dashed border-slate-200">
           <ClipboardList size={40} className="mx-auto text-slate-200 mb-4" strokeWidth={1} />
           <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">Zero Records found matching criteria</p>
           <button 
            onClick={() => { setSelectedLocation("All Locations"); setSelectedMonth("All Time"); }}
            className="mt-4 text-[10px] font-black text-blue-600 uppercase tracking-widest underline decoration-2 underline-offset-4"
           >
             Clear All Constraints
           </button>
        </div>
      )}

      {/* Slide-over Detail Panel */}
      <AnimatePresence>
        {selectedInspectionId && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedInspectionId(null)}
              className={cn("fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40", showPrintPreview && "print:hidden")}
            />
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className={cn("fixed top-0 right-0 h-full w-full max-w-2xl bg-slate-50 shadow-2xl z-50 flex flex-col border-l border-slate-200", showPrintPreview && "print:hidden")}
            >
              <div className="bg-white p-6 border-b border-slate-200 flex justify-between items-center shadow-sm">
                {(() => {
                  const ins = (filteredInsData.find(i => normalizeId(i.id) === normalizeId(selectedInspectionId)) || 
                               insData.find(i => normalizeId(i.id) === normalizeId(selectedInspectionId)));
                  if (!ins) return <div className="animate-pulse flex items-center gap-2"><div className="w-4 h-4 bg-slate-200 rounded"></div><div className="w-32 h-4 bg-slate-200 rounded"></div></div>;
                  return (
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-black bg-slate-900 text-white px-2 py-0.5 rounded uppercase tracking-tighter italic shadow-sm">LOG: {ins?.id}</span>
                        {/* @ts-ignore */}
                        {ins?.isGrouped && (
                          <span className="text-[9px] font-black bg-emerald-500 text-white px-2 py-0.5 rounded-full uppercase tracking-widest shadow-sm">Consolidated Report</span>
                        )}
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{ins?.fullDate}</span>
                      </div>
                      <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter leading-none italic">{ins?.displayLocation || 'Location Log'}</h3>
                    </div>
                  );
                })()}
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleExportPDF(selectedInspectionId)}
                    disabled={isExporting}
                    className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-900/10 disabled:opacity-50 disabled:cursor-not-allowed print:hidden"
                  >
                    {isExporting ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                    Export PDF
                  </button>
                  <button 
                    onClick={() => setShowPrintPreview(true)}
                    className="flex items-center gap-2 px-5 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all shadow-lg shadow-slate-900/10 mr-2 print:hidden"
                  >
                    <Printer size={14} />
                    Print
                  </button>
                  <button onClick={() => setSelectedInspectionId(null)} className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full transition-colors print:hidden">
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div id="inspection-registry-entry" className="flex-1 overflow-y-auto p-6 space-y-6">
                {(() => {
                   const ins = (filteredInsData.find(i => normalizeId(i.id) === normalizeId(selectedInspectionId)) || 
                                insData.find(i => normalizeId(i.id) === normalizeId(selectedInspectionId)));
                   if (!ins) return null;
                   return (
                     <>
                      {/* Detailed Print Header - Only visible on paper */}
                      <div className="hidden print:flex flex-col border-b-2 border-slate-900 pb-4 mb-6">
                        <div className="flex justify-between items-end">
                          <div>
                            <h2 className="text-2xl font-black italic tracking-tighter uppercase text-slate-900">Inspection Protocol Registry</h2>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Detailed Evidence Transcript • Ref: {ins.id}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[8px] font-black text-slate-400 uppercase">Verification Date</p>
                            <p className="text-sm font-black text-slate-900">{ins.fullDate}</p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-3 print:grid-cols-2">
                         <div className="col-span-3 bg-slate-900 p-6 rounded-3xl text-white shadow-2xl relative overflow-hidden group">
                           <div className="absolute right-0 top-0 w-32 h-32 bg-white/5 rounded-full -translate-y-16 translate-x-16 blur-2xl group-hover:bg-blue-500/10 transition-all duration-700"></div>
                           <div className="relative z-10">
                              <p className="text-[10px] font-bold uppercase tracking-[0.3em] opacity-60 mb-2">Aggregate Status</p>
                              <p className="text-3xl font-black italic mb-4">{ins.inspectionObservations.length} Observations Recv.</p>
                              <div className="flex gap-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)] animate-pulse"></div>
                                  <span className="text-[10px] font-black uppercase tracking-widest">{ins.openCount} Critical</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]"></div>
                                  <span className="text-[10px] font-black uppercase tracking-widest">{ins.inProgressCount} Progress</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"></div>
                                  <span className="text-[10px] font-black uppercase tracking-widest">{ins.closedCount} Resolved</span>
                                </div>
                              </div>
                           </div>
                         </div>
                         <div className="col-span-1 bg-white p-3 rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center justify-center gap-2">
                            <QRCodeSVG 
                              value={`${window.location.origin}/reports?inspectionId=${ins.id}`} 
                              size={80} 
                              level="H"
                            />
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Protocol ID</p>
                            <p className="text-[10px] font-mono font-bold text-slate-900 leading-none">#{ins.id}</p>
                         </div>
                      </div>


                      <div className="space-y-4">
                        <div className="flex items-center justify-between px-1">
                          <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Granular Findings Register</h4>
                          <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest italic">Sorted by {obsSortField === 'sectionName' ? 'Section' : obsSortField === 'createdAt' ? 'Date' : 'Field'}</span>
                        </div>

                        {/* Sortable Header Table-Style */}
                        <div className="bg-slate-200/50 p-3 rounded-xl border border-slate-200 grid grid-cols-6 gap-4 print:hidden">
                           <button 
                             onClick={() => toggleObsSort('id')}
                             className="text-[9px] font-black text-slate-500 uppercase tracking-widest text-left hover:text-blue-600 transition-colors"
                           >
                             ID {obsSortField === 'id' && (obsSortDirection === 'asc' ? '↑' : '↓')}
                           </button>
                           <button 
                             onClick={() => toggleObsSort('sectionName')}
                             className="col-span-2 text-[9px] font-black text-slate-500 uppercase tracking-widest text-left hover:text-blue-600 transition-colors"
                           >
                             Section {obsSortField === 'sectionName' && (obsSortDirection === 'asc' ? '↑' : '↓')}
                           </button>
                           <button 
                             onClick={() => toggleObsSort('status')}
                             className="text-[9px] font-black text-slate-500 uppercase tracking-widest text-left hover:text-blue-600 transition-colors"
                           >
                             Status {obsSortField === 'status' && (obsSortDirection === 'asc' ? '↑' : '↓')}
                           </button>
                           <button 
                             onClick={() => toggleObsSort('createdAt')}
                             className="col-span-2 text-[9px] font-black text-slate-500 uppercase tracking-widest text-right hover:text-blue-600 transition-colors"
                           >
                             Created Date {obsSortField === 'createdAt' && (obsSortDirection === 'asc' ? '↑' : '↓')}
                           </button>
                        </div>

                        {sortedObservations.map((obs, idx) => {
                          const obsSection = sections.find(s => s.id === obs.sectionId)?.name || 'General';
                          return (
                            <motion.div 
                              key={obs.id} 
                              initial={{ opacity: 0, x: 20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: idx * 0.05 }}
                              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 hover:border-blue-200 transition-colors"
                            >
                              <div className="flex justify-between items-start gap-4">
                                <div className="flex items-start gap-4">
                                   <div className="flex flex-col items-center gap-1">
                                     <span className="w-10 h-10 rounded-xl bg-slate-50 text-slate-900 border border-slate-200 flex items-center justify-center text-xs font-black italic shrink-0 shadow-sm">
                                       {idx + 1}
                                     </span>
                                     <span className="text-[7px] font-mono text-slate-400">#{obs.id}</span>
                                   </div>
                                   <div>
                                     <div className="flex items-center gap-3 mb-1">
                                        <div className="flex items-center gap-1">
                                          <MapPin size={10} className="text-blue-500" />
                                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{obs.location}</p>
                                        </div>
                                        <div className="h-3 w-px bg-slate-200"></div>
                                        <div className="flex items-center gap-1">
                                          <Activity size={10} className="text-emerald-500" />
                                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{obsSection}</p>
                                        </div>
                                     </div>
                                     <h4 className="text-[13px] font-black text-slate-800 leading-tight uppercase tracking-tight">
                                       Evidence Transcription
                                     </h4>
                                     <p className="text-[10px] text-slate-400 mt-0.5 font-bold uppercase tracking-tight">
                                       Reported: {formatDate(obs.createdAt)}
                                     </p>
                                     <div 
                                       className="text-xs text-slate-600 mt-3 italic leading-relaxed bg-slate-50/50 p-4 rounded-xl border border-slate-100 prose prose-slate max-w-none"
                                       dangerouslySetInnerHTML={{ __html: obs.description }}
                                     />
                                   </div>
                                </div>
                                <span className={cn(
                                  "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter whitespace-nowrap shadow-sm border",
                                  obs.status === 'Open' ? "bg-rose-50 border-rose-100 text-rose-600" : 
                                  obs.status === 'In Progress' ? "bg-amber-50 border-amber-100 text-amber-600" : 
                                  "bg-emerald-50 border-emerald-100 text-emerald-600"
                                )}>
                                  {obs.status === 'Open' ? 'UNRESOLVED' : 
                                   obs.status === 'In Progress' ? 'PROGRESSING' : 
                                   'RECTIFIED'}
                                </span>
                              </div>

                              {(obs.beforeImageUrl || obs.afterImageUrl) && (
                                <div className="grid grid-cols-2 gap-3">
                                   <div className="space-y-2">
                                     <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">Baseline State</p>
                                     {obs.beforeImageUrl ? (
                                       <div className="relative aspect-[16/10] bg-slate-100 rounded-xl overflow-hidden border border-slate-200 shadow-sm group">
                                          <img src={obs.beforeImageUrl} className="w-full h-full object-cover transition-transform group-hover:scale-110 duration-700" referrerPolicy="no-referrer" />
                                          <div className="absolute top-2 left-2 bg-slate-900/40 backdrop-blur-md text-white text-[8px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-lg">Before</div>
                                       </div>
                                     ) : (
                                       <div className="flex items-center justify-center bg-slate-50 border border-dashed border-slate-200 rounded-xl aspect-[16/10]">
                                          <p className="text-[8px] font-bold text-slate-300 uppercase tracking-widest italic">No Visual Baseline</p>
                                       </div>
                                     )}
                                   </div>
                                   
                                   <div className="space-y-2">
                                     <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">Rectification Proof</p>
                                     {obs.afterImageUrl ? (
                                       <div className="relative aspect-[16/10] bg-emerald-50 rounded-xl overflow-hidden border border-emerald-100 shadow-sm group">
                                          <img src={obs.afterImageUrl} className="w-full h-full object-cover transition-transform group-hover:scale-110 duration-700" referrerPolicy="no-referrer" />
                                          <div className="absolute top-2 left-2 bg-emerald-600/60 backdrop-blur-md text-white text-[8px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-lg">Result</div>
                                       </div>
                                     ) : (
                                       <div className="flex items-center justify-center bg-slate-50 border border-dashed border-slate-200 rounded-xl aspect-[16/10]">
                                          <p className="text-[8px] font-bold text-slate-300 uppercase tracking-widest italic">Fix Not Logged</p>
                                       </div>
                                     )}
                                   </div>
                                </div>
                              )}
                            </motion.div>
                          );
                        })}
                      </div>
                     </>
                   );
                })()}
              </div>

              <div className="p-6 bg-white border-t border-slate-200">
                 <button 
                  onClick={() => setSelectedInspectionId(null)}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] hover:bg-blue-600 transition-all shadow-xl shadow-slate-900/20 active:scale-95"
                 >
                   End Analysis Session
                 </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

