
import { ProcessedWorkLog, LogStatus } from "../../types";

export const getFilteredLogs = ({
    data,
    step,
    searchTerm,
    activeTab,
    stickyViolationUserIds,
    tfUserIds,
    tfUserNames
}: {
    data: any,
    step: number,
    searchTerm: string,
    activeTab: string,
    stickyViolationUserIds: Set<string> | null,
    tfUserIds: Set<string>,
    tfUserNames: Set<string>
}) => {
    if (!data || (step !== 2 && step !== 3)) return [];

    const sourceLogs: ProcessedWorkLog[] = (step === 2 ? data.v2 : (data.v3 || data.v2)) || [];
    const allUserIds = new Set<string>();
    const violationUserIds = new Set<string>();
    const overtimeUserIds = new Set<string>();
    const vacationUserIds = new Set<string>();
    const otherUserIds = new Set<string>();
    const tfIds = new Set<string>();
    const searchMatchingUserIds = new Set<string>();
    const weekVacationUserIds = new Set<string>();

    const userTotalWork: Record<string, number> = {};
    const userWeekdayCount: Record<string, number> = {};
    const userVacationWeekdayCount: Record<string, number> = {};

    sourceLogs.forEach(log => {
        allUserIds.add(log.userId);
        if (!userTotalWork[log.userId]) userTotalWork[log.userId] = 0;
        userTotalWork[log.userId] += (log.actualWorkDuration || 0) + (log.overtimeDuration || 0) + (log.specialWorkMinutes || 0);

        const [y, m, d] = log.date.split('-').map(Number);
        const lDate = new Date(y, m - 1, d);
        const dayOfWeek = lDate.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isHoliday = log.isHoliday || false;

        if (!isWeekend && !isHoliday) {
            userWeekdayCount[log.userId] = (userWeekdayCount[log.userId] || 0) + 1;
            if (
                log.logStatus === LogStatus.VACATION ||
                log.logStatus === LogStatus.TRIP ||
                log.logStatus === LogStatus.EDUCATION ||
                log.logStatus === LogStatus.SICK ||
                log.logStatus === LogStatus.REST ||
                log.logStatus === LogStatus.OTHER
            ) {
                userVacationWeekdayCount[log.userId] = (userVacationWeekdayCount[log.userId] || 0) + 1;
            }
        }

        if (log.logStatus === LogStatus.OTHER && !(log.note && log.note.includes("[근태확인]"))) {
            violationUserIds.add(log.userId);
        }
        if (log.overtimeDuration > 0 || log.specialWorkMinutes > 0) {
            overtimeUserIds.add(log.userId);
        }
        if (log.logStatus === LogStatus.VACATION || log.logStatus === LogStatus.TRIP || log.logStatus === LogStatus.EDUCATION || log.logStatus === LogStatus.SICK) {
            vacationUserIds.add(log.userId);
        }
        if (log.logStatus === LogStatus.OTHER) {
            otherUserIds.add(log.userId);
        }
        if ((log.employeeId && tfUserIds.has(log.employeeId)) || (!log.employeeId && tfUserNames.has(log.userId))) {
            tfIds.add(log.userId);
        }

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            if (
                log.userName.toLowerCase().includes(term) ||
                (log.department || "").toLowerCase().includes(term) ||
                (log.userTitle || "").toLowerCase().includes(term) ||
                (log.logStatus || "").toLowerCase().includes(term)
            ) {
                searchMatchingUserIds.add(log.userId);
            }
        }
    });

    allUserIds.forEach(userId => {
        const userLogs = sourceLogs.filter(l => l.userId === userId);
        const weekdays = userWeekdayCount[userId] || 0;
        const vWeekdays = userVacationWeekdayCount[userId] || 0;
        const isAllVacation = weekdays > 0 && weekdays === vWeekdays;
        const isResigned = userLogs.some(l => l.logStatus === LogStatus.RESIGNED);

        if (!isResigned && isAllVacation) {
            const isConfirmed = userLogs.some(l => l.note && l.note.includes("[근태확인]"));
            if (!isConfirmed) {
                weekVacationUserIds.add(userId);
            }
        }
    });

    let finalUserIds = new Set([...allUserIds].filter(id => {
        const isTF = tfUserNames.has(id) || tfIds.has(id);
        const hasWork = (userTotalWork[id] || 0) > 0;
        const hasOther = otherUserIds.has(id);
        const isWeekVacation = weekVacationUserIds.has(id);

        if (isTF) return true;
        if (hasWork) return true;
        if (hasOther) return true;
        if (isWeekVacation) return true;
        return false;
    }));

    if (activeTab === 'MANUAL_CHECK') {
        const targetSet = stickyViolationUserIds || violationUserIds;
        finalUserIds = new Set([...finalUserIds].filter(id => targetSet.has(id)));
    } else if (activeTab === 'OVERTIME') {
        const targetSet = stickyViolationUserIds || overtimeUserIds;
        finalUserIds = new Set([...finalUserIds].filter(id => targetSet.has(id)));
    } else if (activeTab === 'VACATION') {
        const targetSet = stickyViolationUserIds || vacationUserIds;
        finalUserIds = new Set([...finalUserIds].filter(id => targetSet.has(id)));
    } else if (activeTab === 'TF_ONLY') {
        const targetSet = stickyViolationUserIds || tfIds;
        finalUserIds = new Set([...finalUserIds].filter(id => targetSet.has(id)));
    } else if (activeTab === 'WEEK_VACATION') {
        const targetSet = stickyViolationUserIds || weekVacationUserIds;
        finalUserIds = new Set([...finalUserIds].filter(id => targetSet.has(id)));
    }

    if (searchTerm) {
        finalUserIds = new Set([...finalUserIds].filter(id => searchMatchingUserIds.has(id)));
    }

    return sourceLogs.filter(log => finalUserIds.has(log.userId));
};

export const getFilterCounts = ({
    data,
    step,
    tfUserIds,
    tfUserNames
}: {
    data: any,
    step: number,
    tfUserIds: Set<string>,
    tfUserNames: Set<string>
}) => {
    if (!data || (step !== 2 && step !== 3)) return { MANUAL_CHECK: 0, OVERTIME: 0, VACATION: 0, ALL: 0, TF_ONLY: 0, WEEK_VACATION: 0 };

    let logs: ProcessedWorkLog[] = (step === 2 ? data.v2 : (data.v3 || data.v2 || []));

    const allUsers = new Set<string>();
    const violations = new Set<string>();
    const overtimes = new Set<string>();
    const vacations = new Set<string>();
    const tfMembers = new Set<string>();
    const weekVacations = new Set<string>();

    const userWeekdayCount: Record<string, number> = {};
    const userVacationWeekdayCount: Record<string, number> = {};

    logs.forEach(log => {
        allUsers.add(log.userId);
        const [y, m, d] = log.date.split('-').map(Number);
        const lDate = new Date(y, m - 1, d);
        const dayOfWeek = lDate.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isHoliday = log.isHoliday || false;

        if (!isWeekend && !isHoliday) {
            userWeekdayCount[log.userId] = (userWeekdayCount[log.userId] || 0) + 1;
            if (
                log.logStatus === LogStatus.VACATION ||
                log.logStatus === LogStatus.TRIP ||
                log.logStatus === LogStatus.EDUCATION ||
                log.logStatus === LogStatus.SICK ||
                log.logStatus === LogStatus.REST ||
                log.logStatus === LogStatus.OTHER
            ) {
                userVacationWeekdayCount[log.userId] = (userVacationWeekdayCount[log.userId] || 0) + 1;
            }
        }

        if (log.logStatus === LogStatus.OTHER && !(log.note && log.note.includes("[근태확인]"))) {
            violations.add(log.userId);
        }
        if (log.overtimeDuration > 0 || log.specialWorkMinutes > 0) overtimes.add(log.userId);
        if (log.logStatus === LogStatus.VACATION || log.logStatus === LogStatus.TRIP || log.logStatus === LogStatus.EDUCATION || log.logStatus === LogStatus.SICK) vacations.add(log.userId);
        if ((log.employeeId && tfUserIds.has(log.employeeId)) || (!log.employeeId && tfUserNames.has(log.userId))) {
            tfMembers.add(log.userId);
        }
    });

    allUsers.forEach(userId => {
        const userLogs = logs.filter(l => l.userId === userId);
        const weekdays = userWeekdayCount[userId] || 0;
        const vWeekdays = userVacationWeekdayCount[userId] || 0;
        const isAllVacation = weekdays > 0 && weekdays === vWeekdays;
        const isResigned = userLogs.some(l => l.logStatus === LogStatus.RESIGNED);

        if (!isResigned && isAllVacation) {
            const isConfirmed = userLogs.some(l => l.note && l.note.includes("[근태확인]"));
            if (!isConfirmed) {
                weekVacations.add(userId);
            }
        }
    });

    return {
        ALL: allUsers.size,
        MANUAL_CHECK: violations.size,
        OVERTIME: overtimes.size,
        VACATION: vacations.size,
        TF_ONLY: tfMembers.size,
        WEEK_VACATION: weekVacations.size
    };
};

export const getFinalPreviewData = ({
    data,
    step
}: {
    data: any,
    step: number
}) => {
    if (!data || step !== 4) return { weekGroups: {}, sortedMondays: [] };
    const logs = data.v4 || data.v3 || data.v2;

    const getMondayOfWeek = (date: Date): string => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff));
        const year = monday.getFullYear();
        const month = String(monday.getMonth() + 1).padStart(2, '0');
        const dt = String(monday.getDate()).padStart(2, '0');
        return `${year}-${month}-${dt}`;
    };

    const weekGroups: Record<string, ProcessedWorkLog[]> = {};
    logs.forEach((log: any) => {
        const mondayStr = getMondayOfWeek(new Date(log.date));
        if (!weekGroups[mondayStr]) weekGroups[mondayStr] = [];
        weekGroups[mondayStr].push(log);
    });

    const sortedMondays = Object.keys(weekGroups).sort();
    return { weekGroups, sortedMondays };
};
