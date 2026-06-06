
import { ProcessedWorkLog, LogStatus, GlobalConfig, WorkPolicy } from "../../types";
import { HolidayUtils } from "../../lib/holidayUtils";
import { PolicyUtils } from "../../lib/policyUtils";
import { TimeUtils } from "../../lib/timeUtils";
import { calculateActualWork, generateSafeTimeString } from "../../lib/correctionUtils";

/**
 * [Helper] Pure Logic for Night Work Correction
 * [Updated] "Eliminate Night Work" -> Standardize to Normal Day (09:00~18:00)
 */
export const processNightCorrection = (
    sourceLogs: ProcessedWorkLog[],
    config: GlobalConfig,
    policies: WorkPolicy[]
) => {
    let nightFixCount = 0;
    const finalLogs = sourceLogs.map(log => {
        // User Requirement: Clock-in between 00:00 (0) and 06:00 (360) is considered Night Work entry that needs cleansing
        // Also captures entries with calculated NightWorkDuration
        const isNightEntry = log.startTime >= 0 && log.startTime <= 360 && (log.startTime !== 0 || log.endTime !== 0);
        const hasNightDuration = log.nightWorkDuration && log.nightWorkDuration > 0;

        if (!isNightEntry && !hasNightDuration) return log;
        if (log.note?.includes("[야간 확인(정상화)]")) return log; // Updated note check

        nightFixCount++;

        // Standardize to "Normal Day": Find active policy for the date
        const effectivePolicy = PolicyUtils.getPolicyForDate(log.date, policies);
        const activeConfig = effectivePolicy ? PolicyUtils.toGlobalConfig(effectivePolicy) : config;

        const stdStart = activeConfig.standardStartTime || "09:00";
        const stdEnd = activeConfig.standardEndTime || "18:00";

        const newStartStr = randomizePerfectTime(stdStart, 'START', log.id, activeConfig);
        const newEndStr = randomizePerfectTime(stdEnd, 'END', log.id, activeConfig);

        const startMin = TimeUtils.timeToMinutes(newStartStr.substring(0, 5));
        const endMin = TimeUtils.timeToMinutes(newEndStr.substring(0, 5));
        const { actualWork, totalDuration, breakDuration, nightWorkDuration } = calculateActualWork(startMin, endMin, activeConfig);

        return {
            ...log,
            startTime: startMin,
            endTime: endMin,
            rawStartTimeStr: newStartStr,
            rawEndTimeStr: newEndStr,
            totalDuration,
            breakDuration,
            actualWorkDuration: actualWork,
            overtimeDuration: 0,
            nightWorkDuration: nightWorkDuration || 0, // Should be 0 for standard hours
            status: 'NORMAL' as const,
            logStatus: LogStatus.NORMAL,
            note: (log.note || "") + " [야간 확인(정상화)]"
        };
    });
    return { logs: finalLogs, count: nightFixCount };
};

/**
 * Helper: Randomize Perfect Time
 */
const randomizePerfectTime = (val: string, type: 'START' | 'END', idSeed: string, activeConfig: GlobalConfig): string => {
    if (!val) return val;

    const stdStart = activeConfig.standardStartTime || "09:00";
    const stdEnd = activeConfig.standardEndTime || "18:00";

    if (type === 'START') {
        if (val === stdStart || val === stdStart + ":00") {
            const targetMin = TimeUtils.timeToMinutes(stdStart);
            return generateSafeTimeString(targetMin - 10, targetMin + 3, idSeed + "start_rand");
        }
    } else {
        if (val === stdEnd || val === stdEnd + ":00") {
            const targetMin = TimeUtils.timeToMinutes(stdEnd);
            return generateSafeTimeString(targetMin, targetMin + 30, idSeed + "end_rand");
        }
    }
    return val;
};

export const handleOvertimeCorrection = async ({
    data,
    policies,
    config,
    tfUserIds,
    tfUserNames,
    setData,
    setActiveTab,
    setStickyViolationUserIds,
    showAlert
}: {
    data: any;
    policies: WorkPolicy[];
    config: GlobalConfig;
    tfUserIds: Set<string>;
    tfUserNames: Set<string>;
    setData: (val: any) => void;
    setActiveTab: (val: any) => void;
    setStickyViolationUserIds: (val: any) => void;
    showAlert: (msg: string, options?: any) => void;
}) => {
    if (!data) return;
    try {
        const v3Init: ProcessedWorkLog[] = JSON.parse(JSON.stringify(data.v3 || data.v2));
        (window as any)['lastWorkingDaysMap'] = undefined;
        let otFixCount = 0;

        const v3AfterOT = v3Init.map(log => {
            if (log.isExemptFromOvertime) return log;
            if (log.logStatus === LogStatus.RESIGNED || log.logStatus === LogStatus.PRE_JOIN) return log;

            const effectivePolicy = PolicyUtils.getPolicyForDate(log.date, policies);
            const activeConfig = effectivePolicy ? PolicyUtils.toGlobalConfig(effectivePolicy) : config;

            const y = parseInt(log.date.substring(0, 4));
            const m = parseInt(log.date.substring(5, 7)) - 1;
            const d = parseInt(log.date.substring(8, 10));

            const dateObj = new Date(y, m, d);
            const dayOfWeek = dateObj.getDay();

            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const isHoliday = HolidayUtils.isHoliday(dateObj);
            const isWorkingDay = !isWeekend && !isHoliday;

            if (!(window as any)['lastWorkingDaysMap']) {
                const dates = new Set<string>(v3Init.map((l: ProcessedWorkLog) => l.date));
                const monthGroups: Record<string, string[]> = {};
                dates.forEach((date) => {
                    const ym = date.substring(0, 7);
                    if (!monthGroups[ym]) monthGroups[ym] = [];
                    monthGroups[ym].push(date);
                });

                const lwd = new Set<string>();
                Object.keys(monthGroups).forEach(ym => {
                    const [yearStr, monthStr] = ym.split('-');
                    const year = parseInt(yearStr);
                    const month = parseInt(monthStr);

                    let checkDate = new Date(year, month, 0);
                    while (checkDate.getMonth() === month - 1) {
                        const day = checkDate.getDay();
                        const isWeekend = day === 0 || day === 6;
                        const isHoliday = HolidayUtils.isHoliday(checkDate);

                        if (!isWeekend && !isHoliday) {
                            const yS = checkDate.getFullYear();
                            const mS = String(checkDate.getMonth() + 1).padStart(2, '0');
                            const dS = String(checkDate.getDate()).padStart(2, '0');
                            const targetStr = `${yS}-${mS}-${dS}`;

                            if (monthGroups[ym].includes(targetStr)) {
                                lwd.add(targetStr);
                            }
                            break;
                        }
                        checkDate.setDate(checkDate.getDate() - 1);
                    }
                });
                (window as any)['lastWorkingDaysMap'] = lwd;
            }
            const lastWorkingDays = (window as any)['lastWorkingDaysMap'] as Set<string>;

            const isTfId = log.employeeId && tfUserIds.has(log.employeeId);
            const isTfName = !log.employeeId && tfUserNames.has(log.userId);

            if ((isTfId || isTfName) && lastWorkingDays.has(log.date)) {
                if (log.logStatus !== LogStatus.VACATION) {
                    return {
                        ...log,
                        startTime: 0,
                        endTime: 0,
                        rawStartTimeStr: '',
                        rawEndTimeStr: '',
                        totalDuration: 0,
                        breakDuration: 0,
                        actualWorkDuration: 0,
                        overtimeDuration: 0,
                        specialWorkMinutes: 0,
                        nightWorkDuration: 0,
                        status: 'NORMAL',
                        logStatus: LogStatus.VACATION,
                        correctionMemo: (log.correctionMemo || "") + "[TF 자동 연차]"
                    } as ProcessedWorkLog;
                }
            }

            if ((isTfId || isTfName) && isWorkingDay) {
                const stdStart = activeConfig.standardStartTime || "09:00";
                const stdEnd = activeConfig.standardEndTime || "18:00";

                const newStartStr = randomizePerfectTime(stdStart, 'START', log.id, activeConfig);
                const newEndStr = randomizePerfectTime(stdEnd, 'END', log.id, activeConfig);

                const startMin = TimeUtils.timeToMinutes(newStartStr.substring(0, 5));
                const endMin = TimeUtils.timeToMinutes(newEndStr.substring(0, 5));
                const { actualWork, totalDuration, breakDuration } = calculateActualWork(startMin, endMin, activeConfig);

                const originalMemo = log.correctionMemo || "";
                const newMemo = originalMemo.includes("[TF 가상근무]") ? originalMemo : originalMemo + "[TF 가상근무]";

                return {
                    ...log,
                    startTime: startMin,
                    endTime: endMin,
                    rawStartTimeStr: newStartStr,
                    rawEndTimeStr: newEndStr,
                    totalDuration: totalDuration,
                    breakDuration: breakDuration,
                    actualWorkDuration: actualWork,
                    overtimeDuration: Math.max(0, actualWork - (8 * 60)),
                    specialWorkMinutes: 0,
                    status: 'NORMAL',
                    logStatus: LogStatus.NORMAL,
                    correctionMemo: newMemo
                } as ProcessedWorkLog;
            }

            if ((isTfId || isTfName) && !isWorkingDay) {
                return {
                    ...log,
                    startTime: 0,
                    endTime: 0,
                    rawStartTimeStr: '',
                    rawEndTimeStr: '',
                    totalDuration: 0,
                    breakDuration: 0,
                    actualWorkDuration: 0,
                    overtimeDuration: 0,
                    specialWorkMinutes: 0,
                    nightWorkDuration: 0,
                    status: 'NORMAL',
                    logStatus: LogStatus.REST,
                    correctionMemo: (log.correctionMemo || "") + "[TF 주말/휴일 휴무]"
                } as ProcessedWorkLog;
            }

            if (!isWorkingDay) {
                return {
                    ...log,
                    startTime: 0,
                    endTime: 0,
                    rawStartTimeStr: '',
                    rawEndTimeStr: '',
                    totalDuration: 0,
                    breakDuration: 0,
                    actualWorkDuration: 0,
                    overtimeDuration: 0,
                    specialWorkMinutes: 0,
                    nightWorkDuration: 0,
                    status: 'NORMAL',
                    logStatus: LogStatus.REST,
                    correctionMemo: (log.correctionMemo || "") + "[휴일/주말 휴무]"
                } as ProcessedWorkLog;
            }

            const hasWork = log.totalDuration > 0 || log.startTime > 0 || log.endTime > 0;
            if (!hasWork) {
                const protectedStatuses = [LogStatus.SICK, LogStatus.TRIP, LogStatus.EDUCATION, LogStatus.VACATION, LogStatus.RESIGNED, LogStatus.PRE_JOIN];
                if (protectedStatuses.includes(log.logStatus as LogStatus)) {
                    return log;
                }
                return {
                    ...log,
                    status: 'NORMAL',
                    logStatus: LogStatus.VACATION,
                    correctionMemo: (log.correctionMemo || "") + "[평일 미근무 휴가]"
                } as ProcessedWorkLog;
            }

            let isModified = false;
            let newStartStr = log.rawStartTimeStr || '';
            let newEndStr = log.rawEndTimeStr || '';

            const randomizedStart = randomizePerfectTime(newStartStr, 'START', log.id, activeConfig);
            const randomizedEnd = randomizePerfectTime(newEndStr, 'END', log.id, activeConfig);

            if (randomizedStart !== newStartStr) { newStartStr = randomizedStart; isModified = true; }
            if (randomizedEnd !== newEndStr) { newEndStr = randomizedEnd; isModified = true; }

            if (log.overtimeDuration && log.overtimeDuration > 0) {
                const stdStartMin = TimeUtils.timeToMinutes(activeConfig.standardStartTime || "09:00");
                const stdEndMin = TimeUtils.timeToMinutes(activeConfig.standardEndTime || "18:00");

                newStartStr = generateSafeTimeString(stdStartMin - 30, stdStartMin + 10, log.id + "start_ot");
                newEndStr = generateSafeTimeString(stdEndMin, stdEndMin + 10, log.id + "end_ot");
                isModified = true;
                otFixCount++;
            }

            if (isModified) {
                const startMinutes = TimeUtils.timeToMinutes(newStartStr.substring(0, 5));
                const endMinutes = TimeUtils.timeToMinutes(newEndStr.substring(0, 5));
                const { actualWork, totalDuration, breakDuration } = calculateActualWork(startMinutes, endMinutes, activeConfig);

                return {
                    ...log,
                    startTime: startMinutes,
                    endTime: endMinutes,
                    rawStartTimeStr: newStartStr,
                    rawEndTimeStr: newEndStr,
                    totalDuration,
                    breakDuration,
                    actualWorkDuration: actualWork,
                    overtimeDuration: Math.round(Math.max(0, actualWork - (8 * 60)) / 30) * 30,
                    targetStartTime: TimeUtils.minutesToTime(calculateActualWork(startMinutes, endMinutes, activeConfig).snappedStart),
                    targetEndTime: TimeUtils.minutesToTime(calculateActualWork(startMinutes, endMinutes, activeConfig).effectiveEndTime),
                };
            }
            return log;
        });

        const { logs: finalV3, count: nightFixCount } = processNightCorrection(v3AfterOT, config, policies);

        const { applyPregnancyNaturalization } = await import('../overtimeSimulator');
        const finalV3_with_Pregnancy = applyPregnancyNaturalization(finalV3, config);

        const pregFixCount = finalV3_with_Pregnancy.filter(l => l.note?.includes("[단축 보정]")).length;

        setData((prev: any) => {
            if (!prev) return null;
            return { ...prev, v3: finalV3_with_Pregnancy, final: finalV3_with_Pregnancy };
        });

        setActiveTab('ALL');
        setStickyViolationUserIds(null);

        let msg = "검수가 완료되었습니다.";
        if (otFixCount > 0) msg += `\n- 연장근로/랜덤화: ${otFixCount}건`;
        if (nightFixCount > 0) msg += `\n- 야간근무 자동확인: ${nightFixCount}건`;
        if (pregFixCount > 0) msg += `\n- 임산부 단축근로 보정: ${pregFixCount}건`;
        await showAlert(msg, { type: 'success' });

    } catch (error) {
        console.error(error);
        await showAlert('검수 작업 중 오류가 발생했습니다.', { type: 'error' });
    }
};

export const handleGlobalNightWorkCorrection = async ({
    data,
    config,
    policies,
    setData,
    showAlert
}: {
    data: any,
    config: GlobalConfig,
    policies: WorkPolicy[],
    setData: (val: any) => void,
    showAlert: (msg: string, options?: any) => void
}) => {
    if (!data?.v2) return;
    try {
        const { logs: updatedLogs, count } = processNightCorrection(data.v2, config, policies);
        if (count === 0) {
            await showAlert("추가로 확인 필요한 야간 근무가 없습니다.", { type: 'info' });
            return;
        }

        setData((prev: any) => prev ? { ...prev, v2: updatedLogs } : null);
        await showAlert(`${count}건의 야간 근무 작업이 일괄 확인되었습니다.`, { type: 'success' });
    } catch (e: any) {
        await showAlert(`오류 발생: ${e.message}`, { type: 'error' });
    }
};

export const handleApplyNaturalOvertime = async ({
    data,
    policies,
    config,
    tfUserIds,
    tfUserNames,
    setData,
    showAlert
}: {
    data: any,
    policies: WorkPolicy[],
    config: GlobalConfig,
    tfUserIds: Set<string>,
    tfUserNames: Set<string>,
    setData: (val: any) => void,
    showAlert: (msg: string, options?: any) => void
}) => {
    if (!data?.v2) return;
    try {
        const sourceLogs = JSON.parse(JSON.stringify(data.v3 || data.v2));
        const activeUserIds = new Set<string>();
        const validLogs = sourceLogs.filter((l: ProcessedWorkLog) => {
            const isTF = (l.employeeId && tfUserIds.has(l.employeeId)) || tfUserNames.has(l.userId);
            return !isTF;
        });
        validLogs.forEach((l: any) => activeUserIds.add(l.userId));

        const { applyNaturalOvertime } = await import('../overtimeSimulator');
        const newLogs = applyNaturalOvertime(sourceLogs, activeUserIds, policies, config);

        setData((prev: any) => {
            if (!prev) return null;
            return { ...prev, v3: newLogs };
        });

        await showAlert("포괄임금제 야근 적용이 완료되었습니다.", { type: 'success' });

    } catch (e: any) {
        console.error("Natural OT Application Failed", e);
        await showAlert(`적용 중 오류가 발생했습니다: ${e.message}`, { type: 'error' });
    }
};

export const handleTfAutoCorrection = async ({
    data,
    tfUserIds,
    tfUserNames,
    policies,
    config,
    setData,
    showAlert
}: {
    data: any,
    tfUserIds: Set<string>,
    tfUserNames: Set<string>,
    policies: WorkPolicy[],
    config: GlobalConfig,
    setData: (val: any) => void,
    showAlert: (msg: string, options?: any) => void
}) => {
    if (!data?.v2 || data.v2.length === 0) {
        await showAlert("처리할 데이터가 없습니다.", { type: 'info' });
        return;
    }

    const logs = data.v2;
    const monthGroups: Record<string, { maxDate: string, logs: ProcessedWorkLog[] }> = {};
    const allUserIds = new Set<string>();

    logs.forEach((log: any) => {
        const ym = log.date.substring(0, 7);
        if (!monthGroups[ym]) monthGroups[ym] = { maxDate: "", logs: [] };
        monthGroups[ym].logs.push(log);
        if (!monthGroups[ym].maxDate || log.date > monthGroups[ym].maxDate) {
            monthGroups[ym].maxDate = log.date;
        }
        allUserIds.add(log.userId);
    });

    const targetLWDs = new Set<string>();

    Object.keys(monthGroups).forEach(ym => {
        const [yearStr, monthStr] = ym.split('-');
        const year = parseInt(yearStr);
        const month = parseInt(monthStr);
        const maxDateInDataset = monthGroups[ym].maxDate;

        let checkDate = new Date(year, month, 0);
        while (checkDate.getMonth() === month - 1) {
            const day = checkDate.getDay();
            const isWeekend = day === 0 || day === 6;
            const isHoliday = HolidayUtils.isHoliday(checkDate);

            if (!isWeekend && !isHoliday) {
                const yS = checkDate.getFullYear();
                const mS = String(checkDate.getMonth() + 1).padStart(2, '0');
                const dS = String(checkDate.getDate()).padStart(2, '0');
                const lwd = `${yS}-${mS}-${dS}`;

                if (maxDateInDataset >= lwd) {
                    targetLWDs.add(lwd);
                }
                break;
            }
            checkDate.setDate(checkDate.getDate() - 1);
        }
    });

    if (targetLWDs.size === 0) {
        await showAlert("자동 연차를 적용할 '월 마지막 근무일'이 포함된 데이터가 아닙니다.", { type: 'info' });
        return;
    }

    let changedCount = 0;
    let injectedCount = 0;
    const newV2 = [...data.v2];

    const usersInDataset = new Set(newV2.map(l => l.userId));
    const tfUsersInDataset = new Set<string>();

    newV2.forEach(log => {
        const isTfId = log.employeeId && tfUserIds.has(log.employeeId);
        const isTfName = !log.employeeId && tfUserNames.has(log.userId?.trim());
        if (isTfId || isTfName) tfUsersInDataset.add(log.userId);
    });

    tfUsersInDataset.forEach(userId => {
        const userLogs = newV2.filter(l => l.userId === userId);
        const sampleLog = userLogs[0];
        if (!sampleLog) return;

        targetLWDs.forEach(lwd => {
            const existingLogIndex = newV2.findIndex(l => l.userId === userId && l.date === lwd);

            if (existingLogIndex >= 0) {
                const log = newV2[existingLogIndex];
                if (log.logStatus !== LogStatus.VACATION && log.logStatus !== LogStatus.RESIGNED && log.logStatus !== LogStatus.PRE_JOIN) {
                    newV2[existingLogIndex] = {
                        ...log,
                        startTime: 0,
                        endTime: 0,
                        totalDuration: 0,
                        breakDuration: 0,
                        actualWorkDuration: 0,
                        overtimeDuration: 0,
                        status: 'NORMAL',
                        logStatus: LogStatus.VACATION,
                        note: (log.note || "") + "[TF 자동 연차]",
                        rawStartTimeStr: '',
                        rawEndTimeStr: ''
                    };
                    changedCount++;
                }
            } else {
                injectedCount++;
                const newLog: ProcessedWorkLog = {
                    id: crypto.randomUUID(),
                    date: lwd,
                    userId: sampleLog.userId,
                    userName: sampleLog.userName,
                    employeeId: sampleLog.employeeId,
                    department: sampleLog.department,
                    startTime: 0,
                    endTime: 0,
                    rawStartTimeStr: '',
                    rawEndTimeStr: '',
                    totalDuration: 0,
                    breakDuration: 0,
                    actualWorkDuration: 0,
                    overtimeDuration: 0,
                    specialWorkMinutes: 0,
                    nightWorkDuration: 0,
                    restDuration: 0,
                    workType: 'BASIC',
                    isHoliday: false,
                    status: 'NORMAL',
                    logStatus: LogStatus.VACATION,
                    note: "[TF 자동 연차(생성)]"
                };
                newV2.push(newLog);
            }
        });
    });

    const finalV2 = newV2.map(log => {
        const isTfId = log.employeeId && tfUserIds.has(log.employeeId);
        const isTfName = !log.employeeId && tfUserNames.has(log.userId?.trim());
        if (!isTfId && !isTfName) return log;

        if (log.logStatus === LogStatus.VACATION) return log;

        if (
            log.logStatus === LogStatus.TRIP ||
            log.logStatus === LogStatus.EDUCATION ||
            log.logStatus === LogStatus.SICK
        ) return log;

        if (log.isExemptFromOvertime) return log;

        if (
            (log.actualWorkDuration || 0) === 0 &&
            (!log.logStatus || log.logStatus === LogStatus.NORMAL || log.logStatus === LogStatus.OTHER)
        ) {
            const date = new Date(log.date);
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            const isHoliday = HolidayUtils.isHoliday(date);
            if (isWeekend || isHoliday) return log;

            const effectivePolicy = PolicyUtils.getPolicyForDate(log.date, policies);
            const activeConfig = effectivePolicy ? PolicyUtils.toGlobalConfig(effectivePolicy) : config;

            const targetStart = TimeUtils.timeToMinutes(activeConfig.standardStartTime || "09:00");
            const targetEnd = TimeUtils.timeToMinutes(activeConfig.standardEndTime || "18:00");
            const seed = `${log.userId}-${log.date}`;
            const rsStr = generateSafeTimeString(targetStart - 10, targetStart + 5, seed + "start");
            const reStr = generateSafeTimeString(targetEnd, targetEnd + 20, seed + "end");

            const rsMin = TimeUtils.timeToMinutes(rsStr);
            const reMin = TimeUtils.timeToMinutes(reStr);
            const calc = calculateActualWork(rsMin, reMin, activeConfig);

            changedCount++;
            return {
                ...log,
                startTime: rsMin,
                endTime: reMin,
                rawStartTimeStr: rsStr,
                rawEndTimeStr: reStr,
                actualWorkDuration: calc.actualWork,
                totalDuration: calc.totalDuration,
                breakDuration: calc.breakDuration,
                overtimeDuration: Math.max(0, calc.actualWork - (8 * 60)),
                logStatus: LogStatus.NORMAL,
                note: (log.note || "") + "[TF 평일 자동채움]"
            };
        }
        return log;
    });

    setData((prev: any) => prev ? { ...prev, v2: finalV2 } : null);
    await showAlert(`전략인력 자동확인이 완료되었습니다.\n- 연차 전환/생성: ${changedCount + injectedCount}건\n- 평일 공란 채움 포함`, { type: 'success' });
};

export const handleUpdateLog = ({
    id,
    updates,
    data,
    policies,
    config,
    setData
}: {
    id: string,
    updates: Partial<ProcessedWorkLog>,
    data: any,
    policies: WorkPolicy[],
    config: GlobalConfig,
    setData: (val: any) => void
}) => {
    if (!data) return;

    const applyUpdates = (log: ProcessedWorkLog): ProcessedWorkLog => {
        const nextLog = { ...log, ...updates };

        const effectivePolicy = PolicyUtils.getPolicyForDate(nextLog.date, policies);
        const activeConfig = effectivePolicy ? PolicyUtils.toGlobalConfig(effectivePolicy) : config;

        if (updates.startTime !== undefined || updates.endTime !== undefined) {
            if (nextLog.workType === 'ELASTIC') {
                // [재량근무제 수동 업데이트]
                const targetStartStr = nextLog.targetStartTime || "09:00";
                const targetEndStr = nextLog.targetEndTime || "18:00";
                const targetStartMin = TimeUtils.timeToMinutes(targetStartStr);
                const targetEndMin = TimeUtils.timeToMinutes(targetEndStr);

                const tempConfig: GlobalConfig = {
                    ...activeConfig,
                    standardStartTime: targetStartStr,
                    standardEndTime: targetEndStr,
                    clockInCutoffTime: TimeUtils.minutesToColonFormat(targetStartMin - 14),
                    clockOutCutoffTime: TimeUtils.minutesToColonFormat(targetEndMin + 14),
                    lateClockInGraceMinutes: 0
                };

                const { actualWork, totalDuration, breakDuration } = calculateActualWork(
                    nextLog.startTime,
                    nextLog.endTime,
                    tempConfig
                );
                nextLog.actualWorkDuration = Math.round(actualWork / 30) * 30;
                nextLog.totalDuration = totalDuration;
                nextLog.breakDuration = breakDuration;
                nextLog.overtimeDuration = 0; // 연장 근무 면제
            } else if (nextLog.isExemptFromOvertime && nextLog.targetEndTime) {
                // [임산부 단축근로 수동 업데이트]
                const targetStartStr = nextLog.targetStartTime || "09:00";
                const targetEndStr = nextLog.targetEndTime || "18:00";
                const targetStartMin = TimeUtils.timeToMinutes(targetStartStr);
                const targetEndMin = TimeUtils.timeToMinutes(targetEndStr);

                const tempConfig: GlobalConfig = {
                    ...activeConfig,
                    standardStartTime: targetStartStr,
                    standardEndTime: targetEndStr,
                    clockInCutoffTime: TimeUtils.minutesToColonFormat(targetStartMin - 30),
                    clockOutCutoffTime: TimeUtils.minutesToColonFormat(targetEndMin + 30),
                };

                const { actualWork, totalDuration, breakDuration } = calculateActualWork(
                    nextLog.startTime,
                    nextLog.endTime,
                    tempConfig
                );
                nextLog.actualWorkDuration = Math.round(actualWork / 30) * 30;
                nextLog.totalDuration = totalDuration;
                nextLog.breakDuration = breakDuration;
                nextLog.overtimeDuration = 0; // 연장 근무 면제
            } else {
                // [일반 근태 수동 업데이트]
                const { actualWork, totalDuration, breakDuration, nightWorkDuration } = calculateActualWork(
                    nextLog.startTime,
                    nextLog.endTime,
                    activeConfig
                );
                nextLog.actualWorkDuration = actualWork;
                nextLog.totalDuration = totalDuration;
                nextLog.breakDuration = breakDuration;
                nextLog.nightWorkDuration = nightWorkDuration;
                nextLog.overtimeDuration = Math.max(0, actualWork - (8 * 60));
            }
        }
        return nextLog;
    };

    setData((prev: any) => {
        if (!prev) return null;
        const v2 = prev.v2.map((l: any) => l.id === id ? applyUpdates(l) : l);
        const v3 = prev.v3?.map((l: any) => l.id === id ? applyUpdates(l) : l);
        const final = prev.final.map((l: any) => l.id === id ? applyUpdates(l) : l);

        return { ...prev, v2, v3, final };
    });
};
