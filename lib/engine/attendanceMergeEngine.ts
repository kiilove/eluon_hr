import { ProcessedWorkLog, LogStatus } from "../../types";

export enum MergeViewMode {
    MERGED = 'MERGED',
    MANUAL = 'MANUAL',
    SPECIAL = 'SPECIAL'
}

export const AttendanceMergeEngine = {
    /**
     * Merges Manual (Base) Logs and Special (Overtime/Holiday) Logs based on the View Mode.
     * Logic matches `AttendanceCalendarPage.tsx` identically.
     */
    mergeLogs: (
        manualLogs: ProcessedWorkLog[],
        specialLogs: ProcessedWorkLog[],
        viewMode: MergeViewMode | string = MergeViewMode.MERGED
    ): ProcessedWorkLog[] => {

        // 1. View Mode: SPECIAL ONLY
        if (viewMode === MergeViewMode.SPECIAL) {
            return [...specialLogs].sort((a, b) =>
                a.date.localeCompare(b.date) || a.employeeId.localeCompare(b.employeeId)
            );
        }

        // 2. View Mode: MANUAL (Regular) ONLY
        if (viewMode === MergeViewMode.MANUAL) {
            return [...manualLogs].sort((a, b) =>
                a.date.localeCompare(b.date) || a.employeeId.localeCompare(b.employeeId)
            );
        }

        // 3. View Mode: MERGED (Default)
        const mergedMap = new Map<string, ProcessedWorkLog>();

        // 3.1 Start with Manual Logs (Base Layer)
        manualLogs.forEach(log => {
            const key = `${log.employeeId}-${log.date}`;
            mergedMap.set(key, log);
        });

        // 3.2 Overlay Special Logs (Priority Layer)
        specialLogs.forEach(log => {
            const key = `${log.employeeId}-${log.date}`;
            const hasWork = (log.actualWorkDuration > 0) || (log.overtimeDuration > 0);

            // Optimization: If Special Log is just "REST" (Empty) and we don't need to overwrite meaningful Manual data?
            // The Logic in CalendarPage says:
            // if (!hasWork && log.logStatus === 'REST') return;
            // This prevents blank 'REST' special logs from detecting emptiness and overwriting a 'VACATION' or 'NORMAL' Manual Log.
            if (!hasWork && log.logStatus === LogStatus.REST) {
                return;
            }

            const existingLog = mergedMap.get(key);

            if (existingLog) {
                // If Manual log exists, we only overwrite if Special has meaningful work (or is forced special status).
                // "if (hasWork)"
                if (hasWork) {
                    const specialLog: ProcessedWorkLog = {
                        ...log,
                        logStatus: LogStatus.SPECIAL // Force tag as SPECIAL
                    };
                    mergedMap.set(key, specialLog);
                }
            } else {
                // If no Manual log, we add the Special Log
                // (e.g. Weekend Work where Manual Log might be missing or empty)
                const specialLog: ProcessedWorkLog = {
                    ...log,
                    logStatus: LogStatus.SPECIAL
                };
                mergedMap.set(key, specialLog);
            }
        });

        // 4. Transform Map to List & Sort
        return Array.from(mergedMap.values()).sort((a, b) =>
            a.date.localeCompare(b.date) || a.employeeId.localeCompare(b.employeeId)
        );
    }
};
