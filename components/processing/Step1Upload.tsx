import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ExcelParser } from '../../lib/engine/excelParser';
import { HolidayUtils } from '../../lib/holidayUtils';
import { WorkHourCalculator } from '../../lib/workHourCalculator';
import { TimeUtils } from '../../lib/timeUtils';
import { calculateActualWork, generateSafeTimeString } from '../../lib/correctionUtils';
import { ProcessedWorkLog, LogStatus, GlobalConfig, WorkPolicy } from "../../types";
import { PolicyUtils } from '../../lib/policyUtils';
import { EmployeeDateValidator } from '../../lib/employeeDateValidator';
import { SmartUploadStep } from './SmartUploadStep';
import { useMessageModal } from '@/contexts/MessageModalContext';
import { LegacyUploadStep } from './LegacyUploadStep';

interface Step1UploadProps {
    setData: (data: any) => void;
    setStep: (step: 1 | 2 | 3 | 4) => void;
    config: GlobalConfig;
    policies: WorkPolicy[];
    tfUserNames?: Set<string>;
    tfUserIds?: Set<string>;
    onLoadExisting?: (start: Date, end: Date) => void;
}

export const Step1Upload: React.FC<Step1UploadProps> = ({ setData, setStep, config, policies, tfUserNames, tfUserIds, onLoadExisting }) => {
    const { showAlert, showConfirm } = useMessageModal();
    const [isProcessing, setIsProcessing] = useState(false);
    const navigate = React.useMemo(() => (window as any).navigation?.navigate || ((url: string) => window.location.href = url), []);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsProcessing(true);
        try {
            console.log("Parsing file using External Engine...");
            const rawData = await ExcelParser.parse(file);
            console.log("Parsed Data:", rawData);

            if (rawData.length === 0) {
                await showAlert("데이터를 찾을 수 없습니다.", { type: 'warning' });
                setIsProcessing(false);
                return;
            }

            // [Feature] Extract and Save Employees
            const userStr = localStorage.getItem('user');
            const userObj = userStr ? JSON.parse(userStr) : null;
            const companyId = userObj?.company_id;

            const empRes = await fetch(`/api/employees?companyId=${companyId || ''}&t=` + Date.now(), { cache: 'no-store' });
            const existingEmployees = empRes.ok ? await empRes.json() as any[] : [];

            // [Fix] Derive TF users locally from the fresh fetch
            const employeeMap = new Map<string, any[]>();
            const tfUserIdsLocal = new Set<string>();
            const normalizeName = (n: string) => (n || "").replace(/\s+/g, '').toLowerCase().trim();

            existingEmployees.forEach((e: any) => {
                const key = normalizeName(e.name);
                if (!employeeMap.has(key)) {
                    employeeMap.set(key, []);
                }
                employeeMap.get(key)?.push(e);

                if (e.is_TF) {
                    tfUserIdsLocal.add(e.id);
                }
            });

            // Hardcoded config fallback if not provided properly
            const fallbackConfig = (config && config.standardStartTime) ? config : {
                standardStartTime: "09:00",
                standardEndTime: "18:00",
                breakTimeMinutes: 60,
                clockInCutoffTime: "08:30",
                clockOutCutoffTime: "18:30",
                lateClockInGraceMinutes: 10,
                maxWeeklyOvertimeMinutes: 12 * 60,
            };

            const v1Logs: ProcessedWorkLog[] = rawData.map((raw: any) => {
                const effectivePolicy = PolicyUtils.getPolicyForDate(raw.date, policies);
                const activeConfig = effectivePolicy ? PolicyUtils.toGlobalConfig(effectivePolicy) : fallbackConfig;

                const log = WorkHourCalculator.processDailyLog(raw, activeConfig);

                const key = normalizeName(log.userName);
                const matchedEmployees = employeeMap.get(key);

                if (matchedEmployees) {
                    if (matchedEmployees.length === 1) {
                        const emp = matchedEmployees[0];
                        log.employeeId = emp.id;

                        // [Centralized Validation] Check join_date and resignation_date
                        const validation = EmployeeDateValidator.isValidLogDate(log.date, emp);
                        if (!validation.isValid) {
                            return null; // Exclude logs before join or after resignation month
                        }

                        // [Resigned Status Handling]
                        if (validation.suggestedStatus === 'RESIGNED') {
                            log.logStatus = LogStatus.RESIGNED;
                            log.startTime = 0;
                            log.endTime = 0;
                            log.rawStartTimeStr = "";
                            log.rawEndTimeStr = "";
                            log.totalDuration = 0;
                            log.actualWorkDuration = 0;
                            log.breakDuration = 0;
                            log.overtimeDuration = 0;
                            log.note = (log.note || "") + " [퇴사 후]";
                            log.status = 'NORMAL';
                        }
                    } else if (matchedEmployees.length > 1) {
                        log.status = 'WARNING';
                        log.note = (log.note || "") + "[동명이인 확인 필요]";
                        log.candidates = matchedEmployees;
                    }
                }
                return log;
            }).filter((log): log is ProcessedWorkLog => log !== null);

            // [Ghost TF Logic] Inject Missing Weekend/Holiday Logs for TF Users
            if (v1Logs.length > 0) {
                const dates = v1Logs.map(l => l.date).sort();
                let minDate = TimeUtils.getMondayOfDate(dates[0]);
                let maxDate = TimeUtils.getSundayOfDate(dates[dates.length - 1]);

                let targetTfIds = (tfUserIds && tfUserIds.size > 0) ? tfUserIds : tfUserIdsLocal;
                let targetTfNames = (tfUserNames && tfUserNames.size > 0) ? tfUserNames : new Set(existingEmployees.filter((e: any) => e.is_TF).map((e: any) => e.name));

                const activeTfUserIds = new Set<string>();
                v1Logs.forEach(l => {
                    const isTfId = l.employeeId && targetTfIds.has(l.employeeId);
                    const isTfName = !l.employeeId && targetTfNames.has(l.userName);
                    if (isTfId || isTfName) activeTfUserIds.add(l.userId);
                });

                const logMap = new Set(v1Logs.map(l => `${l.userId}:${l.date}`));
                const missingLogs: ProcessedWorkLog[] = [];

                for (let d = new Date(minDate); d <= maxDate; d.setDate(d.getDate() + 1)) {
                    const dateStr = TimeUtils.toDateString(d);
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    const isHoliday = HolidayUtils.isHoliday(d);
                    const isWorkingDay = !isWeekend && !isHoliday;

                    activeTfUserIds.forEach(userId => {
                        if (!logMap.has(`${userId}:${dateStr}`)) {
                            const userInfo = v1Logs.find(l => l.userId === userId);
                            if (userInfo) {
                                let startTime = 0;
                                let endTime = 0;
                                let rawStart = "";
                                let rawEnd = "";
                                let actualWork = 0;
                                let totalDur = 0;
                                let breakDur = 0;
                                let logStatus = LogStatus.REST;
                                let note = '[시스템 생성: 누락일]';

                                if (isWorkingDay) {
                                    // Generate Virtual Times for TF Weekday hole
                                    const effectivePolicy = PolicyUtils.getPolicyForDate(dateStr, policies);
                                    const activeConfig = effectivePolicy ? PolicyUtils.toGlobalConfig(effectivePolicy) : fallbackConfig;
                                    const stdStart = activeConfig.standardStartTime || "09:00";
                                    const stdEnd = activeConfig.standardEndTime || "18:00";

                                    rawStart = generateSafeTimeString(TimeUtils.timeToMinutes(stdStart) - 10, TimeUtils.timeToMinutes(stdStart) + 5, `ghost-tf-${userId}-${dateStr}-start`);
                                    rawEnd = generateSafeTimeString(TimeUtils.timeToMinutes(stdEnd), TimeUtils.timeToMinutes(stdEnd) + 15, `ghost-tf-${userId}-${dateStr}-end`);
                                    startTime = TimeUtils.timeToMinutes(rawStart.substring(0, 5));
                                    endTime = TimeUtils.timeToMinutes(rawEnd.substring(0, 5));

                                    const calc = calculateActualWork(startTime, endTime, activeConfig);
                                    actualWork = calc.actualWork;
                                    totalDur = calc.totalDuration;
                                    breakDur = calc.breakDuration;
                                    logStatus = LogStatus.NORMAL;
                                    note = '[전략인력 자동생성: 누락일]';
                                }

                                missingLogs.push({
                                    ...userInfo,
                                    id: `ghost-${userId}-${dateStr}`,
                                    date: dateStr,
                                    startTime,
                                    endTime,
                                    rawStartTimeStr: rawStart,
                                    rawEndTimeStr: rawEnd,
                                    totalDuration: totalDur,
                                    breakDuration: breakDur,
                                    actualWorkDuration: actualWork,
                                    overtimeDuration: Math.max(0, actualWork - (8 * 60)),
                                    nightWorkDuration: 0,
                                    specialWorkMinutes: 0,
                                    status: 'NORMAL',
                                    logStatus: logStatus,
                                    note: note
                                } as any);
                            }
                        }
                    });
                }
                if (missingLogs.length > 0) {
                    v1Logs.push(...missingLogs);
                    v1Logs.sort((a, b) => a.date.localeCompare(b.date) || a.userName.localeCompare(b.userName));
                }
            }

            // [Missing Injection]
            if (v1Logs.length > 0) {
                const presentEmpIds = new Set(v1Logs.map(l => l.employeeId).filter(Boolean));
                const totallyMissingEmployees = existingEmployees.filter((e: any) => !presentEmpIds.has(e.id));

                if (totallyMissingEmployees.length > 0) {
                    const dates = v1Logs.map(l => l.date).sort();
                    let minDateRange = TimeUtils.getMondayOfDate(dates[0]);
                    let maxDateRange = TimeUtils.getSundayOfDate(dates[dates.length - 1]);

                    const uploadMinDateStr = TimeUtils.toDateString(minDateRange);
                    const uploadMaxDateStr = TimeUtils.toDateString(maxDateRange);
                    const relevantMissingEmployees = totallyMissingEmployees.filter((e: any) =>
                        EmployeeDateValidator.isActiveInRange(uploadMinDateStr, uploadMaxDateStr, e)
                    );

                    const generatedLogs: ProcessedWorkLog[] = [];
                    for (let d = new Date(minDateRange); d <= maxDateRange; d.setDate(d.getDate() + 1)) {
                        const dateStr = TimeUtils.toDateString(d);
                        const isWeekend = d.getDay() === 0 || d.getDay() === 6;

                        // [Policy Aware] Configuration for the current date
                        const effectivePolicy = PolicyUtils.getPolicyForDate(dateStr, policies);
                        const activeConfig = effectivePolicy ? PolicyUtils.toGlobalConfig(effectivePolicy) : fallbackConfig;

                        relevantMissingEmployees.forEach((emp: any) => {
                            const validation = EmployeeDateValidator.isValidLogDate(dateStr, emp);
                            if (!validation.isValid) return;

                            const isResigned = validation.suggestedStatus === 'RESIGNED';
                            const isTF = emp.is_TF || false;

                            let logStatus = isWeekend ? LogStatus.REST : (isResigned ? LogStatus.RESIGNED : (isTF ? LogStatus.NORMAL : LogStatus.VACATION));
                            let startTime = 0;
                            let endTime = 0;
                            let rawStart = "";
                            let rawEnd = "";
                            let actualWork = 0;
                            let totalDur = 0;
                            let breakDur = 0;

                            if (isTF && !isWeekend && !isResigned) {
                                // Generate Virtual Times for TF
                                const stdStart = activeConfig.standardStartTime || "09:00";
                                const stdEnd = activeConfig.standardEndTime || "18:00";
                                rawStart = generateSafeTimeString(TimeUtils.timeToMinutes(stdStart) - 10, TimeUtils.timeToMinutes(stdStart) + 5, `missing-tf-${emp.id}-${dateStr}-start`);
                                rawEnd = generateSafeTimeString(TimeUtils.timeToMinutes(stdEnd), TimeUtils.timeToMinutes(stdEnd) + 15, `missing-tf-${emp.id}-${dateStr}-end`);
                                startTime = TimeUtils.timeToMinutes(rawStart.substring(0, 5));
                                endTime = TimeUtils.timeToMinutes(rawEnd.substring(0, 5));
                                const calc = calculateActualWork(startTime, endTime, activeConfig);
                                actualWork = calc.actualWork;
                                totalDur = calc.totalDuration;
                                breakDur = calc.breakDuration;
                            }

                            generatedLogs.push({
                                id: `missing-${emp.id}-${dateStr}`,
                                userId: emp.id,
                                userName: emp.name,
                                userTitle: emp.position || '',
                                department: emp.department || '',
                                employeeId: emp.id,
                                date: dateStr,
                                startTime: startTime,
                                endTime: endTime,
                                rawStartTimeStr: rawStart,
                                rawEndTimeStr: rawEnd,
                                actualWorkDuration: actualWork,
                                totalDuration: totalDur,
                                breakDuration: breakDur,
                                logStatus: logStatus,
                                status: 'NORMAL',
                                note: isResigned ? '[퇴사 확인됨]' : (isTF ? '[전략인력 자동생성]' : '[명부 등재/데이터 없음]'),
                                isHoliday: false,
                                workType: 'BASIC'
                            } as any);
                        });
                    }
                    if (generatedLogs.length > 0) {
                        console.log(`[Missing Injection] Injected ${generatedLogs.length} logs for missing members.`);
                        v1Logs.push(...generatedLogs);
                        v1Logs.sort((a, b) => a.date.localeCompare(b.date) || a.userName.localeCompare(b.userName));
                    }
                }
            }

            // Week Filling logic
            const validUserIds = new Set(v1Logs.filter(log => log.actualWorkDuration > 0 || log.logStatus === LogStatus.VACATION || log.status === 'ERROR' || log.status === 'MISSING').map(l => l.userId));
            const validLogs = v1Logs.filter(log => validUserIds.has(log.userId));
            const filledLogs: ProcessedWorkLog[] = [];
            const userGroups: Record<string, ProcessedWorkLog[]> = {};

            validLogs.forEach(l => {
                if (!userGroups[l.userId]) userGroups[l.userId] = [];
                userGroups[l.userId].push(l);
            });

            Object.keys(userGroups).forEach(userId => {
                const logs = userGroups[userId];
                const sampleLog = logs[0];
                const dates = logs.map(l => new Date(l.date).getTime());
                const minD = new Date(Math.min(...dates));

                const monday = TimeUtils.getMondayOfDate(minD);
                monday.setHours(0, 0, 0, 0);

                for (let i = 0; i < 7; i++) {
                    const curr = new Date(monday);
                    curr.setDate(monday.getDate() + i);
                    const dateStr = TimeUtils.toDateString(curr);

                    const existing = logs.find(l => l.date === dateStr);
                    if (existing) {
                        filledLogs.push(existing);
                    } else {
                        const empObj = existingEmployees.find((e: any) => e.id === sampleLog.employeeId);
                        if (empObj) {
                            const validation = EmployeeDateValidator.isValidLogDate(dateStr, empObj);
                            if (!validation.isValid) continue;
                        }

                        filledLogs.push({
                            id: `generated-${userId}-${dateStr}`,
                            userId: userId,
                            employeeId: sampleLog.employeeId,
                            userName: sampleLog.userName,
                            userTitle: sampleLog.userTitle,
                            department: sampleLog.department,
                            date: dateStr,
                            startTime: 0,
                            endTime: 0,
                            totalDuration: 0,
                            breakDuration: 0,
                            actualWorkDuration: 0,
                            overtimeDuration: 0,
                            nightWorkDuration: 0,
                            restDuration: 0,
                            workType: 'BASIC',
                            isHoliday: false,
                            status: 'MISSING',
                            logStatus: LogStatus.NORMAL,
                            note: 'Missing Date Filled'
                        } as ProcessedWorkLog);
                    }
                }
            });

            let finalV1Logs = filledLogs;
            try {
                const { applyNewPolicies } = await import('../../lib/correctionUtils');
                finalV1Logs = applyNewPolicies(filledLogs, existingEmployees, fallbackConfig);
                console.log("[Step1Upload] Applied New Policies");
            } catch (err) {
                console.error("[Step1Upload] Policy application failed:", err);
            }

            setData({
                raw: rawData,
                v1: finalV1Logs,
                v2: JSON.parse(JSON.stringify(finalV1Logs)).map((log: ProcessedWorkLog) => {
                    const effectivePolicy = PolicyUtils.getPolicyForDate(log.date, policies);
                    const activeConfig = effectivePolicy ? PolicyUtils.toGlobalConfig(effectivePolicy) : fallbackConfig;
                    
                    let processedLog;
                    if (log.workType === 'ELASTIC' || log.isExemptFromOvertime) {
                        processedLog = { ...log };
                    } else {
                        const { actualWork, totalDuration, breakDuration, snappedStart, snappedEnd } = calculateActualWork(log.startTime || 0, log.endTime || 0, activeConfig);
                        processedLog = {
                            ...log,
                            startTime: snappedStart,
                            endTime: snappedEnd,
                            totalDuration: totalDuration,
                            breakDuration: breakDuration,
                            actualWorkDuration: actualWork,
                            overtimeDuration: Math.max(0, actualWork - (8 * 60)),
                        };
                    }

                    if (log.employeeId && (tfUserIds?.has(log.employeeId) || tfUserIdsLocal.has(log.employeeId))) {
                        const date = new Date(log.date);
                        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                        if (processedLog.actualWorkDuration === 0 && !isWeekend && (log.logStatus === LogStatus.NORMAL || log.logStatus === LogStatus.VACATION)) {
                            const targetStart = TimeUtils.timeToMinutes(activeConfig.standardStartTime || "09:00");
                            const targetEnd = TimeUtils.timeToMinutes(activeConfig.standardEndTime || "18:00");
                            const startRaw = generateSafeTimeString(targetStart - 10, targetStart + 5, log.id + "start");
                            const endRaw = generateSafeTimeString(targetEnd, targetEnd + 20, log.id + "end");
                            const { actualWork: aw, totalDuration: td, breakDuration: bd } = calculateActualWork(TimeUtils.timeToMinutes(startRaw.substring(0, 5)), TimeUtils.timeToMinutes(endRaw.substring(0, 5)), activeConfig);

                            processedLog = {
                                ...processedLog,
                                startTime: TimeUtils.timeToMinutes(startRaw.substring(0, 5)),
                                endTime: TimeUtils.timeToMinutes(endRaw.substring(0, 5)),
                                rawStartTimeStr: startRaw,
                                rawEndTimeStr: endRaw,
                                totalDuration: td,
                                breakDuration: bd,
                                actualWorkDuration: aw,
                                overtimeDuration: Math.max(0, aw - (8 * 60)),
                                status: 'NORMAL',
                                logStatus: LogStatus.NORMAL,
                                note: (log.note ? log.note + ", " : "") + "TF Auto-Filled"
                            };
                        }
                    }
                    return processedLog;
                }),
                final: []
            });
            setStep(2);
        } catch (error) {
            console.error("Upload failed", error);
            await showAlert("파일 처리에 실패했습니다. 엑셀 형식을 확인해주세요.", { type: 'error' });
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <SmartUploadStep isProcessing={isProcessing} onUpload={handleFileUpload} onEdit={onLoadExisting} />
    );
};
