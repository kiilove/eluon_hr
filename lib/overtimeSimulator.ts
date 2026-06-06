import { ProcessedWorkLog, LogStatus, WorkPolicy, GlobalConfig } from "../types";
import { TimeUtils } from "./timeUtils";
import { calculateActualWork } from "./correctionUtils";
import { HolidayUtils } from "./holidayUtils";
import { PolicyUtils } from "./policyUtils";

/**
 * [포괄임금제 자연스러운 야근 시뮬레이션]
 * 
 * 목적:
 * - 포괄임금제(월 30시간 내외)를 반영하여, 시스템이 자동으로 "자연스러운 야근"을 생성함.
 * - 매주 전체 인원의 약 50%를 랜덤 선정하여 야근 부여.
 * - 주당 최대 5시간(300분)의 목표 야근 시간 할당.
 * - 출퇴근 시간은 18:00를 기준으로 산정하며, "퇴근 버퍼(18:30)" 이후 퇴근 시 연장근무로 인정.
 * 
 * 규칙:
 * 1. 주 단위(월~일) 그룹핑.
 * 2. 매주 재직 인원(Active User)의 50%를 랜덤 선정.
 * 3. 선정된 인원에게 주당 0~300분(5시간)의 목표 야근 시간 할당.
 * 4. 목표 시간을 주중(월~금) 근무일에 랜덤 분배.
 * 5. 생성된 퇴근 시간 = (Buffer End) + 할당된 시간.
 * 
 * @param logs 전체 근무 로그 (V3 단계)
 * @param activeUserIds 현재 활성 사용자 ID 집합
 * @param policies 근무 정책 리스트 (Dynamic Config)
 * @param globalConfig 전역 설정 (Fallback)
 * @returns 야근이 반영된 새로운 근무 로그 리스트
 */
export const applyPregnancyNaturalization = (
    logs: ProcessedWorkLog[],
    globalConfig: GlobalConfig
): ProcessedWorkLog[] => {
    console.log(`[ApplyNatural] Start Naturalizing Pregnancy logs. Total inputs: ${logs.length}`);
    let appliedCount = 0;

    return logs.map(log => {
        // [New Detection]
        // 1. Must be exempt from overtime (as set in applyNewPolicies for pregnant/discretionary)
        // 2. Must NOT be ELASTIC/discretionary (as they are already naturalized in Step 2)
        // 3. Must have a targetEndTime (the reduced work target)
        // 4. Optionally check note for safety but don't rely solely on it
        const isPregnancyReduced = log.isExemptFromOvertime &&
            log.workType !== 'ELASTIC' &&
            log.targetEndTime;

        if (!isPregnancyReduced) {
            return log;
        }

        // [Fix] Skip Weekends/Holidays for Pregnancy Naturalization
        const y = parseInt(log.date.substring(0, 4));
        const m = parseInt(log.date.substring(5, 7)) - 1;
        const d = parseInt(log.date.substring(8, 10));
        const dateObj = new Date(y, m, d);

        const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
        const isHoliday = HolidayUtils.isHoliday(dateObj);

        if (isWeekend || isHoliday) {
            return log;
        }

        // 1. Parse Targets
        const targetStartMin = TimeUtils.timeToMinutes(log.targetStartTime || "09:00");
        const targetEndMin = TimeUtils.timeToMinutes(log.targetEndTime || "18:00");

        // 2. Generate Natural Times
        // Buffer: 14 min (Target - 14 ~ Target - 1 for Start, Target + 1 ~ Target + 14 for End)
        const seed = `${log.userId}-${log.date}-preg`;

        // Use random values for minute fuzzing
        const startFuzz = Math.floor(Math.random() * 14) + 1;
        const endFuzz = Math.floor(Math.random() * 14) + 1;

        const newStartMin = targetStartMin - startFuzz;
        const newEndMin = targetEndMin + endFuzz;

        // 3. Random Seconds
        const startSec = Math.floor(Math.random() * 59) + 1;
        const endSec = Math.floor(Math.random() * 59) + 1;

        // 4. Construct Strings
        const startParts = TimeUtils.minutesToTime(newStartMin).split(':');
        const endParts = TimeUtils.minutesToTime(newEndMin).split(':');

        const rawStartStr = `${startParts[0]}:${startParts[1]}:${String(startSec).padStart(2, '0')}`;
        const rawEndStr = `${endParts[0]}:${endParts[1]}:${String(endSec).padStart(2, '0')}`;

        // 5. Recalculate Work
        const tempConfig: GlobalConfig = {
            ...globalConfig,
            standardStartTime: log.targetStartTime || "09:00",
            standardEndTime: log.targetEndTime || "18:00",
            clockInCutoffTime: TimeUtils.minutesToTime(targetStartMin - 30),
            clockOutCutoffTime: TimeUtils.minutesToTime(targetEndMin + 30),
        };

        const calc = calculateActualWork(newStartMin, newEndMin, tempConfig);

        appliedCount++;

        return {
            ...log,
            // Update Snap Times (Forces correction to target)
            startTime: calc.snappedStart,
            endTime: calc.snappedEnd,

            // Update Raw Simulated Times
            rawStartTimeStr: rawStartStr,
            rawEndTimeStr: rawEndStr,

            // Update Calculated Sums
            totalDuration: calc.totalDuration,
            breakDuration: calc.breakDuration,
            actualWorkDuration: Math.round(calc.actualWork / 30) * 30,

            // Ensure exempt
            overtimeDuration: 0,
            specialWorkMinutes: 0,

            // Visual feedback
            correctionMemo: (log.correctionMemo || "") + (log.correctionMemo?.includes("[자연주의]") ? "" : " [자연주의]"),
            note: (log.note || "") + (log.note?.includes("[단축 보정]") ? "" : " [단축 보정]")
        };
    });
};

export const applyNaturalOvertime = (
    logs: ProcessedWorkLog[],
    activeUserIds: Set<string>,
    policies: WorkPolicy[],
    globalConfig: GlobalConfig
): ProcessedWorkLog[] => {
    // 1. 로그 복제 (Deep Copy)
    const resultLogs = logs.map(log => ({ ...log }));

    // 2. 주 단위 그룹핑 (Week Key: YYYY-MM-DD of Monday)
    const weekGroups: Record<string, ProcessedWorkLog[]> = {};

    resultLogs.forEach(log => {
        const d = new Date(log.date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
        const monday = new Date(d.setDate(diff));
        const mondayStr = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;

        if (!weekGroups[mondayStr]) weekGroups[mondayStr] = [];
        weekGroups[mondayStr].push(log);
    });

    const sortedMondays = Object.keys(weekGroups).sort();

    // 3. 주차별 처리 루프
    sortedMondays.forEach(mondayStr => {
        // 현재 주차의 활성 사용자 추출 (해당 주차에 로그가 있는 사람만 대상)
        const weeklyUsers = new Set<string>();
        weekGroups[mondayStr].forEach(l => {
            // [Fix] TF(activeUserIds에서 필터링됨), 재량근무, 임산부 등 제외
            if (activeUserIds.has(l.userId) && !l.isExemptFromOvertime && l.workType === 'BASIC') {
                weeklyUsers.add(l.userId);
            }
        });

        const candidates = Array.from(weeklyUsers);
        // [규칙] 50% 인원 랜덤 선정
        const targetCount = Math.ceil(candidates.length * 0.5);

        // Fisher-Yates Shuffle로 랜덤 섞기
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }

        const selectedUsers = candidates.slice(0, targetCount);

        // 4. 선정된 인원에게 야근 부여
        selectedUsers.forEach(userId => {
            // [규칙] 주당 최대 5시간 (300분) 이내 랜덤 목표 설정
            // 최소 60분 ~ 최대 300분 사이로 설정하여 "유의미한" 야근 생성
            const weeklyTargetMinutes = Math.floor(Math.random() * (300 - 60 + 1)) + 60;

            // 분배할 잔여 시간
            let remainingMinutes = weeklyTargetMinutes;

            // 해당 주차의 이 유저의 근무일(평일) 찾기
            const userWeekLogs = weekGroups[mondayStr].filter(l =>
                l.userId === userId &&
                l.logStatus === LogStatus.NORMAL && // 정상 근무일만
                !l.isExemptFromOvertime && // [Fix] 예외 대상 제외
                l.workType === 'BASIC' &&
                (new Date(l.date).getDay() >= 1 && new Date(l.date).getDay() <= 5) // 월~금
            );

            // 해당 인원의 기존 야근 시간 계산 (초기값)
            let accumulatedWeeklyOT = userWeekLogs.reduce((acc, l) => acc + (l.overtimeDuration || 0), 0);
            if (accumulatedWeeklyOT > 120) return; // 이미 2시간 이상 야근이면 자동 부여 제외

            // 분배 대상 날짜 섞기
            const targetLogs = [...userWeekLogs];
            for (let i = targetLogs.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [targetLogs[i], targetLogs[j]] = [targetLogs[j], targetLogs[i]];
            }

            targetLogs.forEach((log) => {
                // Get Effective Policies for Dynamic Time Buffer
                const effectivePolicy = PolicyUtils.getPolicyForDate(log.date, policies);
                const activeConfig = effectivePolicy ? PolicyUtils.toGlobalConfig(effectivePolicy) : globalConfig;

                // [Dynamic Config] Use policy's End Time and Buffer
                const stdEndMin = TimeUtils.timeToMinutes(activeConfig.standardEndTime || "18:00");
                const endLimitMin = TimeUtils.timeToMinutes(activeConfig.clockOutCutoffTime || "18:30"); // e.g. 18:30 (Buffer End)

                // 주당 최대 5시간(300분) 엄격 제한 체크
                if (accumulatedWeeklyOT >= 300) return;
                if (remainingMinutes <= 0) return;

                // 이번 날짜에 할당할 시간
                let maxDaily = Math.min(remainingMinutes, 120);

                // (300 - 현재누적)과도 비교하여 주당 캡 초과 방지
                maxDaily = Math.min(maxDaily, 300 - accumulatedWeeklyOT);

                if (maxDaily < 60) return; // 최소 1시간 이상

                // [Step] 30m Discrete Allocation - User Request "1h, 2h..."
                const steps = [];
                for (let m = 60; m <= maxDaily; m += 30) {
                    steps.push(m);
                }
                if (steps.length === 0) return;

                const dailyAlloc = steps[Math.floor(Math.random() * steps.length)];

                // 최종 할당량이 주당 캡을 넘지 않는지 한 번 더 확인
                if (accumulatedWeeklyOT + dailyAlloc > 300) return;

                // 5. 시간 적용
                // 퇴근 시간 = (Buffer End Time) + (Allocated OT) + (2~10m Fuzzing)
                // e.g. 18:30 + 1h + 7m = 19:37.
                const fuzzingMinutes = Math.floor(Math.random() * (10 - 2 + 1)) + 2;
                const newEndMin = endLimitMin + dailyAlloc + fuzzingMinutes;

                // 기존 퇴근시간보다 늦을 때만 적용 (Overwrite only if near standard end)
                // If they already worked until 21:00, we don't reduce it.
                if (log.endTime <= endLimitMin + 20) {
                    // Update Log
                    log.endTime = newEndMin;

                    // [Fix] 초 단위 랜덤화 (Natural Fuzzing)
                    const randomSeconds = Math.floor(Math.random() * 60);
                    const timeStr = TimeUtils.minutesToColonFormat(newEndMin); // HH:mm:00
                    const parts = timeStr.split(':');
                    log.rawEndTimeStr = `${parts[0]}:${parts[1]}:${String(randomSeconds).padStart(2, '0')}`;

                    // 재계산 (Use activeConfig)
                    // calculateActualWork inside uses config.clockOutCutoffTime (endLimitMin) to determine overtime.
                    const { snappedStart, snappedEnd, actualWork, totalDuration, breakDuration, overtimeDuration, effectiveEndTime } = calculateActualWork(log.startTime, log.endTime, activeConfig);

                    log.totalDuration = totalDuration;
                    log.breakDuration = breakDuration; // Includes buffer deduction
                    log.actualWorkDuration = actualWork;

                    // [Fix] Update UI Display Snap Targets
                    log.targetStartTime = TimeUtils.minutesToTime(snappedStart);
                    log.targetEndTime = TimeUtils.minutesToTime(effectiveEndTime);

                    // Use the Correctly Calculated Overtime from Utility (Dynamic!)
                    log.overtimeDuration = overtimeDuration;

                    // 누적 업데이트
                    accumulatedWeeklyOT += dailyAlloc;
                    remainingMinutes -= dailyAlloc;

                    // 메모 추가
                    const label = "[포괄임금]";
                    if (!log.correctionMemo?.includes(label)) {
                        log.correctionMemo = (log.correctionMemo || "") + label;
                    }
                }
            });
        });
    });

    // [New] Apply Naturalization for Pregnancy Reduced Hours
    // This runs AFTER the overtime allocation to ensure pregnant employees (who are skipped above) get processed.
    const finalLogs = applyPregnancyNaturalization(resultLogs, globalConfig);

    return finalLogs;
};
