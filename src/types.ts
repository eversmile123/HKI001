export interface Section {
  id: string;
  name: string;
}

export interface Inspection {
  id: string;
  date: string;
  sectionId: string;
  location?: string;
  summary?: string;
  auditor?: string;
  createdAt?: string;
}

export interface Observation {
  id: string;
  inspectionId: string;
  sectionId?: string;
  location: string;
  description: string;
  beforeImageUrl?: string;
  afterImageUrl?: string;
  status: 'Open' | 'Closed' | 'In Progress';
  createdAt: string;
}

export interface InspectionWithDetails extends Inspection {
  sectionName: string;
  observations: Observation[];
}

export interface DashboardMetrics {
  totalInspections: number;
  openObservations: number;
  closedObservations: number;
  sectionPerformance: { name: string; score: number }[];
  trendData: { month: string; inspections: number; closures: number }[];
}
