import * as XLSX from 'xlsx';
import { RawCommuteLog } from '../../types';
import { TimeUtils } from '../timeUtils';

export const ExcelParser = {
    parse: (file: File): Promise<RawCommuteLog[]> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = e.target?.result;
                    const workbook = XLSX.read(data, { type: 'binary' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    // [수정] 날짜가 숫자로 나오는 문제 방지를 위해 raw: false 추가
                    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false }) as any[][];

                    console.log("=== Excel Parsing Debug Start ===");
                    console.log("Total Rows:", rows?.length);
                    if (rows && rows.length > 0) {
                        console.log("Row 0:", rows[0]);
                        console.log("Row 1:", rows[1]);
                        console.log("Row 2:", rows[2]);
                    }

                    if (!rows || rows.length < 3) {
                        console.error("Rows are empty or insufficient length (<3)");
                        resolve([]);
                        return;
                    }

                    // [Dynamic Header Search]
                    // Find the row that contains date-like patterns (e.g., "2024.", "2025-", "12-01") in column F (index 5) or similar
                    let dateHeaderRowIndex = 0;
                    const datePattern = /(\d{4}[\.\-]\d{2})|(\d{1,2}[\.\-]\d{1,2})/;

                    for (let r = 0; r < Math.min(rows.length, 5); r++) {
                        // Check column 5 (F) or 10 (K) for date string
                        const valF = String(rows[r][5] || "");
                        const valK = String(rows[r][10] || "");
                        if (datePattern.test(valF) || datePattern.test(valK)) {
                            dateHeaderRowIndex = r;
                            console.log(`Found Date Header at Row ${r}:`, rows[r]);
                            break;
                        }
                    }

                    const dateHeaderRow = rows[dateHeaderRowIndex];

                    // Base Year/Month extraction from the found header row
                    const refDate = dateHeaderRow[5];
                    let baseYear = 2026, baseMonth = 1;

                    if (refDate) {
                        const dateNums = String(refDate).match(/\d+/g);
                        if (dateNums && dateNums.length >= 2) {
                            baseYear = parseInt(dateNums[0]);
                            baseMonth = parseInt(dateNums[1]);
                        }
                    }
                    console.log(`Base Year: ${baseYear}, Base Month: ${baseMonth}`);

                    const flatList: RawCommuteLog[] = [];

                    // [Fix] Determine Data Start Index Dynamically
                    // Inspect rows starting after header to find the first row with a valid Name in Column 0
                    let dataStartIndex = -1;
                    const skipKeywords = ['합계', '소계', '평균', '인원', '근무시간', '연장', '이름', '사번', '직급'];

                    for (let r = dateHeaderRowIndex + 1; r < rows.length; r++) {
                        const cell0 = rows[r][0];
                        if (cell0) {
                            const val = String(cell0).trim();
                            if (val.length > 0 && !skipKeywords.some(kw => val.includes(kw))) {
                                dataStartIndex = r;
                                console.log(`Found First Data Row at Index ${r}:Name="${val}"`);
                                break;
                            }
                        }
                    }

                    if (dataStartIndex === -1) {
                        console.error("Could not find any data start row (no valid names found).");
                        resolve([]);
                        return;
                    }

                    // Start loop from the dynamically found index
                    // Step is 2 because there's a sub-row for each user (e.g. Department info)
                    for (let i = dataStartIndex; i < rows.length; i += 2) {
                        const firstRow = rows[i];      // [이름/직급, 사번, ...]
                        const secondRow = rows[i + 1];  // [부서, ...]

                        if (!firstRow || !firstRow[0]) continue;

                        const nameTitleRaw = String(firstRow[0]).trim();
                        // Double check filtering (though start index check covers first one)
                        if (skipKeywords.some(kw => nameTitleRaw.includes(kw))) {
                            console.log(`Skipping row ${i} due to keyword: ${nameTitleRaw}`);
                            continue;
                        }

                        // [Fix] Parse "Name Position\nDepartment" structure
                        // 1. Split by Newline
                        const partsByNewline = nameTitleRaw.split(/[\n\r]+/);
                        const nameAndTitle = partsByNewline[0].trim(); // "Name Position"
                        const extractedDept = partsByNewline.length > 1 ? partsByNewline[1].trim() : "";

                        // 2. Split Name and Title by Space
                        const nameTitleParts = nameAndTitle.split(/\s+/);
                        const userName = nameTitleParts[0];
                        const userTitle = nameTitleParts.length > 1 ? nameTitleParts[1] : "";

                        // 3. Dept logic: Prioritize newline extract, fallback to secondRow if needed
                        const deptName = extractedDept || (secondRow && secondRow[0] ? String(secondRow[0]).trim() : "");

                        console.log(`Processing User: ${userName}, Title: ${userTitle}, Dept: ${deptName}`);

                        // 3. 5열 간격으로 날짜 블록 순회 (F->Idx 5, K->Idx 10...)
                        for (let j = 5; j < firstRow.length; j += 5) {
                            // dateHeaderRow 사용
                            const dateLabel = dateHeaderRow[j];
                            if (!dateLabel) continue;

                            const rawIn = firstRow[j];
                            const rawOut = firstRow[j + 1];

                            // Raw strings from Excel (already formatted as string by raw:false)
                            const rawInStr = String(rawIn || '').trim();
                            const rawOutStr = String(rawOut || '').trim();

                            // Sanitize for calculation (HH:mm) - TimeUtils.timeToMinutes uses string split, so it handles HH:mm:ss fine by ignoring seconds usually,
                            // BUT timeToMinutes splits by ':' and takes first two.
                            // Let's rely on TimeUtils.timeToMinutes handling parsing. 

                            // We store the full raw string for display
                            // And use the same string for calc (assuming TimeUtils handles it)

                            let cleanIn = TimeUtils.sanitizeTime(rawInStr);
                            let cleanOut = TimeUtils.sanitizeTime(rawOutStr);

                            // Format date string "MM-DD(Day)" -> "YYYY-MM-DD"
                            // Header format example: "12-01(Mon)" or "2025-12-01..."
                            const dateStr = TimeUtils.formatDateString(String(dateLabel), baseYear, baseMonth);
                            if (!dateStr) continue;

                            flatList.push({
                                id: `${userName}-${dateStr}`,
                                userId: userName,
                                userName,
                                userTitle,
                                department: deptName,
                                date: dateStr,
                                clockIn: cleanIn || '',
                                clockOut: cleanOut || '',
                                originalClockIn: cleanIn, // Store the sanitized full string (preserves seconds if regex matched them)
                                originalClockOut: cleanOut
                            } as any);
                        }
                    }
                    console.log(`Parsed ${flatList.length} logs.`);
                    console.log("=== Excel Parsing Debug End ===");
                    resolve(flatList);
                } catch (error) {
                    reject(error);
                }
            };
            reader.readAsBinaryString(file);
        });
    }
};