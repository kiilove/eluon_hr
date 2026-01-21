import { ProcessedWorkLog, GlobalConfig, LogStatus } from "../../types";
import { TimeUtils } from "../timeUtils";

export class SpecialCalibration {
    static calibrate(
        log: ProcessedWorkLog,
        config: GlobalConfig,
        currentWeeklyOvertime: number
    ): ProcessedWorkLog {
        const newLog = { ...log };

        // 1. Noise Filter (< 30m)
        if (newLog.actualWorkDuration < 30) {
            newLog.logStatus = LogStatus.REST;
            newLog.startTime = 0;
            newLog.endTime = 0;
            newLog.actualWorkDuration = 0;
            newLog.overtimeDuration = 0;
            newLog.totalDuration = 0;
            newLog.breakDuration = 0;
            newLog.note = (newLog.note || "") + "[노이즈 제거 (<30분)]";
            newLog.status = 'WARNING';
            return newLog;
        }

        // 2. May 1st (Labor Day) check
        if (log.date.endsWith("-05-01")) {
            newLog.logStatus = LogStatus.REST;
            newLog.startTime = 0;
            newLog.endTime = 0;
            newLog.actualWorkDuration = 0;
            newLog.overtimeDuration = 0;
            newLog.totalDuration = 0;
            newLog.breakDuration = 0;
            newLog.note = "근로자의 날 (휴무 처리)";
            newLog.status = 'WARNING';
            return newLog;
        }

        // 3. Weekly Overtime Budget Check with Buffer
        // User Request: Limit between 11h 30m (690m) and 11h 50m (710m)
        // Buffer = 12h(720m) - Limit. So Buffer should be 10m ~ 30m.

        // Use a semi-deterministic seed (User ID length + char code) to keep it stable-ish or just random
        // Let's use simple random for "Natural" variation as requested.
        // Actually, to avoid jitter, let's seed it with userId.
        let seed = 0;
        for (let i = 0; i < log.userId.length; i++) seed += log.userId.charCodeAt(i);

        // Modulo 21 gives 0~20. Add 10 gives 10~30.
        const randomBuffer = 10 + (seed % 21);

        const maxWeeklyLimit = (config.maxWeeklyOvertimeMinutes || 12 * 60) - randomBuffer;

        const remainingBudget = Math.max(0, maxWeeklyLimit - currentWeeklyOvertime);

        // Define Constraints
        const safeEndThreshold = 18 * 60 + 30; // 18:30 (1110 min)
        const fixedSafeEndTime = 18 * 60;      // 18:00 (1080 min)

        // 4. Fix End Time Strategy
        // Rule: If EndTime > 18:30, snap to 18:00. Else keep it.
        let targetEndTime = newLog.endTime;
        if (newLog.endTime > safeEndThreshold) {
            targetEndTime = fixedSafeEndTime;
        }

        // [Fix] Snap Start Time Strategy for Special Work
        // User Request: Calculate based on "Snapped" values (e.g., 08:41 -> 09:00)
        const stdStart = TimeUtils.timeToMinutes(config.standardStartTime || "09:00");
        let targetStartTime = newLog.startTime;

        if (targetStartTime < stdStart) {
            targetStartTime = stdStart;
        }

        // Recalculate Original Actual based on Snapped Start/End
        const rawDuration = Math.max(0, targetEndTime - targetStartTime);
        let rawBreak = 0;
        if (rawDuration >= 480) rawBreak = 60;
        else if (rawDuration >= 240) rawBreak = 30;

        const originalActual = Math.max(0, rawDuration - rawBreak);

        // 5. Determine Target Actual Work Duration
        // Rule: Maximize work but don't exceed Original Actual AND don't exceed Remaining Budget
        const targetActual = Math.min(originalActual, remainingBudget);

        // 6. Calculate Required Total Duration (Work + Break) & Start Time
        let breakMin = 0;
        // Break logic: >= 7.5h work (450m) needs 60m break (Total 510m+)
        // >= 4h work (240m) needs 30m break
        if (targetActual >= 450) breakMin = 60;
        else if (targetActual >= 240) breakMin = 30;

        const targetTotal = targetActual + breakMin;
        const finalTargetStart = targetEndTime - targetTotal;

        // 7. Apply Calculation Values
        newLog.endTime = targetEndTime;
        newLog.startTime = finalTargetStart;
        newLog.totalDuration = targetTotal;
        newLog.breakDuration = breakMin;
        newLog.actualWorkDuration = targetActual;
        newLog.overtimeDuration = targetActual; // All special work is overtime

        // 8. Generate Display Strings (Random Seconds)
        const randomStartSeconds = Math.floor(Math.random() * 60);
        const randomEndSeconds = Math.floor(Math.random() * 60);

        // Helper to format as HH:mm:ss (No Milliseconds)
        const formatTimeWithSeconds = (minutes: number, seconds: number) => {
            const h = Math.floor(minutes / 60);
            const m = minutes % 60;
            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        };

        newLog.rawStartTimeStr = formatTimeWithSeconds(finalTargetStart, randomStartSeconds);
        newLog.rawEndTimeStr = formatTimeWithSeconds(targetEndTime, randomEndSeconds);

        newLog.status = 'NORMAL';
        newLog.note = (newLog.note || "") + "[특근 보정]";

        return newLog;
    }
}
