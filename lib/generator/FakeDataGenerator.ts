
import { ProcessedWorkLog, LogStatus } from "../../types";
import { TimeUtils } from "../timeUtils";
import { WorkHourCalculator } from "../workHourCalculator";
import { calculateActualWork, generateSafeTimeString } from "../correctionUtils"; // Ensure this is imported

interface Employee {
    id: string;
    name: string;
    employee_code?: string;
    department?: string;
    position?: string;
    is_TF?: boolean;
}

export class FakeDataGenerator {
    /**
     * Generate fake logs using Regular Employees marked as TF (is_TF=1).
     */
    static async generateAsync(companyId: string, dateRange: string[]): Promise<ProcessedWorkLog[]> {
        const logs: ProcessedWorkLog[] = [];

        try {
            // 1. Fetch All Employees (or filtered endpoint if available)
            const res = await fetch('/api/employees');
            if (!res.ok) throw new Error("Failed to fetch employees");
            const allEmployees: Employee[] = await res.json();

            // 2. Filter TF Employees
            const tfEmployees = allEmployees.filter(e => e.is_TF);

            if (tfEmployees.length === 0) {
                console.warn("No TF employees found.");
                return [];
            }

            // 3. Generate Logs
            tfEmployees.forEach(emp => {
                // Determine work hours (could be random or fixed)
                const targetStart = 540; // 09:00
                const targetEnd = 1080; // 18:00

                dateRange.forEach(date => {
                    const dateObj = new Date(date);
                    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

                    if (isWeekend) return; // No work on weekends

                    // Random noise (-10 to +10 mins for Start, 0 to +20 mins for End)
                    const startRaw = generateSafeTimeString(targetStart - 10, targetStart + 10, emp.id + date + "start");
                    const endRaw = generateSafeTimeString(targetEnd, targetEnd + 20, emp.id + date + "end");

                    const fakeLog: any = {
                        id: `fake-${emp.id}-${date}`,
                        userId: emp.employee_code || emp.id,
                        userName: emp.name,
                        userTitle: emp.position || "사원",
                        department: emp.department || "경영지원팀",
                        date,
                        clockIn: startRaw, // HH:mm:ss
                        clockOut: endRaw,  // HH:mm:ss
                        originalClockIn: startRaw,
                        originalClockOut: endRaw,
                        logStatus: LogStatus.NORMAL
                    };

                    const processed = WorkHourCalculator.processDailyLog(fakeLog, {
                        standardStartTime: "09:00",
                        standardEndTime: "18:00",
                        clockInCutoffTime: "08:30",
                        clockOutCutoffTime: "18:30",
                        lateClockInGraceMinutes: 10,
                        breakTimeMinutes: 60,
                        maxWeeklyOvertimeMinutes: 720
                    });

                    processed.id = fakeLog.id;
                    processed.note = "가상 데이터 (TF)";
                    processed.status = 'MISSING'; // Mark as created so it shows up? Or 'NORMAL'? 
                    // Actually if we want it to show as "New", we return it. 
                    // The comparison logic handles "New".

                    logs.push(processed);
                });
            });

        } catch (e) {
            console.error(e);
        }

        return logs;
    }
}
