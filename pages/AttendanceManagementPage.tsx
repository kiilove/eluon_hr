import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { TimeUtils } from '../lib/timeUtils';
import { calculateActualWork, generateSafeTimeString } from '../lib/correctionUtils';
import { ProcessedWorkLog, LogStatus, GlobalConfig, WorkPolicy } from "../types";
import { WorkHourCalculator } from '@/lib/workHourCalculator';
import { useData } from '../contexts/DataContext';
import { ExcelReportGenerator } from '@/lib/excelReportGenerator';
import { HolidayUtils } from '@/lib/holidayUtils';
import { PolicyUtils } from '../lib/policyUtils';

// Components
import { ProcessingHeader } from '../components/processing/ProcessingHeader';
import { Step1Upload } from '../components/processing/Step1Upload';
import { Step2Verification } from '../components/processing/Step2Verification';
import { Step3Correction } from '../components/processing/Step3Correction';
import { Step4Preview } from '../components/processing/Step4Preview';
import { LoadingOverlay } from '../components/ui/LoadingOverlay';


// Engine Type Interfaces
interface ProcessedData {
    raw: any[];
    v1: ProcessedWorkLog[]; // V1: Automated Correction
    v2: ProcessedWorkLog[]; // V2: Manual Correction
    v3?: ProcessedWorkLog[]; // V3: Worker Correction
    v4?: ProcessedWorkLog[]; // V4: Final Filtered (Ready for Save)
    final: ProcessedWorkLog[]; // Final: Ready for Export
}

type SortOption = 'NAME' | 'DEPT' | 'TITLE';
type SidebarTab = 'ALL' | 'MANUAL_CHECK' | 'OVERTIME' | 'VACATION' | 'TF_ONLY';

export const AttendanceManagementPage = () => {
    const { config, policies } = useData();
    const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
    const [data, setData] = useState<ProcessedData | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Step 3 Filters
    const [searchTerm, setSearchTerm] = useState("");
    const [sortOption, setSortOption] = useState<SortOption>('NAME');
    const [activeTab, setActiveTab] = useState<SidebarTab>('ALL');
    const [stickyViolationUserIds, setStickyViolationUserIds] = useState<Set<string> | null>(null);
    const [tfUserNames, setTfUserNames] = useState<Set<string>>(new Set());
    const [tfUserIds, setTfUserIds] = useState<Set<string>>(new Set());

    const refreshEmployees = async () => {
        try {
            // [Fix] Pass Company ID
            const userStr = localStorage.getItem('user');
            const userObj = userStr ? JSON.parse(userStr) : null;
            const companyId = userObj?.company_id;

            const res = await fetch(`/api/employees?t=${Date.now()}&companyId=${companyId || ''}`, { cache: 'no-store' });
            const data: any[] = await res.json();
            const tfNames = new Set(data.filter(e => e.is_TF).map(e => e.name));
            const tfIds = new Set(data.filter(e => e.is_TF).map(e => e.id));
            setTfUserNames(tfNames);
            setTfUserIds(tfIds);
            console.log(`[AttendancePage] Loaded ${tfIds.size} TF Users.`);
        } catch (err) {
            console.warn("Failed to fetch employees", err);
        }
    };

    useEffect(() => {
        refreshEmployees();
    }, []);

    // [Fix] Refresh Employees when Step changes (e.g. after upload/auto-create)
    useEffect(() => {
        if (step > 1) refreshEmployees();
    }, [step]);

    const location = useLocation();

    // 1. Init from Navigation State
    useEffect(() => {
        if (location.state?.initialData && !data) {
            const initFromUpload = async () => {
                setIsProcessing(true);
                try {
                    const rawData = location.state.initialData;

                    // [New] Auto-Create Employees if missing
                    /*
                    // [경고] 향후 부활할수있으니 삭제하지 마시오 (2025-01-21 User Request: 시급 업로드에서 직원 등록 처리함)
                    try {
                        const userStr = localStorage.getItem('user');
                        const userObj = userStr ? JSON.parse(userStr) : null;
                        const companyId = userObj?.company_id;

                        if (companyId) {
                            const { EmployeeExtractor } = await import('../lib/engine/employeeExtractor'); // Dynamic Import
                            // Fetch latest employees to check duplicates
                            const empRes = await fetch(`/api/employees?companyId=${companyId}`);
                            const currentEmployees = await empRes.json() as any[];

                            const newEmployees = EmployeeExtractor.extractFromLogs(rawData, currentEmployees)
                                .map(e => ({ ...e, companyId }));

                            if (newEmployees.length > 0) {
                                console.log(`[Auto-Create] Found ${newEmployees.length} new employees. Saving...`);
                                await EmployeeExtractor.saveEmployees(newEmployees);
                                // alert(`${newEmployees.length}명의 신규 직원이 자동 등록되었습니다.`); // Optional alert
                            }
                        }
                    } catch (empError) {
                        console.error("[Auto-Create] Failed to auto-create employees:", empError);
                        // Don't block main flow
                    }
                    */

                    const v1Logs: ProcessedWorkLog[] = rawData.map((raw: any) => {
                        return WorkHourCalculator.processDailyLog(raw, {
                            ...config,
                            disableSnap: true
                        });
                    }).filter((l: any) => l.actualWorkDuration > 0 || l.logStatus === LogStatus.VACATION || l.logStatus === LogStatus.TRIP);

                    setData({
                        raw: rawData,
                        v1: v1Logs,
                        v2: JSON.parse(JSON.stringify(v1Logs)),
                        final: []
                    });
                    setStep(2);
                } catch (e) {
                    console.error("Failed to init data", e);
                } finally {
                    setIsProcessing(false);
                }
            };
            initFromUpload();
        }
    }, [location.state, data, config]);

    // [New] Fail-safe: Auto-generate V4 if missing in Step 4 (e.g. navigated via Header)
    useEffect(() => {
        if (step === 4 && data && !data.v4) {
            console.log("Fail-safe: Step 4 reached but V4 missing. Generating now...");
            const sourceLogs = data.v3 || data.v2;

            // 1. Identify "Active Users"
            const activeUserIds = new Set<string>();
            sourceLogs.forEach(log => {
                const hasWork = (log.actualWorkDuration || 0) > 0;
                const isOther = log.logStatus === LogStatus.OTHER;
                const isTF = (log.employeeId && tfUserIds.has(log.employeeId)) || (!log.employeeId && tfUserNames.has(log.userId));

                if (hasWork || isOther || isTF) {
                    activeUserIds.add(log.userId);
                }
            });

            // 2. Create V4
            const v4Logs = sourceLogs.filter(log => activeUserIds.has(log.userId));

            setData(prev => {
                if (!prev) return null;
                return { ...prev, v4: v4Logs };
            });
        }
    }, [step, data]);


    // Handlers
    const handleTabChange = (tab: SidebarTab) => {
        if (tab !== 'ALL') {
            const currentLogs = data?.v2 || [];
            let ids = new Set<string>();

            if (tab === 'MANUAL_CHECK') {
                ids = new Set(currentLogs
                    .filter(l => l.status === 'ERROR' || l.status === 'MISSING' || l.logStatus === LogStatus.OTHER)
                    .map(l => l.userId));
            } else if (tab === 'OVERTIME') {
                ids = new Set(currentLogs
                    .filter(l => (l.overtimeDuration > 0 || l.specialWorkMinutes > 0))
                    .map(l => l.userId));
            } else if (tab === 'VACATION') {
                ids = new Set(currentLogs
                    .filter(l => (l.logStatus === LogStatus.VACATION || l.logStatus === LogStatus.TRIP || l.logStatus === LogStatus.EDUCATION || l.logStatus === LogStatus.SICK))
                    .map(l => l.userId));
            } else if (tab === 'TF_ONLY') {
                ids = new Set(currentLogs
                    .filter(l => (l.employeeId && tfUserIds.has(l.employeeId)) || (!l.employeeId && tfUserNames.has(l.userId)))
                    .map(l => l.userId));
            }
            setStickyViolationUserIds(ids);
        } else {
            setStickyViolationUserIds(null);
        }
        setActiveTab(tab);
    };

    // [Helper] Pure Logic for Night Work Correction
    const processNightCorrection = (sourceLogs: ProcessedWorkLog[]) => {
        const nightShiftStartLimit = TimeUtils.timeToMinutes("06:00");

        const PROTECTED_STATUSES = [
            LogStatus.VACATION,
            LogStatus.TRIP,
            LogStatus.EDUCATION,
            LogStatus.SICK
        ];

        let correctionCount = 0;

        const processedLogs = sourceLogs.map(log => {
            const isTarget =
                log.startTime > 0 &&
                log.startTime <= nightShiftStartLimit &&
                !PROTECTED_STATUSES.includes(log.logStatus);

            if (isTarget) {
                // Get Policy Config
                const effectivePolicy = PolicyUtils.getPolicyForDate(log.date, policies);
                const activeConfig = effectivePolicy ? PolicyUtils.toGlobalConfig(effectivePolicy) : config;

                const newLog = { ...log };
                const targetStartMin = TimeUtils.timeToMinutes(activeConfig.standardStartTime || "09:00");
                const targetEndMin = TimeUtils.timeToMinutes(activeConfig.standardEndTime || "18:00");

                const startRaw = generateSafeTimeString(targetStartMin - 10, targetStartMin, log.id + "night_fix_start");
                const endRaw = generateSafeTimeString(targetEndMin, targetEndMin + 10, log.id + "night_fix_end");
                const startMin = TimeUtils.timeToMinutes(startRaw.substring(0, 5));
                const endMin = TimeUtils.timeToMinutes(endRaw.substring(0, 5));

                newLog.startTime = startMin;
                newLog.endTime = endMin;
                newLog.rawStartTimeStr = startRaw;
                newLog.rawEndTimeStr = endRaw;

                const { actualWork, totalDuration, breakDuration } = calculateActualWork(startMin, endMin, activeConfig);
                newLog.totalDuration = totalDuration;
                newLog.breakDuration = breakDuration;
                newLog.actualWorkDuration = actualWork;
                newLog.overtimeDuration = Math.max(0, actualWork - (8 * 60));
                newLog.logStatus = LogStatus.NORMAL;

                correctionCount++;
                return newLog;
            }
            return log;
        });

        return { logs: processedLogs, count: correctionCount };
    };

    const handleOvertimeCorrection = () => {
        if (!data?.v2) return;
        try {
            // Reset Global Map for calculation
            window['lastWorkingDaysMap'] = undefined;

            // 1. Start with fresh V2 clone
            const v3Init: ProcessedWorkLog[] = JSON.parse(JSON.stringify(data.v2));
            let otFixCount = 0;

            // Helper: Randomize Perfect Time
            const randomizePerfectTime = (val: string, type: 'START' | 'END', idSeed: string, activeConfig: GlobalConfig): string => {
                if (!val) return val;

                const stdStart = activeConfig.standardStartTime || "09:00";
                const stdEnd = activeConfig.standardEndTime || "18:00";

                if (type === 'START') {
                    if (val === stdStart || val === stdStart + ":00") {
                        const targetMin = TimeUtils.timeToMinutes(stdStart);
                        return generateSafeTimeString(targetMin - 10, targetMin + 3, idSeed + "start_rand");
                    }
                } else {
                    if (val === stdEnd || val === stdEnd + ":00") {
                        const targetMin = TimeUtils.timeToMinutes(stdEnd);
                        return generateSafeTimeString(targetMin, targetMin + 30, idSeed + "end_rand");
                    }
                }
                return val;
            };

            // 2. Apply Overtime / Randomization Logic
            const v3AfterOT = v3Init.map(log => {
                // Get Policy Config
                const effectivePolicy = PolicyUtils.getPolicyForDate(log.date, policies);
                const activeConfig = effectivePolicy ? PolicyUtils.toGlobalConfig(effectivePolicy) : config;

                // [Rule 1] Identify Date Type (Robust Parsing)
                const y = parseInt(log.date.substring(0, 4));
                const m = parseInt(log.date.substring(5, 7)) - 1; // Month is 0-indexed
                const d = parseInt(log.date.substring(8, 10));

                // Use explicit constructors to avoid UTC shifts
                const dateObj = new Date(y, m, d);
                const dayOfWeek = dateObj.getDay();

                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                const isHoliday = HolidayUtils.isHoliday(dateObj);
                const isWorkingDay = !isWeekend && !isHoliday;

                // [Rule 0] Check TF Last Working Day (Priority Overwrite)
                // Calculate Last Working Days MAP if not done yet
                if (!window['lastWorkingDaysMap']) {
                    const dates = new Set<string>(v3Init.map((l: ProcessedWorkLog) => l.date));
                    const monthGroups: Record<string, string[]> = {};
                    dates.forEach((date) => {
                        const ym = date.substring(0, 7);
                        if (!monthGroups[ym]) monthGroups[ym] = [];
                        monthGroups[ym].push(date);
                    });

                    const lwd = new Set<string>();
                    Object.keys(monthGroups).forEach(ym => {
                        const [yearStr, monthStr] = ym.split('-');
                        const year = parseInt(yearStr);
                        const month = parseInt(monthStr); // 1-12

                        // Calculate Theoretical Last Working Day for this month
                        // Start from last day of month
                        let checkDate = new Date(year, month, 0); // Day 0 of next month = Last day of this month
                        while (checkDate.getMonth() === month - 1) {
                            const day = checkDate.getDay();
                            const isWeekend = day === 0 || day === 6;
                            const isHoliday = HolidayUtils.isHoliday(checkDate);

                            if (!isWeekend && !isHoliday) {
                                // Found the theoretical last working day
                                const yS = checkDate.getFullYear();
                                const mS = String(checkDate.getMonth() + 1).padStart(2, '0');
                                const dS = String(checkDate.getDate()).padStart(2, '0');
                                const targetStr = `${yS}-${mS}-${dS}`;

                                // Only add if this date implies the dataset actually covers the End of Month
                                // OR if we just want to protect the true end of month?
                                // User wants "Last Working Day Auto Vacation". This implies if the month is fully worked?
                                // If dataset has 1/1, 1/2... and 1/2 is latest.
                                // If we don't protect 1/2, it remains NORMAL/OVERTIME. Correct.
                                // If dataset has 12/31. It IS the last working day. Protected. Correct.
                                if (monthGroups[ym].includes(targetStr)) {
                                    lwd.add(targetStr);
                                }
                                break; // Stop searching for this month
                            }
                            checkDate.setDate(checkDate.getDate() - 1);
                        }
                    });
                    window['lastWorkingDaysMap'] = lwd;
                    console.log("[AttendancePage] Last Working Days:", Array.from(lwd));
                }
                const lastWorkingDays = window['lastWorkingDaysMap'] as Set<string>;

                const isTfId = log.employeeId && tfUserIds.has(log.employeeId);
                const isTfName = !log.employeeId && tfUserNames.has(log.userId);

                if ((isTfId || isTfName) && lastWorkingDays.has(log.date)) {
                    if (log.logStatus !== LogStatus.VACATION) {
                        return {
                            ...log,
                            startTime: 0,
                            endTime: 0,
                            rawStartTimeStr: '',
                            rawEndTimeStr: '',
                            totalDuration: 0,
                            breakDuration: 0,
                            actualWorkDuration: 0,
                            overtimeDuration: 0,
                            specialWorkMinutes: 0,
                            nightWorkDuration: 0,
                            status: 'NORMAL',
                            logStatus: LogStatus.VACATION,
                            correctionMemo: (log.correctionMemo || "") + "[TF 자동 연차]"
                        } as ProcessedWorkLog;
                    }
                }

                // [DEBUG] Ahn Jae-min Specific Trace
                if (log.userName === "안재민" && log.date.endsWith("12-07")) {
                    console.log(`[DEBUG_TRACE] 안재민 12-07:`, {
                        date: log.date,
                        parsed: { y, m: m + 1, d },
                        dayOfWeek, // 0=Sun, 6=Sat
                        isWeekend,
                        isHoliday,
                        isWorkingDay,
                        originalStatus: log.logStatus,
                        originalWork: log.actualWorkDuration
                    });
                }

                // Debug for user verification
                if (isWeekend && (log.actualWorkDuration > 0 || log.totalDuration > 0)) {
                    console.log(`[Correction Debug] Zeroing Weekend Log: ${log.userName} on ${log.date} (Day: ${dayOfWeek})`);
                }

                // [Rule 2] Weekend/Holiday -> Force REST (0 Work)
                // "공휴일과, 토,일요일은 0으로 휴무처리"
                if (!isWorkingDay) {
                    return {
                        ...log,
                        startTime: 0,
                        endTime: 0,
                        rawStartTimeStr: '',
                        rawEndTimeStr: '',
                        totalDuration: 0,
                        breakDuration: 0,
                        actualWorkDuration: 0,
                        overtimeDuration: 0,
                        specialWorkMinutes: 0,
                        nightWorkDuration: 0,
                        status: 'NORMAL',
                        logStatus: LogStatus.REST,
                        correctionMemo: (log.correctionMemo || "") + "[휴일/주말 휴무]"
                    } as ProcessedWorkLog;
                }

                // [Rule 3] Weekday 0 Work -> Vacation
                // "주중에 0인 사람은 모두 휴가 처리"
                const hasWork = log.totalDuration > 0 || log.startTime > 0 || log.endTime > 0;
                if (!hasWork) {
                    // Preserve specific statuses if manager already set them (Sick, Trip, Education)
                    const protectedStatuses = [LogStatus.SICK, LogStatus.TRIP, LogStatus.EDUCATION, LogStatus.VACATION];
                    if (protectedStatuses.includes(log.logStatus)) {
                        return log;
                    }
                    // Otherwise default to Vacation
                    return {
                        ...log,
                        status: 'NORMAL',
                        logStatus: LogStatus.VACATION,
                        correctionMemo: (log.correctionMemo || "") + "[평일 미근무 휴가]"
                    } as ProcessedWorkLog;
                }

                // [Rule 4] Weekday with Work -> OT Correction (Standard 9-6 ranges)
                let isModified = false;
                let newStartStr = log.rawStartTimeStr || '';
                let newEndStr = log.rawEndTimeStr || '';

                // Randomize Perfect Times
                const randomizedStart = randomizePerfectTime(newStartStr, 'START', log.id, activeConfig);
                const randomizedEnd = randomizePerfectTime(newEndStr, 'END', log.id, activeConfig);

                if (randomizedStart !== newStartStr) { newStartStr = randomizedStart; isModified = true; }
                if (randomizedEnd !== newEndStr) { newEndStr = randomizedEnd; isModified = true; }

                // Overtime Correction
                if (log.overtimeDuration && log.overtimeDuration > 0) {
                    const stdStartMin = TimeUtils.timeToMinutes(activeConfig.standardStartTime || "09:00");
                    const stdEndMin = TimeUtils.timeToMinutes(activeConfig.standardEndTime || "18:00");

                    // Reduce OT by setting to standard time +/- minor randomization
                    newStartStr = generateSafeTimeString(stdStartMin - 30, stdStartMin + 10, log.id + "start_ot");
                    newEndStr = generateSafeTimeString(stdEndMin, stdEndMin + 10, log.id + "end_ot");
                    isModified = true;
                    otFixCount++;
                }

                if (isModified) {
                    const startMinutes = TimeUtils.timeToMinutes(newStartStr.substring(0, 5));
                    const endMinutes = TimeUtils.timeToMinutes(newEndStr.substring(0, 5));
                    const { actualWork, totalDuration, breakDuration } = calculateActualWork(startMinutes, endMinutes, activeConfig);

                    return {
                        ...log,
                        startTime: startMinutes,
                        endTime: endMinutes,
                        rawStartTimeStr: newStartStr,
                        rawEndTimeStr: newEndStr,
                        totalDuration,
                        breakDuration,
                        actualWorkDuration: actualWork,
                        overtimeDuration: Math.max(0, actualWork - (8 * 60)),
                    };
                }
                return log;
            });

            // 3. Chain Night Work Correction (AUTO-TRIGGER)
            const { logs: finalV3, count: nightFixCount } = processNightCorrection(v3AfterOT);

            setData(prev => {
                if (!prev) return null;
                return { ...prev, v3: finalV3, final: finalV3 };
            });

            // Reset to ALL tab view after correction
            setActiveTab('ALL');
            setStickyViolationUserIds(null);

            // Combined Alert
            let msg = "검수가 완료되었습니다.";
            if (otFixCount > 0) msg += `\n- 연장근로/랜덤화: ${otFixCount}건`;
            if (nightFixCount > 0) msg += `\n- 야간근무 자동확인: ${nightFixCount}건`;
            alert(msg);

        } catch (error) {
            console.error(error);
            alert('검수 작업 중 오류가 발생했습니다.');
        }
    };

    const handleUpdateLog = (id: string, updates: Partial<ProcessedWorkLog>) => {
        if (!data) return;

        // Helper to recalculate if needed
        const applyUpdates = (log: ProcessedWorkLog): ProcessedWorkLog => {
            if (log.id !== id) return log;

            const merged = { ...log, ...updates };

            // If Time Changed, Recalculate Logic
            if (updates.rawStartTimeStr !== undefined || updates.rawEndTimeStr !== undefined ||
                updates.startTime !== undefined || updates.endTime !== undefined) {

                const effectivePolicy = PolicyUtils.getPolicyForDate(merged.date, policies);
                const activeConfig = effectivePolicy ? PolicyUtils.toGlobalConfig(effectivePolicy) : config; // fallback to prop config

                return WorkHourCalculator.recalculateLog(merged, activeConfig);
            }

            return merged;
        };

        setData(prev => {
            if (!prev) return null;

            // Scenario 1: Step 2 OR (Step 3 AND No V3) - Update V2
            // In Step 2 or Step 3 (Prep Mode), V3 doesn't exist yet, so we edit V2.
            if (step === 2 || (step === 3 && !prev.v3)) {
                const newV2 = prev.v2.map(applyUpdates);
                return { ...prev, v2: newV2 };
            }

            // Scenario 2: Step 3 (Correction) - Update V3 ONLY
            // We must NOT update V2, because V2 serves as the "Before" state for comparison.
            if (step === 3 && prev.v3) {
                const newV3 = prev.v3.map(applyUpdates);
                return { ...prev, v3: newV3 };
            }

            return prev;
        });
    };

    // Comparison Logic
    const comparisonResult = useMemo(() => {
        if (step !== 3 || !data?.v3) return null;
        const v2Logs = data.v2 || [];
        const v3Logs = data.v3;

        const v2Map = new Map<string, ProcessedWorkLog>(v2Logs.map(l => [l.id, l]));
        const changedLogIds = new Set<string>();
        const changeMap = new Map<string, { field: string, before: string, after: string }[]>();

        v3Logs.forEach(v3Log => {
            const v2Log = v2Map.get(v3Log.id);
            if (!v2Log) {
                changedLogIds.add(v3Log.id);
                changeMap.set(v3Log.id, [{ field: 'status', before: 'Check', after: 'New' }]);
                return;
            }

            const changes: { field: string, before: string, after: string }[] = [];
            if (v2Log.rawStartTimeStr !== v3Log.rawStartTimeStr) changes.push({ field: 'startTime', before: v2Log.rawStartTimeStr || '', after: v3Log.rawStartTimeStr || '' });
            if (v2Log.rawEndTimeStr !== v3Log.rawEndTimeStr) changes.push({ field: 'endTime', before: v2Log.rawEndTimeStr || '', after: v3Log.rawEndTimeStr || '' });
            if (v2Log.overtimeDuration !== v3Log.overtimeDuration) changes.push({
                field: 'overtime',
                before: TimeUtils.minutesToColonFormat(v2Log.overtimeDuration),
                after: TimeUtils.minutesToColonFormat(v3Log.overtimeDuration)
            });

            if (changes.length > 0) {
                changedLogIds.add(v3Log.id);
                changeMap.set(v3Log.id, changes);
            }
        });

        const usersWithChanges = new Set<string>();
        v3Logs.forEach(log => {
            if (changedLogIds.has(log.id)) {
                usersWithChanges.add(log.userId);
            }
        });

        return {
            displayLogs: v3Logs.filter(log => usersWithChanges.has(log.userId)),
            changeMap,
            changedCount: changedLogIds.size,
            touchedUserCount: usersWithChanges.size
        };

    }, [data, step]);

    // Filter Logic
    const filteredLogs = useMemo(() => {
        if (!data) return [];
        let sourceLogs: ProcessedWorkLog[] = [];
        if (step === 2) {
            sourceLogs = data.v2 || [];
        } else if (step === 3) {
            sourceLogs = data.v3 || data.v2 || [];
        }

        const violationUserIds = new Set<string>();
        const overtimeUserIds = new Set<string>();
        const vacationUserIds = new Set<string>();
        const otherUserIds = new Set<string>(); // [New] Users with 'OTHER' status
        const tfIds = new Set<string>();
        const searchMatchingUserIds = new Set<string>();
        const allUserIds = new Set<string>();
        const userTotalWork: Record<string, number> = {};

        sourceLogs.forEach(log => {
            allUserIds.add(log.userId);
            if (!userTotalWork[log.userId]) userTotalWork[log.userId] = 0;
            userTotalWork[log.userId] += (log.actualWorkDuration || 0) + (log.overtimeDuration || 0) + (log.specialWorkMinutes || 0);

            // Violation: Error or Missing. Exclude 'Other' to allow hiding 0-work 'Other' logs.
            if (log.status === 'ERROR' || log.status === 'MISSING') {
                violationUserIds.add(log.userId);
            }
            if (log.overtimeDuration > 0 || log.specialWorkMinutes > 0) {
                overtimeUserIds.add(log.userId);
            }
            if (log.logStatus === LogStatus.VACATION || log.logStatus === LogStatus.TRIP || log.logStatus === LogStatus.EDUCATION || log.logStatus === LogStatus.SICK) {
                vacationUserIds.add(log.userId);
            }
            if (log.logStatus === LogStatus.OTHER) {
                otherUserIds.add(log.userId);
            }
            if ((log.employeeId && tfUserIds.has(log.employeeId)) || (!log.employeeId && tfUserNames.has(log.userId))) {
                tfIds.add(log.userId);
            }

            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                if (
                    log.userName.toLowerCase().includes(term) ||
                    (log.department || "").toLowerCase().includes(term) ||
                    (log.userTitle || "").toLowerCase().includes(term) ||
                    (log.logStatus || "").toLowerCase().includes(term)
                ) {
                    searchMatchingUserIds.add(log.userId);
                }
            }
        });

        let finalUserIds = new Set([...allUserIds].filter(id => {
            const isTF = tfUserNames.has(id) || tfIds.has(id);
            const hasWork = (userTotalWork[id] || 0) > 0;
            const hasVacation = vacationUserIds.has(id);
            const hasViolation = violationUserIds.has(id);

            // "Only show TF users if 0 work" Rule implementation
            if (isTF) return true; // TF users always shown
            if (hasWork) return true; // Regular users shown if they have work
            // Removed hasVacation: Regular Vacationers (0 work) should be HIDDEN.

            // [Fix] User Requirement: "Other (기타) status must be visible" (even if 0 work, to allow correction)
            const hasOther = otherUserIds.has(id);
            if (hasOther) return true;

            // STRICT RULE: If 0 work, No Other, and Not TF -> HIDE.
            return false;
        }));

        if (activeTab === 'MANUAL_CHECK') {
            const targetSet = stickyViolationUserIds || violationUserIds;
            finalUserIds = new Set([...finalUserIds].filter(id => targetSet.has(id)));
        } else if (activeTab === 'OVERTIME') {
            finalUserIds = new Set([...finalUserIds].filter(id => overtimeUserIds.has(id)));
        } else if (activeTab === 'VACATION') {
            finalUserIds = new Set([...finalUserIds].filter(id => vacationUserIds.has(id)));
        } else if (activeTab === 'TF_ONLY') {
            finalUserIds = new Set([...finalUserIds].filter(id => tfIds.has(id)));
        }

        if (searchTerm) {
            finalUserIds = new Set([...finalUserIds].filter(id => searchMatchingUserIds.has(id)));
        }

        return sourceLogs.filter(log => finalUserIds.has(log.userId));

    }, [data, step, searchTerm, activeTab, stickyViolationUserIds, tfUserIds, tfUserNames]); // Added tf deps


    // Counts
    const filterCounts = useMemo(() => {
        if (!data || (step !== 2 && step !== 3)) return { MANUAL_CHECK: 0, OVERTIME: 0, VACATION: 0, ALL: 0, TF_ONLY: 0 };
        let logs: ProcessedWorkLog[] = [];
        if (step === 2) {
            logs = data.v2 || [];
        } else if (step === 3) {
            logs = data.v3 || data.v2 || [];
        }
        const violations = new Set<string>();
        const overtimes = new Set<string>();
        const vacations = new Set<string>();
        const tfMembers = new Set<string>();
        const allUsers = new Set<string>();

        logs.forEach(log => {
            allUsers.add(log.userId);
            if (log.status === 'ERROR' || log.status === 'MISSING' || log.logStatus === LogStatus.OTHER) violations.add(log.userId);
            if (log.overtimeDuration > 0 || log.specialWorkMinutes > 0) overtimes.add(log.userId);
            if (log.logStatus === LogStatus.VACATION || log.logStatus === LogStatus.TRIP || log.logStatus === LogStatus.EDUCATION || log.logStatus === LogStatus.SICK) vacations.add(log.userId);
            if ((log.employeeId && tfUserIds.has(log.employeeId)) || (!log.employeeId && tfUserNames.has(log.userId))) {
                tfMembers.add(log.userId);
            }
        });

        return {
            ALL: allUsers.size,
            MANUAL_CHECK: violations.size,
            OVERTIME: overtimes.size,
            VACATION: vacations.size,
            TF_ONLY: tfMembers.size
        };
    }, [data, step, tfUserIds, tfUserNames]);


    // [New] Transition to Step 4 (Create V4 State)
    const handleMoveToStep4 = () => {
        if (!data) return;
        const sourceLogs = data.v3 || data.v2;
        console.log("MoveToStep4: Source Logs Count:", sourceLogs.length);

        // 1. Identify "Active Users"
        // Rule: User is Active if they have ANY log with (ActualWork > 0) OR (Status == OTHER) OR (Is TF)
        const activeUserIds = new Set<string>();
        sourceLogs.forEach(log => {
            const hasWork = (log.actualWorkDuration || 0) > 0;
            const isOther = log.logStatus === LogStatus.OTHER;
            const isTF = (log.employeeId && tfUserIds.has(log.employeeId)) || (!log.employeeId && tfUserNames.has(log.userId));

            if (hasWork || isOther || isTF) {
                activeUserIds.add(log.userId);
            }
        });

        // 2. Create V4: Keep ALL logs for Active Users (including Holidays)
        // This removes users who have ONLY 0-work/Holiday/Vacation logs (Total 0)
        // But ensures Active Users see their Holidays correctly.
        let v4Logs = sourceLogs.filter(log => activeUserIds.has(log.userId));

        console.log("MoveToStep4: Active Users:", activeUserIds.size);
        console.log("MoveToStep4: V4 Logs Created:", v4Logs.length);

        // Update State
        setData(prev => {
            console.log("MoveToStep4: Updating Data State with V4");
            if (!prev) return null;
            return { ...prev, v4: v4Logs };
        });
        setStep(4);
    };

    const finalPreviewData = useMemo(() => {
        // [Critical] Step 4 SHOULD PREVIEW V4 (Filtered Data)
        if (!data || step !== 4) return { weekGroups: {}, sortedMondays: [] };
        // Use V4 if available, otherwise fallback to V3
        const logs = data.v4 || data.v3 || data.v2;

        console.log("Calculating FinalPreviewData. Step:", step, "Has V4:", !!data.v4);
        console.log("FinalPreviewData: V4 Logs Count:", logs.length);

        const getMondayOfWeek = (date: Date): string => {
            const d = new Date(date);
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            const monday = new Date(d.setDate(diff));
            const year = monday.getFullYear();
            const month = String(monday.getMonth() + 1).padStart(2, '0');
            const dt = String(monday.getDate()).padStart(2, '0');
            return `${year}-${month}-${dt}`;
        };

        const weekGroups: Record<string, ProcessedWorkLog[]> = {};
        logs.forEach(log => {
            const mondayStr = getMondayOfWeek(new Date(log.date));
            if (!weekGroups[mondayStr]) weekGroups[mondayStr] = [];
            weekGroups[mondayStr].push(log);
        });

        const sortedMondays = Object.keys(weekGroups).sort();
        console.log("FinalPreviewData: Week Groups:", sortedMondays.length);

        return { weekGroups, sortedMondays };
    }, [data, step]);

    const handleSaveToDB = async () => {
        // Save V4 Logs
        const sourceData = data?.v4 || data?.v3 || data?.v2;
        if (!sourceData || sourceData.length === 0) return;

        // [Fix] Get Company ID from User Context (localStorage)
        const userStr = localStorage.getItem('user');
        const userObj = userStr ? JSON.parse(userStr) : null;
        const companyId = userObj?.company_id;

        if (!companyId) {
            alert("로그인 정보(회사 ID)를 찾을 수 없습니다. 다시 로그인해주세요.");
            return;
        }

        if (!confirm(`데이터를 시스템(DB)에 저장하시겠습니까?\n총 ${sourceData.length}건 저장\n대상 회사: ${companyId}`)) return;

        setIsProcessing(true);
        await new Promise(resolve => setTimeout(resolve, 300)); // Force UI Update

        try {
            const response = await fetch('/api/processing/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    logs: sourceData,
                    companyId: companyId // [New] Pass Company ID Explicitly
                })
            });
            const result: any = await response.json();
            if (response.ok && result.success) {
                alert(`성공적으로 저장되었습니다.\n(총 ${sourceData.length}건 저장)`);
                // [UX] Auto-Reset
                setData(null);
                setStep(1);
            } else {
                alert(`저장 실패: ${result.message}`);
            }
        } catch (error: any) {
            console.error("Save failed", error);
            alert(`저장 중 오류가 발생했습니다: ${error.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleGlobalNightWorkCorrection = () => {
        const sourceData = data?.v3 || data?.v2;
        if (!sourceData) return;

        const { logs: newLogs, count: changedCount } = processNightCorrection(sourceData);

        if (changedCount > 0) {
            setData(prev => ({ ...prev!, v3: newLogs }));
            alert(`${changedCount}건의 야간 근무 오류가 정상 근무로 확인되었습니다.`);
        } else {
            alert("조치할 야간 근무 오류 내역이 없습니다.");
        }
    };

    const handleDownloadExcel = async () => {
        // Download user-visible data (V4)
        const sourceData = data?.v4 || data?.v3 || data?.v2;
        if (!sourceData || sourceData.length === 0) return;

        // Pass policies to report generator
        // Wait... generateWeeklyReport doesn't take policies? 
        // We can pass the config if needed, but it usually assumes calculated data.
        await ExcelReportGenerator.generateWeeklyReport(sourceData);
    };

    const handleTfAutoCorrection = () => {
        if (!data?.v2 || data.v2.length === 0) {
            alert("처리할 데이터가 없습니다.");
            return;
        }

        // 1. Calculate Theoretical Last Working Days per Month
        const logs = data.v2;
        const monthGroups: Record<string, { maxDate: string, logs: ProcessedWorkLog[] }> = {};
        const allUserIds = new Set<string>();

        logs.forEach(log => {
            const ym = log.date.substring(0, 7);
            if (!monthGroups[ym]) monthGroups[ym] = { maxDate: "", logs: [] };
            monthGroups[ym].logs.push(log);
            if (!monthGroups[ym].maxDate || log.date > monthGroups[ym].maxDate) {
                monthGroups[ym].maxDate = log.date;
            }
            allUserIds.add(log.userId);
        });

        const targetLWDs = new Set<string>(); // "YYYY-MM-DD"

        Object.keys(monthGroups).forEach(ym => {
            const [yearStr, monthStr] = ym.split('-');
            const year = parseInt(yearStr);
            const month = parseInt(monthStr);
            const maxDateInDataset = monthGroups[ym].maxDate;

            // Theoretical LWD
            let checkDate = new Date(year, month, 0); // Last day of month
            while (checkDate.getMonth() === month - 1) {
                const day = checkDate.getDay();
                const isWeekend = day === 0 || day === 6;
                const isHoliday = HolidayUtils.isHoliday(checkDate);

                if (!isWeekend && !isHoliday) {
                    const yS = checkDate.getFullYear();
                    const mS = String(checkDate.getMonth() + 1).padStart(2, '0');
                    const dS = String(checkDate.getDate()).padStart(2, '0');
                    const lwd = `${yS}-${mS}-${dS}`;

                    // Only activate if dataset covers this date (or was supposed to)
                    // If dataset max date >= lwd, then we should enforce it.
                    if (maxDateInDataset >= lwd) {
                        targetLWDs.add(lwd);
                    }
                    break;
                }
                checkDate.setDate(checkDate.getDate() - 1);
            }
        });

        if (targetLWDs.size === 0) {
            alert("자동 연차를 적용할 '월 마지막 근무일'이 포함된 데이터가 아닙니다.");
            return;
        }

        let changedCount = 0;
        let injectedCount = 0;
        const newV2 = [...data.v2];

        // 2. Identify TF Users in the Dataset
        // We only care about users present in V2? Or should we include users from `tfUserIds` even if missing?
        // Safest is users present in V2 to avoid creating logs for terminated emp.
        const usersInDataset = new Set(newV2.map(l => l.userId));
        const tfUsersInDataset = new Set<string>();

        newV2.forEach(log => {
            const isTfId = log.employeeId && tfUserIds.has(log.employeeId);
            const isTfName = !log.employeeId && tfUserNames.has(log.userId?.trim());
            if (isTfId || isTfName) tfUsersInDataset.add(log.userId);
        });

        console.log(`[TF Auto] Found ${tfUsersInDataset.size} TF users in dataset. Target LWDs:`, Array.from(targetLWDs));

        // 3. Process Each TF User for Each Target LWD
        tfUsersInDataset.forEach(userId => {
            const userLogs = newV2.filter(l => l.userId === userId);
            // Get Employee Info from one of the logs
            const sampleLog = userLogs[0];
            if (!sampleLog) return; // Should not happen

            targetLWDs.forEach(lwd => {
                // Check if log exists
                const existingLogIndex = newV2.findIndex(l => l.userId === userId && l.date === lwd);

                if (existingLogIndex >= 0) {
                    // Update Existing
                    const log = newV2[existingLogIndex];
                    if (log.logStatus !== LogStatus.VACATION) {
                        newV2[existingLogIndex] = {
                            ...log,
                            startTime: 0,
                            endTime: 0,
                            totalDuration: 0,
                            breakDuration: 0,
                            actualWorkDuration: 0,
                            overtimeDuration: 0,
                            status: 'NORMAL',
                            logStatus: LogStatus.VACATION,
                            note: (log.note || "") + "[TF 자동 연차]",
                            rawStartTimeStr: '',
                            rawEndTimeStr: ''
                        };
                        changedCount++;
                    }
                } else {
                    // Inject New Log (Missing logic fix)
                    injectedCount++;
                    const newLog: ProcessedWorkLog = {
                        id: crypto.randomUUID(),
                        date: lwd,
                        userId: sampleLog.userId,
                        userName: sampleLog.userName,
                        employeeId: sampleLog.employeeId,
                        department: sampleLog.department,
                        startTime: 0,
                        endTime: 0,
                        rawStartTimeStr: '',
                        rawEndTimeStr: '',
                        totalDuration: 0,
                        breakDuration: 0,
                        actualWorkDuration: 0,
                        overtimeDuration: 0,
                        specialWorkMinutes: 0,
                        nightWorkDuration: 0,
                        restDuration: 0,
                        workType: 'BASIC',
                        isHoliday: false,
                        status: 'NORMAL',
                        logStatus: LogStatus.VACATION, // Force Vacation
                        note: "[TF 자동 연차(생성)]"
                    };
                    newV2.push(newLog);
                }
            });
        });

        // 4. Also Apply Randomization/Filling for Other TF Days (Original Logic preserved/merged?)
        // The original logic also filled MISSING hours for weekdays.
        // Let's preserve that "Fill 9-6" logic:
        const finalV2 = newV2.map(log => {
            // Only process TF users
            const isTfId = log.employeeId && tfUserIds.has(log.employeeId);
            const isTfName = !log.employeeId && tfUserNames.has(log.userId?.trim());
            if (!isTfId && !isTfName) return log;

            // Skip if already Vacation (incl. the ones we just set)
            if (log.logStatus === LogStatus.VACATION) return log;

            // ... [Preserve existing Protection logic] ...
            if (
                log.logStatus === LogStatus.TRIP ||
                log.logStatus === LogStatus.EDUCATION ||
                log.logStatus === LogStatus.SICK
            ) return log;

            // Fill Logic: 0 Work & (Normal/Other) & Weekday -> Fill 9-6
            if (
                (log.actualWorkDuration || 0) === 0 &&
                (!log.logStatus || log.logStatus === LogStatus.NORMAL || log.logStatus === LogStatus.OTHER)
            ) {
                const date = new Date(log.date);
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                // Double check holiday?
                const isHoliday = HolidayUtils.isHoliday(date);
                if (isWeekend || isHoliday) return log;

                // Fill!
                const effectivePolicy = PolicyUtils.getPolicyForDate(log.date, policies);
                const activeConfig = effectivePolicy ? PolicyUtils.toGlobalConfig(effectivePolicy) : config;

                changedCount++; // Count as change
                const targetStart = TimeUtils.timeToMinutes(activeConfig.standardStartTime || "09:00");
                const targetEnd = TimeUtils.timeToMinutes(activeConfig.standardEndTime || "18:00");
                const startRaw = generateSafeTimeString(targetStart - 10, targetStart + 5, log.id + "start");
                const endRaw = generateSafeTimeString(targetEnd, targetEnd + 20, log.id + "end");
                const startMin = TimeUtils.timeToMinutes(startRaw.substring(0, 5));
                const endMin = TimeUtils.timeToMinutes(endRaw.substring(0, 5));
                const { actualWork, totalDuration, breakDuration } = calculateActualWork(startMin, endMin, activeConfig);

                return {
                    ...log,
                    startTime: startMin,
                    endTime: endMin,
                    rawStartTimeStr: startRaw,
                    rawEndTimeStr: endRaw,
                    totalDuration,
                    breakDuration,
                    actualWorkDuration: actualWork,
                    overtimeDuration: Math.max(0, actualWork - (8 * 60)),
                    status: 'NORMAL',
                    logStatus: LogStatus.NORMAL,
                    note: (log.note ? log.note + ", " : "") + "TF Manual-Filled"
                } as ProcessedWorkLog;
            }
            return log;
        });

        if (changedCount > 0 || injectedCount > 0) {
            // Sort by date/name for cleanliness (Optional)
            finalV2.sort((a, b) => a.date.localeCompare(b.date) || a.userName.localeCompare(b.userName));

            setData(prev => prev ? { ...prev, v2: finalV2 } : null);
            alert(`TF 보정 완료:\n- 자동 연차 처리: ${injectedCount}건 생성, ${changedCount}건 수정`);
        } else {
            alert("보정이 필요한 데이터가 없습니다.");
        }
    };

    const sidebarProps = {
        isReadOnly: step === 2,
        step,
        searchTerm,
        setSearchTerm,
        sortOption,
        setSortOption,
        activeTab,
        handleTabChange,
        filterCounts,
        setStep,
        isProcessing,
        handleOvertimeCorrection,
        handleSaveToDB,
        handleTfAutoCorrection,
        hasV3Data: !!data?.v3
    };

    return (
        <div className="space-y-6 pb-20">
            <ProcessingHeader step={step} setStep={setStep} hasData={!!data} />

            {step === 1 && (
                <Step1Upload
                    setData={setData}
                    setStep={setStep}
                    config={config}
                    policies={policies}
                    tfUserNames={tfUserNames}
                />
            )}

            {step === 2 && data && (
                <Step2Verification
                    filteredLogs={filteredLogs}
                    sortOption={sortOption}
                    onUpdateLog={handleUpdateLog}
                    sidebarProps={sidebarProps}
                />
            )}

            {step === 3 && data && (
                <Step3Correction
                    data={data}
                    filteredLogs={filteredLogs}
                    sortOption={sortOption}
                    onUpdateLog={handleUpdateLog}
                    sidebarProps={sidebarProps}
                    comparisonResult={comparisonResult}
                    onGlobalNightCorrection={handleGlobalNightWorkCorrection}
                    searchTerm={searchTerm}
                    onMoveToStep4={handleMoveToStep4}
                />
            )}

            {step === 4 && finalPreviewData && (
                <Step4Preview
                    finalPreviewData={finalPreviewData}
                    setStep={setStep}
                    handleSaveToDB={handleSaveToDB}
                    handleDownloadExcel={handleDownloadExcel}
                />
            )}

            <LoadingOverlay isVisible={isProcessing} message="데이터 처리 및 저장 중입니다..." />
        </div>
    );
};
