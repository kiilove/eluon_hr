export const TimeUtils = {
    // Convert "HH:mm" to minutes from midnight
    timeToMinutes: (timeStr: string): number => {
        if (!timeStr) return 0;
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    },

    // Convert minutes to "HH:mm"
    minutesToTime: (minutes: number): string => {
        const h = Math.floor(minutes / 60);
        const m = Math.floor(minutes % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    },

    // Convert minutes to "Xh Ym" format for display
    minutesToDisplay: (minutes: number): string => {
        if (minutes <= 0) return "0h 0m";
        const h = Math.floor(minutes / 60);
        const m = Math.floor(minutes % 60);
        return `${h}h ${m}m`;
    },

    // Convert minutes to "H:MM:SS" format for Excel-like display
    minutesToColonFormat: (minutes: number): string => {
        const val = Math.max(0, minutes);
        const h = Math.floor(val / 60);
        const m = Math.floor(val % 60);
        const s = Math.round((val - Math.floor(val)) * 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    },

    // 4h+ -> 30m, 8h+ -> 1h
    calculateBreakMinutes: (totalDurationMinutes: number): number => {
        if (totalDurationMinutes >= 480) { // 8 hours
            return 60;
        } else if (totalDurationMinutes >= 240) { // 4 hours
            return 30;
        }
        return 0;
    },

    // Extract "HH:mm" from a potentially messy string, but try to preserve more info if needed for display? 
    // Actually, for "timeToMinutes", we only need HH:mm. 
    // For Display, we want the full string.
    // Let's make sanitizeTime lenient:
    sanitizeTime: (val: string): string | undefined => {
        if (!val) return undefined;
        // Match HH:mm:ss.SS or HH:mm:ss or HH:mm
        // Match HH:mm:ss or HH:mm, explicitly IGNORING .SS (milliseconds)
        // regex note: (\.\d+)? removed
        const match = String(val).match(/(\d{1,2}:\d{2}(:\d{2})?)/);
        const time = match ? match[0] : undefined;
        return (time === "00:00" || time === "0:00") ? undefined : time;
    },

    // Get Week Key (WXX)
    getWeekKey: (dateInput: Date | string): string => {
        const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
        const year = date.getFullYear();
        const jan1 = new Date(year, 0, 1);
        const jan1Day = jan1.getDay();
        let daysToNextMonday = (8 - jan1Day) % 7;
        if (jan1Day === 1) daysToNextMonday = 0;
        const firstMonday = new Date(year, 0, 1 + daysToNextMonday);

        if (date < firstMonday) {
            const prevYear = year - 1;
            const prevJan1 = new Date(prevYear, 0, 1);
            const prevJan1Day = prevJan1.getDay();
            let prevDaysToNextMonday = (8 - prevJan1Day) % 7;
            if (prevJan1Day === 1) prevDaysToNextMonday = 0;
            const prevFirstMonday = new Date(prevYear, 0, 1 + prevDaysToNextMonday);

            const diffTime = Math.abs(date.getTime() - prevFirstMonday.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            const weekNum = Math.floor(diffDays / 7) + 1;
            return `W${String(weekNum).padStart(2, '0')}`;
        }

        const diffTime = Math.abs(date.getTime() - firstMonday.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const weekNum = Math.floor(diffDays / 7) + 1;
        return `W${String(weekNum).padStart(2, '0')}`;
    },

    // Format date string from Excel header label
    formatDateString: (dateLabel: string, baseYear: number, baseMonth: number): string | null => {
        // Case 1: "2024.12.01" or "2024-12-01"
        const fullDateMatch = String(dateLabel).match(/(\d{4})[\.\-](\d{2})[\.\-](\d{2})/);
        if (fullDateMatch) {
            return `${fullDateMatch[1]}-${fullDateMatch[2]}-${fullDateMatch[3]}`;
        }

        // Case 2: "01(Mon)" or "1" -> Use baseYear/baseMonth
        const dayMatch = String(dateLabel).match(/\d+/);
        if (dayMatch) {
            const day = dayMatch[0].padStart(2, '0');
            return `${baseYear}-${String(baseMonth).padStart(2, '0')}-${day}`;
        }

        return null;
    },

    // Get week number of month (1-5)
    getWeekOfMonth: (date: Date): number => {
        const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
        const dayOfWeek = firstDay.getDay(); // 0 (Sun) - 6 (Sat)
        const offsetDate = date.getDate() + dayOfWeek - 1;
        return Math.floor(offsetDate / 7) + 1;
    }
};
