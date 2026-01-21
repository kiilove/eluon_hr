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

    // Priority: Granular Rules > Legacy Flat Rule
    if (config.breakTime8hDeduction !== undefined || config.breakTime4hDeduction !== undefined) {
        // Granular Logic
        if (totalDuration >= 480 && (config.breakTime8hDeduction || 0) > 0) {
            breakDuration = config.breakTime8hDeduction || 60;
        } else if (totalDuration >= 240 && (config.breakTime4hDeduction || 0) > 0) {
            breakDuration = config.breakTime4hDeduction || 30;
        }
    } else {
        // 3. Deduct Break Time
        // Priority: Granular Rules > Legacy Flat Rule
        if (config.breakTime8hDeduction !== undefined || config.breakTime4hDeduction !== undefined) {
            // Granular Logic
            if (totalDuration >= 480 && (config.breakTime8hDeduction || 0) > 0) {
                breakDuration = config.breakTime8hDeduction || 60;
            } else if (totalDuration >= 240 && (config.breakTime4hDeduction || 0) > 0) {
                breakDuration = config.breakTime4hDeduction || 30;
            }
        } else {
            // Legacy Logic
            if (totalDuration >= 240) { // If worked >= 4 hours
                breakDuration = config.breakTimeMinutes || 60; // Default 60m break
            }
        }
    }

    // 4. Calculate Net Actual
    const actualWork = Math.max(0, totalDuration - breakDuration);

    return { actualWork, totalDuration, breakDuration, snappedStart, snappedEnd };
};

/**
 * Get Standardized Display Value for Log Cells
 * Returns text, class, and editability based on LogStatus.
 */
export const getLogCellDisplay = (log: ProcessedWorkLog, type: 'start' | 'end' | 'total' | 'actual', config?: GlobalConfig) => {
    // 1. Status Overrides (Text Display)
    if (log.logStatus === LogStatus.VACATION) return { text: "휴가", isTime: false, className: "text-sky-500 font-medium" };
    if (log.logStatus === LogStatus.TRIP) return { text: "출장", isTime: false, className: "text-indigo-500 font-medium" };
    if (log.logStatus === LogStatus.EDUCATION) return { text: "교육", isTime: false, className: "text-indigo-500 font-medium" };
    if (log.logStatus === LogStatus.SICK) return { text: "병가", isTime: false, className: "text-red-500 font-medium" };
    if (log.logStatus === LogStatus.REST) return { text: "휴무", isTime: false, className: "text-slate-400 font-medium" };

    // 2. Normal Time Display
    if (type === 'start') {
        const raw = log.rawStartTimeStr;
        const calc = log.startTime > 0 ? TimeUtils.minutesToTime(log.startTime) : '-';

        let subText = null;
        if (config && log.actualWorkDuration > 0) {
            subText = `(${TimeUtils.minutesToTime(snapTime(log.startTime, true, config))})`;
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
        if (config && log.actualWorkDuration > 0) {
            subText = `(${TimeUtils.minutesToTime(snapTime(log.endTime, false, config))})`;
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
