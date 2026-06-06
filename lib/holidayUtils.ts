export const HolidayUtils = {
    // Fixed holidays (Solar)
    SOLAR_HOLIDAYS: {
        '01-01': '신정',
        '03-01': '3.1절',
        '05-01': '근로자의 날',
        '05-05': '어린이날',
        '06-06': '현충일',
        '08-15': '광복절',
        '10-03': '개천절',
        '10-09': '한글날',
        '12-25': '크리스마스'
    } as Record<string, string>,

    // Lunar and variable holidays (Accurate for 2024-2026)
    LUNAR_HOLIDAYS: {
        // 2024
        '2024-02-09': '설날 연휴',
        '2024-02-10': '설날',
        '2024-02-11': '설날 연휴',
        '2024-02-12': '대체공휴일',
        '2024-04-10': '선거일',
        '2024-05-15': '부처님오신날',
        '2024-09-16': '추석 연휴',
        '2024-09-17': '추석',
        '2024-09-18': '추석 연휴',
        '2024-10-01': '국군의 날(임시)',

        // 2025
        '2025-01-27': '설날 연휴',
        '2025-01-28': '설날',
        '2025-01-29': '설날 연휴',
        '2025-01-30': '대체공휴일',
        '2025-03-03': '대체공휴일',
        '2025-05-05': '어린이날/부처님오신날',
        '2025-05-06': '대체공휴일',
        '2025-10-05': '추석 연휴',
        '2025-10-06': '추석',
        '2025-10-07': '추석 연휴',
        '2025-10-08': '대체공휴일',

        // 2026
        '2026-02-16': '설날 연휴',
        '2026-02-17': '설날',
        '2026-02-18': '설날 연휴',
        '2026-02-19': '대체공휴일',
        '2026-05-24': '부처님오신날',
        '2026-05-25': '대체공휴일',
        '2026-09-24': '추석 연휴',
        '2026-09-25': '추석',
        '2026-09-26': '추석 연휴'
    } as Record<string, string>,

    /**
     * Initialize holidays by fetching from Backend API
     */
    init: async (year: number, companyId: string) => {
        try {
            const res = await fetch(`/api/management/holidays?year=${year}&companyId=${companyId}`);
            if (!res.ok) throw new Error('API fetch failed');

            const result = await res.json() as { success: boolean, data: any[] };
            if (result.success && Array.isArray(result.data)) {
                result.data.forEach(h => {
                    let dateStr = h.date.toString(); // YYYY-MM-DD or YYYYMMDD

                    // Normalize to YYYY-MM-DD
                    if (!dateStr.includes('-') && dateStr.length === 8) {
                        dateStr = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
                    }

                    HolidayUtils.LUNAR_HOLIDAYS[dateStr] = h.name;
                });
                console.log(`[HolidayUtils] Successfully loaded ${result.data.length} holidays for ${year}`);
            }
        } catch (e) {
            console.warn(`[HolidayUtils] Failed to fetch dynamic holidays, using static fallback`, e);
        }
    },

    getHolidayName: (date: Date): string | null => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const mmdd = `${month}-${day}`;
        const yyyymmdd = `${year}-${month}-${day}`;

        // Check Fixed
        if (HolidayUtils.SOLAR_HOLIDAYS[mmdd]) {
            return HolidayUtils.SOLAR_HOLIDAYS[mmdd];
        }

        // Check Lunar/Special
        if (HolidayUtils.LUNAR_HOLIDAYS[yyyymmdd]) {
            return HolidayUtils.LUNAR_HOLIDAYS[yyyymmdd];
        }

        return null;
    },

    isHoliday: (date: Date): boolean => {
        return !!HolidayUtils.getHolidayName(date);
    }
};
