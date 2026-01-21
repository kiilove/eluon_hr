import * as XLSX from 'xlsx';

export interface DailyRecord {
    date: string; // YYYY-MM-DD (or MM-DD header)
    type: string; // 'REGULAR' | 'REMOTE' | Custom Code
}

export interface SettlementDetail {
    name: string;
    regularCount: number; // Legacy field, maybe keep for compatibility or map dynamically?
    remoteCount: number;  // Legacy field
    totalAllowance: number;
    excelTotalDays?: number;
    dailyLogs: DailyRecord[];
    // Dynamic counts
    counts: { [code: string]: number };
}

export interface SettlementReport {
    reportTitle: string;
    targetMonth: string;
    totalPayout: number;
    details: SettlementDetail[];
    headers: string[];
}

// [NEW] Config Interface
export interface SpecialWorkConfig {
    code: string;   // 'REGULAR', 'REMOTE', or custom
    symbol: string; // '◎', '★', etc.
    rate: number;   // 70000, 50000
    name?: string;
}

export interface ParseOptions {
    forceDate?: { year: number, month: number };
    configs?: SpecialWorkConfig[]; // [NEW] Dynamic Configs
}

export class DailySettlementParser {
    static async parse(file: File, options: ParseOptions = {}): Promise<SettlementReport> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[];

                    if (!rows || rows.length < 8) {
                        throw new Error("데이터가 부족하거나 잘못된 파일 형식입니다.");
                    }

                    const originalTitle = String(rows[0][0] || "제목 없음").trim(); // e.g., "이루온 11월 특근..."

                    // [NEW] Default Configs (Fallback)
                    const defaults: SpecialWorkConfig[] = [
                        { code: 'REGULAR', symbol: '◎', rate: 70000 },
                        { code: 'REMOTE', symbol: '★', rate: 50000 }
                    ];
                    const configs = options.configs && options.configs.length > 0 ? options.configs : defaults;

                    // Create lookup maps
                    const symbolToConfig = new Map<string, SpecialWorkConfig>();
                    configs.forEach(cfg => symbolToConfig.set(cfg.symbol, cfg));


                    // [NEW] Date Inference Logic
                    let targetYear = new Date().getFullYear();
                    // Default to current month if inference fails
                    let targetMonth = new Date().getMonth() + 1;

                    if (options.forceDate) {
                        // 1. Priority: User forced date
                        targetYear = options.forceDate.year;
                        targetMonth = options.forceDate.month;
                    } else {
                        // 2. Heuristic: Parse from Title (A1)
                        const titleMatch = originalTitle.match(/(\d{1,2})월/);
                        if (titleMatch) {
                            const parsedMonth = parseInt(titleMatch[1], 10);
                            if (!isNaN(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12) {
                                targetMonth = parsedMonth;

                                // Year Inference:
                                const today = new Date();
                                const sysMonth = today.getMonth() + 1;
                                const sysYear = today.getFullYear();

                                if (parsedMonth > sysMonth) {
                                    targetYear = sysYear - 1;
                                } else {
                                    targetYear = sysYear;
                                }
                            }
                        }
                    }

                    // 2. '성명' 행 찾기
                    let headerRowIndex = -1;
                    let nameColumnIndex = -1;

                    for (let r = 0; r < Math.min(rows.length, 20); r++) {
                        const row = rows[r];
                        if (!row) continue;
                        const idx = row?.findIndex((c: any) => String(c || "").trim() === '성명');
                        if (idx !== -1 && idx !== undefined) {
                            headerRowIndex = r;
                            nameColumnIndex = idx;
                            break;
                        }
                    }

                    if (headerRowIndex === -1) throw new Error("'성명' 헤더를 찾을 수 없습니다.");

                    const headerRowForTotal = rows[headerRowIndex];
                    const nextRowHeader = rows.length > headerRowIndex + 1 ? rows[headerRowIndex + 1] : [];

                    // 2. Find 'Money' or 'Total' Column
                    // Priority: explicit money terms > generic total terms
                    let moneyColIndex = -1;
                    let genericTotalColIndex = -1;

                    const moneyKeywords = ["지급액", "총지급액", "실지급액", "특근비", "금액", "총액"];
                    const totalKeywords = ["합계", "소계"];

                    // Helper to check row for keywords
                    const findCol = (row: any[], start: number, keywords: string[]) => {
                        for (let c = start; c < row.length; c++) {
                            const val = String(row[c] || "").trim().replace(/\s/g, '');
                            if (keywords.some(k => val.includes(k))) return c;
                        }
                        return -1;
                    };

                    // Check Header Row
                    moneyColIndex = findCol(headerRowForTotal, nameColumnIndex + 1, moneyKeywords);
                    if (moneyColIndex === -1) genericTotalColIndex = findCol(headerRowForTotal, nameColumnIndex + 1, totalKeywords);

                    // Check Next Row (Double Header case)
                    if (moneyColIndex === -1 && genericTotalColIndex === -1) {
                        const m2 = findCol(nextRowHeader, nameColumnIndex + 1, moneyKeywords);
                        if (m2 !== -1) moneyColIndex = m2;
                        else genericTotalColIndex = findCol(nextRowHeader, nameColumnIndex + 1, totalKeywords);
                    }

                    const startCol = nameColumnIndex + 1;
                    // Determine endCol: if we found a total column, stop there, else go to end
                    const effectiveTotalCol = moneyColIndex !== -1 ? moneyColIndex : genericTotalColIndex;
                    const endCol = effectiveTotalCol !== -1 ? effectiveTotalCol : rows[headerRowIndex].length;

                    let totalPayout = 0;
                    const details: SettlementDetail[] = [];

                    const monthRow = rows[headerRowIndex];
                    const dayRow = rows[headerRowIndex + 1] || [];

                    const headers: string[] = [];
                    const columnDateMap: { [col: number]: string } = {};

                    let activeMonth = targetMonth;

                    for (let c = startCol; c < endCol; c++) {
                        const monthVal = String(monthRow[c] || "").trim();
                        if (monthVal.includes("월")) {
                            const parsedMonth = parseInt(monthVal.replace(/[^0-9]/g, ''), 10);
                            if (!isNaN(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12) {
                                activeMonth = parsedMonth;
                            }
                        }

                        let dayVal = String(dayRow[c] || "").trim();
                        let headerStr = "";

                        const dayNum = parseInt(dayVal.replace(/[^0-9]/g, ''), 10);
                        if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) {
                            const mm = String(activeMonth).padStart(2, '0');
                            const dd = String(dayNum).padStart(2, '0');
                            headerStr = `${mm}-${dd}`;
                        } else {
                            if (dayVal) headerStr = dayVal;
                            else headerStr = `col_${c}`;
                        }

                        headers.push(headerStr);
                        columnDateMap[c] = headerStr;
                    }

                    const dataStartRow = headerRowIndex + 2;

                    for (let i = dataStartRow; i < rows.length; i++) {
                        const row = rows[i];
                        if (!row) continue;

                        const name = String(row[nameColumnIndex] || "").trim();
                        if (!name) continue;
                        if (name === '합계' || name === '소계' || name.includes('성명')) break;

                        const userLogs: DailyRecord[] = [];
                        const counts: { [code: string]: number } = {};
                        let calcAttributesTotal = 0;

                        configs.forEach(cfg => counts[cfg.code] = 0);

                        for (let c = startCol; c < endCol; c++) {
                            const cellVal = String(row[c] || "").trim();
                            const headerKey = columnDateMap[c];
                            const matchedConfig = symbolToConfig.get(cellVal);

                            if (matchedConfig) {
                                counts[matchedConfig.code] = (counts[matchedConfig.code] || 0) + 1;
                                calcAttributesTotal += matchedConfig.rate;
                                userLogs.push({ date: headerKey, type: matchedConfig.code });
                            }
                        }

                        // Extract Excel Total
                        let excelTotal = 0;
                        let hasValidExcelTotal = false;

                        if (effectiveTotalCol !== -1) {
                            const rawTotal = String(row[effectiveTotalCol] || "").replace(/,/g, '').trim();
                            const parsedTotal = parseFloat(rawTotal);
                            if (!isNaN(parsedTotal)) {
                                excelTotal = parsedTotal;
                                hasValidExcelTotal = true;
                            }
                        }

                        // DECISION: Priority to Excel Value
                        // If money detected (>2000) or explicit money column found
                        let finalTotal = calcAttributesTotal;

                        if (hasValidExcelTotal) {
                            if (moneyColIndex !== -1) {
                                // Explicit money column -> Trust Excel
                                finalTotal = excelTotal;
                            } else if (genericTotalColIndex !== -1) {
                                // Ambiguous "Total" column
                                // Heuristic: If value > 2000, likely Money. If < 35, likely Days.
                                if (excelTotal > 2000) {
                                    finalTotal = excelTotal;
                                }
                                // If it looks like days, we keep calcAttributesTotal (Money)
                            }
                        }

                        totalPayout += finalTotal;

                        const regularCount = counts['REGULAR'] || 0;
                        const remoteCount = counts['REMOTE'] || 0;

                        details.push({
                            name,
                            regularCount,
                            remoteCount,
                            counts,
                            totalAllowance: finalTotal,
                            excelTotalDays: excelTotal, // keeping naming for now or rename? Interface has it as excelTotalDays?
                            dailyLogs: userLogs,
                        });
                    }

                    resolve({
                        reportTitle: originalTitle,
                        targetMonth: `${targetYear}-${String(targetMonth).padStart(2, '0')}`,
                        totalPayout,
                        details,
                        headers
                    });

                } catch (error) {
                    reject(error);
                }
            };
            reader.readAsArrayBuffer(file);
        });
    }
}
