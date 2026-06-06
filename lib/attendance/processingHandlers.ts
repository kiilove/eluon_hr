
import { format } from 'date-fns';
import { ProcessedWorkLog, LogStatus, GlobalConfig, WorkPolicy } from "../../types";
import { HolidayUtils } from "../../lib/holidayUtils";
import { PolicyUtils } from "../../lib/policyUtils";
import { WorkHourCalculator } from "../../lib/workHourCalculator";
import { TimeUtils } from "../../lib/timeUtils";
import { applyNewPolicies } from "../../lib/correctionUtils";

export const initFromUpload = async ({
    location,
    policies,
    config,
    tfUserIds,
    tfUserNames,
    setTfUserNames,
    setTfUserIds,
    setData,
    setStep
}: {
    location: any;
    policies: WorkPolicy[];
    config: GlobalConfig;
    tfUserIds: Set<string>;
    tfUserNames: Set<string>;
    setTfUserNames: (val: Set<string>) => void;
    setTfUserIds: (val: Set<string>) => void;
    setData: (val: any) => void;
    setStep: (val: any) => void;
}) => {
    try {
        const rawData = location.state.initialData;

        // [New] Dynamic Holiday Fetching
        const userStr = localStorage.getItem('user');
        const userObj = userStr ? JSON.parse(userStr) : null;
        const companyId = userObj?.company_id;

        if (rawData.length > 0) {
            const years = [...new Set(rawData.map((r: any) => new Date(r.date).getFullYear()))] as number[];
            for (const y of years) {
                if (y && !isNaN(y) && companyId) await HolidayUtils.init(y, companyId);
            }
        }

        const v1Logs: ProcessedWorkLog[] = rawData.map((raw: any) => {
            const effectivePolicy = PolicyUtils.getPolicyForDate(raw.date, policies);
            const activeConfig = effectivePolicy ? PolicyUtils.toGlobalConfig(effectivePolicy) : config;

            return WorkHourCalculator.processDailyLog(raw, {
                ...activeConfig,
                disableSnap: true
            });
        }).filter((l: any) =>
            l.actualWorkDuration > 0 ||
            [LogStatus.VACATION, LogStatus.TRIP, LogStatus.EDUCATION, LogStatus.OTHER, LogStatus.SICK].includes(l.logStatus)
        );

        let v1WithPolicies = v1Logs;

        setData((prev: any) => ({
            raw: rawData,
            v1: v1WithPolicies,
            v2: JSON.parse(JSON.stringify(v1WithPolicies)),
            v3: undefined,
            v4: undefined,
            final: []
        }));
        setStep(2);
    } catch (e) {
        console.error("Failed to init data", e);
    }
};

export const handleLoadExisting = async ({
    start,
    end,
    showAlert,
    setData,
    setStep,
    setIsDirectEdit
}: {
    start: Date;
    end: Date;
    showAlert: (msg: string, options?: any) => void;
    setData: (val: any) => void;
    setStep: (val: any) => void;
    setIsDirectEdit: (val: boolean) => void;
}) => {
    const userStr = localStorage.getItem('user');
    const userObj = userStr ? JSON.parse(userStr) : null;
    if (!userObj?.company_id) return;

    try {
        const sDate = format(start, 'yyyy-MM-dd');
        const eDate = format(end, 'yyyy-MM-dd');

        const res = await fetch(`/api/attendance/logs?startDate=${sDate}&endDate=${eDate}&companyId=${userObj.company_id}`);
        const result = await res.json() as any;

        if (!result.success) throw new Error(result.message);

        let loadedLogs: any[] = result.manualLogs || result.logs || [];

        if (loadedLogs.length === 0 && result.specialLogs) {
            loadedLogs = result.specialLogs;
        }

        if (loadedLogs.length === 0) {
            await showAlert("해당 기간의 데이터가 없습니다.", { type: 'info' });
            return;
        }

        const v2Logs: ProcessedWorkLog[] = loadedLogs.map((l: any) => ({
            ...l,
            startTime: Number(l.startTime || 0),
            endTime: Number(l.endTime || 0),
            actualWorkDuration: Number(l.actualWorkDuration || 0),
            totalDuration: Number(l.totalDuration || 0),
            breakDuration: Number(l.breakDuration || 0),
            overtimeDuration: Number(l.overtimeDuration || 0),
            nightWorkDuration: Number(l.nightWorkDuration || 0),
            specialWorkMinutes: Number(l.specialWorkMinutes || 0),
        }));

        setData({
            raw: [],
            v1: [],
            v2: v2Logs,
            v3: undefined,
            v4: undefined,
            final: []
        });
        setStep(2);
        setIsDirectEdit(true);
        await showAlert(`${v2Logs.length}건의 데이터를 불러왔습니다. 수정 모드로 진입합니다.`, { type: 'info' });
    } catch (err: any) {
        await showAlert(`데이터 로드 중 오류: ${err.message}`, { type: 'error' });
    }
};
