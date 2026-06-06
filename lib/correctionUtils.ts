import { GlobalConfig, ProcessedWorkLog, LogStatus } from "../types";
import { TimeUtils } from "./timeUtils";

/**
 * Generate a safe random time string (HH:mm:ss)
 * Used for displaying safe times when strict correction is applied.
 */
export const generateSafeTimeString = (minMinute: number, maxMinute: number, seed: string) => {
    // [Removed] Early return to allow random seconds even for fixed minute
    // if (minMinute >= maxMinute) return TimeUtils.minutesToColonFormat(minMinute) + ":00";

    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash |= 0;
    }

    const range = maxMinute - minMinute;
    const rMin = range === 0 ? 0 : Math.abs(hash) % range;
    // User Request: Avoid 00 seconds to look more realistic (1 ~ 59)
    const rSec = (Math.abs(hash >> 2) % 59) + 1;

    const finalMinute = minMinute + rMin;
    const hh = Math.floor(finalMinute / 60).toString().padStart(2, '0');
    const mm = (finalMinute % 60).toString().padStart(2, '0');
    const ss = rSec.toString().padStart(2, '0');

    return `${hh}:${mm}:${ss}`;
};

/**
 * Snap(time, type) - 시각 정규화
 * 
 * Rules:
 * - Start: 08:30 ~ 09:10 (Grace 10m) -> Snap to 09:00
 * - End:   18:00 ~ 18:30 -> Snap to 18:00
 */
export const snapTime = (time: number, isStart: boolean, config: GlobalConfig): number => {
    const stdStart = TimeUtils.timeToMinutes(config.standardStartTime); // 09:00
    const stdEnd = TimeUtils.timeToMinutes(config.standardEndTime);     // 18:00

    // Configs from Prompt/Settings
    const startLimit = TimeUtils.timeToMinutes(config.clockInCutoffTime); // 08:30
    const endLimit = TimeUtils.timeToMinutes(config.clockOutCutoffTime);  // 18:30
    const grace = config.lateClockInGraceMinutes || 10; // 10 min

    if (time === 0) return 0; // [Exception] Missing time -> Keep as 0 (Other/Error)

    if (isStart) {
        // Start Logic:
        // 1. 08:30 <= time <= 09:00 -> 09:00
        // 2. 09:00 <  time <= 09:10 -> 09:00 (Grace)
        if (time >= startLimit && time <= stdStart + grace) {
            return stdStart;
        }
        return time;
    } else {
        // End Logic:
        // 1. 18:00 <= time <= 18:30 -> 18:00
        // 2. If time < 18:00, keep original (Early Leave)
        if (time >= stdEnd && time <= endLimit) {
            return stdEnd;
        }
        return time; // Keep original (e.g. 19:00 or 17:50)
    }
};

/**
 * Calculate Actual Work using Snap Logic
 * Returns the effective work minutes after applying snap rules and break time.
 */
export const calculateActualWork = (startTime: number, endTime: number, config: GlobalConfig) => {
    // 1. Apply Snap
    const snappedStart = snapTime(startTime, true, config);
    const snappedEnd = snapTime(endTime, false, config);

    if (snappedStart === 0 || snappedEnd === 0) {
        return { actualWork: 0, totalDuration: 0, breakDuration: 0, snappedStart, snappedEnd };
    }

    // 2. Calculate Total Duration
    const totalDuration = Math.max(0, snappedEnd - snappedStart);

    // 3. Deduct Break Time
    let breakDuration = 0;

    // A. Initial Break Logic (Lunch etc.)
    if (config.breakTime8hDeduction !== undefined || config.breakTime4hDeduction !== undefined) {
        if (totalDuration >= 480 && (config.breakTime8hDeduction || 0) > 0) {
            breakDuration = config.breakTime8hDeduction || 60;
        } else if (totalDuration >= 240 && (config.breakTime4hDeduction || 0) > 0) {
            breakDuration = config.breakTime4hDeduction || 30;
        }
    } else {
        if (totalDuration >= 240) {
            breakDuration = config.breakTimeMinutes || 60;
        }
    }

    // [New] B. Overtime Buffer/Break (18:00 ~ 18:30)
    // Rule: Anything from 18:00 to 18:30 is a buffer/break. 
    // If work extends past 18:30, we deduct this 30m period from actual work.
    const stdEnd = TimeUtils.timeToMinutes(config.standardEndTime); // 18:00
    const endLimit = TimeUtils.timeToMinutes(config.clockOutCutoffTime); // 18:30

    // If effective end time is past the 30-min buffer (18:30), 
    // the period between 18:00 and 18:30 is treated as a dinner/buffer break.
    if (snappedEnd > endLimit) {
        breakDuration += (endLimit - stdEnd); // Usually + 30 mins
    }

    // 4. Calculate Net Actual
    // [User Request] Round to nearest 30 minutes for official "Actual Work" reporting
    const rawActual = Math.max(0, totalDuration - breakDuration);
    const actualWork = Math.round(rawActual / 30) * 30;

    // [New] Explicit Overtime Calculation Rule (User Request: Strict > 18:30)
    // Regardless of start time or breaks, OT is strictly time after 18:30.
    // [User Request] Round to nearest 30 minutes for overtime reporting
    const rawOvertime = Math.max(0, snappedEnd - endLimit);
    const overtimeDuration = Math.round(rawOvertime / 30) * 30;

    // [New] Effective End Time for Display (Snap Target)
    // If Overtime exists, the effective end is (Buffer End + Overtime).
    // If NO Overtime, the effective end is just the Snapped End.
    const effectiveEndTime = overtimeDuration > 0 ? (endLimit + overtimeDuration) : snappedEnd;

    // [New] Night Work Calculation (22:00 ~ 06:00)
    const calculateNightWork = (start: number, end: number): number => {
        if (start === 0 && end === 0) return 0;
        let nightMin = 0;
        // Night Range 1: 00:00 - 06:00 (0 - 360)
        const n1Start = Math.max(start, 0);
        const n1End = Math.min(end, 360);
        if (n1End > n1Start) nightMin += (n1End - n1Start);

        // Night Range 2: 22:00 - 24:00 (1320 - 1440)
        const n2Start = Math.max(start, 1320);
        const n2End = Math.min(end, 1440);
        if (n2End > n2Start) nightMin += (n2End - n2Start);

        // Night Range 3: 24:00 - 30:00 (1440 - 1800) -- past midnight up to 6am
        if (end > 1440) {
            const n3Start = Math.max(start, 1440);
            const n3End = Math.min(end, 1800);
            if (n3End > n3Start) nightMin += (n3End - n3Start);
        }
        return nightMin;
    };

    const nightWorkDuration = calculateNightWork(snappedStart, snappedEnd);

    return {
        actualWork,
        totalDuration,
        breakDuration,
        snappedStart,
        snappedEnd,
        overtimeDuration,
        effectiveEndTime,
        nightWorkDuration
    };
};

/**
 * Calibrates a single log for discretionary work if applicable.
 * Returns the updated log if a discretionary period matches, otherwise null.
 */
export const calibrateLogDiscretionary = (
    log: ProcessedWorkLog,
    employee: any,
    config: GlobalConfig
): ProcessedWorkLog | null => {
    if (!employee || !employee.discretionary_history || employee.discretionary_history.length === 0) {
        return null;
    }

    const activeDisc = employee.discretionary_history.find((h: any) => {
        const startLimit = (h.start_date && h.start_date !== "null" && h.start_date !== "undefined") ? h.start_date : null;
        const endLimit = (h.end_date && h.end_date !== "null" && h.end_date !== "undefined") ? h.end_date : null;
        return (!startLimit || log.date >= startLimit) && (!endLimit || log.date <= endLimit);
    });

    if (!activeDisc) {
        return null;
    }

    const isWorkingDay = log.logStatus === LogStatus.NORMAL || log.logStatus === LogStatus.SPECIAL;
    if (!isWorkingDay) {
        return null;
    }

    const targetStartStr = (activeDisc.start_time && activeDisc.start_time !== "null" && activeDisc.start_time !== "undefined") ? activeDisc.start_time : "09:00";
    const targetEndStr = (activeDisc.end_time && activeDisc.end_time !== "null" && activeDisc.end_time !== "undefined") ? activeDisc.end_time : "18:00";

    const targetStartMin = TimeUtils.timeToMinutes(targetStartStr);
    const targetEndMin = TimeUtils.timeToMinutes(targetEndStr);

    const seed = `${log.userName || log.userId || 'User'}-${log.date}`;
    const rawStart = generateSafeTimeString(targetStartMin - 14, targetStartMin, seed + "-disc-start");
    const rawEnd = generateSafeTimeString(targetEndMin, targetEndMin + 14, seed + "-disc-end");

    const startMin = TimeUtils.timeToMinutes(rawStart.substring(0, 5));
    const endMin = TimeUtils.timeToMinutes(rawEnd.substring(0, 5));

    const tempConfig: GlobalConfig = {
        ...config,
        standardStartTime: targetStartStr,
        standardEndTime: targetEndStr,
        clockInCutoffTime: TimeUtils.minutesToColonFormat(targetStartMin - 14),
        clockOutCutoffTime: TimeUtils.minutesToColonFormat(targetEndMin + 14),
        lateClockInGraceMinutes: 0
    };

    const calc = calculateActualWork(startMin, endMin, tempConfig);
    const roundedActualMinutes = Math.round(calc.actualWork / 30) * 30;

    let note = log.note || "";
    if (!note.includes("[재량근무 적용]")) {
        note = note ? `${note}, [재량근무 적용]` : "[재량근무 적용]";
    }

    return {
        ...log,
        startTime: calc.snappedStart,
        endTime: calc.snappedEnd,
        rawStartTimeStr: rawStart,
        rawEndTimeStr: rawEnd,
        totalDuration: calc.totalDuration,
        breakDuration: calc.breakDuration,
        actualWorkDuration: roundedActualMinutes,
        overtimeDuration: 0,
        isExemptFromOvertime: true,
        targetStartTime: targetStartStr,
        targetEndTime: targetEndStr,
        workType: 'ELASTIC',
        status: 'NORMAL',
        note: note
    };
};

/**
 * Apply New Policies: Discretionary Work & Pregnancy Management
 */
export const applyNewPolicies = (
    logs: ProcessedWorkLog[],
    employees: any[],
    config: GlobalConfig
): ProcessedWorkLog[] => {
    // 1. Create a fast lookup map for employees
    const employeeMap = new Map<string, any>();
    employees.forEach(e => {
        // [Fix] Convert numeric DB values (0/1) to boolean
        const normalized = {
            ...e,
            is_pregnant: Boolean(e.is_pregnant),
            discretionary_history: e.discretionary_history || []
        };
        employeeMap.set(e.id, normalized);
    });

    console.log(`[applyNewPolicies] Processing ${logs.length} logs with ${employees.length} employees`);

    let discretionaryCount = 0;
    let pregnantCount = 0;

    const result = logs.map(log => {
        const emp = log.employeeId ? employeeMap.get(log.employeeId) : null;
        if (!emp) return log;

        let processed = { ...log };

        // [Policy A] Discretionary Work (재량근무제) - Check history records using calibrateLogDiscretionary helper
        const calibrated = calibrateLogDiscretionary(log, emp, config);
        if (calibrated) {
            discretionaryCount++;
            processed = calibrated;
        }

        // [Policy B] Pregnancy Management (임산부 관리 & 단축 근로)
        if (emp.is_pregnant) {
            pregnantCount++;

            // 1. Reduced Working Hours Logic (단축 근로)
            const startLimit = (emp.pregnancy_reduced_start_date && emp.pregnancy_reduced_start_date !== "null" && emp.pregnancy_reduced_start_date !== "undefined") ? emp.pregnancy_reduced_start_date : null;
            const endLimit = (emp.pregnancy_reduced_end_date && emp.pregnancy_reduced_end_date !== "null" && emp.pregnancy_reduced_end_date !== "undefined") ? emp.pregnancy_reduced_end_date : null;

            const hasReducedTimes = emp.pregnancy_reduced_start_time && emp.pregnancy_reduced_start_time !== "null" && emp.pregnancy_reduced_start_time !== "undefined"
                && emp.pregnancy_reduced_end_time && emp.pregnancy_reduced_end_time !== "null" && emp.pregnancy_reduced_end_time !== "undefined";

            const isInReducedPeriod = (!startLimit || log.date >= startLimit) && (!endLimit || log.date <= endLimit) && hasReducedTimes;

            if (isInReducedPeriod) {
                // Apply Custom Reduced Standard Time
                const targetStartStr = emp.pregnancy_reduced_start_time;
                const targetEndStr = emp.pregnancy_reduced_end_time;

                const targetStartMin = TimeUtils.timeToMinutes(targetStartStr);
                const targetEndMin = TimeUtils.timeToMinutes(targetEndStr);

                // For reduced hours, we treat the reduced time as the "Standard".
                // So arriving at 10:00 (if reduced start is 10:00) is NOT Late.
                // Leaving at 16:00 (if reduced end is 16:00) is NOT Early Leave.

                // Create temp config for this calculation
                const tempConfig: GlobalConfig = {
                    ...config,
                    standardStartTime: targetStartStr,
                    standardEndTime: targetEndStr,
                    // Updates Snap rules to strict reduced times? 
                    // Usually reduced work means strict adherence, so we can use the same time or a small grace.
                    // Let's allow standard grace (10m) from the NEW start time.
                    clockInCutoffTime: TimeUtils.minutesToColonFormat(targetStartMin - 30), // Allow earlier arrival but snap?
                    clockOutCutoffTime: TimeUtils.minutesToColonFormat(targetEndMin + 30),
                };

                // Recalculate Work
                // We use the Original Raw Time to re-snap against the new Reduced Targets
                const rawStart = log.rawStartTime || log.startTime;
                const rawEnd = log.rawEndTime || log.endTime;

                const calc = calculateActualWork(rawStart, rawEnd, tempConfig);

                // [User Request] 30-minute rounding for calculated actual work hours
                const roundedActualMinutes = Math.round(calc.actualWork / 30) * 30;

                processed = {
                    ...processed,
                    startTime: calc.snappedStart,
                    endTime: calc.snappedEnd,
                    totalDuration: calc.totalDuration,
                    breakDuration: calc.breakDuration,
                    actualWorkDuration: roundedActualMinutes,
                    targetStartTime: targetStartStr,
                    targetEndTime: targetEndStr,
                    correctionMemo: (processed.correctionMemo ? processed.correctionMemo + " " : "") + `[단축: ${targetStartStr}~${targetEndStr}]`,
                    note: (processed.note ? processed.note + ", " : "") + "[임산부 단축근로]"
                };
            } else {
                processed.note = (processed.note ? processed.note + ", " : "") + "[임산부 보호]";
            }

            // 2. Global Pregnancy Rules (Always applied)
            // "Include from Overtime and Special Work exclusion"
            processed.overtimeDuration = 0;
            processed.specialWorkMinutes = 0;
            processed.isExemptFromOvertime = true;
        }

        return processed;
    });

    console.log(`[applyNewPolicies] Applied: ${discretionaryCount} discretionary logs, ${pregnantCount} pregnancy logs`);

    return result;
};

export const getLogCellDisplay = (log: ProcessedWorkLog, type: 'start' | 'end' | 'total' | 'actual', config?: GlobalConfig) => {
    // 1. Status Overrides (Text Display) - [Fix] Normal logging should pass through
    const isWorkingStatus = log.logStatus === LogStatus.NORMAL || log.logStatus === LogStatus.SPECIAL; // Special is work too

    if (!isWorkingStatus) {
        if (log.logStatus === LogStatus.VACATION) return { text: "휴가", isTime: false, className: "text-sky-500 font-medium" };
        if (log.logStatus === LogStatus.TRIP) return { text: "출장", isTime: false, className: "text-indigo-500 font-medium" };
        if (log.logStatus === LogStatus.EDUCATION) return { text: "교육", isTime: false, className: "text-indigo-500 font-medium" };
        if (log.logStatus === LogStatus.SICK) return { text: "병가", isTime: false, className: "text-red-500 font-medium" };
        if (log.logStatus === LogStatus.REST) return { text: "휴무", isTime: false, className: "text-slate-400 font-medium" };
        if (log.logStatus === LogStatus.RESIGNED) return { text: "퇴사", isTime: false, className: "text-gray-400 font-medium line-through decoration-gray-400" };
        if (log.logStatus === LogStatus.PRE_JOIN) return { text: "입사전", isTime: false, className: "text-cyan-500 font-medium" };
        if (log.logStatus === LogStatus.OTHER) return { text: "기타", isTime: false, className: "text-slate-400 font-medium" };
    }

    // 2. Normal Time Display
    if (type === 'start') {
        // [User Request] Show context/raw time if available
        const raw = log.rawStartTimeStr;
        const calc = log.startTime > 0 ? TimeUtils.minutesToTime(log.startTime) : '-';

        let subText = null;
        if (log.actualWorkDuration > 0) {
            // [Fix] Prioritize saved target times (Discretionary) or show standard start if snapped
            const snappedStr = log.targetStartTime || TimeUtils.minutesToTime(snapTime(log.startTime, true, config || { standardStartTime: "09:00" } as any));

            // If raw input exists, show the effective/snapped time in blue parens for clarity
            if (raw && raw.substring(0, 5) !== snappedStr) {
                subText = `(${snappedStr})`;
            }
        }

        return {
            text: raw || calc,
            subText,
            isTime: true,
            className: (log.startTime === 0 && log.endTime === 0) ? "text-slate-300" : "text-foreground"
        };
    }

    if (type === 'end') {
        const raw = log.rawEndTimeStr;
        const calc = log.endTime > 0 ? TimeUtils.minutesToTime(log.endTime) : '-';
        let subText = null;

        if (log.actualWorkDuration > 0) {
            // [Fix] For OT logs, we want to show the 'Rounded Effective End' in parens if it differs from raw
            // This clearly shows that 20:40 became 20:30 (rounded) or 18:09 became 18:00 (snapped)
            const standardEndStr = (config?.standardEndTime || "18:00");
            const snappedVal = snapTime(log.endTime, false, config || { standardEndTime: "18:00", clockOutCutoffTime: "18:30" } as any);

            // If it's a fixed-target person (Discretionary), use that.
            // Otherwise, if it's overtime, we might want to show the snap/rounding result.
            let effectiveStr = log.targetEndTime || TimeUtils.minutesToTime(snappedVal);

            // [New] If the end time is far beyond standard (OT), and we're rounding to 30m, 
            // the 'effective' display should match the rounded actual work minutes if possible.
            // For now, let's at least ensure 18:10 -> (18:00) works consistently.
            if (raw && raw.substring(0, 5) !== effectiveStr) {
                subText = `(${effectiveStr})`;
            } else if (raw && log.overtimeDuration > 0) {
                // If it's OT but raw is same as snapped (e.g. 20:40), 
                // we still might want to show standard (18:00) so user knows when OT started?
                // Or show the "OT Buffer End" (18:30)?
                // User said: "Why isn't the snap time displayed for virtual OT?"
                // Let's show the standard reference in parentheses for OT days if not already showing something else.
                subText = `(${standardEndStr})`;
            }
        }

        return {
            text: raw || calc,
            subText,
            isTime: true,
            className: (log.startTime === 0 && log.endTime === 0) ? "text-slate-300" : "text-foreground"
        };
    }

    if (type === 'total') {
        const text = log.totalDuration > 0
            ? `${TimeUtils.minutesToDisplay(log.totalDuration)} / ${TimeUtils.minutesToDisplay(log.breakDuration)}`
            : '-';
        return { text, isTime: true, className: "text-muted-foreground" };
    }

    if (type === 'actual') {
        const text = log.actualWorkDuration > 0 ? TimeUtils.minutesToDisplay(log.actualWorkDuration) : '-';
        return { text, isTime: true, className: "text-primary font-bold" };
    }

    return { text: "-", isTime: true };
};
