import { HolidayUtils } from '../../lib/holidayUtils';
import { snapTime, generateSafeTimeString } from '../../lib/correctionUtils';
import { GlobalConfig } from '../../types';

interface AttendanceLog {
    date: string;
    startTime: string; // HH:mm
    endTime: string;   // HH:mm
    breakMinutes: number;
    description: string;
}

interface GenerationOptions {
    targetMonth: string; // YYYY-MM
    totalHours: number;
    employeeName: string;
    maxWeeklyOvertime?: number; // Default 12 * 60
    breakTime4h?: number; // Default 30
    breakTime8h?: number; // Default 60
}

export type PersonaType = 'FOCUSED' | 'STEADY' | 'SUNDAY_LOVER' | 'PROCRASTINATOR';
export type TimePreference = 'AM' | 'PM' | 'ANY';

export interface GenerationResult {
    logs: AttendanceLog[];
    persona: PersonaType;
    timePreference: TimePreference;
    personaName: string; // Korean name for display
    totalAllocated: number; // Added for validation
}

// Special Work Attendance Generator - Auto-generates realistic attendance logs
// Last updated: 2026-01-09 - Natural variation with 90% overtime bias
export class SpecialWorkAttendanceGenerator {

    /**
     * Generate attendance logs to match the total hours, distributed across weekends/holidays.
     * Includes Retry Logic to ensure total hours match exact target.
     */
    static generate(options: GenerationOptions, config?: GlobalConfig): GenerationResult {
        let bestResult: GenerationResult | null = null;
        let minError = Number.MAX_VALUE;
        const MAX_RETRIES = 10; // Increased retries for better convergence

        // Persona is constant for an employee to ensure consistency across retries
        const { type, timePref } = this.assignPersona(options.employeeName);

        for (let i = 0; i < MAX_RETRIES; i++) {
            const result = this._generateInternal(options, type, timePref);

            const targetMin = options.totalHours * 60;
            // Validate based on what we INTENDED to allocate (Plan)
            const error = Math.abs(result.totalAllocated - targetMin);

            if (error <= 1) { // Accept 1 min floating point error
                return result;
            }

            if (error < minError) {
                minError = error;
                bestResult = result;
            }
        }
        return bestResult!;
    }

    private static _generateInternal(options: GenerationOptions, persona: PersonaType, timePref: TimePreference): GenerationResult {
        const { targetMonth, maxWeeklyOvertime = 12 * 60 } = options;
        const totalMinutesTarget = options.totalHours * 60;

        // 1. Candidate Selection
        const allCandidates = this.findCandidateDays(targetMonth);

        // [CRITICAL CHANGE] Separate Weekends from Holidays for Global Priority
        const weekendCandidates = allCandidates.filter(c => c.type === 'SAT' || c.type === 'SUN');
        const holidayCandidates = allCandidates.filter(c => c.type === 'HOL');

        const logs: AttendanceLog[] = [];
        let remainingMinutes = totalMinutesTarget;

        // Process Weekends FIRST (Global Priority)
        remainingMinutes = this.processCandidates(weekendCandidates, remainingMinutes, persona, timePref, options, logs, maxWeeklyOvertime);

        // Process Holidays ONLY if weekends are exhausted
        if (remainingMinutes > 0) {
            remainingMinutes = this.processCandidates(holidayCandidates, remainingMinutes, persona, timePref, options, logs, maxWeeklyOvertime);
        }

        // [DISABLED] Post-Generation Validation - removes natural variation
        // Natural variation (-5 to +10 min) is more important than perfect total
        // const validatedLogs = this.validateAndCorrect(logs, totalMinutesTarget, options);

        return {
            logs: logs, // Use raw logs with natural variation
            persona: persona,
            timePreference: timePref,
            personaName: this.getPersonaName(persona, timePref),
            totalAllocated: totalMinutesTarget - remainingMinutes
        };
    }

    /**
     * Validates generated logs and makes final corrections to ensure:
     * 1. Total hours match target exactly
     * 2. No shift exceeds 5 hours
     * 3. Natural variation is preserved (no rounding of individual shifts)
     */
    private static validateAndCorrect(logs: AttendanceLog[], targetMinutes: number, options: GenerationOptions): AttendanceLog[] {
        const SLOT_CAP = 300; // 5 hours

        // Helper: Calculate duration from a log
        const getDuration = (log: AttendanceLog) => {
            const [sh, sm] = log.startTime.split(':').map(Number);
            const [eh, em] = log.endTime.split(':').map(Number);
            return (eh * 60 + em) - (sh * 60 + sm) - log.breakMinutes;
        };

        // Calculate total and adjust if needed (NO individual rounding)
        let actualTotal = logs.reduce((sum, log) => sum + getDuration(log), 0);
        let diff = targetMinutes - actualTotal;

        // Adjust in small increments to match target while preserving natural variation
        while (Math.abs(diff) >= 1) {
            // Use smaller increments for fine-tuning (1 minute at a time)
            const increment = diff > 0 ? 1 : -1;

            // Sort logs by duration
            const sortedLogs = [...logs].sort((a, b) => {
                const durA = getDuration(a);
                const durB = getDuration(b);
                return increment > 0 ? durA - durB : durB - durA;
            });

            let adjusted = false;
            for (const log of sortedLogs) {
                const currentDuration = getDuration(log);

                // Check constraints
                if (increment > 0 && currentDuration < SLOT_CAP) {
                    // Can add 1 minute
                    const [sh, sm] = log.startTime.split(':').map(Number);
                    const newEnd = sh * 60 + sm + currentDuration + log.breakMinutes + increment;
                    log.endTime = this.minutesToTimeStr(newEnd);
                    diff -= increment;
                    adjusted = true;
                    break;
                } else if (increment < 0 && currentDuration > 60) {
                    // Can subtract 1 minute
                    const [sh, sm] = log.startTime.split(':').map(Number);
                    const newEnd = sh * 60 + sm + currentDuration + log.breakMinutes + increment;
                    log.endTime = this.minutesToTimeStr(newEnd);
                    diff -= increment;
                    adjusted = true;
                    break;
                }
            }

            if (!adjusted) break; // Can't adjust further
        }

        return logs;
    }

    private static processCandidates(
        candidates: any[],
        remainingMinutes: number,
        persona: PersonaType,
        timePref: TimePreference,
        options: GenerationOptions,
        logs: AttendanceLog[],
        maxWeeklyOvertime: number
    ): number {
        // Group by Week
        const weekMap = new Map<string, typeof candidates>();
        candidates.forEach(c => {
            const k = this.getWeekKey(c.date);
            if (!weekMap.has(k)) weekMap.set(k, []);
            weekMap.get(k)!.push(c);
        });

        // 2. Week Ordering based on Persona
        let weeks = Array.from(weekMap.keys()).sort(); // Default Ascending

        if (persona === 'PROCRASTINATOR') {
            weeks = weeks.reverse(); // End of month first
        } else if (persona === 'FOCUSED') {
            // Random Shuffle for Focused (bursts in random weeks)
            weeks = weeks.sort(() => Math.random() - 0.5);
        }

        for (const weekKey of weeks) {
            if (remainingMinutes <= 0) break;

            let daysInWeek = weekMap.get(weekKey) || [];
            if (daysInWeek.length === 0) continue;

            // 3. Day Priority Sorting (Within same type, Sat > Sun)
            daysInWeek.sort((a, b) => {
                const typeRank = (type: string) => {
                    if (persona === 'SUNDAY_LOVER') {
                        if (type === 'SUN') return 3; // Highest
                        if (type === 'SAT') return 2;
                        return 1; // HOL
                    } else {
                        if (type === 'SAT') return 3; // Highest
                        if (type === 'SUN') return 2;
                        return 1; // HOL
                    }
                };
                return typeRank(b.type) - typeRank(a.type);
            });

            // Limit by Weekly Overtime Cap
            const amountForWeek = Math.min(remainingMinutes, maxWeeklyOvertime);

            const distributed = this.distributeToDays(amountForWeek, daysInWeek.length, persona);

            for (let i = 0; i < daysInWeek.length; i++) {
                if (i >= distributed.length || distributed[i] <= 0) continue;

                const duration = distributed[i];
                remainingMinutes -= duration;

                const log = this.createLog(daysInWeek[i], duration, timePref, options);
                logs.push(log);
            }
        }

        return remainingMinutes;
    }

    private static distributeToDays(total: number, slots: number, persona: PersonaType): number[] {
        const result = new Array(slots).fill(0);
        const SLOT_CAP = 300; // 5 hours max per day (User Request)

        // [CRITICAL] Distribute in HOUR increments first, then natural variation is added in createLog
        // Convert to hours for distribution
        const totalHours = Math.round(total / 60);

        // [Logic] If total is very small (e.g. <= 4h), put it all in one day regardless of persona
        if (totalHours <= 4) {
            result[0] = Math.min(totalHours * 60, SLOT_CAP);
            return result;
        }

        if (persona === 'STEADY') {
            // Uniform distribution in HOURS
            const hoursPerSlot = Math.floor(totalHours / slots);
            const remainderHours = totalHours % slots;

            for (let i = 0; i < slots; i++) {
                const allocatedHours = hoursPerSlot + (i < remainderHours ? 1 : 0);
                result[i] = Math.min(allocatedHours * 60, SLOT_CAP); // Convert back to minutes
            }

            return result;
        }

        // FOCUSED, PROCRASTINATOR, SUNDAY_LOVER -> Greedy Fill in HOURS
        let remainingHours = totalHours;
        for (let i = 0; i < slots; i++) {
            const maxHours = SLOT_CAP / 60; // 5 hours
            const take = Math.min(remainingHours, maxHours);
            result[i] = take * 60; // Convert to minutes
            remainingHours -= take;
        }

        return result;
    }

    private static createLog(day: any, allocatedDuration: number, timePref: TimePreference, options: GenerationOptions): AttendanceLog {
        // [Correction] Do NOT add positive noise that increases total duration.
        // The allocatedDuration is the target "Actual Work".

        let breakMin = 0;
        const break4h = options.breakTime4h ?? 30;
        const break8h = options.breakTime8h ?? 60;

        // Determine Break Time based on Duration
        if (allocatedDuration >= 480) breakMin = break8h;
        else if (allocatedDuration >= 240) breakMin = break4h; // 4h+ = break

        const totalDuration = allocatedDuration + breakMin;

        // Start Time Base
        let baseH = 9, baseM = 0;
        if (timePref === 'PM') { baseH = 13; baseM = 0; } // 13:00
        else if (timePref === 'AM') { baseH = 9; baseM = 0; } // 09:00

        // If 'ANY', randomize AM/PM weighted
        if (timePref === 'ANY') {
            if (Math.random() > 0.5) { baseH = 13; }
        }

        // Randomize Start Time (+/- 15 mins)
        // e.g. 08:45 ~ 09:15
        const offset = Math.floor(Math.random() * 31) - 15;
        const startMin = baseH * 60 + baseM + offset;

        // [NEW] Add natural variation to end time (User Request: 90% overtime, 10% undertime)
        // 90% chance: +1 to +10 minutes (working more)
        // 10% chance: -1 to -5 minutes (working less)
        let endVariation: number;
        if (Math.random() < 0.9) {
            // 90%: Add 1-10 minutes
            endVariation = Math.floor(Math.random() * 10) + 1; // 1 to 10
        } else {
            // 10%: Subtract 1-5 minutes
            endVariation = -(Math.floor(Math.random() * 5) + 1); // -1 to -5
        }
        const endMin = startMin + totalDuration + endVariation;

        return {
            date: day.date,
            startTime: this.minutesToTimeStr(startMin),
            endTime: this.minutesToTimeStr(endMin),
            breakMinutes: breakMin,
            description: day.holidayName || (day.type === 'SAT' ? '토요근무' : '휴일근무')
        };
    }

    private static assignPersona(name: string): { type: PersonaType, timePref: TimePreference } {
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);

        const types: PersonaType[] = ['FOCUSED', 'STEADY', 'SUNDAY_LOVER', 'PROCRASTINATOR'];

        // Time Pref: mostly AM for standard checks, but let's mix in PM
        const prefs: TimePreference[] = ['AM', 'AM', 'PM', 'ANY'];

        // Use different bits of hash for different traits to decorrelate
        const typeIndex = Math.abs(hash) % types.length;
        const prefIndex = Math.abs(hash >> 3) % prefs.length;

        return { type: types[typeIndex], timePref: prefs[prefIndex] };
    }

    private static getPersonaName(type: PersonaType, timePref: TimePreference): string {
        let base = '';
        switch (type) {
            case 'FOCUSED': base = '몰아치기형'; break;
            case 'STEADY': base = '꾸준형'; break;
            case 'SUNDAY_LOVER': base = '일요선호형'; break;
            case 'PROCRASTINATOR': base = '벼락치기형'; break;
            default: base = '기본형';
        }

        if (timePref === 'AM') base += ' (오전)';
        else if (timePref === 'PM') base += ' (오후)';

        return base;
    }

    private static getUniqueWeeks(candidates: Array<{ date: string }>): string[] {
        const weeks = new Set<string>();
        candidates.forEach(c => weeks.add(this.getWeekKey(c.date)));
        return Array.from(weeks);
    }

    private static findCandidateDays(monthStr: string): Array<{ date: string, type: 'SAT' | 'SUN' | 'HOL', holidayName?: string }> {
        const [y, m] = monthStr.split('-').map(Number);
        const start = new Date(y, m - 1, 1);
        const end = new Date(y, m, 0); // last day

        const results = [];

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const holidayName = HolidayUtils.getHolidayName(d);
            const day = d.getDay();

            if (holidayName) {
                results.push({ date: dateStr, type: 'HOL', holidayName });
            } else if (day === 6) {
                results.push({ date: dateStr, type: 'SAT' });
            } else if (day === 0) {
                results.push({ date: dateStr, type: 'SUN' });
            }
        }
        return results as any[];
    }

    private static getWeekKey(dateStr: string): string {
        const d = new Date(dateStr);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
        const monday = new Date(d.setDate(diff));
        return `${monday.getFullYear()}-${monday.getMonth()}-${monday.getDate()}`;
    }

    private static hhmmToMinutes(hhmm: string): number {
        const [h, m] = hhmm.split(':').map(Number);
        return h * 60 + m;
    }

    private static minutesToTimeStr(min: number): string {
        return generateSafeTimeString(min, min, Math.random().toString());
    }
}
