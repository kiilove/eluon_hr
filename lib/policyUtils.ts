import { GlobalConfig, WorkPolicy } from "../types";

export const PolicyUtils = {
    /**
     * Converts a database WorkPolicy to the app's GlobalConfig format.
     */
    toGlobalConfig: (policy: WorkPolicy): GlobalConfig => {
        return {
            standardStartTime: policy.standard_start_time,
            standardEndTime: policy.standard_end_time,
            clockInCutoffTime: policy.clock_in_cutoff_time || "",
            clockOutCutoffTime: policy.clock_out_cutoff_time || "",
            lateClockInGraceMinutes: policy.clock_in_grace_minutes,
            breakTimeMinutes: policy.break_time_8h_deduction, // Default mapping for legacy
            breakTime4hDeduction: policy.break_time_4h_deduction,
            breakTime8hDeduction: policy.break_time_8h_deduction,
            maxWeeklyOvertimeMinutes: policy.max_weekly_overtime_minutes
        };
    },

    /**
     * Finds the applicable policy for a given date.
     * Assumes policies are NOT sorted.
     * Returns the policy with the latest effective_date that is <= targetDate.
     * If no policy is found (all future), returns null (caller should use default).
     */
    getPolicyForDate: (targetDate: string, policies: WorkPolicy[]): WorkPolicy | null => {
        if (!policies || policies.length === 0) return null;

        // Sort descending by effective date (Newest first)
        const sorted = [...policies].sort((a, b) =>
            new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime()
        );

        // Find match
        // Example: Target 2024-01-05
        // Policies: [2024-02-01, 2024-01-01, 2023-01-01]
        // 1. 2024-02-01 > 2024-01-05 (Skip)
        // 2. 2024-01-01 <= 2024-01-05 (Match!)

        const target = new Date(targetDate).getTime();
        for (const policy of sorted) {
            const eff = new Date(policy.effective_date).getTime();
            if (eff <= target) {
                return policy;
            }
        }

        // If no policy is <= target (e.g. data is from 2022, earliest policy is 2023), 
        // usually we default to the earliest policy available or a hardcoded default.
        // Let's return the earliest policy if strictly older, or null?
        // Requirement says "Effective Date". If data is OLDER than any policy, 
        // logic suggests using the Oldest Policy.
        return sorted[sorted.length - 1];
    }
};
