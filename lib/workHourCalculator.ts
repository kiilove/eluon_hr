import { ProcessedWorkLog, RawCommuteLog, WeeklySummary, WorkType, LogStatus, GlobalConfig, WorkPolicy } from "../types";
import { TimeUtils } from "./timeUtils";
import { HolidayUtils } from "./holidayUtils";
import { StandardCalibration } from "./calibration/StandardCalibration";
import { SpecialCalibration } from "./calibration/SpecialCalibration";
import { SpecialWorkCalculator } from "./calibration/SpecialWorkCalculator";
import { snapTime, generateSafeTimeString, calculateActualWork } from "./correctionUtils";

// --- Helper Functions Moved to correctionUtils.ts ---




export const WorkHourCalculator = {

    processDailyLog: (log: RawCommuteLog, config?: GlobalConfig): ProcessedWorkLog => {
        // Default Config if missing
        if (!config) {
            config = {
                standardStartTime: "09:00",
                standardEndTime: "18:00",
                breakTimeMinutes: 60,
                clockInCutoffTime: "08:30",
                clockOutCutoffTime: "18:30",
                lateClockInGraceMinutes: 10
            } as GlobalConfig;
        }

        let rawStart = TimeUtils.timeToMinutes(log.clockIn);
        let rawEnd = TimeUtils.timeToMinutes(log.clockOut);

        // Initial Snap & Calculation (Replaces manual snap + calculateHours)
        let {
            snappedStart: processedStart,
            snappedEnd: processedEnd,
            actualWork,
            totalDuration,
            breakDuration
        } = calculateActualWork(rawStart, rawEnd, config);

        // If 'disableSnap' is true, we revert to raw (Though calculateActualWork enforces strict rules usually)
        // If 'disableSnap' is true, we revert to raw FOR DISPLAY ONLY
        // But we MUST keep the 'actualWork' calculated based on Snap rules (as requested)
        if (config.disableSnap) {
            processedStart = rawStart;
            processedEnd = rawEnd;
            // actualWork, totalDuration, breakDuration are kept as calculated by calculateActualWork (Synced with Snap)
        }

        // [Fix] Respect explicit empty string in clockIn/Out (Zeroing case)
        // If log.clockIn is "", we want finalRawStartsStr to be "" (not originalClockIn)
        let finalRawStartsStr = log.clockIn;
        if (finalRawStartsStr === undefined || finalRawStartsStr === null) {
            finalRawStartsStr = log.originalClockIn || "";
        }

        let finalRawEndsStr = log.clockOut;
        if (finalRawEndsStr === undefined || finalRawEndsStr === null) {
            finalRawEndsStr = log.originalClockOut || "";
        }

        // Day Type Check
        // [Fix] Use robust YMD parsing to avoid UTC/Local timezone shifts (e.g. "2025-12-06" became Friday in UTC vs Sat in Local)
        const [y, m, d] = log.date.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d); // Local Time construction

        const isHoliday = HolidayUtils.isHoliday(dateObj);
        const day = dateObj.getDay();
        const isWeekend = day === 0 || day === 6;
        const isStandardWorkDay = !isHoliday && !isWeekend;

        // [New Architecture] "Basic Attendance Engine" Rule:
        // Weekends & Holidays are strictly IGNORED from Raw Excel.
        // They default to 'REST' (0 hours).
        // Exception: If 'logStatus' is explicitly passed (Manual Override/Correction), we respect it.
        const isExplicitSpecial = log.logStatus === LogStatus.SPECIAL || log.logStatus === LogStatus.TRIP || log.logStatus === LogStatus.EDUCATION;

        if ((isHoliday || isWeekend) && !isExplicitSpecial) {
            // Force zeroing out for Basic Engine
            // But keep original Raw Strings in 'original...' fields for reference if needed? 
            // Config: "All employees... mark as REST"
            // We do NOT wipe 'originalClockIn' because we might want to see it in a "Raw View" popup, but for Calc logic, it is 0.

            // Reset Calculation Vars
            processedStart = 0;
            processedEnd = 0;
            actualWork = 0;
            totalDuration = 0;
            breakDuration = 0;

            // Reset Raw Input (Effective)
            rawStart = 0;
            rawEnd = 0;
        }

        // Step 3: Daily Review (Normal Day Only for strict checking?)
        // "일일 검토: 일 8시간 초과 근무일 -> SafetyCorrection"
        const standardDailyMinutes = 8 * 60; // 480 min

        // Safety Correction Trigger (DISABLED for V2 Raw View - User Request)
        // We only want to SNAP for calculation, but NOT "Correct" (invent) times yet.
        /* 
        if (isStandardWorkDay && actualWork > standardDailyMinutes) {
             // ... (Safety Logic Disabled) ...
        } 
        */

        // Determine Status based on Work Hours (not just duration)
        // If 0h on weekday -> VACATION (unless holiday)
        let status: 'NORMAL' | 'WARNING' | 'ERROR' = 'NORMAL';
        let logStatus = LogStatus.NORMAL;

        // Classification Logic (Result of Sidebar Filter Request)
        if (isHoliday || isWeekend) {
            // Priority 1: Holiday / Weekend
            if (actualWork > 0) {
                logStatus = LogStatus.SPECIAL; // Worked on Holiday/Weekend
            } else {
                logStatus = LogStatus.REST; // Rested on Holiday/Weekend
            }
        } else {
            // Weekday Logic
            if (rawStart === 0 && rawEnd === 0) {
                // Priority 2: Weekday NO Work History -> VACATION
                logStatus = LogStatus.VACATION;
            } else if (rawStart === 0 || rawEnd === 0) {
                // Priority 3: Partial Data (Missing Start or End) -> MANUAL CHECK
                status = 'ERROR';
                logStatus = LogStatus.OTHER; // Needs check
            } else {
                // Normal Work Day
                if (actualWork === 0) {
                    // Start/End exist but result is 0? (e.g. 09:00 - 09:00) -> Technically "Other" or "Warning"
                    status = 'WARNING';
                    logStatus = LogStatus.OTHER;
                }
            }
        }

        // [Fix] Priority Override: If input log already has a specific Status (e.g. Manual TRIP/EDUCATION), respect it.
        // Unless it is 'NORMAL', in which case we accept the auto-classification (or if it was explicitly set to Normal).
        if (log.logStatus && log.logStatus !== LogStatus.NORMAL) {
            // If manual status is set (Trip, Education, etc.), Keep it.
            // But if invalid (e.g. Vacation but has work?), we might want to warn, but for now Trust the Status.
            logStatus = log.logStatus;
        }

        // [Fix] Priority Override: If input log already has a specific Status, respect it.
        // We Respect User Selection (Sticky) for NORMAL, VACATION, TRIP, etc.
        // We ONLY recalculate if the status is 'OTHER' (Error/Temporary) or 'REST' (Auto).
        if (log.logStatus &&
            log.logStatus !== LogStatus.OTHER &&
            log.logStatus !== LogStatus.REST
        ) {
            // If manual status is set (Normal, Trip, Education, etc.), Keep it.
            logStatus = log.logStatus;

            // Exception: If Status is Vacation/Sick but actually worked > 0?
            // User wants to see "Vacation" even if 0 work.
            // If 0 work, we already calculate 0.
        }

        return {
            id: log.id,
            userId: log.userId,
            userName: log.userName,
            userTitle: log.userTitle,
            department: log.department,
            date: log.date,
            // Return RAW times for display (User Request: "Don't correct yet")
            startTime: rawStart,
            endTime: rawEnd,
            // Keep specific raw fields just in case
            rawStartTime: rawStart,
            rawEndTime: rawEnd,

            rawStartTimeStr: finalRawStartsStr, // Display: Original OR Safe Random
            rawEndTimeStr: finalRawEndsStr,     // Display: Original OR Safe Random

            originalStartTimeStr: log.originalClockIn || log.clockIn,
            originalEndTimeStr: log.originalClockOut || log.clockOut,

            totalDuration: totalDuration,
            breakDuration: breakDuration,
            actualWorkDuration: actualWork,
            overtimeDuration: (!isStandardWorkDay && (isWeekend || isHoliday)) ? 0 : Math.max(0, actualWork - (8 * 60)),
            specialWorkMinutes: (!isStandardWorkDay && (isWeekend || isHoliday)) ? actualWork : 0,

            nightWorkDuration: 0,
            restDuration: 0,
            workType: 'BASIC',
            isHoliday: (!isStandardWorkDay && (isWeekend || isHoliday)),
            status,
            logStatus
        };
    },

    // --- Weekly Logic (Step 5) ---
    calculateWeeklySummary: (userId: string, logs: ProcessedWorkLog[], workType: WorkType): WeeklySummary => {
        let totalActualMinutes = 0;
        let specialWorkMinutes = 0;

        logs.filter(l => l.userId === userId).forEach(log => {
            totalActualMinutes += log.actualWorkDuration;

            // Robust Date Parsing
            const [y, m, d] = log.date.split('-').map(Number);
            const dateObj = new Date(y, m - 1, d);
            const day = dateObj.getDay();
            const isWeekend = day === 0 || day === 6;

            if (isWeekend || log.isHoliday) {
                specialWorkMinutes += log.actualWorkDuration;
            }
        });

        const weekDayWorkMinutes = Math.max(0, totalActualMinutes - specialWorkMinutes);
        const standardWeeklyMinutes = 40 * 60;
        const basicWorkMinutes = Math.min(weekDayWorkMinutes, standardWeeklyMinutes);
        const overtimeMinutes = Math.max(0, weekDayWorkMinutes - standardWeeklyMinutes);
        const totalOvertime = overtimeMinutes + specialWorkMinutes;

        let complianceStatus: 'PASS' | 'WARNING' | 'VIOLATION' = 'PASS';
        if (totalOvertime > 12 * 60) complianceStatus = 'VIOLATION';

        return {
            userId,
            userName: logs[0]?.userName || "", // Safe access
            startDate: logs[0]?.date || "",
            totalWorkMinutes: totalActualMinutes,
            basicWorkMinutes,
            overtimeMinutes,
            specialWorkMinutes,
            complianceStatus
        };
    },

    calibrateLogs: (logs: ProcessedWorkLog[], config: GlobalConfig, policies?: WorkPolicy[]): ProcessedWorkLog[] => {
        // Detect Anomalies First
        const analyzedLogs = WorkHourCalculator.detectAnomalies(logs);

        const getWeekKey = (dateStr: string) => {
            const d = new Date(dateStr);
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            const monday = new Date(d.setDate(diff));
            return `${monday.getFullYear()}-${monday.getMonth()}-${monday.getDate()}`;
        };

        const weekGroups: Record<string, ProcessedWorkLog[]> = {};
        analyzedLogs.forEach(log => {
            const key = getWeekKey(log.date);
            if (!weekGroups[key]) weekGroups[key] = [];
            weekGroups[key].push(log);
        });

        const calibratedLogs: ProcessedWorkLog[] = [];

        Object.values(weekGroups).forEach(weekLogs => {
            const userLogsMap: Record<string, ProcessedWorkLog[]> = {};
            weekLogs.forEach(log => {
                if (!userLogsMap[log.userId]) userLogsMap[log.userId] = [];
                userLogsMap[log.userId].push(log);
            });

            Object.keys(userLogsMap).forEach(userId => {
                const userLogs = userLogsMap[userId];
                const specialLogs: ProcessedWorkLog[] = [];
                const standardLogs: ProcessedWorkLog[] = [];

                userLogs.forEach(log => {
                    if (log.status === 'ERROR') {
                        calibratedLogs.push(log); // Keep as is
                        return;
                    }
                    const dateObj = new Date(log.date);
                    const isHoliday = HolidayUtils.isHoliday(dateObj);
                    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

                    if (isWeekend || isHoliday) {
                        specialLogs.push(log);
                    } else {
                        standardLogs.push(log);
                    }
                });

                let currentWeeklySpecial = 0;

                // 2. Process Standard Logs First
                standardLogs.forEach(log => {
                    calibratedLogs.push(log);
                });

                // 3. Process Special Logs using SpecialWorkCalculator
                specialLogs.sort((a, b) => a.actualWorkDuration - b.actualWorkDuration); // Shortest first
                specialLogs.forEach(log => {
                    // Determine Active Config for this Log
                    let logConfig = config;
                    if (policies && policies.length > 0) {
                        const match = policies
                            .filter(p => p.effective_date <= log.date)
                            .sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0];
                        if (match) {
                            logConfig = {
                                standardStartTime: match.standard_start_time,
                                standardEndTime: match.standard_end_time,
                                clockInCutoffTime: match.clock_in_cutoff_time || '08:30',
                                clockOutCutoffTime: match.clock_out_cutoff_time || '18:30',
                                lateClockInGraceMinutes: match.clock_in_grace_minutes,
                                breakTimeMinutes: match.break_time_8h_deduction,
                                breakTime4hDeduction: match.break_time_4h_deduction,
                                breakTime8hDeduction: match.break_time_8h_deduction,
                                maxWeeklyOvertimeMinutes: match.max_weekly_overtime_minutes,
                            };
                        }
                    }

                    const calibrated = SpecialWorkCalculator.calibrate(log, logConfig, currentWeeklySpecial);
                    currentWeeklySpecial += calibrated.actualWorkDuration;
                    calibratedLogs.push(calibrated);
                });
            });
        });

        return calibratedLogs.sort((a, b) => {
            if (a.date !== b.date) return new Date(a.date).getTime() - new Date(b.date).getTime();
            return a.userId.localeCompare(b.userId);
        });
    },

    detectAnomalies: (logs: ProcessedWorkLog[]): ProcessedWorkLog[] => {
        const sortedLogs = logs.map(l => ({ ...l })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const userGlobalMap: Record<string, ProcessedWorkLog[]> = {};

        sortedLogs.forEach(l => {
            if (!userGlobalMap[l.userId]) userGlobalMap[l.userId] = [];
            userGlobalMap[l.userId].push(l);
        });

        Object.values(userGlobalMap).forEach(uLogs => {
            uLogs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            for (let i = 0; i < uLogs.length - 1; i++) {
                const current = uLogs[i];
                if (current.startTime > 0 && current.endTime === 0) {
                    // Open Ended Logic (PC Left On) - Mark as error or auto-fix?
                    // Standard approach: Mark as error for manual review.
                    // ... (Simplifying for this prompt to stick to basics)
                }

                if (current.startTime === 0 && current.endTime > 0) {
                    current.status = 'ERROR';
                    current.logStatus = LogStatus.OTHER;
                    current.note = (current.note || "") + "[시작시간 미비]";
                    current.actualWorkDuration = 0;
                }
            }
        });
        return Object.values(userGlobalMap).flat().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    },

    fillMissingDays: (logs: ProcessedWorkLog[]): ProcessedWorkLog[] => {
        if (logs.length === 0) return [];
        const dates = logs.map(l => l.date).sort();
        const minDate = new Date(dates[0]);
        const maxDate = new Date(dates[dates.length - 1]);
        const userGroups: Record<string, ProcessedWorkLog[]> = {};
        logs.forEach(log => {
            if (!userGroups[log.userId]) userGroups[log.userId] = [];
            userGroups[log.userId].push(log);
        });

        const filledLogs: ProcessedWorkLog[] = [];
        Object.values(userGroups).forEach(group => {
            const user = group[0];
            const userLogMap = new Map(group.map(l => [l.date, l]));
            for (let d = new Date(minDate); d <= maxDate; d.setDate(d.getDate() + 1)) {
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const dateStr = `${year}-${month}-${day}`;

                if (userLogMap.has(dateStr)) {
                    filledLogs.push(userLogMap.get(dateStr)!);
                } else {
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    const isHoliday = HolidayUtils.isHoliday(d);
                    let status = LogStatus.VACATION;
                    if (isWeekend || isHoliday) status = LogStatus.REST;

                    filledLogs.push({
                        id: `filler-${user.userId}-${dateStr}`,
                        userId: user.userId,
                        userName: user.userName,
                        userTitle: user.userTitle,
                        department: user.department,
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
                        isHoliday: isWeekend || isHoliday,
                        status: 'NORMAL',
                        logStatus: status
                    });
                }
            }
        });
        return filledLogs;
    },

    calculateAllWeeklySummaries: (logs: ProcessedWorkLog[]): WeeklySummary[] => {
        const groupedLogs: Record<string, ProcessedWorkLog[]> = {};
        logs.forEach(log => {
            if (!groupedLogs[log.userId]) groupedLogs[log.userId] = [];
            groupedLogs[log.userId].push(log);
        });
        return Object.values(groupedLogs).map(userLogs =>
            WorkHourCalculator.calculateWeeklySummary(userLogs[0].userId, userLogs, WorkType.STANDARD)
        ).sort((a, b) => a.userName.localeCompare(b.userName, 'ko'));
    },

    recalculateLog: (log: ProcessedWorkLog, config: GlobalConfig): ProcessedWorkLog => {
        return WorkHourCalculator.processDailyLog({
            ...log,
            clockIn: log.rawStartTimeStr || TimeUtils.minutesToColonFormat(log.startTime) + ":00",
            clockOut: log.rawEndTimeStr || TimeUtils.minutesToColonFormat(log.endTime) + ":00",
            originalClockIn: log.originalStartTimeStr,
            originalClockOut: log.originalEndTimeStr,
            // [Fix] Pass existing logStatus to prevent overwrite by auto-classification logic
            logStatus: log.logStatus
        } as RawCommuteLog, config);
    },

    getViolationUserIds: (logs: ProcessedWorkLog[]): Set<string> => {
        const ids = new Set<string>();
        logs.forEach(log => {
            if (log.status === 'ERROR') {
                ids.add(log.userId);
                return;
            }
            // Logic to find violators can be expanded
            if (log.actualWorkDuration > 52 * 60) ids.add(log.userId);
        });
        return ids;
    }
};
