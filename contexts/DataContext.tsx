import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { RawCommuteLog, ProcessedWorkLog, WeeklySummary, WorkType, LogStatus, GlobalConfig, WorkPolicy, WagePolicy, SpecialWorkPolicySet } from '../types';
import { WorkHourCalculator } from '../lib/workHourCalculator';
import { TimeUtils } from '../lib/timeUtils';
import { PolicyUtils } from '../lib/policyUtils';

type ViewMode = 'ORIGINAL' | 'CALIBRATED';

interface DataContextType {
    rawLogs: RawCommuteLog[];
    logs: ProcessedWorkLog[]; // The active logs being displayed
    originalLogs: ProcessedWorkLog[]; // Always the 1st pass data
    summaries: WeeklySummary[];
    config: GlobalConfig;
    policies: WorkPolicy[];
    allowancePolicies: SpecialWorkPolicySet[]; // [NEW]
    wagePolicies: WagePolicy[]; // [NEW]
    viewMode: ViewMode;
    isCalibrated: boolean;
    setRawLogs: (logs: RawCommuteLog[]) => void;
    setLogs: (logs: ProcessedWorkLog[]) => void;
    setSummaries: (summaries: WeeklySummary[]) => void;
    updateLog: (id: string, updates: Partial<ProcessedWorkLog>) => void;
    calibrateData: () => void;
    toggleViewMode: () => void;
    updateConfig: (newConfig: GlobalConfig) => void;
    initialViolationCount: number;
    refreshPolicies: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider = ({ children }: { children: ReactNode }) => {
    const [rawLogs, setRawLogs] = useState<RawCommuteLog[]>([]);

    // State for Dual View
    const [originalLogs, setOriginalLogs] = useState<ProcessedWorkLog[]>([]);
    const [calibratedLogs, setCalibratedLogs] = useState<ProcessedWorkLog[] | null>(null);
    const [logs, setLogs] = useState<ProcessedWorkLog[]>([]); // Active Display Logs
    const [initialViolationCount, setInitialViolationCount] = useState<number>(0);

    const [summaries, setSummaries] = useState<WeeklySummary[]>([]);
    const [viewMode, setViewMode] = useState<ViewMode>('ORIGINAL');

    // Policies State
    const [policies, setPolicies] = useState<WorkPolicy[]>([]);
    const [allowancePolicies, setAllowancePolicies] = useState<SpecialWorkPolicySet[]>([]); // [NEW]
    const [wagePolicies, setWagePolicies] = useState<WagePolicy[]>([]); // [NEW]

    // Default Config (Fallback)
    const [config, setConfig] = useState<GlobalConfig>({
        standardStartTime: "09:00",
        standardEndTime: "18:00",
        clockInCutoffTime: "08:30",
        clockOutCutoffTime: "18:30",
        lateClockInGraceMinutes: 10,
        breakTimeMinutes: 60,
        maxWeeklyOvertimeMinutes: 12 * 60
    });

    // Refresh Policies Helper
    const refreshPolicies = async () => {
        try {
            const [pRes, aRes, wRes] = await Promise.all([
                fetch('/api/policies'),
                fetch('/api/settings/special-work'),
                fetch('/api/settings/wage-policies')
            ]);

            if (pRes.ok) setPolicies(await pRes.json());
            if (aRes.ok) setAllowancePolicies(await aRes.json());
            if (wRes.ok) setWagePolicies(await wRes.json());
        } catch (e) {
            console.warn("Failed to fetch policies in DataContext", e);
        }
    };

    // Fetch Policies on Mount
    useEffect(() => {
        refreshPolicies();
    }, []);

    const updateSummaries = (currentLogs: ProcessedWorkLog[]) => {
        const uniqueUsers = Array.from(new Set(currentLogs.map(l => l.userId)));
        const newSummaries = uniqueUsers.map(uid =>
            WorkHourCalculator.calculateWeeklySummary(uid, currentLogs, WorkType.STANDARD)
        );
        setSummaries(newSummaries);
    };

    const processLogsWithPolicies = (raw: RawCommuteLog[], currentPolicies: WorkPolicy[], fallbackConfig: GlobalConfig) => {
        console.log('🔧 Processing logs with policies count:', currentPolicies.length);

        // 1. Process all logs with DATE-SPECIFIC config
        let processed = raw.map(log => {
            const effectivePolicy = PolicyUtils.getPolicyForDate(log.date, currentPolicies);
            const activeConfig = effectivePolicy ? PolicyUtils.toGlobalConfig(effectivePolicy) : fallbackConfig;
            return WorkHourCalculator.processDailyLog(log, activeConfig);
        });

        // 2. Filter out users with 0 total actual work duration across all their logs
        const userTotalWork: Record<string, number> = {};
        processed.forEach(log => {
            userTotalWork[log.userId] = (userTotalWork[log.userId] || 0) + log.actualWorkDuration;
        });

        // Keep only logs for users who have at least some work
        processed = processed.filter(log => userTotalWork[log.userId] > 0);

        // 3. Fill Missing Days (Vacation/Rest)
        processed = WorkHourCalculator.fillMissingDays(processed);

        // 4. Detect Anomalies
        processed = WorkHourCalculator.detectAnomalies(processed);

        // Update States
        setOriginalLogs(processed);
        setLogs(processed);

        // Reset Calibration on new data
        setCalibratedLogs(null);
        setViewMode('ORIGINAL');

        // Initial Violation Count
        const violationIds = WorkHourCalculator.getViolationUserIds(processed);
        setInitialViolationCount(violationIds.size);

        // Recalculate summaries
        updateSummaries(processed);
    };

    const updateConfig = (newConfig: GlobalConfig) => {
        // [Legacy Support] Update fallback config
        setConfig(newConfig);
        // We probably should re-fetch policies or re-process?
        // If "Config" is updated manually via SettingsPage (V1), it might update policies now.
        // But SettingsPage V2 calls API directly.
        // For safety, re-process with new fallback.
        if (rawLogs.length > 0) {
            processLogsWithPolicies(rawLogs, policies, newConfig);
        }
    };

    // Re-process when RawLogs or Policies change
    useEffect(() => {
        if (rawLogs.length > 0) {
            processLogsWithPolicies(rawLogs, policies, config);
        }
    }, [rawLogs, policies, config]);

    // Manual update
    const updateLog = useCallback((id: string, updates: Partial<ProcessedWorkLog>) => {
        setLogs(prev => {
            const index = prev.findIndex(l => l.id === id);
            if (index === -1) return prev;

            const oldLog = prev[index];
            // 1. Merge updates (timestamps)
            let updatedLog = { ...oldLog, ...updates };

            // 2. Recalculate if time changed
            if (updates.startTime !== undefined || updates.endTime !== undefined) {
                // Determine Correct Config for this Log's Date
                const effectivePolicy = PolicyUtils.getPolicyForDate(updatedLog.date, policies);
                const activeConfig = effectivePolicy ? PolicyUtils.toGlobalConfig(effectivePolicy) : config;

                updatedLog = WorkHourCalculator.recalculateLog(updatedLog, activeConfig);
            }

            const newLogs = [...prev];
            newLogs[index] = updatedLog;

            // 3. Sync persistence states
            setOriginalLogs(prevOrg => prevOrg.map(log => log.id === id ? updatedLog : log));
            setCalibratedLogs(prevCal => prevCal ? prevCal.map(log => log.id === id ? updatedLog : log) : null);

            updateSummaries(newLogs);
            return newLogs;
        });
    }, [policies, config, viewMode, calibratedLogs]);

    // Generate Calibrated Data
    const calibrateData = useCallback(() => {
        if (originalLogs.length === 0) return;

        // Note: Calibration usually needs a single Strategy.
        // If "policies" vary by date, `calibrateLogs` inside might need to respect that?
        // `WorkHourCalculator.calibrateLogs` takes `config`.
        // Ideally, calibration (OT limits) is checking Weekly limits.
        // If a week spans two policies, it gets tricky.
        // For now, let's pass the Fallback Config or improve calibrateLogs later.
        // Actually, `calibrateLogs` (for 52h strictness) uses `SpecialWorkCalculator`.
        // We probably should update `calibrateLogs` to handle policies too if we want perfect accuracy.
        // For now, let's pass `config` (fallback) as current implementation expects one config.
        // TODO: Update calibrateLogs to support Date-Polymorphic Policies

        const newCalibrated = WorkHourCalculator.calibrateLogs(originalLogs, config);
        setCalibratedLogs(newCalibrated);
        setLogs(newCalibrated);
        setViewMode('CALIBRATED');
        updateSummaries(newCalibrated);
    }, [originalLogs, config]);

    const toggleViewMode = useCallback(() => {
        if (viewMode === 'ORIGINAL' && calibratedLogs) {
            setViewMode('CALIBRATED');
            setLogs(calibratedLogs);
            updateSummaries(calibratedLogs);
        } else {
            setViewMode('ORIGINAL');
            setLogs(originalLogs);
            updateSummaries(originalLogs);
        }
    }, [viewMode, originalLogs, calibratedLogs]);

    return (
        <DataContext.Provider value={{
            rawLogs, logs, originalLogs, summaries, config, policies, allowancePolicies, wagePolicies, viewMode, isCalibrated: !!calibratedLogs, initialViolationCount,
            setRawLogs, setLogs, setSummaries, updateLog, calibrateData, toggleViewMode, updateConfig, refreshPolicies
        }}>
            {children}
        </DataContext.Provider>
    );
};

export const useData = () => {
    const context = useContext(DataContext);
    if (context === undefined) {
        throw new Error('useData must be used within a DataProvider');
    }
    return context;
};
