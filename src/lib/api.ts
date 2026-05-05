import { Section, Inspection, Observation } from "../types.ts";

const handleResponse = async (res: Response) => {
  const contentType = res.headers.get("content-type");
  
  if (!res.ok) {
    let message = `HTTP error! status: ${res.status}`;
    if (contentType && contentType.includes("application/json")) {
      const errorBody = await res.json().catch(() => ({}));
      message = (errorBody as any).details || (errorBody as any).error || message;
    } else {
      const text = await res.text().catch(() => "");
      if (text) message += ` - ${text.substring(0, 100)}`;
    }
    throw new Error(message);
  }

  if (contentType && contentType.includes("application/json")) {
    return (await res.json()) as any;
  }
  
  const text = await res.text();
  console.error("Expected JSON but received:", text.substring(0, 200));
  
  if (text.includes("<title>Starting Server...</title>")) {
    throw new Error("The system is currently waking up or updating. Please wait a few seconds and try again.");
  }
  
  throw new Error(`Server returned an invalid response format (not JSON). Start of response: ${text.substring(0, 50).replace(/[\n\r]/g, " ")}`);
};

export const api = {
  getSections: async (): Promise<Section[]> => {
    const res = await fetch("/api/sections");
    return handleResponse(res);
  },
  
  getInspections: async (): Promise<Inspection[]> => {
    const res = await fetch("/api/inspections");
    return handleResponse(res);
  },
  
  createInspection: async (data: { date: string; sectionId?: string; location?: string }): Promise<Inspection> => {
    const res = await fetch("/api/inspections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },
  
  getObservations: async (): Promise<Observation[]> => {
    const res = await fetch("/api/observations");
    return handleResponse(res);
  },
  
  createObservation: async (data: Partial<Observation>): Promise<Observation> => {
    const res = await fetch("/api/observations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },
  
  updateObservation: async (id: string, updates: Partial<Observation>): Promise<any> => {
    const res = await fetch(`/api/observations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    return handleResponse(res);
  },

  bulkResolveObservationsByIds: async (observationIds: string[]): Promise<{ success: boolean; count: number }> => {
    const res = await fetch("/api/observations/bulk-resolve-ids", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ observationIds }),
    });
    return handleResponse(res);
  },

  bulkResolveObservations: async (inspectionIds: string[]): Promise<{ success: boolean; count: number }> => {
    const res = await fetch("/api/observations/bulk-resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inspectionIds }),
    });
    return handleResponse(res);
  },
};
