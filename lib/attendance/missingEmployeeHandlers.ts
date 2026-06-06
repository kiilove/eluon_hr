
import { ProcessedWorkLog, LogStatus, GlobalConfig, WorkPolicy } from "../../types";
import { TimeUtils } from "../../lib/timeUtils";
import { PolicyUtils } from "../../lib/policyUtils";
import { EmployeeDateValidator } from "../../lib/employeeDateValidator";
import { calculateActualWork, generateSafeTimeString, applyNewPolicies } from "../../lib/correctionUtils";

export const checkMissing = async ({
    data,
    policies,
    config,
    setData,
    setTfUserIds,
    setTfUserNames,
    setHasCheckedMissing,
    showAlert
}: {
    data: any,
    policies: WorkPolicy[],
    config: GlobalConfig,
    setData: (val: any) => void,
    setTfUserIds: (val: Set<string>) => void,
    setTfUserNames: (val: Set<string>) => void,
    setHasCheckedMissing: (val: boolean) => void,
    showAlert: (msg: string, options?: any) => void
}) => {
    try {
        setHasCheckedMissing(true);

        const userStr = localStorage.getItem('user');
        const companyId = userStr ? JSON.parse(userStr).company_id : null;
        if (!companyId) return;

        const normalizeName = (n: string) => (n || "").replace(/\s+/g, '').toLowerCase().trim();

        const empRes = await fetch(`/api/employees?t=${Date.now()}&companyId=${companyId}`, { cache: 'no-store' });
        const allEmployees = await empRes.json() as any[];

        const rosterEmployees = allEmployees;

        const logs = data.v2;
        const dates = logs.map((l: any) => l.date).sort();
        if (dates.length === 0) return;

        const startDateStr = dates[0];
        const endDateStr = dates[dates.length - 1];
        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);

        const wageSetsRes = await fetch(`/api/hourly-wages?companyId=${companyId}`);
        const wageSetsData = await wageSetsRes.json() as any;
        const wageSets = wageSetsData.data || [];

        let targetWageEmployeeIds = new Set<string>();
        if (wageSets.length > 0) {
            const sortedSets = [...wageSets].sort((a, b) => b.effective_date.localeCompare(a.effective_date));
            const targetSet = sortedSets.find(s => s.effective_date <= endDateStr) || sortedSets[0];

            if (targetSet) {
                const detailRes = await fetch(`/api/hourly-wages/details?id=${targetSet.id}`);
                const detailData = await detailRes.json() as any;
                const items = detailData.data?.items || [];
                targetWageEmployeeIds = new Set(items.map((i: any) => i.employee_id));
                console.log(`[직원명부 우선] 시급 대상자 확인: ${targetWageEmployeeIds.size}명 (Set: ${targetSet.effective_date})`);
            }
        }

        const periodActiveEmployees = rosterEmployees.filter((e: any) => {
            const isActive = e.current_status === 'ACTIVE' && EmployeeDateValidator.isActiveInRange(startDateStr, endDateStr, e);
            const isTarget = targetWageEmployeeIds.has(e.id) || e.is_TF;
            return isActive && isTarget;
        });

        console.log(`[직원명부 우선] 기간내 재직 직원: ${periodActiveEmployees.length}명 (전체: ${rosterEmployees.length}명)`);

        // 3. [ID Healing & Policy Application]
        const nameMap = new Map<string, any[]>();
        rosterEmployees.forEach(e => {
            const kn = normalizeName(e.name);
            if (!nameMap.has(kn)) nameMap.set(kn, []);
            nameMap.get(kn)?.push(e);
        });

        let healedCount = 0;
        const currentV2 = data.v2;

        // A. Apply 사번(employeeId) 보합 (ID Healing)
        const healedV2 = currentV2.map((log: any) => {
            if (!log.employeeId) {
                const matched = nameMap.get(normalizeName(log.userName));
                if (matched && matched.length === 1) {
                    healedCount++;
                    return { ...log, employeeId: matched[0].id };
                }
            }
            return log;
        });

        // B. Apply Policies (Discretionary/Pregnancy) - Step 2 Automation
        let finalizedV2 = healedV2;
        try {
            const firstDate = healedV2[0]?.date;
            const effectivePolicy = firstDate ? PolicyUtils.getPolicyForDate(firstDate, policies) : null;
            const activeConfig = effectivePolicy ? PolicyUtils.toGlobalConfig(effectivePolicy) : config;

            finalizedV2 = applyNewPolicies(healedV2, rosterEmployees, activeConfig);
            console.log("[Step 2] Applied New Policies (Discretionary/Pregnancy) to V2");
        } catch (err) {
            console.error("[Step 2] Policy application failed:", err);
        }

        // C. [Validation Sweep] Deletion of unknown personnel & Joiner/Leaver Validation
        let unknownDeletedCount = 0;
        const rosterIds = new Set(rosterEmployees.map(e => e.id));

        let validatedV2 = finalizedV2.filter((log: any) => {
            // 1. Roster existence check
            const hasId = log.employeeId && rosterIds.has(log.employeeId);
            const hasName = nameMap.has(normalizeName(log.userName));

            if (!hasId && !hasName) {
                console.log(`[Step 2] Deleting log for unknown person: ${log.userName}`);
                unknownDeletedCount++;
                return false;
            }

            // 2. Joiner/Leaver Validation (for matched employees)
            const emp = log.employeeId ? rosterEmployees.find(e => e.id === log.employeeId) : rosterEmployees.find(e => normalizeName(e.name) === normalizeName(log.userName));
            if (!emp) return true;

            const validation = EmployeeDateValidator.isValidLogDate(log.date, emp);
            if (!validation.isValid) {
                console.log(`[Step 2] Removing invalid log for ${log.userName} on ${log.date}: ${validation.reason}`);
                return false;
            }

            if (validation.suggestedStatus === 'RESIGNED' && log.logStatus !== LogStatus.RESIGNED) {
                log.logStatus = LogStatus.RESIGNED;
                log.note = (log.note ? log.note + ", " : "") + "[직원명부: 퇴사 확인됨]";
                log.startTime = 0;
                log.endTime = 0;
                log.actualWorkDuration = 0;
                log.totalDuration = 0;
                log.overtimeDuration = 0;
            }
            return true;
        });

        // D. Track Joiners/Resigners in Period
        const joiners = periodActiveEmployees.filter((e: any) => e.join_date && e.join_date >= startDateStr && e.join_date <= endDateStr);
        const resigners = rosterEmployees.filter((e: any) => e.resignation_date && e.resignation_date >= startDateStr && e.resignation_date <= endDateStr);

        console.log(`[Step 2] Joiners: ${joiners.length}, Resigners: ${resigners.length}`);

        // We will update the state once at the end.

        const activeLogs = validatedV2;

        setTfUserIds(new Set(periodActiveEmployees.filter((e: any) => e.is_TF).map((e: any) => e.id)));
        setTfUserNames(new Set(periodActiveEmployees.filter((e: any) => e.is_TF).map((e: any) => e.name)));

        // 4. Identify Missing Employees (누락 직원 찾기)
        const uploadedUserIds = new Set(activeLogs.map((l: any) => l.userId));
        const uploadedEmployeeIds = new Set(activeLogs.filter((l: any) => l.employeeId).map((l: any) => l.employeeId));
        const uploadedUserNamesNormalized = new Set(activeLogs.map((l: any) => normalizeName(l.userName)));

        const missing = periodActiveEmployees.filter((e: any) => {
            const hasIdMatch = uploadedUserIds.has(e.id) || uploadedEmployeeIds.has(e.id);
            const hasNameMatch = uploadedUserNamesNormalized.has(normalizeName(e.name));
            return !hasIdMatch && !hasNameMatch;
        });

        console.log(`[Step 2] 엑셀에 누락된 기간내 재직 직원: ${missing.length}명`, missing.map(e => e.name));

        const newLogs: ProcessedWorkLog[] = [];
        let generatedCount = 0;
        let tfGeneratedCount = 0;

        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const day = d.getDay();
            const isWeekend = day === 0 || day === 6;
            const dateStr = TimeUtils.toDateString(d);

            missing.forEach((emp: any) => {
                const validation = EmployeeDateValidator.isValidLogDate(dateStr, emp);
                if (!validation.isValid) return;

                const isTF = emp.is_TF || false;
                const isResigned = validation.suggestedStatus === 'RESIGNED';

                let logStatus = isWeekend ? LogStatus.REST : (isResigned ? LogStatus.RESIGNED : (isTF ? LogStatus.NORMAL : LogStatus.VACATION));
                let startTime = 0, endTime = 0, rawStartTimeStr = '', rawEndTimeStr = '';
                let actualWorkDuration = 0, totalDuration = 0, breakDuration = 0, overtimeDuration = 0;

                if (isTF && !isWeekend && !isResigned) {
                    const effectivePolicy = PolicyUtils.getPolicyForDate(dateStr, policies);
                    const activeConfig = effectivePolicy ? PolicyUtils.toGlobalConfig(effectivePolicy) : config;

                    const targetStart = TimeUtils.timeToMinutes(activeConfig.standardStartTime || "09:00");
                    const targetEnd = TimeUtils.timeToMinutes(activeConfig.standardEndTime || "18:00");

                    const seed = `${emp.id}-${dateStr}`;
                    rawStartTimeStr = generateSafeTimeString(targetStart - 10, targetStart + 5, seed + "start");
                    rawEndTimeStr = generateSafeTimeString(targetEnd, targetEnd + 20, seed + "end");

                    const startMin = TimeUtils.timeToMinutes(rawStartTimeStr.substring(0, 5));
                    const endMin = TimeUtils.timeToMinutes(rawEndTimeStr.substring(0, 5));
                    const calc = calculateActualWork(startMin, endMin, activeConfig);

                    startTime = startMin;
                    endTime = endMin;
                    actualWorkDuration = calc.actualWork;
                    totalDuration = calc.totalDuration;
                    breakDuration = calc.breakDuration;
                    overtimeDuration = Math.max(0, calc.actualWork - (8 * 60));
                    tfGeneratedCount++;
                }

                newLogs.push({
                    id: `roster-priority-${emp.id}-${dateStr}`,
                    userId: emp.id,
                    userName: emp.name,
                    employeeId: emp.id,
                    department: emp.department,
                    userTitle: emp.title,
                    date: dateStr,
                    startTime, endTime, rawStartTimeStr, rawEndTimeStr,
                    totalDuration, breakDuration, actualWorkDuration, overtimeDuration,
                    specialWorkMinutes: 0, nightWorkDuration: 0, restDuration: 0,
                    workType: 'BASIC', isHoliday: false, status: 'NORMAL',
                    logStatus,
                    note: isResigned ? '[직원명부: 퇴사 확인됨]' : (isTF ? '[전략인력 자동생성 - 엑셀 미제출]' : '[직원명부 기준 자동생성 - 엑셀 미제출]')
                } as ProcessedWorkLog);
                generatedCount++;
            });
        }

        // Final State Update (Consolidated)
        setData((prev: any) => {
            if (!prev) return null;
            const combinedV2 = [...validatedV2, ...newLogs].sort((a, b) => a.date.localeCompare(b.date) || a.userName.localeCompare(b.userName));

            // Also filter V3 if exists
            let filteredV3 = prev.v3;
            if (filteredV3) {
                filteredV3 = filteredV3.filter((l: any) => {
                    const hasId = l.employeeId && rosterIds.has(l.employeeId);
                    const hasName = nameMap.has(normalizeName(l.userName));
                    if (!hasId && !hasName) return false;

                    const emp = l.employeeId ? rosterEmployees.find(e => e.id === l.employeeId) : rosterEmployees.find(e => normalizeName(e.name) === normalizeName(l.userName));
                    if (!emp) return true;
                    const validation = EmployeeDateValidator.isValidLogDate(l.date, emp);
                    return validation.isValid;
                });
            }

            return {
                ...prev,
                v1: [...prev.v1, ...newLogs],
                v2: combinedV2,
                v3: filteredV3
            };
        });

        let summary = `[스텝 2: 데이터 정제 완료]`;
        if (healedCount > 0) summary += `\n- ID 보정(성명 매칭): ${healedCount}건`;
        if (unknownDeletedCount > 0) summary += `\n- 외부 인원 로그 삭제(명부 없음): ${unknownDeletedCount}건`;
        if (tfGeneratedCount > 0) summary += `\n- 전략인력 가상근무 생성: ${tfGeneratedCount}건`;
        if (generatedCount - tfGeneratedCount > 0) summary += `\n- 누락 재직자 휴가 처리: ${generatedCount - tfGeneratedCount}건`;
        if (joiners.length > 0) summary += `\n- 기간 내 입사자: ${joiners.length}명 (${joiners.map(j => j.name).join(', ')})`;
        if (resigners.length > 0) summary += `\n- 기간 내 퇴사자: ${resigners.length}명 (${resigners.map(r => r.name).join(', ')})`;

        await showAlert(summary, { type: 'success' });

    } catch (e) {
        console.error("[Step 2] Automation failed", e);
    }
};
