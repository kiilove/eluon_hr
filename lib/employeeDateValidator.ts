/**
 * Centralized Employee Date Validation Utility
 * 
 * Consolidates all join_date and resignation_date validation logic
 * to ensure consistency across the application.
 */

export interface DateValidationResult {
    isValid: boolean;
    reason?: 'PRE_JOIN' | 'RESIGNED' | 'MONTH_EXCLUDED';
    suggestedStatus?: string | null; // e.g. LogStatus.RESIGNED
}

export class EmployeeDateValidator {
    /**
     * Check if a log date is valid for an employee
     * @param logDate - Date string (YYYY-MM-DD)
     * @param employee - Employee object with join_date, resignation_date, status_history
     * @returns Validation result
     */
    static isValidLogDate(logDate: string, employee: any): DateValidationResult {
        const logDateObj = new Date(logDate);
        const logMonthStr = logDate.substring(0, 7);

        // 1. Join Date Check - COMPLETELY EXCLUDE BEFORE JOIN
        if (employee.join_date) {
            const joinDateObj = new Date(employee.join_date);
            const joinMonthStr = employee.join_date.substring(0, 7);

            // Month-level filter (optimization)
            if (logMonthStr < joinMonthStr) {
                return { isValid: false, reason: 'MONTH_EXCLUDED' };
            }

            // Day-level filter
            if (logDateObj < joinDateObj) {
                return { isValid: false, reason: 'PRE_JOIN' };
            }
        }

        // 2. Resignation Date Check (with fallback to status_history)
        let resignDateStr = employee.resignation_date;
        if (!resignDateStr && employee.status_history && Array.isArray(employee.status_history)) {
            const resignEntry = employee.status_history.find((h: any) => h.status === 'RESIGNED');
            if (resignEntry) resignDateStr = resignEntry.effective_date;
        }

        if (resignDateStr) {
            const resignDateObj = new Date(resignDateStr);
            const resignMonthStr = resignDateStr.substring(0, 7);

            // Month-level filter
            if (logMonthStr > resignMonthStr) {
                return { isValid: false, reason: 'MONTH_EXCLUDED' };
            }

            // Day-level filter
            if (logDateObj > resignDateObj) {
                // User wants to keep resigned logs in the same month but mark them as RESIGNED (Day AFTER resignation)
                return {
                    isValid: true,
                    reason: 'RESIGNED',
                    suggestedStatus: 'RESIGNED'
                };
            }
        }

        return { isValid: true };
    }

    /**
     * Check if employee was active during entire date range
     * @param startDate - Range start (YYYY-MM-DD)
     * @param endDate - Range end (YYYY-MM-DD)
     * @param employee - Employee object
     * @returns True if employee has at least one valid day in range
     */
    static isActiveInRange(startDate: string, endDate: string, employee: any): boolean {
        const empJoinDate = employee.join_date ? employee.join_date.substring(0, 10) : null;
        const empResignDate = this.getResignationDate(employee)?.substring(0, 10) || null;

        // Quick check: joined after range or resigned before range
        if (empJoinDate && empJoinDate > endDate) {
            console.log(`[isActiveInRange] ${employee.name} EXCLUDED: join_date ${empJoinDate} > range end ${endDate}`);
            return false;
        }

        if (empResignDate && empResignDate < startDate) {
            console.log(`[isActiveInRange] ${employee.name} EXCLUDED: resignation_date ${empResignDate} < range start ${startDate}`);
            return false;
        }

        return true;
    }

    /**
     * Get resignation date string with fallback to status_history
     * @param employee - Employee object
     * @returns Resignation date string or null
     */
    static getResignationDate(employee: any): string | null {
        let resignDateStr = employee.resignation_date;
        if (!resignDateStr && employee.status_history && Array.isArray(employee.status_history)) {
            const resignEntry = employee.status_history.find((h: any) => h.status === 'RESIGNED');
            if (resignEntry) resignDateStr = resignEntry.effective_date;
        }
        return resignDateStr || null;
    }
}
