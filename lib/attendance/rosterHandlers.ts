
export const refreshEmployees = async ({
    setTfUserNames,
    setTfUserIds,
    setEmployeeCount
}: {
    setTfUserNames: (val: Set<string>) => void;
    setTfUserIds: (val: Set<string>) => void;
    setEmployeeCount: (val: number | null) => void;
}) => {
    try {
        const userStr = localStorage.getItem('user');
        const userObj = userStr ? JSON.parse(userStr) : null;
        const companyId = userObj?.company_id;

        if (!companyId) {
            console.warn("[AttendancePage] No company ID found.");
            return;
        }

        const res = await fetch(`/api/employees?t=${Date.now()}&companyId=${companyId}`, { cache: 'no-store' });
        if (!res.ok) {
            console.error("[AttendancePage] Failed to fetch employees:", res.status, res.statusText);
            return;
        }

        const data = await res.json();
        if (Array.isArray(data)) {
            const tfNames = new Set(data.filter((e: any) => e.is_TF).map((e: any) => e.name));
            const tfIds = new Set(data.filter((e: any) => e.is_TF).map((e: any) => e.id));
            setTfUserNames(tfNames);
            setTfUserIds(tfIds);
            setEmployeeCount(data.length);
            console.log(`[AttendancePage] Loaded ${tfIds.size} TF Users. Total Employees: ${data.length}`);
        } else {
            console.warn("[AttendancePage] Expected array but got:", data);
            setEmployeeCount(0);
        }
    } catch (err) {
        console.warn("Failed to fetch employees", err);
    }
};

export const handleResyncRoster = async ({
    setHasCheckedMissing,
    showAlert
}: {
    setHasCheckedMissing: (val: boolean) => void;
    showAlert: (msg: string, options?: any) => void;
}) => {
    setHasCheckedMissing(false);
    setTimeout(() => {
        showAlert("직원 명부 재동기화 및 ID 보정 작업을 시작합니다. 완료되면 알림이 표시됩니다.", { type: 'info' });
    }, 500);
};
