
import { ProcessedWorkLog, GlobalConfig, LogStatus } from "../../types";
import { TimeUtils } from "../timeUtils";
import { snapTime, calculateActualWork } from "../correctionUtils";

export const SpecialWorkCalculator = {
    /**
     * Calibrate Special Work (Weekend/Holiday) to fit within remaining weekly budget.
     * Uses the same logic structure as WorkHourCalculator but applies constraints.
     */
    calibrate: (
        log: ProcessedWorkLog,
        config: GlobalConfig,
        currentWeeklyOvertime: number
    ): ProcessedWorkLog => {
        // 1. Initial Setup: preserve original data references
        const newLog = { ...log };

        // 2. Budget Calculation
        // Limit: 12h (720m) - Buffer (random 10~30m)
        let seed = 0;
        for (let i = 0; i < log.userId.length; i++) seed += log.userId.charCodeAt(i);
        const randomBuffer = 10 + (seed % 21);
        const maxWeeklyLimit = (config.maxWeeklyOvertimeMinutes || 12 * 60) - randomBuffer;
        const remainingBudget = Math.max(0, maxWeeklyLimit - currentWeeklyOvertime);

        // If no budget left or already 0, return REST
        if (remainingBudget <= 0 || log.actualWorkDuration === 0) {
            newLog.actualWorkDuration = 0;
            newLog.overtimeDuration = 0;
            newLog.totalDuration = 0;
            newLog.breakDuration = 0;
            newLog.startTime = 0;
            newLog.endTime = 0;
            newLog.rawStartTimeStr = "";
            newLog.rawEndTimeStr = "";
            newLog.logStatus = LogStatus.REST;
            newLog.note = (newLog.note || "") + "[예산 초과/근무 없음]";
            return newLog;
        }

        // 3. Define Constraints for Special Work
        // Start: Standard Start (09:00) usually
        const stdStart = TimeUtils.timeToMinutes(config.standardStartTime || "09:00");
        const stdEnd = TimeUtils.timeToMinutes(config.standardEndTime || "18:00");

        // 4. Determine Target Duration
        // We want to keep as much original work as possible, up to remainingBudget
        // But we must respect the physical constraints (StartTime ~ EndTime)

        // Strategy: 
        // - Try to keep original StartTime (snapped)
        // - Adjust EndTime to fit Budget
        // - OR: If original StartTime is too early, snap to Standard Start

        // Step A: Snap Original Times using correctionUtils (Consistency!)
        // We use the raw values from the log (which are already snapped in Step 2, but let's be sure)
        // Actually, log.startTime IS passed from Step 2.

        let targetStart = log.startTime;
        let targetEnd = log.endTime;

        // Force Start >= Standard Start (09:00) for clean Special Work?
        // User requirements often prefer 09:00 start for weekends unless specific.
        if (targetStart < stdStart) {
            targetStart = stdStart;
        }

        // Calculate maximum possible duration from this Start
        // And apply budget constraint

        // Recalculate duration from potentially new Start
        // We need to find an EndTime that results in 'actualWork' <= remainingBudget

        // This is tricky because calculateActualWork subtracts Break Time.
        // We need to reverse-engineer: TargetActual -> TargetTotal -> TargetEnd

        const targetActual = Math.min(log.actualWorkDuration, remainingBudget);

        // Reverse Break Logic:
        // actual = total - break
        // if actual >= 240 (4h), break is 30m? Or 60m?
        // Let's use the SAME config as calculateActualWork
        // config.breakTimeMinutes || 60

        // WARNING: correctionUtils uses ">= 240 (4h) -> 60m break" logic?
        // Let's check calculateActualWork:
        // "if (totalDuration >= 240) breakDuration = 60;"
        // Wait, 4 hours work -> 1 hour break? That means 5 hours total.
        // If I work 09:00 - 13:00 (4h total), break is 60? -> Actual 3h.
        // If I work 09:00 - 14:00 (5h total), break is 60 -> Actual 4h.

        // Let's assume we want 'targetActual'.
        // If targetActual < 4h (240m), break is 0. Total = Actual.
        // If targetActual >= 4h? 
        // We need to add break back. 
        // If we add 60m break, does it push Total >= 240? Yes.

        let targetTotal = targetActual;
        let breakMin = 0;

        // Consistency with correctionUtils:
        // logic: total >= 240 -> break = 60
        // So if (actual + 60) >= 240 -> break = 60.
        // Since 60 >= 0, this simplifies to: if actual >= 180 (3h), we MIGHT trigger it.
        // But strictly: Total = Actual + Break.
        // If Actual >= 4h (240m), then Total MUST be >= 5h (300m) to fit 60m break?
        // No, if Total=240, Break=60 -> Actual=180.
        // We need to invert "total >= 240".
        // Threshold is Total=240. At that point Actual=180.
        // So if we want Actual=180, we need Total=240.
        // If we want Actual=200, we need Total=260.
        // If we want Actual<180, Total<240, Break=0.

        if (targetActual >= 180) { // Based on current strict 60m rule for >4h total
            breakMin = config.breakTimeMinutes || 60;
            targetTotal = targetActual + breakMin;
        } else {
            targetTotal = targetActual;
        }

        // Apply to End Time
        targetEnd = targetStart + targetTotal;

        // Hard Limit check: If End > 22:00 or something? 
        // Or if End > 18:00 (Standard End) + Overtime limit?
        // Special work can go late. 
        // But usually we prefer 09:00 ~ 18:00 range if possible.
        // If targetEnd > 18:00?
        // If user worked 09:00 - 22:00, and we clip to budget...
        // It naturally reduces EndTime.

        // 5. Finalize
        newLog.startTime = targetStart;
        newLog.endTime = targetEnd;
        newLog.actualWorkDuration = targetActual;
        newLog.totalDuration = targetTotal;
        newLog.breakDuration = breakMin;
        newLog.overtimeDuration = targetActual; // All special is overtime

        // Generate strings
        const randomStartSeconds = Math.floor(Math.random() * 60);
        const randomEndSeconds = Math.floor(Math.random() * 60);
        const formatTime = (min: number, sec: number) => {
            const h = Math.floor(min / 60);
            const m = min % 60;
            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
        };

        newLog.rawStartTimeStr = formatTime(targetStart, randomStartSeconds);
        newLog.rawEndTimeStr = formatTime(targetEnd, randomEndSeconds);

        newLog.note = (newLog.note || "") + "[특근 보정]";

        return newLog;
    }
};
