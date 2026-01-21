
import { TimeRecord, CleansingSettings, WeeklySummary, WeekStat } from '../types';
import * as XLSX from 'xlsx';
import { HolidayUtils } from '../lib/holidayUtils';

// Helper: HH:mm to minutes from midnight
const timeToMinutes = (time: string): number => {
    if (!time || time === '-') return 0;
    const [h, m] = time.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
};

// Helper: minutes to HH:mm
const minutesToTime = (minutes: number): string => {
    const h = Math.floor(minutes / 60);
    const m = Math.floor(minutes % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

// Helper: Parse Excel Serial Date or Time String
const parseExcelTime = (value: any): string => {
    if (!value) return "00:00";

    // Case 1: Excel Serial Number (e.g., 0.375 for 09:00)
    if (typeof value === 'number') {
        let fraction = value % 1;
        if (fraction === 0 && value > 0) fraction = 0;

        const totalSeconds = Math.round(fraction * 86400);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    // Case 2: String "HH:mm:ss" or "HH:mm"
    if (typeof value === 'string') {
        const cleanStr = value.replace(/[^\d:]/g, '');
        const parts = cleanStr.split(':');
        if (parts.length >= 2) {
            return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
        }
    }

    return "00:00";
};

// Helper: Get ISO Week Number
const getWeekNumber = (d: Date): number => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

export const parseExcel = async (file: File): Promise<TimeRecord[]> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];

                const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

                if (jsonData.length < 3) {
                    reject(new Error("파일 형식이 올바르지 않습니다 (데이터 행 부족)."));
                    return;
                }

                // --- 1. Dynamic Row Detection ---
                // Scan top 20 rows to find the "Date Row"
                let dateRowIndex = -1;
                for (let i = 0; i < Math.min(jsonData.length, 20); i++) {
                    const row = jsonData[i];
                    if (!row || row.length === 0) continue;

                    const hasDate = row.some(cell => {
                        if (!cell) return false;
                        const s = String(cell);
                        return /20[2-3][0-9]|20[2-3][0-9]-[0-1][0-9]/.test(s) || (s.includes('월') && s.includes('일'));
                    });

                    if (hasDate) {
                        dateRowIndex = i;
                        break;
                    }
                }

                if (dateRowIndex === -1) {
                    reject(new Error("날짜가 포함된 헤더 행을 찾을 수 없습니다. (예: 2024-01-01 또는 1월 1일)"));
                    return;
                }

                const headerRowIndex = dateRowIndex + 1;
                const dataStartIndex = headerRowIndex + 1;

                if (jsonData.length <= dataStartIndex) {
                    reject(new Error("데이터 행이 존재하지 않습니다."));
                    return;
                }

                const dateRow = jsonData[dateRowIndex];
                const headerRow = jsonData[headerRowIndex] || [];

                // --- 2. Map Columns ---
                interface ColMap { date: string, type: 'start' | 'end' }
                let colMap: { [colIndex: number]: ColMap } = {};
                let lastDate = '';

                // Strategy A: Explicit Keyword Matching in Header Row
                for (let c = 0; c < Math.max(dateRow.length, headerRow.length); c++) {
                    const dateCell = dateRow[c];
                    if (dateCell && (String(dateCell).match(/20\d\d/) || String(dateCell).includes('-') || String(dateCell).includes('월'))) {
                        lastDate = String(dateCell).trim();
                    }

                    if (lastDate) {
                        const headerVal = String(headerRow[c] || '').trim();

                        const isStart = /시작|출근|입실|Start|In|Begin|On|Open/i.test(headerVal);
                        const isEnd = /종료|퇴근|퇴실|End|Out|Finish|Off|Close/i.test(headerVal);

                        if (isStart) {
                            colMap[c] = { date: lastDate, type: 'start' };
                        } else if (isEnd) {
                            colMap[c] = { date: lastDate, type: 'end' };
                        }
                    }
                }

                // Strategy B: Positional Inference (Fallback)
                // If keywords are missing, assume 1st col under a date is Start, 2nd is End.
                if (Object.keys(colMap).length === 0) {
                    console.warn("Explicit keywords not found. Attempting positional inference.");
                    lastDate = '';

                    for (let c = 0; c < dateRow.length; c++) {
                        const dateCell = dateRow[c];
                        if (dateCell && (String(dateCell).match(/20\d\d/) || String(dateCell).includes('-') || String(dateCell).includes('월'))) {
                            lastDate = String(dateCell).trim();
                            // Found a new date column. Map this to Start.
                            colMap[c] = { date: lastDate, type: 'start' };
                        } else if (lastDate) {
                            // If this column is empty (merged) and follows a Start column of the same date
                            if (colMap[c - 1]?.type === 'start' && colMap[c - 1]?.date === lastDate) {
                                colMap[c] = { date: lastDate, type: 'end' };
                            }
                        }
                    }
                }

                if (Object.keys(colMap).length === 0) {
                    reject(new Error("출근/퇴근 컬럼을 식별할 수 없습니다. (헤더에 '시작/종료', '출근/퇴근', '입실/퇴실'이 포함되거나, 날짜 하위에 2개의 컬럼이 존재해야 합니다.)"));
                    return;
                }

                // --- 3. Extract Data ---
                const records: TimeRecord[] = [];

                for (let r = dataStartIndex; r < jsonData.length; r++) {
                    const row = jsonData[r];
                    // Try to find Name in first few columns
                    let empName = '';
                    // Heuristic: Check col 0, 1, 2 for a non-number string that looks like a name
                    for (let i = 0; i < 3; i++) {
                        if (row[i] && typeof row[i] === 'string' && !row[i].match(/\d/) && row[i].length > 1) {
                            empName = row[i];
                            break;
                        }
                    }
                    // Fallback: just take col 0 or 1
                    if (!empName) empName = row[1] || row[0];

                    if (!empName || String(empName).trim() === '') continue;

                    const dailyTimes: { [date: string]: { start?: string, end?: string } } = {};

                    Object.keys(colMap).forEach(idxStr => {
                        const idx = Number(idxStr);
                        const mapInfo = colMap[idx];
                        const val = row[idx];

                        if (!dailyTimes[mapInfo.date]) dailyTimes[mapInfo.date] = {};

                        if (val) {
                            const timeStr = parseExcelTime(val);
                            if (timeStr !== "00:00") {
                                if (mapInfo.type === 'start') dailyTimes[mapInfo.date].start = timeStr;
                                if (mapInfo.type === 'end') dailyTimes[mapInfo.date].end = timeStr;
                            }
                        }
                    });

                    Object.entries(dailyTimes).forEach(([dateStr, times]) => {
                        const rawStart = times.start || "00:00";
                        const rawEnd = times.end || "00:00";

                        // Clean date string for parsing
                        // Sometimes dateStr has newlines or extra spaces
                        const cleanDateStr = dateStr.replace(/[\n\r]+/g, ' ').trim();

                        // Try to parse standard date
                        // If dateStr is just "10/1", we might need year. But let's assume raw string is sufficient for ID

                        // Parse Date efficiently
                        let dateObj = new Date(cleanDateStr);
                        if (isNaN(dateObj.getTime())) {
                            // Try removing Korean characters to parse "2024년 1월 1일" -> "2024 1 1"
                            // Or "2024-01-01 (월)" -> "2024-01-01"
                            // Regex to extract YYYY-MM-DD or YYYY.MM.DD
                            const match = cleanDateStr.match(/(\d{4})[\.\-\/년]\s*(\d{1,2})[\.\-\/월]\s*(\d{1,2})/);
                            if (match) {
                                dateObj = new Date(`${match[1]}-${match[2]}-${match[3]}`);
                            }
                        }

                        let isHolidayOrWeekend = false;
                        if (!isNaN(dateObj.getTime())) {
                            const day = dateObj.getDay();
                            const isWeekend = day === 0 || day === 6; // Sun or Sat
                            const isPublicHoliday = HolidayUtils.isHoliday(dateObj);
                            isHolidayOrWeekend = isWeekend || isPublicHoliday;
                        } else {
                            // Fallback string check
                            isHolidayOrWeekend = cleanDateStr.includes('토') || cleanDateStr.includes('일') || cleanDateStr.includes('Sat') || cleanDateStr.includes('Sun');
                        }

                        const startMin = timeToMinutes(rawStart);
                        const endMin = timeToMinutes(rawEnd);
                        let gross = Math.max(0, endMin - startMin);

                        // [Fix] User Request: Ignore Excel data for Weekends/Holidays (Treat as 0).
                        // This prevents legacy "Special Work" from becoming "Ghost Logs" in the Manual Table.
                        if (isHolidayOrWeekend) {
                            gross = 0;
                        }

                        if (gross > 0) {
                            records.push({
                                id: `${empName}-${cleanDateStr}`,
                                employeeName: String(empName),
                                date: cleanDateStr,
                                rawStartTime: rawStart,
                                rawEndTime: rawEnd,
                                auditStartTime: rawStart,
                                auditEndTime: rawEnd,
                                rawWorkMinutes: gross,
                                statutoryBreakMinutes: 0,
                                policyDeductionMinutes: 0,
                                manualDeductionMinutes: 0,
                                auditWorkMinutes: 0,
                                changes: [],
                                isViolation: false,
                                weekNumber: getWeekNumber(new Date(cleanDateStr.replace(/[^\d-]/g, ''))),
                                isHoliday: isHolidayOrWeekend
                            });
                        }
                    });
                }

                if (records.length === 0) {
                    reject(new Error("유효한 근태 기록을 찾을 수 없습니다. 엑셀 데이터 형식을 확인해주세요."));
                    return;
                }

                resolve(records);

            } catch (err) {
                console.error("Parsing Error", err);
                reject(err);
            }
        };
        reader.readAsBinaryString(file);
    });
};

// Generate dummy data: MAKE THEM OVERWORK (Most people > 52h)
export const generateDummyData = (): TimeRecord[] => {
    const employees = ['김철수', '이영희', '박민수', '정수진', '최동훈', '강지민', '윤서준'];
    const baseDateObj = new Date('2023-10-02'); // Start on a Monday

    const records: TimeRecord[] = [];

    employees.forEach((name, empIndex) => {
        for (let week = 0; week < 4; week++) {
            // Change from 5 days (Mon-Fri) to 6 days (Mon-Sat) to simulate weekend work
            for (let day = 0; day < 6; day++) {
                const currentDate = new Date(baseDateObj);
                currentDate.setDate(baseDateObj.getDate() + (week * 7) + day);

                const year = currentDate.getFullYear();
                const month = String(currentDate.getMonth() + 1).padStart(2, '0');
                const d = String(currentDate.getDate()).padStart(2, '0');

                const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
                const dayName = dayNames[currentDate.getDay()];
                const formattedDate = `${year}-${month}-${d} (${dayName})`;
                const isWeekend = dayName === '토' || dayName === '일';

                // Skip Saturday for some, but make High Risk group work on Saturdays
                if (isWeekend) {
                    // If not high risk group (index >= 5), skip Saturday 80% of time
                    if (empIndex >= 5 && Math.random() > 0.2) continue;
                    // If high risk group, skip Saturday only 30% of time (work 70%)
                    if (empIndex < 5 && Math.random() > 0.7) continue;
                }

                // Default Start
                let startBase = 8 * 60 + 30;
                if (isWeekend) startBase = 9 * 60; // Start later on weekends

                const startRand = Math.floor(Math.random() * 40);
                const startMin = startBase + startRand;

                // Default End
                let endBase = 19 * 60;
                let extraWork = 0;

                if (isWeekend) {
                    // Weekend work is usually shorter or specific (e.g., 10:00 - 15:00)
                    // But risk group might work full day
                    endBase = 17 * 60;
                    extraWork = Math.floor(Math.random() * 120);
                } else {
                    if (empIndex < 5) {
                        extraWork = Math.floor(Math.random() * 240);
                    } else {
                        endBase = 18 * 60;
                        extraWork = Math.floor(Math.random() * 60);
                    }
                }

                if (day === 4 && !isWeekend) extraWork = Math.max(0, extraWork - 60); // Friday leave earlier

                const endMin = endBase + extraWork;

                records.push({
                    id: `${name}-${week}-${day}`,
                    employeeName: name,
                    date: formattedDate,
                    rawStartTime: minutesToTime(startMin),
                    rawEndTime: minutesToTime(endMin),
                    auditStartTime: minutesToTime(startMin),
                    auditEndTime: minutesToTime(endMin),
                    rawWorkMinutes: Math.max(0, endMin - startMin),
                    statutoryBreakMinutes: 0,
                    policyDeductionMinutes: 0,
                    manualDeductionMinutes: 0,
                    auditWorkMinutes: 0,
                    changes: [],
                    isViolation: false,
                    weekNumber: week + 1,
                    isHoliday: isWeekend
                });
            }
        }
    });

    return records;
};

export const processRecords = (
    records: TimeRecord[],
    settings: CleansingSettings
): { processedRecords: TimeRecord[], weeklySummaries: WeeklySummary[] } => {

    const employeeGroups: Record<string, TimeRecord[]> = {};

    // 1. First Pass: Daily Normalization (3-Tier Calc)
    const tempRecords = records.map(record => {
        const newRecord = { ...record, changes: [] as string[] };
        let startMin = timeToMinutes(newRecord.rawStartTime);
        let endMin = timeToMinutes(newRecord.rawEndTime);

        // --- Tier 1: Gross Time & Statutory Break (FR-3) ---
        // First, apply normalization buffers to get "Recognized Work Time" boundaries
        const workStartStandard = 9 * 60; // 09:00
        if (startMin < workStartStandard && (workStartStandard - startMin) <= settings.startBufferMinutes) {
            startMin = workStartStandard;
            newRecord.changes.push('업무 준비(Buffer)');
        }

        // Determine end standard based on day type
        const workEndStandard = 18 * 60;

        // Only apply Late Departure buffer if it's close to standard end time
        // For weekends, we don't necessarily enforce 18:00 as standard, but let's keep logic simple:
        // If they finish a bit after 18:00, trim it.
        if (endMin > workEndStandard && (endMin - workEndStandard) <= settings.endBufferMinutes) {
            endMin = workEndStandard;
            newRecord.changes.push('퇴근 대기(Buffer)');
        }

        // Safety Randomness
        if (settings.safetyRandomness) {
            if (startMin % 60 === 0 && newRecord.changes.length > 0) startMin += Math.floor(Math.random() * 6) - 2;
            if (endMin % 60 === 0 && newRecord.changes.length > 0) endMin += Math.floor(Math.random() * 9) - 4;
        }

        newRecord.auditStartTime = minutesToTime(startMin);
        newRecord.auditEndTime = minutesToTime(endMin);

        // Calculate Gross Duration (Normalized)
        const grossDuration = Math.max(0, endMin - startMin);

        // Calculate Statutory Break (Labor Standards Act Art. 54)
        // 4h -> 30m, 8h -> 1h
        // Applies to Weekend work as well
        let statBreak = 0;
        if (grossDuration >= 8 * 60) {
            statBreak = 60;
        } else if (grossDuration >= 4 * 60) {
            statBreak = 30;
        }
        newRecord.statutoryBreakMinutes = statBreak;

        // --- Tier 2: Policy Adjustments (FR-4) ---
        let policyDeduction = 0;

        // Auto Dinner Break
        if (settings.autoDinnerBreak) {
            const thresholdMin = timeToMinutes(settings.dinnerBreakThreshold);
            // Only apply dinner break if working past threshold
            if (endMin > thresholdMin) {
                policyDeduction += settings.dinnerBreakDuration;
                newRecord.changes.push(`석식(${settings.dinnerBreakDuration}분)`);
            }
        }
        newRecord.policyDeductionMinutes = policyDeduction;

        // --- Tier 3: Manual/Cap Adjustments (FR-5) ---
        let netCalc = grossDuration - statBreak - policyDeduction;
        if (netCalc < 0) netCalc = 0;

        newRecord.auditWorkMinutes = netCalc;

        if (!employeeGroups[newRecord.employeeName]) {
            employeeGroups[newRecord.employeeName] = [];
        }
        employeeGroups[newRecord.employeeName].push(newRecord);

        return newRecord;
    });

    // 2. Second Pass: Weekly Cap Enforcement (FR-6)
    const finalRecords: TimeRecord[] = [];
    const weeklySummaries: WeeklySummary[] = [];

    Object.keys(employeeGroups).forEach(name => {
        let empRecords = employeeGroups[name];
        empRecords.sort((a, b) => a.date.localeCompare(b.date));

        let totalRawForMonth = 0;
        let totalAuditForMonth = 0;
        const weekStats: WeekStat[] = [];

        let maxExcessMinutes = 0;
        let worstRawMinutes = 0;
        let worstAuditMinutes = 0;

        // Use specific logic to group by week number
        const weeks: Record<number, TimeRecord[]> = {};
        empRecords.forEach(r => {
            if (!weeks[r.weekNumber]) weeks[r.weekNumber] = [];
            weeks[r.weekNumber].push(r);
        });

        Object.keys(weeks).map(Number).forEach(weekIndex => {
            const weekChunk = weeks[weekIndex];
            let weekRawMinutes = weekChunk.reduce((sum, r) => sum + r.rawWorkMinutes, 0);
            let weekAuditMinutes = weekChunk.reduce((sum, r) => sum + r.auditWorkMinutes, 0);

            if (weekRawMinutes > worstRawMinutes) worstRawMinutes = weekRawMinutes;

            const maxMinutes = settings.maxWeeklyHours * 60;

            // Force Trim (Enforce Cap)
            if (settings.enforceCap && weekAuditMinutes > maxMinutes) {
                const minutesToTrim = weekAuditMinutes - maxMinutes;
                let remainingTrim = minutesToTrim;

                // Sort: Trim Weekends first, then late nights
                const sortedIndices = weekChunk
                    .map((r, idx) => ({ ...r, originalIndex: idx }))
                    .sort((a, b) => {
                        // Priority 1: Holidays/Weekends
                        if (a.isHoliday && !b.isHoliday) return -1;
                        if (!a.isHoliday && b.isHoliday) return 1;
                        // Priority 2: Late End Time
                        return timeToMinutes(b.auditEndTime) - timeToMinutes(a.auditEndTime);
                    });

                for (const recordRef of sortedIndices) {
                    if (remainingTrim <= 0) break;
                    // Find actual reference in weekChunk
                    const targetRecord = weekChunk.find(r => r.id === recordRef.id);
                    if (!targetRecord) continue;

                    const currentDuration = targetRecord.auditWorkMinutes;
                    const trimAmount = Math.min(remainingTrim, currentDuration);

                    targetRecord.auditWorkMinutes -= trimAmount;
                    targetRecord.manualDeductionMinutes += trimAmount;

                    const currentEndMin = timeToMinutes(targetRecord.auditEndTime);
                    targetRecord.auditEndTime = minutesToTime(currentEndMin - trimAmount);
                    targetRecord.changes.push(targetRecord.isHoliday ? '휴일 한도초과(Cap)' : '연장 한도초과(Cap)');

                    remainingTrim -= trimAmount;
                }
                weekAuditMinutes = weekChunk.reduce((sum, r) => sum + r.auditWorkMinutes, 0);
            }

            if (weekAuditMinutes > worstAuditMinutes) worstAuditMinutes = weekAuditMinutes;

            const rawOver = weekRawMinutes > maxMinutes;
            const isStillOver = weekAuditMinutes > maxMinutes;

            let status: 'safe' | 'warning' | 'danger' = 'safe';
            if (isStillOver) {
                status = 'danger';
                const excess = weekAuditMinutes - maxMinutes;
                if (excess > maxExcessMinutes) maxExcessMinutes = excess;
            } else if (rawOver) {
                status = 'warning';
            }

            weekStats.push({
                weekIndex,
                rawMinutes: weekRawMinutes,
                auditMinutes: weekAuditMinutes,
                isViolation: rawOver,
                status
            });

            totalRawForMonth += weekRawMinutes;
            totalAuditForMonth += weekAuditMinutes;
        });

        const isRisky = weekStats.some(w => w.status === 'danger');

        let actionPlan = "";
        if (isRisky) {
            if (maxExcessMinutes <= 120) actionPlan = "Buffer";
            else if (maxExcessMinutes <= 300) actionPlan = "Break";
            else actionPlan = "Cap";
        }

        weeklySummaries.push({
            employeeName: name,
            totalRawMinutes: totalRawForMonth,
            totalAuditMinutes: totalAuditForMonth,
            totalWorkMinutes: totalAuditForMonth, // [Added] Alias for required field
            complianceStatus: isRisky ? 'VIOLATION' : 'PASS', // [Added]
            violationRisk: isRisky,
            maxExcessHours: Number((maxExcessMinutes / 60).toFixed(1)),
            maxRawHours: Number((worstRawMinutes / 60).toFixed(1)),
            maxAuditHours: Number((worstAuditMinutes / 60).toFixed(1)),
            weeks: weekStats,
            actionPlan: actionPlan
        });

        finalRecords.push(...empRecords);
    });

    return { processedRecords: finalRecords, weeklySummaries };
};
