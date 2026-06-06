
/**
 * Special Work Calculation Utilities
 * Centralizes the logic for rounding rules to ensure consistency across the application.
 * 
 * Rules:
 * 1. Recognized Hours: Convert minutes to hours and ROUND to nearest integer.
 * 2. Special Wage: Calculate base * multiplier and ROUND to nearest integer.
 * 3. Total Amount: Hours * Wage.
 */
export const SpecialWorkCalculator = {
    /**
     * Converts raw minutes to "Work/Recognized Hours" (Integer) for Attendance.
     * Rule: Round to nearest whole number (User: "인정시간은 반올림").
     * Example: 162 min / 60 = 2.7 -> 3h
     */
    toRecognizedHours: (minutes: number): number => {
        if (!minutes) return 0;
        // [User Request] Round to nearest 30 mins (0.5h) for accuracy
        return Math.round(minutes / 30) / 2;
    },

    /**
     * Converts raw minutes to "Work Hours" (Integer) for Regular Work.
     * Rule: Round to nearest whole number.
     * Example: 451 min / 60 = 7.51 -> 8h
     */
    toWorkHours: (minutes: number): number => {
        if (!minutes) return 0;
        // [User Request] Support 30-minute increments (0.5h)
        return Math.round(minutes / 30) / 2;
    },

    /**
     * Calculates the Special Hourly Wage.
     * Rule: Floor (Truncate) to nearest whole number (KRW).
     */
    calculateWage: (baseWage: number, multiplier: number): number => {
        if (!baseWage) return 0;
        const raw = baseWage * multiplier;
        return Math.floor(raw);
    },

    /**
     * Calculates the Total Pay Amount.
     */
    calculateTotalPay: (recognizedHours: number, specialWage: number): number => {
        return recognizedHours * specialWage;
    },

    /**
     * Converts minutes to "XH.Y" string with Floor(1 decimal) logic.
     * Example: 5h 3m (303m) -> 5.05 -> 5.0H
     * Example: 4h 55m (295m) -> 4.916 -> 4.9H
     */
    toOneDecimalHours: (minutes: number): string => {
        if (!minutes || minutes <= 0) return "0.0H";
        const hours = Math.floor((minutes / 60) * 10) / 10;
        return hours.toFixed(1) + "H";
    }
};
