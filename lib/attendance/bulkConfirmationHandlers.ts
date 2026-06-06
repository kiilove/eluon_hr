
import { ProcessedWorkLog, LogStatus, GlobalConfig, WorkPolicy } from "../../types";
import { PolicyUtils } from "../../lib/policyUtils";
import { TimeUtils } from "../../lib/timeUtils";
import { calculateActualWork, generateSafeTimeString } from "../../lib/correctionUtils";

export const handleConfirmAllWeekVacation = async ({
    forcedStatus,
    data,
    config,
    policies,
    setData,
    showAlert
}: {
    forcedStatus?: LogStatus,
    data: any,
    config: GlobalConfig,
    policies: WorkPolicy[],
    setData: (val: any) => void,
    showAlert: (msg: string, options?: any) => void
}) => {
    if (!data?.v2) return;

    // Identify users who are currently in "All-Week Vacation" state
    const userWeekdayCount: Record<string, number> = {};
    const userVacationWeekdayCount: Record<string, number> = {};

    data.v2.forEach((log: any) => {
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
    });

    const targetUserIds = new Set<string>();
    Object.keys(userWeekdayCount).forEach(userId => {
        if (userWeekdayCount[userId] > 0 && userWeekdayCount[userId] === userVacationWeekdayCount[userId]) {
            targetUserIds.add(userId);
        }
    });

    if (targetUserIds.size === 0) {
        await showAlert("확인할 전일 휴가 대상자가 없습니다.", { type: 'info' });
        return;
    }

    const updatedV2 = data.v2.map((log: any) => {
        if (targetUserIds.has(log.userId)) {
            let newLog = { ...log };
            if (forcedStatus && !log.isHoliday) {
                const date = new Date(log.date);
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                if (!isWeekend) {
                    newLog.logStatus = forcedStatus;
                    if (forcedStatus === LogStatus.NORMAL && (log.actualWorkDuration || 0) === 0) {
                        const effectivePolicy = PolicyUtils.getPolicyForDate(log.date, policies);
                        const activeConfig = effectivePolicy ? PolicyUtils.toGlobalConfig(effectivePolicy) : config;

                        const targetStart = TimeUtils.timeToMinutes(activeConfig.standardStartTime || "09:00");
                        const targetEnd = TimeUtils.timeToMinutes(activeConfig.standardEndTime || "18:00");
                        const seed = `${log.userId}-${log.date}`;
                        newLog.rawStartTimeStr = generateSafeTimeString(targetStart - 10, targetStart + 5, seed + "start");
                        newLog.rawEndTimeStr = generateSafeTimeString(targetEnd, targetEnd + 20, seed + "end");

                        const sMin = TimeUtils.timeToMinutes(newLog.rawStartTimeStr.substring(0, 5));
                        const eMin = TimeUtils.timeToMinutes(newLog.rawEndTimeStr.substring(0, 5));
                        const calc = calculateActualWork(sMin, eMin, activeConfig);

                        newLog.startTime = sMin;
                        newLog.endTime = eMin;
                        newLog.actualWorkDuration = calc.actualWork;
                        newLog.totalDuration = calc.totalDuration;
                        newLog.breakDuration = calc.breakDuration;
                    } else if (forcedStatus === LogStatus.VACATION || forcedStatus === LogStatus.TRIP) {
                        newLog.startTime = 0;
                        newLog.endTime = 0;
                        newLog.rawStartTimeStr = '';
                        newLog.rawEndTimeStr = '';
                        newLog.actualWorkDuration = 0;
                        newLog.totalDuration = 0;
                        newLog.breakDuration = 0;
                    }
                }
            }

            newLog.note = (newLog.note || "").includes("[근태확인]") ? newLog.note : (newLog.note ? newLog.note + " [근태확인]" : "[근태확인]");
            return newLog;
        }
        return log;
    });

    setData((prev: any) => prev ? { ...prev, v2: updatedV2 } : null);
    await showAlert(`대상 직원 ${targetUserIds.size}명의 주간 근태를 처리했습니다.`, { type: 'success' });
};
