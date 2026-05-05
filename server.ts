import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import cors from "cors";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  console.log("Starting HouseKeep OS Server...");
  const app = express();
  app.use(cors());
  app.use(express.json());
  const PORT = 3000;

  // Helper to parse dates robustly, especially dd/mm/yyyy
  const parseFlexDate = (raw: any): string => {
    if (!raw) return "";
    const str = raw.toString().trim();
    if (!str) return "";

    // Excel serial dates
    if (/^\d+(\.\d+)?$/.test(str)) {
      const serial = parseFloat(str);
      const date = new Date((serial - 25569) * 86400 * 1000);
      return !isNaN(date.getTime()) ? date.toISOString() : str;
    }

    // Try parsing dd/mm/yyyy explicitly as it's common in spreadsheets
    const dmyMatch = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(\s+\d{1,2}:\d{1,2}(:\d{1,2})?)?$/);
    if (dmyMatch) {
      let day = parseInt(dmyMatch[1], 10);
      let month = parseInt(dmyMatch[2], 10) - 1; // 0-indexed
      let yearStr = dmyMatch[3];
      let year = parseInt(yearStr, 10);
      
      // Handle 2-digit years
      if (yearStr.length === 2) {
        year += year < 50 ? 2000 : 1900;
      }

      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) {
        // If we have time, try to append it or just use the date
        return date.toISOString();
      }
    }

    // Fallback to standard JS parsing
    const date = new Date(str);
    if (!isNaN(date.getTime())) return date.toISOString();

    return str; // Return raw string if parsing fails
  };

  // Google Sheets Auth Setup
  const getSheetsClient = () => {
    let credentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const isDebug = process.env.DEBUG === "true";

    if (isDebug) {
      console.log("[DEBUG] Initializing Google Sheets Client...");
      console.log("[DEBUG] GOOGLE_SHEET_ID:", process.env.GOOGLE_SHEET_ID ? "PRESENT" : "MISSING");
    }

    if (!credentials) {
      console.warn("GOOGLE_SERVICE_ACCOUNT_JSON is missing. Using empty client (Development mode).");
      return null;
    }

    let cleanCreds = "";
    try {
      // Clean up potential formatting issues in the JSON string from .env
      cleanCreds = credentials.trim();
      
      // Step 1: Remove any surrounding literal quotes that might be added by the env loader
      if (cleanCreds.startsWith('"') && cleanCreds.endsWith('"')) {
        cleanCreds = cleanCreds.substring(1, cleanCreds.length - 1);
      } else if (cleanCreds.startsWith("'") && cleanCreds.endsWith("'")) {
        cleanCreds = cleanCreds.substring(1, cleanCreds.length - 1);
      }

      // Step 2: Handle escaped characters that might be literally present as sequences
      if (cleanCreds.includes('\\n') || cleanCreds.includes('\\"')) {
        try {
          const attempt = JSON.parse(cleanCreds);
          if (typeof attempt === 'string') cleanCreds = attempt;
          else if (typeof attempt === 'object' && attempt !== null) cleanCreds = JSON.stringify(attempt);
        } catch (e) {
          // Fallback manual replacement
          cleanCreds = cleanCreds.replace(/\\n/g, '\n').replace(/\\"/g, '"');
        }
      }

      // Step 3: Extract specifically the JSON object part
      const firstB = cleanCreds.indexOf('{');
      const lastB = cleanCreds.lastIndexOf('}');
      if (firstB !== -1 && lastB !== -1 && lastB > firstB) {
          cleanCreds = cleanCreds.substring(firstB, lastB + 1);
      }

      const parsedCreds = JSON.parse(cleanCreds);

      const auth = new google.auth.GoogleAuth({
        credentials: parsedCreds,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });
      return google.sheets({ version: "v4", auth });
    } catch (e: any) {
      console.error("Failed to initialize Google Sheets client:", e.message);
      if (isDebug) {
        console.error("[DEBUG] Error Details:", e);
        console.error("[DEBUG] Credentials string head (after cleanup):", cleanCreds.substring(0, 50));
      }
      return null;
    }
  };

  let SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
  if (SPREADSHEET_ID) {
    SPREADSHEET_ID = SPREADSHEET_ID.trim().replace(/^['"]+|['"]+$/g, "");
  }

  // Global error handler utility
  const handleApiError = (res: any, e: any, context: string) => {
    console.error(`Error in ${context}:`, e.message || e);
    const message = e.message || String(e);
    res.status(500).json({ 
      error: `Failure during ${context}`, 
      details: message,
      source: "Server"
    });
  };

  // Health Check / Connection Debug
  app.get("/api/health", async (req, res) => {
    const sheets = getSheetsClient();
    const isDebug = process.env.DEBUG === "true" || !sheets;

    const status = {
      sheetsClient: !!sheets,
      spreadsheetId: !!SPREADSHEET_ID,
      env: process.env.NODE_ENV,
      debug: isDebug,
      spreadsheetConnection: "Checking...",
      credsInfo: "No sheets client"
    };

    if (!sheets) {
       const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "";
       status.credsInfo = `RAW_PRESENT: ${!!raw}, LENGTH: ${raw.length}, STARTS: ${raw.substring(0, 10)}...`;
    }

    if (sheets && SPREADSHEET_ID) {
      try {
        const metadata = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
        status.spreadsheetConnection = "OK";
        
        // Fetch headers for debugging
        const inspectionsRes = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: "Inspections!A1:Z1"
        });
        const observationsRes = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: "Observations!A1:Z1"
        });
        
        (status as any).headers = {
          inspections: inspectionsRes.data.values?.[0] || [],
          observations: observationsRes.data.values?.[0] || []
        };
      } catch (e: any) {
        status.spreadsheetConnection = `FAIL: ${e.message}`;
        if (isDebug) console.error("[DEBUG] Connection Error:", e.message);
      }
    } else {
      status.spreadsheetConnection = "MISCONFIGURED";
    }

    res.json(status);
  });

  // --- MOCK DATA FOR DEMO ---
  let mockSections = [
    { id: "SEC1", name: "Lobby & Reception" },
    { id: "SEC2", name: "Guest Rooms (Floor 4)" },
    { id: "SEC3", name: "Fitness Center" },
  ];
  let mockInspections = [
    { id: "INS1", date: "2024-05-01", sectionId: "SEC1" },
  ];
  let mockObservations = [
    { id: "OBS1", inspectionId: "INS1", location: "Entrance G1", description: "Fingerprints on glass doors", status: "Open", createdAt: new Date().toISOString() },
  ];

  // API Routes
  app.get("/api/sections", async (req, res) => {
    const sheets = getSheetsClient();
    if (!sheets || !SPREADSHEET_ID) return res.json(mockSections);
    
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: "Section!A1:Z", // Changed from Sections!A2:B to Section!A1:Z to be more inclusive and follow user's naming
      });
      const allRows = response.data.values || [];
      if (allRows.length === 0) return res.json([]);

      // Find headers
      const headers = allRows[0] || [];
      const dataRows = allRows.slice(1);

      const idIdx = getFlexibleColIdx(headers, ["sectionid", "id", "code"], 0);
      const nameIdx = getFlexibleColIdx(headers, ["sectionname", "name", "title"], 1);

      const sections = dataRows.map(r => ({ 
        id: (r[idIdx] || "").toString().trim(), 
        name: (r[nameIdx] || r[idIdx] || "Unnamed Section").toString().trim() 
      })).filter(s => s.id);
      res.json(sections);
    } catch (e: any) {
      // Fallback try Sections if Section fails
      try {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: "Sections!A1:Z",
        });
        const allRows = response.data.values || [];
        const headers = allRows[0] || [];
        const dataRows = allRows.slice(1);
        const idIdx = getFlexibleColIdx(headers, ["sectionid", "id", "code"], 0);
        const nameIdx = getFlexibleColIdx(headers, ["sectionname", "name", "title"], 1);
        const sections = dataRows.map(r => ({ 
          id: (r[idIdx] || "").toString().trim(), 
          name: (r[nameIdx] || r[idIdx] || "Unnamed Section").toString().trim() 
        })).filter(s => s.id);
        return res.json(sections);
      } catch (e2) {
        handleApiError(res, e, "fetching sections");
      }
    }
  });

  app.get("/api/inspections", async (req, res) => {
    const sheets = getSheetsClient();
    const isDebug = process.env.DEBUG === "true";
    if (!sheets || !SPREADSHEET_ID) return res.json(mockInspections);
    
    try {
      if (isDebug) console.log("[DEBUG] Fetching Inspections!A1:F...");
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: "Inspections!A1:F",
      });
      const allRows = response.data.values || [];
      
      // Find the header row
      let headerIdx = 0;
      for (let i = 0; i < Math.min(allRows.length, 10); i++) {
        const row = allRows[i];
        if (row && row.some((cell: any) => {
          const s = cell?.toString().toLowerCase() || "";
          return (
            s.includes("id") ||
            s.includes("audit") ||
            s.includes("inspection") ||
            s.includes("location") ||
            s.includes("description") ||
            s.includes("date")
          );
        })) {
          headerIdx = i;
          break;
        }
      }

      const headers = allRows[headerIdx] || [];
      const dataRows = allRows.slice(headerIdx + 1);

      const inspections = dataRows.map((r, index) => {
        const idIdx = getFlexibleColIdx(headers, ["inspectionid", "auditid", "audit", "serial", "id"], -1);
        const dateIdx = getFlexibleColIdx(headers, ["reporteddate", "date", "time", "timestamp", "created", "day", "inspectedon", "audit date", "inspection date"], -1);
        const secIdx = getFlexibleColIdx(headers, ["sectionid", "section", "category", "department", "area"], -1);
        // Location might not exist in Inspections tab, don't default to Section index if it doesn't match
        const locIdx = getFlexibleColIdx(headers, ["location", "site", "place", "point"], -1);
        const sumIdx = getFlexibleColIdx(headers, ["summary", "description", "remarks", "scope"], -1);
        const audIdx = getFlexibleColIdx(headers, ["auditor", "inspector", "person", "auditedby"], -1);

        const dateValue = dateIdx !== -1 ? parseFlexDate(r[dateIdx]) : "";

        // Greedy Fallback: if still no date, search the row for anything that looks like a date
        let finalDate = dateValue;
        if (!finalDate || isNaN(new Date(finalDate).getTime())) {
           for (const cell of r) {
             if (cell && cell.toString().includes('/') && !isNaN(new Date(parseFlexDate(cell)).getTime())) {
                finalDate = parseFlexDate(cell);
                break;
             }
           }
        }

        const getSafe = (row: any[], idx: number, fallback: string = "") => {
          if (idx === -1 || idx >= row.length || row[idx] === undefined || row[idx] === null) return fallback;
          return row[idx].toString().trim();
        };

        return { 
          id: (idIdx !== -1 && idIdx < r.length && r[idIdx] ? r[idIdx] : `ins-auto-${index}`).toString().trim(), 
          date: finalDate, 
          sectionId: getSafe(r, secIdx),
          location: getSafe(r, locIdx),
          summary: getSafe(r, sumIdx),
          auditor: getSafe(r, audIdx),
        };
      });
      res.json(inspections);
    } catch (e: any) {
      handleApiError(res, e, "fetching inspections");
    }
  });

  app.post("/api/inspections", async (req, res) => {
    const { date, sectionId, location } = req.body;
    const id = "INS-" + Date.now();
    const newInspection = { id, date, sectionId, location };

    const sheets = getSheetsClient();
    if (!sheets || !SPREADSHEET_ID) {
      mockInspections.push(newInspection as any);
      return res.json(newInspection);
    }

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: "Inspections!A2:D",
        valueInputOption: "RAW",
        requestBody: { values: [[id, date, sectionId || "", location || ""]] },
      });
      res.json(newInspection);
    } catch (e) {
      res.status(500).json({ error: "Failed to save inspection" });
    }
  });

  // Helper to normalize image URLs (especially Google Drive links)
  const formatImageUrl = (url: any) => {
    if (!url) return "";
    const cleanUrl = url.toString().trim();
    
    // Check if it's already a formatted lh3 link
    if (cleanUrl.includes("lh3.googleusercontent.com/d/")) return cleanUrl;

    // Detect Google Drive patterns
    if (cleanUrl.includes("drive.google.com") || 
        cleanUrl.includes("google.com/open?id=") || 
        cleanUrl.includes("google.com/uc?") ||
        cleanUrl.includes("google.com/file/d/") ||
        cleanUrl.includes("googleusercontent.com")) {
      
      let id = "";
      
      // Extensive ID extraction patterns
      const patterns = [
        /\/d\/([a-zA-Z0-9\-_]{25,})/,       // Standard ID (usually 33 chars)
        /[?&]id=([a-zA-Z0-9\-_]{25,})/,     // Query param ID
        /\/file\/d\/([a-zA-Z0-9\-_]{20,})/, // File URL path ID (can be slightly shorter)
        /uc\?id=([a-zA-Z0-9\-_]{20,})/,     // UC format
        /open\?id=([a-zA-Z0-9\-_]{20,})/    // Open format
      ];

      for (const pattern of patterns) {
        const match = cleanUrl.match(pattern);
        if (match && match[1]) {
          id = match[1];
          break;
        }
      }

      // Final fallback for raw IDs or slightly shorter ones often found in shared links
      if (!id) {
        const simpleMatch = cleanUrl.match(/\/d\/([a-zA-Z0-9-_]+)/) || cleanUrl.match(/[?&]id=([a-zA-Z0-9-_]+)/);
        if (simpleMatch && simpleMatch[1].length > 15) id = simpleMatch[1];
      }
      
      // Fallback: If it's a 25-50 char alphanumeric string without slashes/dots, it might be a raw ID
      if (!id && cleanUrl.match(/^[a-zA-Z0-9-_]{25,50}$/)) {
        id = cleanUrl;
      }
      
      if (id) {
        return `https://lh3.googleusercontent.com/d/${id}=s2000`;
      }
    }

    // Handle direct image extensions
    if (cleanUrl.startsWith("http") && (
      cleanUrl.match(/\.(jpg|jpeg|png|webp|gif|svg|bmp|heic|tiff)/i) ||
      cleanUrl.includes("googleusercontent.com")
    )) {
      return cleanUrl;
    }

    return "";
  };

  const isImageUrl = (str: any) => {
    if (!str || typeof str !== 'string') return false;
    const s = str.trim();
    
    // Don't treat spreadsheet links as images
    const lowerS = s.toLowerCase();
    if (lowerS.includes("spreadsheets/d/") || lowerS.includes("docs.google.com/forms")) return false;

    if (s.match(/^[a-zA-Z0-9\-_]{25,50}$/)) return true; // Likely a Drive ID
    if (!s.startsWith("http")) return false;
    
    return (
      lowerS.includes("drive.google.com") || 
      lowerS.includes("googleusercontent.com") ||
      lowerS.match(/\.(jpg|jpeg|png|webp|gif|svg|bmp|heic|tiff)/i) ||
      lowerS.includes("/d/") ||
      lowerS.includes("id=") ||
      lowerS.includes("format=jpg") ||
      lowerS.includes("image")
    );
  };

  const getFlexibleColIdx = (headers: string[], names: string[], def: number) => {
    const normalize = (s: any) => s?.toString().toLowerCase().replace(/[^a-z0-9]/gi, '') || '';
    const searchNames = names.map(n => normalize(n));
    
    // Try exact matches or includes matches
    const idx = headers.findIndex(h => {
       const nh = normalize(h);
       if (!nh) return false;
       
       // Optimization: if we are searching for location/section, skip if header clearly says "email"
       const isEmailHeader = nh.includes('email') || nh.includes('mail');
       const isTargetingLocationOrSection = names.some(n => n.includes('location') || n.includes('section') || n.includes('area') || n.includes('site'));
       if (isEmailHeader && isTargetingLocationOrSection) return false;

       return searchNames.some(sn => nh === sn || nh.includes(sn));
    });
    
    return idx !== -1 ? idx : def;
  };

  app.get("/api/observations", async (req, res) => {
    const sheets = getSheetsClient();
    const isDebug = process.env.DEBUG === "true";
    if (!sheets || !SPREADSHEET_ID) {
      if (isDebug) console.log("[DEBUG] Sheets not configured, returning mock observations");
      return res.json(mockObservations);
    }
    
    try {
      if (isDebug) console.log("[DEBUG] Fetching Observations!A1:ZZ...");
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: "Observations!A1:ZZ",
      });
      const allRows = response.data.values || [];
      
      // Find the header row (the first row that looks like it has headers)
      let headerIdx = 0;
      for (let i = 0; i < Math.min(allRows.length, 10); i++) {
        const row = allRows[i];
        if (row && row.some((cell: any) => {
          const s = cell?.toString().toLowerCase() || "";
          return (
            s.includes("id") ||
            s.includes("observation") ||
            s.includes("audit") ||
            s.includes("inspection") ||
            s.includes("location") ||
            s.includes("description") ||
            s.includes("finding") ||
            s.includes("serial") ||
            s.includes("place")
          );
        })) {
          headerIdx = i;
          break;
        }
      }

      const headers = (allRows[headerIdx] || []).map(h => (h || "").toString().trim());
      const dataRows = allRows.slice(headerIdx + 1);

      if (isDebug) {
        console.log(`[DEBUG] Found Headers at row ${headerIdx}:`, headers.slice(0, 10).join(" | "), `... Total Cols: ${headers.length}`);
      }

      const observations = dataRows.map((r, index) => {
        // Find indices based on common header names
        // Removed fixed defaults (0, 1, 2) to prevent accidental email mapping
        const idIdx = getFlexibleColIdx(headers, ['observationid', 'obsid', 'serial', 'id'], -1);
        const locIdx = getFlexibleColIdx(headers, ['location', 'place', 'room', 'area', 'block', 'site', 'point', 'zone', 'floor', 'department'], -1);
        const insIdIdx = getFlexibleColIdx(headers, ['inspectionid', 'auditid', 'insid', 'parentid', 'audit', 'inspection', 'ref'], -1);
        const secIdIdx = getFlexibleColIdx(headers, ['sectionid', 'section', 'secid'], -1);
        const obsIdx = getFlexibleColIdx(headers, ['observation', 'finding', 'issue', 'title'], -1);
        const descIdx = getFlexibleColIdx(headers, ['description', 'details', 'remarks', 'comment', 'summary'], -1);
        const statusIdx = getFlexibleColIdx(headers, ['status', 'state', 'stage', 'condition'], -1);
        const bfImgIdx = getFlexibleColIdx(headers, ['bfimageurl', 'bfimage', 'beforeimage', 'beforephoto', 'image1', 'bf'], -1);
        const afImgIdx = getFlexibleColIdx(headers, ['afimageurl', 'afimage', 'afterimage', 'afterphoto', 'image2', 'af'], -1);
        const dateIdx = getFlexibleColIdx(headers, ['reporteddate', 'date', 'created', 'time', 'timestamp', 'day', 'observedon', 'audit date', 'inspection date'], -1);

        let dateValue = dateIdx !== -1 ? parseFlexDate(r[dateIdx]) : "";

        // Greedy Fallback: if still no date, search the row for anything that looks like a date
        if (!dateValue || isNaN(new Date(dateValue).getTime())) {
          for (const cell of r) {
            if (cell && cell.toString().includes('/') && !isNaN(new Date(parseFlexDate(cell)).getTime())) {
               dateValue = parseFlexDate(cell);
               break;
            }
          }
        }

        const getSafe = (row: any[], idx: number, fallback: string = "") => {
          if (idx === -1 || idx >= row.length || row[idx] === undefined || row[idx] === null) return fallback;
          return row[idx].toString().trim();
        };

        const obsTitle = getSafe(r, obsIdx);
        const descText = getSafe(r, descIdx);
        
        let beforeImg = formatImageUrl(getSafe(r, bfImgIdx));
        let afterImg = formatImageUrl(getSafe(r, afImgIdx));
        
        // Greedy Fallback: Search the entire row for any image URLs if specific columns are empty
        if (!beforeImg || !afterImg) {
          const allUrls = r.filter(c => isImageUrl(c)).map(c => formatImageUrl(c));
          if (!beforeImg && allUrls.length > 0) beforeImg = allUrls[0];
          if (!afterImg && allUrls.length > 1) afterImg = allUrls[1];
          // Special case: if afterImg is still empty and we have only one image, check if it was supposed to be after URL
          if (!afterImg && allUrls.length === 1 && !beforeImg) afterImg = allUrls[0];
        }

        const rawStatus = getSafe(r, statusIdx, "Open").toLowerCase();
        let normalizedStatus: 'Open' | 'Closed' | 'In Progress' = 'Open';
        
        if (rawStatus.startsWith('close') || rawStatus.startsWith('resolve') || rawStatus === 'done' || rawStatus === 'rectified') {
          normalizedStatus = 'Closed';
        } else if (rawStatus.includes('progress') || rawStatus.includes('working') || rawStatus === 'ongoing') {
          normalizedStatus = 'In Progress';
        }

        return {
          id: (idIdx !== -1 && idIdx < r.length && r[idIdx] ? r[idIdx] : `auto-${index}`).toString().trim(),
          location: getSafe(r, locIdx),
          inspectionId: getSafe(r, insIdIdx),
          sectionId: getSafe(r, secIdIdx),
          description: (descText || obsTitle) || "Observation noted during inspection", 
          beforeImageUrl: beforeImg,
          afterImageUrl: afterImg,
          status: normalizedStatus,
          createdAt: dateValue,
        };
      });
      res.json(observations);
    } catch (e: any) {
      handleApiError(res, e, "fetching observations");
    }
  });

  app.post("/api/observations", async (req, res) => {
    const data = req.body;
    const id = "OBS-" + Date.now();
    const newObs = { id, ...data, status: "Open" };

    const sheets = getSheetsClient();
    if (!sheets || !SPREADSHEET_ID) {
      mockObservations.push(newObs);
      return res.json(newObs);
    }

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: "Observations!A2:H",
        valueInputOption: "RAW",
        requestBody: { 
          values: [[id, data.location, data.inspectionId, data.description, data.beforeImageUrl || "", data.afterImageUrl || "", "Open", data.sectionId || ""]] 
        },
      });
      res.json(newObs);
    } catch (e) {
      res.status(500).json({ error: "Failed to save observation" });
    }
  });

  app.patch("/api/observations/:id", async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    const sheets = getSheetsClient();
    
    if (!sheets || !SPREADSHEET_ID) {
      const idx = mockObservations.findIndex(o => o.id === id);
      if (idx !== -1) {
        mockObservations[idx] = { ...mockObservations[idx], ...updates };
        return res.json(mockObservations[idx]);
      }
      return res.status(404).json({ error: "Observation not found" });
    }

    try {
      // Find the row
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: "Observations!A:A",
      });
      const rows = response.data.values || [];
      const rowIdx = rows.findIndex(r => r[0] && r[0].toString().trim() === id);

      if (rowIdx === -1) return res.status(404).json({ error: "Observation not found in sheet" });

      // Identify column for status
      const headerResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: "Observations!1:1",
      });
      const headers = headerResponse.data.values?.[0] || [];
      const statusIdx = headers.findIndex(h => h.toLowerCase().includes("status"));

      if (statusIdx === -1) return res.status(400).json({ error: "Status column not found" });

      const colLetter = String.fromCharCode(65 + statusIdx);
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `Observations!${colLetter}${rowIdx + 1}`,
        valueInputOption: "RAW",
        requestBody: { values: [[updates.status]] },
      });

      res.json({ success: true, id, status: updates.status });
    } catch (e: any) {
      handleApiError(res, e, "updating observation");
    }
  });

  app.post("/api/observations/bulk-resolve-ids", async (req, res) => {
    const { observationIds } = req.body;
    const sheets = getSheetsClient();
    
    if (!sheets || !SPREADSHEET_ID) {
      mockObservations = mockObservations.map(o => 
        observationIds.includes(o.id) ? { ...o, status: "Closed" } : o
      );
      return res.json({ success: true });
    }

    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: "Observations!A:C", 
      });
      const rows = response.data.values || [];
      const headers = rows[0] || [];
      const dataRows = rows.slice(1);

      const idIdx = getFlexibleColIdx(headers, ["observationid", "id", "serial", "code"], 0);
      const statusHeaderRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: "Observations!1:1",
      });
      const allHeaders = statusHeaderRes.data.values?.[0] || [];
      const statusIdx = allHeaders.findIndex(h => h.toLowerCase().includes("status"));
      const colLetter = String.fromCharCode(65 + statusIdx);

      if (statusIdx === -1) throw new Error("Status column not found");

      const data = [];
      const idSet = new Set(observationIds.map((id: any) => String(id).trim()));

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        if (idSet.has(String(row[idIdx]).trim())) {
          data.push({
            range: `Observations!${colLetter}${i + 2}`,
            values: [["Closed"]]
          });
        }
      }

      if (data.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: {
            valueInputOption: "RAW",
            data: data
          }
        });
      }

      res.json({ success: true, count: data.length });
    } catch (e: any) {
      handleApiError(res, e, "bulk resolving observations by id");
    }
  });

  app.post("/api/observations/bulk-resolve", async (req, res) => {
    const { inspectionIds } = req.body;
    const sheets = getSheetsClient();
    
    if (!sheets || !SPREADSHEET_ID) {
      mockObservations = mockObservations.map(o => 
        inspectionIds.includes(o.inspectionId) ? { ...o, status: "Closed" } : o
      );
      return res.json({ success: true });
    }

    try {
      // 1. Fetch all observations to find which rows to update
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: "Observations!A:C", // Assuming ID, Location, InspectionID
      });
      const rows = response.data.values || [];
      const headers = rows[0] || [];
      const dataRows = rows.slice(1);

      const insIdIdx = headers.findIndex(h => h.toLowerCase().includes("inspection"));
      const statusHeaderRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: "Observations!1:1",
      });
      const allHeaders = statusHeaderRes.data.values?.[0] || [];
      const statusIdx = allHeaders.findIndex(h => h.toLowerCase().includes("status"));
      const colLetter = String.fromCharCode(65 + statusIdx);

      if (statusIdx === -1) throw new Error("Status column not found");

      // Batch update status to "Closed" for all observations in these inspections
      const data = [];
      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        if (inspectionIds.includes(row[insIdIdx])) {
          data.push({
            range: `Observations!${colLetter}${i + 2}`,
            values: [["Closed"]]
          });
        }
      }

      if (data.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: {
            valueInputOption: "RAW",
            data: data
          }
        });
      }

      res.json({ success: true, count: data.length });
    } catch (e: any) {
      handleApiError(res, e, "bulk resolving observations");
    }
  });

  // Listen early so API routes are available while Vite is preparing
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    try {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (e: any) {
      console.error("Failed to start Vite middleware:", e);
    }
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
}

startServer();
