// src/hooks/useLiveITSMData.ts
import { useState, useEffect } from 'react';

export interface Incident {
  id: string;
  number: string;
  shortDescription: string;
  description: string;
  state: string;
  configurationItemName: string;
  priority: string;
  assignedToName?: string;
  department?: string;
  resolutionCode?: string;
  createdAt: string;
}

export interface ProblemRecord {
  id: string;
  number: string;
  shortDescription: string;
  description: string;
  rootCause: string;
  workaround: string;
  knownError: boolean;
  state: string;
  priority: string;
  configurationItemName: string;
  assignedToName: string;
  relatedIncidentsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentStats {
  pendingApprovals: number;
  totalExecutedActions: number;
  approvedActions: number;
  rejectedActions: number;
  humanApprovalRatePercent: number;
  safetyComplianceScore: number;
  avgResolutionTimeSavedHours: string;
  riskBreakdown: {
    CRITICAL: number;
    HIGH: number;
    MEDIUM: number;
    LOW: number;
  };
}

export const useLiveITSMData = () => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [problems, setProblems] = useState<ProblemRecord[]>([]);
  const [agentStats, setAgentStats] = useState<AgentStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [incRes, probRes, statsRes] = await Promise.all([
        fetch('http://localhost:4000/api/v1/incidents'),
        fetch('http://localhost:4000/api/v1/problems'),
        fetch('http://localhost:4000/api/v1/agent/stats'),
      ]);
      const incData = incRes.ok ? await incRes.json() : [];
      const probData = probRes.ok ? await probRes.json() : [];
      const statsData = statsRes.ok ? await statsRes.json() : null;
      if (Array.isArray(incData)) setIncidents(incData);
      if (Array.isArray(probData)) setProblems(probData);
      if (statsData) setAgentStats(statsData);
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (e) {
      console.error('Failed to load ITSM data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 15000);
    return () => clearInterval(interval);
  }, []);

  return { incidents, problems, agentStats, loading, lastRefreshed };
};
