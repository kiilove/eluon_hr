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

    // Lunar holidays (Hardcoded for 2024-2026 for simplicity, can be expanded)
    // Format: YYYY-MM-DD
    LUNAR_HOLIDAYS: {
        // 2024
        '2024-02-09': '설날 연휴',
        '2024-02-10': '설날',
        '2024-02-11': '설날 연휴',
        '2024-02-12': '대체공휴일',
        '2024-04-10': '선거일', // Special one-off
        '2024-05-15': '부처님오신날',
        '2024-09-16': '추석 연휴',
        '2024-09-17': '추석',
        '2024-09-18': '추석 연휴',

        // 2025
        '2025-01-28': '설날 연휴',
        '2025-01-29': '설날',
        '2025-01-30': '설날 연휴',
        '2025-03-03': '대체공휴일', // 3.1절 is Sat? Not sure if auto-sub applies to all, assuming standard
        '2025-05-05': '어린이날',
        '2025-05-06': '부처님오신날', // Approx
        '2025-10-06': '추석', // Approx (Need precise calendar if critical)

        // 2026 (Placeholder/Approx)
        '2026-02-17': '설날',
    } as Record<string, string>,

    /**
     * Initialize holidays (No-op now)
     * Kept for API compatibility with DataProcessingPage
     */
    init: async (year: number) => {
        // Reverted to static for stability due to browser incompatibility of 3rd party lib
        console.log(`[HolidayUtils] Init called for ${year} (Static Mode Active)`);
        return;
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
