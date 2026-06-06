
import { ProcessedWorkLog, LogStatus } from "../../types";

export const createV4State = async ({
    sourceLogs,
    tfUserIds,
    tfUserNames
}: {
    sourceLogs: ProcessedWorkLog[],
    tfUserIds: Set<string>,
    tfUserNames: Set<string>
}) => {
    // 1. Fetch Active Employees from Roster (직원 명부 확인)
    let activeEmployeeIds = new Set<string>();
    try {
        const userStr = localStorage.getItem('user');
        const companyId = userStr ? JSON.parse(userStr).company_id : null;
        if (companyId) {
            const empRes = await fetch(`/api/employees?t=${Date.now()}&companyId=${companyId}`, { cache: 'no-store' });
            const allEmployees = await empRes.json() as any[];

            // Get IDs of ACTIVE employees (재직 직원)
            const activeEmps = allEmployees.filter((e: any) => e.current_status === 'ACTIVE');
            activeEmployeeIds = new Set(activeEmps.map((e: any) => e.id));
        }
    } catch (err) {
        console.error("[V4 Filter] Failed to fetch active employees:", err);
    }

    // 2. Identify "Active Users" for V4
    const activeUserIds = new Set<string>();
    sourceLogs.forEach(log => {
        const isActiveEmployee = log.employeeId && activeEmployeeIds.has(log.employeeId);
        const hasWork = (log.actualWorkDuration || 0) > 0;
        const isOther = log.logStatus === LogStatus.OTHER;
        const isTF = (log.employeeId && tfUserIds.has(log.employeeId)) || (!log.employeeId && tfUserNames.has(log.userId));

        // [PRIORITY] 재직 직원은 무조건 포함
        if (isActiveEmployee || hasWork || isOther || isTF) {
            activeUserIds.add(log.userId);
        }
    });

    // 3. Create V4: Keep ALL logs for Active Users (including Holidays/Vacations)
    let v4Logs = sourceLogs
        .filter(log => activeUserIds.has(log.userId))
        .map(log => ({ ...log }));

    v4Logs.sort((a, b) => a.userName.localeCompare(b.userName) || a.date.localeCompare(b.date));
    return v4Logs;
};

export const handleMoveToStep4 = async ({
    data,
    tfUserIds,
    tfUserNames,
    setData,
    setStep
}: {
    data: any,
    tfUserIds: Set<string>,
    tfUserNames: Set<string>,
    setData: (val: any) => void,
    setStep: (val: any) => void
}) => {
    if (!data) return;
    const sourceLogs = data.v3 || data.v2;
    console.log("MoveToStep4: Source Logs Count:", sourceLogs.length);

    const v4Logs = await createV4State({ sourceLogs, tfUserIds, tfUserNames });

    console.log("MoveToStep4: V4 Logs Created:", v4Logs.length);

    // Update State (Force Replace V4)
    setData((prev: any) => {
        if (!prev) return null;
        return {
            ...prev,
            v4: undefined
        };
    });

    setTimeout(() => {
        setData((prev: any) => {
            if (!prev) return null;
            return { ...prev, v4: v4Logs };
        });
        setStep(4);
    }, 0);
};
