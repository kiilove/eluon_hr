import { RawCommuteLog, ProcessedWorkLog, LogStatus, GlobalConfig, WorkPolicy } from '../../types';
import { TimeUtils } from '../timeUtils';
import { WorkHourCalculator } from '../workHourCalculator';

export interface CorrectionResult {
    processedLogs: ProcessedWorkLog[];
    summary: {
        total: number;
        valid: number;
        errors: number;
    };
}

export const CorrectionProcessor = {
    /**
     * 1st Correction: Automated Cleaning & Calculation
     * - Converts Raw Logs to Processed Logs
     * - Calculates Work Durations
     * - Identifies obvious errors (Missing Punches)
     */
    runV1Details: async (rawLogs: RawCommuteLog[], policies?: WorkPolicy[], config?: GlobalConfig): Promise<CorrectionResult> => {
        // 1. Initial Processing (Process Daily Logs)

        // Define default config as fallback
        const defaultConfig: GlobalConfig = config || {
            standardStartTime: '09:00',
            standardEndTime: '18:00',
            clockInCutoffTime: '08:30',
            clockOutCutoffTime: '18:30',
            lateClockInGraceMinutes: 10,
            breakTimeMinutes: 60,
            maxWeeklyOvertimeMinutes: 720
        };

        let processedLogs = rawLogs.map(raw => {
            // Determine Config for this specific date
            let activeConfig = defaultConfig;

            if (policies && policies.length > 0) {
                // Find effective policy for this date
                // Policies should be sorted by date desc in finding logic or pre-sorted
                // Rule: closest effective_date that is <= raw.date
                const targetDate = raw.date;
                const match = policies
                    .filter(p => p.effective_date <= targetDate)
                    .sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0];

                if (match) {
                    // Convert Policy (snake_case) to Config (camelCase)
                    activeConfig = {
                        standardStartTime: match.standard_start_time,
                        standardEndTime: match.standard_end_time,
                        clockInCutoffTime: match.clock_in_cutoff_time || '08:30',
                        clockOutCutoffTime: match.clock_out_cutoff_time || '18:30',
                        lateClockInGraceMinutes: match.clock_in_grace_minutes,
                        breakTimeMinutes: match.break_time_8h_deduction, // Default to 8h deduction for legacy prop
                        breakTime4hDeduction: match.break_time_4h_deduction,
                        breakTime8hDeduction: match.break_time_8h_deduction,
                        maxWeeklyOvertimeMinutes: match.max_weekly_overtime_minutes,
                    };
                }
            }

            return WorkHourCalculator.processDailyLog(raw, activeConfig);
        });

        // 2. Fill Missing Days (Vacation/Weekend Filler)
        // Note: For filled days, we might also need policy, but typically they are empty. 
        // If we need to calc rest days using policy, we'd need to thread policy through fillMissingDays too.
        // For now, assume fillMissingDays creates empty logs or standard week logs.
        processedLogs = WorkHourCalculator.fillMissingDays(processedLogs);

        // 3. Detect Anomalies
        processedLogs = WorkHourCalculator.detectAnomalies(processedLogs);

        // 4. Calibrate Logs (Apply Safety Margins & Special Work Snapping)
        // [Fix] Pass policies to calibrateLogs to ensure consistency
        processedLogs = WorkHourCalculator.calibrateLogs(processedLogs, defaultConfig, policies);

        const summary = {
            total: processedLogs.length,
            valid: processedLogs.filter(l => l.status === 'NORMAL').length,
            errors: processedLogs.filter(l => l.status === 'ERROR' || l.status === 'MISSING').length,
        };

        return { processedLogs, summary };
    }
};
