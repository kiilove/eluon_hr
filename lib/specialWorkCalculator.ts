
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
     * Converts raw minutes to "Recognized Hours" (Integer).
     * Rule: Round to nearest whole number.
     * Example: 303 min / 60 = 5.05 -> 5h
     */
    toRecognizedHours: (minutes: number): number => {
        if (!minutes) return 0;
        return Math.round(minutes / 60);
    },

    /**
     * Calculates the Special Hourly Wage.
     * Rule: Round to nearest whole number (KRW).
     */
    calculateWage: (baseWage: number, multiplier: number): number => {
        if (!baseWage) return 0;
        const raw = baseWage * multiplier;
        return Math.round(raw);
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
