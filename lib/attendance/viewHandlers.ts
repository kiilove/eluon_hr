
import { LogStatus } from "../../types";

export const handleTabChange = ({
    tab,
    data,
    tfUserIds,
    tfUserNames,
    setStickyViolationUserIds,
    setActiveTab
}: {
    tab: any,
    data: any,
    tfUserIds: Set<string>,
    tfUserNames: Set<string>,
    setStickyViolationUserIds: (val: any) => void,
    setActiveTab: (val: any) => void
}) => {
    if (tab !== 'ALL') {
        const currentLogs = data?.v2 || [];
        let ids = new Set<string>();

        if (tab === 'MANUAL_CHECK') {
            ids = new Set(currentLogs
                .filter((l: any) => l.status === 'ERROR' || l.status === 'MISSING' || l.logStatus === LogStatus.OTHER)
                .map((l: any) => l.userId));
        } else if (tab === 'OVERTIME') {
            ids = new Set(currentLogs
                .filter((l: any) => (l.overtimeDuration > 0 || l.specialWorkMinutes > 0))
                .map((l: any) => l.userId));
        } else if (tab === 'VACATION') {
            ids = new Set(currentLogs
                .filter((l: any) => (l.logStatus === LogStatus.VACATION || l.logStatus === LogStatus.TRIP || l.logStatus === LogStatus.EDUCATION || l.logStatus === LogStatus.SICK))
                .map((l: any) => l.userId));
        } else if (tab === 'TF_ONLY') {
            ids = new Set(currentLogs
                .filter((l: any) => (l.employeeId && tfUserIds.has(l.employeeId)) || (!l.employeeId && tfUserNames.has(l.userId)))
                .map((l: any) => l.userId));
        } else if (tab === 'WEEK_VACATION') {
            const userWeekdayCount: Record<string, number> = {};
            const userVacationWeekdayCount: Record<string, number> = {};

            currentLogs.forEach((log: any) => {
                const [y, m, d] = log.date.split('-').map(Number);
                const lDate = new Date(y, m - 1, d);
                const dayOfWeek = lDate.getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                const isHoliday = log.isHoliday || false;

                if (!isWeekend && !isHoliday) {
                    userWeekdayCount[log.userId] = (userWeekdayCount[log.userId] || 0) + 1;
                    if (
                        [LogStatus.VACATION, LogStatus.TRIP, LogStatus.EDUCATION, LogStatus.SICK, LogStatus.REST, LogStatus.OTHER].includes(log.logStatus)
                    ) {
                        userVacationWeekdayCount[log.userId] = (userVacationWeekdayCount[log.userId] || 0) + 1;
                    }
                }
            });

            const allUserIdsInLogs = new Set<string>(currentLogs.map((l: any) => l.userId));
            allUserIdsInLogs.forEach(userId => {
                const weekdays = userWeekdayCount[userId] || 0;
                const vWeekdays = userVacationWeekdayCount[userId] || 0;
                const userLogs = currentLogs.filter((l: any) => l.userId === userId);
                const isResigned = userLogs.some((l: any) => l.logStatus === LogStatus.RESIGNED);
                const isConfirmed = userLogs.some((l: any) => l.note && l.note.includes("[근태확인]"));

                if (!isResigned && weekdays > 0 && weekdays === vWeekdays && !isConfirmed) {
                    ids.add(userId);
                }
            });
        }
        setStickyViolationUserIds(ids);
    } else {
        setStickyViolationUserIds(null);
    }
    setActiveTab(tab);
};
