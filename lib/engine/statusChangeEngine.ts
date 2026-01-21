
import { LogStatus, ProcessedWorkLog, GlobalConfig } from "../../types";
import { TimeUtils } from "../timeUtils";
import { generateSafeTimeString, calculateActualWork } from "../correctionUtils";

/**
 * Calculates the updates needed for a log entry based on a changed LogStatus.
 * 
 * Logic:
 * - Vacation/Sick/Rest/Other: Reset times to 0.
 * - Trip/Education: Set to Standard 09:00 - 18:00 (8h Work).
 * - Special: If 0, set to Standard. Else keep as is but clear error.
 * - Normal: Regenerate natural random times (09:00ish ~ 18:00ish) to ensure valid data.
 */
export const calculateStatusChangeUpdates = (
    log: ProcessedWorkLog,
    newStatus: LogStatus,
    config: GlobalConfig
): Partial<ProcessedWorkLog> => {
    let updates: Partial<ProcessedWorkLog> = { logStatus: newStatus };

    const setZero = () => ({
        startTime: 0,
        endTime: 0,
        rawStartTimeStr: '',
        rawEndTimeStr: '',
        originalStartTimeStr: '', // Clear original to force display update
        originalEndTimeStr: '',   // Clear original to force display update
        totalDuration: 0,
        breakDuration: 0,
        actualWorkDuration: 0,
        overtimeDuration: 0,
        status: 'NORMAL' as const // Clear Error
    });

    const setStandard9to6 = () => {
        const startStr = config.standardStartTime || "09:00";
        const endStr = config.standardEndTime || "18:00";
        const startMin = TimeUtils.timeToMinutes(startStr);
        const endMin = TimeUtils.timeToMinutes(endStr);

        // [Format Consistency] Use generateSafeTimeString to add random seconds (HH:mm:ss)
        const rawStartTimeStr = generateSafeTimeString(startMin, startMin, log.id + "std-start");
        const rawEndTimeStr = generateSafeTimeString(endMin, endMin, log.id + "std-end");

        // [Fix] Use calculateActualWork to ensure Break Time policy is respected (Granular/Legacy)
        const { actualWork, totalDuration, breakDuration } = calculateActualWork(startMin, endMin, config);

        return {
            startTime: startMin,
            endTime: endMin,
            rawStartTimeStr,
            rawEndTimeStr,
            originalStartTimeStr: '', // Clear original
            originalEndTimeStr: '',   // Clear original
            totalDuration,
            breakDuration,
            actualWorkDuration: actualWork,
            overtimeDuration: Math.max(0, actualWork - (8 * 60)), // Recalculate OT if standard > 8h
            status: 'NORMAL' as const
        };
    };

    const setNaturalNormal = () => {
        // [Policy Aware] Generate realistic random times based on Config
        const standardStart = TimeUtils.timeToMinutes(config.standardStartTime || "09:00");
        const standardEnd = TimeUtils.timeToMinutes(config.standardEndTime || "18:00");

        // Start: -30 mins ~ +10 mins from Standard Start (e.g. 08:30 ~ 09:10 for 09:00)
        const rawStartTimeStr = generateSafeTimeString(standardStart - 30, standardStart + 10, log.id + "start");

        // End: +0 mins ~ +10 mins from Standard End (e.g. 18:00 ~ 18:10 for 18:00)
        // Ensure strictly >= Standard End to avoid under-work checks triggering
        const rawEndTimeStr = generateSafeTimeString(standardEnd, standardEnd + 15, log.id + "end");

        const startMinutes = TimeUtils.timeToMinutes(rawStartTimeStr);
        const endMinutes = TimeUtils.timeToMinutes(rawEndTimeStr);

        const { actualWork, totalDuration, breakDuration } = calculateActualWork(startMinutes, endMinutes, config);
        const overtimeDuration = Math.max(0, actualWork - (8 * 60)); // Assumes 8h standard, or derived?

        return {
            startTime: startMinutes,
            endTime: endMinutes,
            totalDuration,
            breakDuration,
            actualWorkDuration: actualWork,
            overtimeDuration,
            rawStartTimeStr,
            rawEndTimeStr,
            originalStartTimeStr: '', // Clear original
            originalEndTimeStr: '',   // Clear original
            status: 'NORMAL' as const,
            note: (log.note || "").replace(/\[.*?\]/g, "") + "[수기 정상처리]"
        };
    };

    if (newStatus === LogStatus.VACATION || newStatus === LogStatus.SICK || newStatus === LogStatus.REST || newStatus === LogStatus.OTHER) {
        return { ...updates, ...setZero() };
    }

    if (newStatus === LogStatus.TRIP || newStatus === LogStatus.EDUCATION) {
        return { ...updates, ...setStandard9to6() };
    }

    if (newStatus === LogStatus.SPECIAL) {
        // If currently empty (0), set to standard 9-6 as a baseline for Special Work
        if (log.startTime === 0 && log.endTime === 0) {
            return { ...updates, ...setStandard9to6() };
        } else {
            return { ...updates, status: 'NORMAL' as const };
        }
    }

    if (newStatus === LogStatus.NORMAL) {
        // ALWAYS regenerate natural normal times when manually switching to NORMAL
        return { ...updates, ...setNaturalNormal() };
    }

    // Default fallback
    return { ...updates, status: 'NORMAL' as const };
};
