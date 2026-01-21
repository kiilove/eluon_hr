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
import { SmartUploadStep } from './SmartUploadStep';
import { LegacyUploadStep } from './LegacyUploadStep';

interface Step1UploadProps {
    setData: (data: any) => void;
    setStep: (step: 1 | 2 | 3 | 4) => void;
    config: GlobalConfig;
    policies: WorkPolicy[];
    tfUserNames?: Set<string>;
}

export const Step1Upload: React.FC<Step1UploadProps> = ({ setData, setStep, config, policies, tfUserNames }) => {
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
                alert("데이터를 찾을 수 없습니다.");
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
            // 1. Create a precise map for matching: "Name" -> Employee[]
            const employeeMap = new Map<string, any[]>();
            const tfUserIds = new Set<string>();

            existingEmployees.forEach((e: any) => {
                // [Change] Key is Name only
                const key = e.name.trim(); // Normalize
                if (!employeeMap.has(key)) {
                    employeeMap.set(key, []);
                }
                employeeMap.get(key)?.push(e);

                if (e.is_TF) {
                    tfUserIds.add(e.id);
                }
            });

            console.log("Debug: Fetch Employees Result:", existingEmployees.length);
            const tfNames = existingEmployees.filter((e: any) => tfUserIds.has(e.id)).map((e: any) => e.name);
            console.log("Debug: Detected TF User IDs:", Array.from(tfUserIds));
            console.log("Debug: Detected TF User Names:", tfNames);

            // [DISABLED] Employee auto-creation moved to Hourly Wage Upload
            // Attendance upload should NOT create employees anymore
            /*
            import('../../lib/engine/employeeExtractor').then(({ EmployeeExtractor }) => {
                const userStr = localStorage.getItem('user');
                const userObj = userStr ? JSON.parse(userStr) : null;
                const companyId = userObj?.company_id;

                const employees = EmployeeExtractor.extractFromLogs(rawData, existingEmployees)
                    .map(e => ({ ...e, companyId }));

                if (employees.length > 0) {
                    EmployeeExtractor.saveEmployees(employees).catch(err => console.warn("Auto-save employees failed:", err));
                } else {
                    console.log("No new employees to save.");
                }
            });
            */


            // [NEW] Dynamic Holiday Init
            const years = new Set(rawData.map(d => new Date(d.date).getFullYear()));
            for (const year of years) {
                await HolidayUtils.init(year);
                await HolidayUtils.init(year);
            }

            // [NEW] Check for Special Work Report & LOCK STATUS
            if (rawData.length > 0) {
                const sampleDate = rawData[0].date; // e.g., "2024-11-01"
                const targetMonth = sampleDate.substring(0, 7); // "2024-11"

                // 1. Check Lock Status
                try {
                    const lockRes = await fetch(`/api/management/lock-status?month=${targetMonth}`);
                    const lockData = await lockRes.json() as any;
                    if (lockData.success && lockData.isLocked) {
                        const confirmed = confirm(`${targetMonth}월은 이미 결재 완료(Lock)된 상태입니다.\n\n정말로 데이터를 다시 업로드하시겠습니까?\n(주의: 기존 데이터와 충돌할 수 있습니다.)`);
                        if (!confirmed) {
                            setIsProcessing(false);
                            return; // Stop processing
                        }
                    }
                } catch (e) {
                    console.error("Failed to check lock status", e);
                    // Optional: Fail open or closed? Let's warn but proceed or fail safe?
                    // Let's proceed but warn.
                }
            }



            console.log("Mapping Raw Data using WorkHourCalculator with Policies...");

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
                // Determine effective config based on Policy
                const effectivePolicy = PolicyUtils.getPolicyForDate(raw.date, policies);
                const activeConfig = effectivePolicy ? PolicyUtils.toGlobalConfig(effectivePolicy) : fallbackConfig;

                const log = WorkHourCalculator.processDailyLog(raw, activeConfig);

                // [Feature] Link to DB Employee UUID
                // [Change] Match using Name ONLY
                const key = log.userName.trim();
                const matchedEmployees = employeeMap.get(key);

                if (matchedEmployees) {
                    if (matchedEmployees.length === 1) {
                        // 1. Exact Match
                        log.employeeId = matchedEmployees[0].id;
                    } else if (matchedEmployees.length > 1) {
                        // 2. Ambiguous Match (Duplicate Names)
                        // Do NOT set employeeId
                        log.status = 'WARNING'; // Use WARNING or ERROR to highlight? Let's use WARNING + Custom Status?
                        // Actually, let's keep status as WARNING but add a note or special field
                        log.note = (log.note || "") + "[동명이인 확인 필요]";
                        log.candidates = matchedEmployees; // Attach candidates

                        // Override standard logic for status if needed, or rely on UI to check candidates
                    }
                }

                return log;
            });

            const userTotalWork: Record<string, number> = {};
            v1Logs.forEach(log => {
                userTotalWork[log.userId] = (userTotalWork[log.userId] || 0) + log.actualWorkDuration;
            });

            const validUserIds = new Set(v1Logs.filter(log => {
                return log.actualWorkDuration > 0 ||
                    log.logStatus === LogStatus.VACATION ||
                    log.status === 'ERROR' ||
                    log.status === 'MISSING';
            }).map(l => l.userId));

            let validLogs = v1Logs.filter(log => validUserIds.has(log.userId));

            const filledLogs: ProcessedWorkLog[] = [];
            const userGroups: Record<string, ProcessedWorkLog[]> = {};

            validLogs.forEach(l => {
                if (!userGroups[l.userId]) userGroups[l.userId] = [];
                userGroups[l.userId].push(l);
            });

            Object.keys(userGroups).forEach(userId => {
                const logs = userGroups[userId];
                if (logs.length === 0) return;

                const dates = logs.map(l => new Date(l.date).getTime());
                const minDate = new Date(Math.min(...dates));

                // Find a sample log to get employee metadata for the generated missing logs
                const sampleLog = logs[0];

                const day = minDate.getDay();
                const diff = minDate.getDate() - day + (day === 0 ? -6 : 1);
                const monday = new Date(minDate.setDate(diff));
                monday.setHours(0, 0, 0, 0);

                for (let i = 0; i < 7; i++) {
                    const curr = new Date(monday);
                    curr.setDate(monday.getDate() + i);
                    const y = curr.getFullYear();
                    const m = String(curr.getMonth() + 1).padStart(2, '0');
                    const d = String(curr.getDate()).padStart(2, '0');
                    const dateStr = `${y}-${m}-${d}`;

                    const existing = logs.find(l => l.date === dateStr);
                    if (existing) {
                        filledLogs.push(existing);
                    } else {
                        filledLogs.push({
                            id: `generated-${userId}-${dateStr}`,
                            userId: userId,
                            employeeId: sampleLog.employeeId, // Propagate UUID
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

            setData({
                raw: rawData,
                v1: filledLogs,
                v2: JSON.parse(JSON.stringify(filledLogs)).map((log: ProcessedWorkLog) => {
                    // Recalculate V2 using correct policy as well
                    const effectivePolicy = PolicyUtils.getPolicyForDate(log.date, policies);
                    const activeConfig = effectivePolicy ? PolicyUtils.toGlobalConfig(effectivePolicy) : fallbackConfig;

                    const { actualWork, totalDuration, breakDuration, snappedStart, snappedEnd } = calculateActualWork(log.rawStartTime!, log.rawEndTime!, activeConfig);
                    let processedLog = {
                        ...log,
                        startTime: snappedStart,
                        endTime: snappedEnd,
                        totalDuration: totalDuration,
                        breakDuration: breakDuration,
                        actualWorkDuration: actualWork,
                        overtimeDuration: Math.max(0, actualWork - (8 * 60)),
                    };

                    // [NEW] Auto-Fill Logic for TF Users (Using strict UUID match)
                    if (log.employeeId && tfUserIds.has(log.employeeId)) {
                        const date = new Date(log.date);
                        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                        const isZeroWork = processedLog.actualWorkDuration === 0;
                        // [Fix] Allow VACATION status because WorkHourCalculator defaults empty logs to VACATION
                        // For TF users, "Empty Logs" means "Working", not "Vacation".
                        const isTargetStatus = (
                            !log.logStatus ||
                            log.logStatus === LogStatus.NORMAL ||
                            log.logStatus === LogStatus.OTHER ||
                            log.logStatus === LogStatus.VACATION
                        );

                        if (isZeroWork && isTargetStatus && !isWeekend) {
                            // Valid TF Auto-Fill Condition

                            const targetStart = TimeUtils.timeToMinutes(activeConfig.standardStartTime || "09:00");
                            const targetEnd = TimeUtils.timeToMinutes(activeConfig.standardEndTime || "18:00");

                            // [Fix] Start: -10~+5 min (Early arrival ok), End: 0~+20 min (No early leave)
                            const startRaw = generateSafeTimeString(targetStart - 10, targetStart + 5, log.id + "start");
                            const endRaw = generateSafeTimeString(targetEnd, targetEnd + 20, log.id + "end");

                            const startMin = TimeUtils.timeToMinutes(startRaw.substring(0, 5));
                            const endMin = TimeUtils.timeToMinutes(endRaw.substring(0, 5));
                            const { actualWork: aw, totalDuration: td, breakDuration: bd } = calculateActualWork(startMin, endMin, activeConfig);

                            processedLog = {
                                ...processedLog,
                                startTime: startMin,
                                endTime: endMin,
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
            alert("파일 처리에 실패했습니다. 엑셀 형식을 확인해주세요.");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <SmartUploadStep isProcessing={isProcessing} onUpload={handleFileUpload} />
        /* 
        <LegacyUploadStep isProcessing={isProcessing} onUpload={handleFileUpload} />
        */
    );
};
