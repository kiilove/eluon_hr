
import { ProcessedWorkLog, GlobalConfig, LogStatus } from "../../types";
import { TimeUtils } from "../timeUtils";

export class StandardCalibration {
    static calibrate(
        log: ProcessedWorkLog,
        config: GlobalConfig,
        currentWeeklyOvertime: number
    ): ProcessedWorkLog {
        // Deep copy
        const newLog = { ...log };

        const stdStart = TimeUtils.timeToMinutes(config.standardStartTime);
        const stdEnd = TimeUtils.timeToMinutes(config.standardEndTime);
        const lateGrace = config.lateClockInGraceMinutes || 0;
        const cutoff = TimeUtils.timeToMinutes(config.clockOutCutoffTime);
        const startCutoff = TimeUtils.timeToMinutes(config.clockInCutoffTime);

        // --- STEP 1: Apply Snap Logic (Grace Period) ---
        // This is the "1차 계산" - snap times within range to standard times

        // Snap early start (within grace: 08:30 ~ 09:00)
        // If < 08:30, it's overtime -> StartTime remains as-is
        if (newLog.startTime < stdStart && newLog.startTime >= startCutoff) {
            newLog.startTime = stdStart;
        }

        // Snap late start (within grace period)
        if (newLog.startTime > stdStart && newLog.startTime <= stdStart + lateGrace) {
            newLog.startTime = stdStart;
        }

        // Snap early end (17:30-17:59 → 18:00)
        if (newLog.endTime < stdEnd && newLog.endTime >= stdEnd - 30) {
            newLog.endTime = stdEnd;
        }

        // Snap late end (18:01-18:30 → 18:00)
        if (newLog.endTime > stdEnd && newLog.endTime <= cutoff) {
            newLog.endTime = stdEnd;
        }

        // Recalculate durations after snap
        newLog.totalDuration = Math.max(0, newLog.endTime - newLog.startTime);
        newLog.breakDuration = TimeUtils.calculateBreakMinutes(newLog.totalDuration);
        newLog.actualWorkDuration = Math.max(0, newLog.totalDuration - newLog.breakDuration);
        newLog.overtimeDuration = Math.max(0, newLog.actualWorkDuration - 8 * 60);

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

        // 2. Cut-off & Grace Logic (Already applied in processDailyLog, but re-verify/adjust if needed for display?)
        // Assuming processDailyLog handles initial Cut-offs.
        // Calibration focuses on *Backward Calculation* for compliance.



        // --- STEP 2: Check if calibration is needed ---
        // After snap logic, check if this day still has overtime
        // If no overtime → keep as-is (don't recalculate)

        const isNightWork = newLog.startTime < 6 * 60 || newLog.endTime > 22 * 60;
        const hasOvertime = newLog.actualWorkDuration > 480; // More than 8 hours

        if (!isNightWork && !hasOvertime) {
            // No overtime after snap → this day is compliant, keep as-is
            return newLog;
        }

        // --- STEP 3: Calibrate (recalculate times for days with overtime) ---

        // --- IF VIOLATION EXIST -> CALIBRATE ---

        // Check for Missing Times (e.g. from ERROR overrides)
        // If times are 0, default them to standard range
        if (newLog.startTime === 0) newLog.startTime = stdStart;
        if (newLog.endTime === 0) newLog.endTime = stdEnd;

        // --- 2. Strict Standard Day Alignment (Naturalize with Independent Jitter) ---
        // Requirement: "3 min late start -> 10 min late end" (Natural flow)
        // Strategy: 
        // 1. Shift Start forward within [0, Grace]
        // 2. Calculate Required End (Start + 8h + Break)
        // 3. Shift End forward slightly within [RequiredEnd, CutOff]


        const cutInGrace = config.lateClockInGraceMinutes || 0;
        // For calibration, limit end time to stdEnd + 10 minutes (18:00-18:10)
        // Even though actual data can be 17:30-18:30 (cutoff), calibrated data should be more conservative
        const calibrationEndLimit = stdEnd + 10; // 18:10

        // For start time: 08:31 - 09:00 (User Request)
        const calibrationStartMin = stdStart - 29; // 08:31 (09:00 - 29min)
        const calibrationStartMax = stdStart;      // 09:00

        // 1. Generate Random Times for Display (Realistic Look)
        const startRange = calibrationStartMax - calibrationStartMin; // 29 minutes
        const startOffset = Math.floor(Math.random() * (startRange + 1));
        const randomStart = calibrationStartMin + startOffset;

        // 2. Generate Random End Time for Display
        const calibrationEndMin = stdEnd;          // 18:00
        const calibrationEndMax = stdEnd + 29;     // 18:29
        const endRange = calibrationEndMax - calibrationEndMin;
        const endOffset = Math.floor(Math.random() * (endRange + 1));
        const randomEnd = calibrationEndMin + endOffset;

        // 3. FORCE Standard Times for Calculation (Exact 8h Request)
        newLog.startTime = stdStart; // 09:00
        newLog.endTime = stdEnd;     // 18:00

        // 4. Generate raw time strings with seconds for display
        // This ensures UI shows: "08:45:12 (09:00)" -> 8h work exactly.
        const randomStartSeconds = Math.floor(Math.random() * 60);
        const randomEndSeconds = Math.floor(Math.random() * 60);

        const formatTimeWithSeconds = (minutes: number, seconds: number) => {
            const h = Math.floor(minutes / 60);
            const m = minutes % 60;
            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        };

        newLog.rawStartTimeStr = formatTimeWithSeconds(randomStart, randomStartSeconds);
        newLog.rawEndTimeStr = formatTimeWithSeconds(randomEnd, randomEndSeconds);

        // Note
        newLog.note = (newLog.note || "") + `[Auto-Calibrated]`;

        // Finalize Duration Strictness
        newLog.totalDuration = newLog.endTime - newLog.startTime;
        newLog.breakDuration = TimeUtils.calculateBreakMinutes(newLog.totalDuration);
        newLog.actualWorkDuration = newLog.totalDuration - newLog.breakDuration;
        newLog.overtimeDuration = 0; // Strict Weekday force to 8h (or slightly more if break calc differs, but usually 8h)

        newLog.status = 'WARNING'; // Always mark modified

        return newLog;
    }
}
