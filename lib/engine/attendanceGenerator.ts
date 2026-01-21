
interface WorkLog {
    id: string;
    staff_id: string;
    work_date: string;
    start_time: string;
    end_time: string;
    status: string;
}

// Helper: Check weekend
function isWeekend(date: Date) {
    const day = date.getDay();
    return day === 0 || day === 6;
}

// Helper: Pad numbers
const pad = (n: number) => n.toString().padStart(2, '0');

// Helper: Time Format HH:mm:ss
function formatTime(h: number, m: number, s: number) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function generateMonthlyAttendance(staffId: string, year: number, month: number, existingLeaveDates: Set<string>, targetStart: string = '09:00', targetEnd: string = '18:00'): WorkLog[] {
    const logs: WorkLog[] = [];
    const daysInMonth = new Date(year, month, 0).getDate();

    // Parse targets
    const [tSh, tSm] = targetStart.split(':').map(Number);
    const [tEh, tEm] = targetEnd.split(':').map(Number);

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${pad(month)}-${pad(day)}`;
        const dateObj = new Date(year, month - 1, day);

        // 1. Skip Weekend
        if (isWeekend(dateObj)) continue;

        // 2. Skip Leave
        if (existingLeaveDates.has(dateStr)) continue;

        // 3. Generate Random Start Time (Target +/- 15min)
        // Weighted: 70% Target-10 ~ Target+5
        let startHour = tSh;
        let startMin = tSm;

        const rStart = Math.random();
        if (rStart < 0.7) {
            // Most people arrive 15 min early to on time
            // e.g. 09:00 -> 08:45 ~ 09:00
            startMin = tSm - 15 + Math.floor(Math.random() * 16);
        } else {
            // Some arrive a bit late
            // e.g. 09:00 -> 09:01 ~ 09:10
            startMin = tSm + 1 + Math.floor(Math.random() * 10);
        }

        // Normalize Min
        while (startMin < 0) { startMin += 60; startHour--; }
        while (startMin >= 60) { startMin -= 60; startHour++; }


        // 4. Generate Random End Time (Target ~ Target + 30min)
        let endHour = tEh;
        let endMin = tEm;
        const rEnd = Math.random();

        if (rEnd < 0.8) {
            // Normal: 0~20 min overtime
            endMin = tEm + Math.floor(Math.random() * 21);
        } else {
            // Late: 21~60 min overtime
            endMin = tEm + 21 + Math.floor(Math.random() * 40);
        }

        // Normalize Min
        while (endMin >= 60) { endMin -= 60; endHour++; }

        logs.push({
            id: crypto.randomUUID(),
            staff_id: staffId,
            work_date: dateStr,
            start_time: formatTime(startHour, startMin, Math.floor(Math.random() * 60)),
            end_time: formatTime(endHour, endMin, Math.floor(Math.random() * 60)),
            status: 'NORMAL'
        });
    }

    return logs;
}
