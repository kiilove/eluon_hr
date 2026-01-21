import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { ProcessedWorkLog, LogStatus } from '../types';
import { TimeUtils } from './timeUtils';
import { SpecialWorkCalculator } from './specialWorkCalculator';

export class ExcelReportGenerator {
    static async generateWeeklyReport(
        logs: ProcessedWorkLog[],
        userContext?: { name: string; company_id: string }
    ) {
        if (!logs || logs.length === 0) {
            alert('출력할 데이터가 없습니다.');
            return;
        }

        try {
            // Group by Week (Monday)
            const getMondayOfWeek = (date: Date): string => {
                const d = new Date(date);
                const day = d.getDay();
                const diff = d.getDate() - day + (day === 0 ? -6 : 1);
                const monday = new Date(d.setDate(diff));
                const year = monday.getFullYear();
                const month = String(monday.getMonth() + 1).padStart(2, '0');
                const dt = String(monday.getDate()).padStart(2, '0');
                return `${year}-${month}-${dt}`;
            };

            const weekGroups: Record<string, ProcessedWorkLog[]> = {};
            logs.forEach(log => {
                const mondayStr = getMondayOfWeek(new Date(log.date));
                if (!weekGroups[mondayStr]) weekGroups[mondayStr] = [];
                weekGroups[mondayStr].push(log);
            });
            const sortedMondays = Object.keys(weekGroups).sort();

            if (sortedMondays.length === 0) return;

            // Define Styles
            const borderStyle: Partial<ExcelJS.Borders> = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
            const fontStyle: Partial<ExcelJS.Font> = { name: 'Malgun Gothic', size: 10 };
            const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };

            const applyStyle = (cell: ExcelJS.Cell, isHeader = false) => {
                cell.font = fontStyle;
                cell.border = borderStyle;
                cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                if (isHeader) {
                    cell.fill = headerFill;
                    cell.font = { ...fontStyle, bold: true };
                }
            };

            const workbook = new ExcelJS.Workbook();

            // Define styles/width helper
            const setColumnWidths = (ws: ExcelJS.Worksheet) => {
                ws.getColumn(1).width = 20;
                for (let i = 2; i <= 5; i++) { ws.getColumn(i).width = 10; }
                for (let i = 6; i <= 19; i++) { ws.getColumn(i).width = 8; }
            };

            sortedMondays.forEach((mondayStr) => {
                const worksheet = workbook.addWorksheet(`${mondayStr} 주간`, {
                    pageSetup: {
                        paperSize: 9, // A4
                        orientation: 'landscape',
                        fitToPage: true,
                        fitToWidth: 1,
                        fitToHeight: 0,
                        margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
                        printTitlesRow: '1:3' // Repeat Header Rows 1-3
                    }
                });
                setColumnWidths(worksheet);

                // Reset rowIndex for new sheet
                let rowIndex = 1;

                const weekLogs = weekGroups[mondayStr];
                const mondayDate = new Date(mondayStr);

                // Title Row
                worksheet.mergeCells(`A${rowIndex}:S${rowIndex}`);
                const titleCell = worksheet.getCell(`A${rowIndex}`);
                titleCell.value = `${mondayDate.getFullYear()}년 ${mondayDate.getMonth() + 1}월 주간 근태현황 (시작일: ${mondayStr})`;
                titleCell.font = { name: 'Malgun Gothic', size: 14, bold: true };
                titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
                titleCell.border = borderStyle;
                rowIndex++;

                // Header Row 1
                worksheet.mergeCells(`A${rowIndex}:A${rowIndex + 1}`);
                worksheet.getCell(`A${rowIndex}`).value = "이름";
                applyStyle(worksheet.getCell(`A${rowIndex}`), true);

                worksheet.mergeCells(`B${rowIndex}:E${rowIndex}`);
                worksheet.getCell(`B${rowIndex}`).value = "주 근무시간";
                applyStyle(worksheet.getCell(`B${rowIndex}`), true);

                const getWeekDates = (mStr: string) => {
                    const dates = [];
                    const curr = new Date(mStr);
                    curr.setHours(12, 0, 0, 0);
                    for (let i = 0; i < 7; i++) {
                        const y = curr.getFullYear();
                        const m = String(curr.getMonth() + 1).padStart(2, '0');
                        const d = String(curr.getDate()).padStart(2, '0');
                        dates.push(`${y}-${m}-${d}`);
                        curr.setDate(curr.getDate() + 1);
                    }
                    return dates;
                };
                const weekDates = getWeekDates(mondayStr);
                const dayMap = ['(일)', '(월)', '(화)', '(수)', '(목)', '(금)', '(토)'];

                let colIdx = 6;

                weekDates.forEach((dateStr) => {
                    const d = new Date(dateStr);
                    const dayIdx = d.getDay();
                    worksheet.mergeCells(rowIndex, colIdx, rowIndex, colIdx + 1);
                    const cell = worksheet.getCell(rowIndex, colIdx);
                    cell.value = `${dateStr} ${dayMap[dayIdx]}`;
                    applyStyle(cell, true);
                    if (dayIdx === 0) cell.font = { ...fontStyle, color: { argb: 'FFFF0000' }, bold: true };
                    if (dayIdx === 6) cell.font = { ...fontStyle, color: { argb: 'FF0000FF' }, bold: true };
                    colIdx += 2;
                });
                rowIndex++;

                // Header Row 2
                worksheet.getCell(`B${rowIndex}`).value = "총";
                worksheet.getCell(`C${rowIndex}`).value = "기본";
                worksheet.getCell(`D${rowIndex}`).value = "연장";
                worksheet.getCell(`E${rowIndex}`).value = "특근";
                applyStyle(worksheet.getCell(`B${rowIndex}`), true);
                applyStyle(worksheet.getCell(`C${rowIndex}`), true);
                applyStyle(worksheet.getCell(`D${rowIndex}`), true);
                applyStyle(worksheet.getCell(`E${rowIndex}`), true);

                colIdx = 6;
                weekDates.forEach(() => {
                    const c1 = worksheet.getCell(rowIndex, colIdx);
                    const c2 = worksheet.getCell(rowIndex, colIdx + 1);
                    c1.value = "시작";
                    c2.value = "종료";
                    applyStyle(c1, true);
                    applyStyle(c2, true);
                    colIdx += 2;
                });
                rowIndex++;

                const userGroups = weekLogs.reduce<Record<string, ProcessedWorkLog[]>>((acc, log) => {
                    if (!acc[log.userId]) acc[log.userId] = [];
                    acc[log.userId].push(log);
                    return acc;
                }, {});

                const userIds = Object.keys(userGroups).filter(userId => {
                    const userLogs = userGroups[userId];
                    const totalWork = userLogs.reduce((sum, log) => sum + log.actualWorkDuration, 0);
                    return totalWork > 0;
                }).sort();

                userIds.forEach(userId => {
                    const userLogs = userGroups[userId];
                    const user = userLogs[0];
                    const logMap = new Map<string, ProcessedWorkLog>(userLogs.map(l => [l.date, l]));

                    const summary = {
                        totalWorkMinutes: userLogs.reduce((acc, l) => acc + (l.actualWorkDuration || 0) + (l.overtimeDuration || 0) + (l.specialWorkMinutes || 0), 0),
                        basicWorkMinutes: userLogs.reduce((acc, l) => {
                            const [y, m, d] = l.date.split('-').map(Number);
                            const dateObj = new Date(y, m - 1, d);
                            const day = dateObj.getDay();
                            const isSpecial = day === 0 || day === 6 || l.isHoliday;

                            if (isSpecial) return acc;
                            return acc + Math.min(l.actualWorkDuration || 0, 480);
                        }, 0),

                        overtimeMinutes: userLogs.reduce((acc, l) => {
                            const [y, m, d] = l.date.split('-').map(Number);
                            const dateObj = new Date(y, m - 1, d);
                            const day = dateObj.getDay();
                            const isSpecial = day === 0 || day === 6 || l.isHoliday;

                            if (isSpecial) return acc;
                            return acc + (l.overtimeDuration || 0);
                        }, 0),

                        specialWorkMinutes: userLogs.reduce((acc, l) => {
                            const [y, m, d] = l.date.split('-').map(Number);
                            const dateObj = new Date(y, m - 1, d);
                            const day = dateObj.getDay();
                            // Update: Sync with Visuals. If Status is REST, ignore duration (treat as 0)
                            if (l.logStatus === LogStatus.REST) return acc;

                            const isSpecial = day === 0 || day === 6 || l.isHoliday;

                            if (isSpecial) return acc + (l.actualWorkDuration || 0);
                            return acc;
                        }, 0)
                    };
                    summary.totalWorkMinutes = summary.basicWorkMinutes + summary.overtimeMinutes + summary.specialWorkMinutes;

                    // Rich Text for Name Column
                    const nameCell = worksheet.getCell(`A${rowIndex}`);
                    nameCell.value = {
                        richText: [
                            { text: `${user.userName} (${user.userTitle || ''})`, font: { name: 'Malgun Gothic', size: 10, bold: true } },
                            { text: `\r\n${user.department || ''}`, font: { name: 'Malgun Gothic', size: 9, color: { argb: 'FF555555' } } }
                        ]
                    };
                    applyStyle(nameCell);
                    nameCell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };

                    // Enforce Row Height
                    worksheet.getRow(rowIndex).height = 30;

                    worksheet.getCell(`B${rowIndex}`).value = TimeUtils.minutesToColonFormat(summary.totalWorkMinutes);
                    worksheet.getCell(`C${rowIndex}`).value = TimeUtils.minutesToColonFormat(summary.basicWorkMinutes);
                    worksheet.getCell(`D${rowIndex}`).value = TimeUtils.minutesToColonFormat(summary.overtimeMinutes);
                    worksheet.getCell(`E${rowIndex}`).value = TimeUtils.minutesToColonFormat(summary.specialWorkMinutes || 0);
                    applyStyle(worksheet.getCell(`B${rowIndex}`));
                    applyStyle(worksheet.getCell(`C${rowIndex}`));
                    applyStyle(worksheet.getCell(`D${rowIndex}`));
                    applyStyle(worksheet.getCell(`E${rowIndex}`));

                    colIdx = 6;
                    weekDates.forEach(date => {
                        const log = logMap.get(date);
                        let startStr = '';
                        let endStr = '';

                        if (log) {
                            if (log.logStatus === LogStatus.VACATION) { startStr = '휴가'; endStr = '휴가'; }
                            else if (log.logStatus === LogStatus.TRIP) { startStr = '출장'; endStr = '출장'; }
                            else if (log.logStatus === LogStatus.EDUCATION) { startStr = '교육'; endStr = '교육'; }
                            else if (log.logStatus === LogStatus.SICK) { startStr = '병가'; endStr = '병가'; }
                            else if (log.logStatus === LogStatus.REST) { startStr = '휴무'; endStr = '휴무'; }
                            else {
                                startStr = log.rawStartTimeStr || (log.startTime > 0 ? TimeUtils.minutesToColonFormat(log.startTime) : '');
                                endStr = log.rawEndTimeStr || (log.endTime > 0 ? TimeUtils.minutesToColonFormat(log.endTime) : '');
                            }
                        }

                        const c1 = worksheet.getCell(rowIndex, colIdx);
                        const c2 = worksheet.getCell(rowIndex, colIdx + 1);
                        c1.value = startStr;
                        c2.value = endStr;
                        applyStyle(c1);
                        applyStyle(c2);

                        if (['휴가', '출장', '교육', '병가', '휴무'].includes(startStr)) {
                            worksheet.mergeCells(rowIndex, colIdx, rowIndex, colIdx + 1);
                            worksheet.getCell(rowIndex, colIdx).value = startStr;
                        }

                        colIdx += 2;
                    });
                    rowIndex++;
                });
            });

            // Generate Filename
            let companyName = "회사";
            let userName = "사용자";

            if (userContext) {
                if (userContext.name) userName = userContext.name;
                if (userContext.company_id === 'comp_eluon') companyName = "이루온";
                else if (userContext.company_id === 'comp_eluonins') companyName = "이루온아이앤에스";
                else if (userContext.company_id) companyName = userContext.company_id;
            } else {
                try {
                    const userStr = localStorage.getItem('user');
                    if (userStr) {
                        const userObj = JSON.parse(userStr);
                        if (userObj.name) userName = userObj.name;
                        if (userObj.company_id === 'comp_eluon') companyName = "이루온";
                        else if (userObj.company_id === 'comp_eluonins') companyName = "이루온아이앤에스";
                        else if (userObj.company_id) companyName = userObj.company_id;
                    }
                } catch (e) { console.warn("User parse fail", e); }
            }


            const startDate = sortedMondays[0] || new Date().toISOString().slice(0, 10);
            const timestamp = Date.now();
            const fileName = `${companyName}_근태대장_${startDate}_${userName}_${timestamp}.xlsx`;

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            saveAs(blob, fileName);

        } catch (e) {
            console.error("Export failed", e);
            alert("엑셀 내보내기 중 오류가 발생했습니다.");
        }
    }
    static async generateMonthlyReport(
        logs: ProcessedWorkLog[],
        currentMonthStr: string, // YYYY-MM
        userContext?: { name: string; company_id: string }
    ) {
        if (!logs || logs.length === 0) {
            alert('출력할 데이터가 없습니다.');
            return;
        }

        try {
            const workbook = new ExcelJS.Workbook();

            // --- STYLES ---
            const borderStyle: Partial<ExcelJS.Borders> = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
            const fontStyle = { name: 'Malgun Gothic', size: 9 };

            const applyStyle = (cell: ExcelJS.Cell, isHeader = false) => {
                cell.border = borderStyle;
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.font = isHeader ? { ...fontStyle, bold: true } : fontStyle;
                if (isHeader) {
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFF0F0F0' }
                    };
                }
            };

            // --- HELPER: Custom Week Number Logic ---
            const getCustomWeekNumber = (date: Date) => {
                const year = date.getFullYear();
                const jan1 = new Date(year, 0, 1);
                const jan1Day = jan1.getDay();
                let daysToNextMonday = (8 - jan1Day) % 7;
                if (jan1Day === 1) daysToNextMonday = 0;
                const firstMonday = new Date(year, 0, 1 + daysToNextMonday);

                if (date < firstMonday) {
                    const prevYear = year - 1;
                    const prevJan1 = new Date(prevYear, 0, 1);
                    const prevJan1Day = prevJan1.getDay();
                    let prevDaysToNextMonday = (8 - prevJan1Day) % 7;
                    if (prevJan1Day === 1) prevDaysToNextMonday = 0;
                    const prevFirstMonday = new Date(prevYear, 0, 1 + prevDaysToNextMonday);
                    const diffTime = Math.abs(date.getTime() - prevFirstMonday.getTime());
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    return Math.floor(diffDays / 7) + 1;
                }

                const diffTime = Math.abs(date.getTime() - firstMonday.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                return Math.floor(diffDays / 7) + 1;
            };

            const getMondayOfWeek = (date: Date): string => {
                const d = new Date(date);
                const day = d.getDay();
                const diff = (day === 0 ? 6 : day - 1);
                d.setDate(d.getDate() - diff);
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const dt = String(d.getDate()).padStart(2, '0');
                return `${year}-${month}-${dt}`;
            };

            // Group by Week
            const weekGroups: Record<string, ProcessedWorkLog[]> = {};
            logs.forEach(log => {
                const mondayStr = getMondayOfWeek(new Date(log.date));
                if (!weekGroups[mondayStr]) weekGroups[mondayStr] = [];
                weekGroups[mondayStr].push(log);
            });
            const sortedMondays = Object.keys(weekGroups).sort();

            // --- MAIN LOOP: One Sheet Per Week ---
            sortedMondays.forEach((mondayStr, weekIndex) => {
                const mDate = new Date(mondayStr);
                const wStart = new Date(mDate);
                const wEnd = new Date(mDate);
                wEnd.setDate(mDate.getDate() + 6);

                const weekNum = getCustomWeekNumber(wStart);
                const sheetName = `${mDate.getMonth() + 1}월 ${weekIndex + 1}주`;

                const worksheet = workbook.addWorksheet(sheetName, {
                    pageSetup: {
                        paperSize: 9, // A4
                        orientation: 'landscape',
                        fitToPage: true,
                        fitToWidth: 1,
                        fitToHeight: 0,
                        margins: { left: 0.2, right: 0.2, top: 0.4, bottom: 0.4, header: 0.3, footer: 0.3 }
                    },
                    views: [{ showGridLines: false }]
                });

                // Set Column Widths (Global for Sheet)
                // New Layout: T columns (A-T)
                // A: No (5)
                // B: Name (18)
                // C-F: Stats (6)
                // G-T: Days (7 pairs * 2 = 14)
                worksheet.getColumn('A').width = 5; // No.
                worksheet.getColumn('B').width = 18; // Name
                ['C', 'D', 'E', 'F'].forEach(c => worksheet.getColumn(c).width = 6); // Stats
                for (let i = 7; i <= 20; i++) worksheet.getColumn(i).width = 8; // Days (G~T)

                let rowIndex = 1;

                // --- SHEET 1 ONLY: Title & Approval ---
                if (weekIndex === 0) {
                    // Title
                    const titleRow = rowIndex;
                    worksheet.mergeCells(`A${titleRow}:T${titleRow}`);
                    const titleCell = worksheet.getCell(`A${titleRow}`);
                    titleCell.value = `${currentMonthStr.split('-')[0]}년 ${currentMonthStr.split('-')[1]}월 근태 현황`;
                    titleCell.font = { name: 'Malgun Gothic', size: 18, bold: true };
                    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
                    rowIndex += 2;

                    // Approval Boxes
                    const approvalRowHeader = rowIndex;
                    const approvalRowSign = rowIndex + 1;
                    const setApprovalBox = (startCol: string, endCol: string) => {
                        worksheet.mergeCells(`${startCol}${approvalRowHeader}:${endCol}${approvalRowHeader}`);
                        const hCell = worksheet.getCell(`${startCol}${approvalRowHeader}`);
                        hCell.value = "";
                        applyStyle(hCell, true);

                        worksheet.mergeCells(`${startCol}${approvalRowSign}:${endCol}${approvalRowSign}`);
                        const sCell = worksheet.getCell(`${startCol}${approvalRowSign}`);
                        sCell.value = "";
                        sCell.border = borderStyle;
                        worksheet.getRow(approvalRowSign).height = 60;
                    };
                    // Shifted for new column A
                    setApprovalBox('O', 'P');
                    setApprovalBox('Q', 'R');
                    setApprovalBox('S', 'T');
                    rowIndex += 3;
                }

                // --- HEADER RENDER (For valid PrintTitles) ---
                const headerStartRow = rowIndex;

                // 1. Week Title
                worksheet.mergeCells(`A${rowIndex}:T${rowIndex}`);
                const c = worksheet.getCell(`A${rowIndex}`);
                const formatDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

                c.value = `W${weekNum} (${formatDate(wStart)} ~ ${formatDate(wEnd)})`;
                c.font = { name: 'Malgun Gothic', size: 12, bold: true };
                c.alignment = { horizontal: 'center', vertical: 'middle' };
                c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
                c.border = borderStyle;
                rowIndex++;

                // 2. Table Header
                // Row 1
                // No
                worksheet.mergeCells(`A${rowIndex}:A${rowIndex + 1}`);
                worksheet.getCell(`A${rowIndex}`).value = "No.";
                applyStyle(worksheet.getCell(`A${rowIndex}`), true);

                // Name
                worksheet.mergeCells(`B${rowIndex}:B${rowIndex + 1}`);
                worksheet.getCell(`B${rowIndex}`).value = "이름";
                applyStyle(worksheet.getCell(`B${rowIndex}`), true);

                // Stats
                worksheet.mergeCells(`C${rowIndex}:F${rowIndex}`);
                worksheet.getCell(`C${rowIndex}`).value = "주 근무시간 (인정)";
                applyStyle(worksheet.getCell(`C${rowIndex}`), true);

                // Days
                const dayMap = ['(월)', '(화)', '(수)', '(목)', '(금)', '(토)', '(일)'];
                // Need dates for header
                const currHead = new Date(wStart);
                const headerDates: string[] = [];
                for (let i = 0; i < 7; i++) {
                    const y = currHead.getFullYear();
                    const m = String(currHead.getMonth() + 1).padStart(2, '0');
                    const d = String(currHead.getDate()).padStart(2, '0');
                    headerDates.push(`${y}-${m}-${d}`);
                    currHead.setDate(currHead.getDate() + 1);
                }

                let colIdx = 7; // G column (7)
                for (let i = 0; i < 7; i++) {
                    worksheet.mergeCells(rowIndex, colIdx, rowIndex, colIdx + 1);
                    const cell = worksheet.getCell(rowIndex, colIdx);
                    // Updated Header Format: YYYY-MM-DD(Day)
                    cell.value = `${headerDates[i]}${dayMap[i]}`;
                    applyStyle(cell, true);
                    if (i === 5) cell.font = { ...fontStyle, color: { argb: 'FF0000FF' }, bold: true };
                    if (i === 6) cell.font = { ...fontStyle, color: { argb: 'FFFF0000' }, bold: true };
                    colIdx += 2;
                }

                // Row 2
                const r2 = rowIndex + 1;
                worksheet.getCell(`C${r2}`).value = "총";
                worksheet.getCell(`D${r2}`).value = "기본";
                worksheet.getCell(`E${r2}`).value = "연장";
                worksheet.getCell(`F${r2}`).value = "특근";
                applyStyle(worksheet.getCell(`C${r2}`), true);
                applyStyle(worksheet.getCell(`D${r2}`), true);
                applyStyle(worksheet.getCell(`E${r2}`), true);
                applyStyle(worksheet.getCell(`F${r2}`), true);

                colIdx = 7;
                for (let i = 0; i < 7; i++) {
                    const c1 = worksheet.getCell(r2, colIdx);
                    const c2 = worksheet.getCell(r2, colIdx + 1);
                    c1.value = "시작";
                    c2.value = "종료";
                    applyStyle(c1, true);
                    applyStyle(c2, true);
                    colIdx += 2;
                }
                const headerEndRow = r2;
                rowIndex = r2 + 1;

                // --- SET NATIVE PRINT TITLES ---
                worksheet.pageSetup.printTitlesRow = `${headerStartRow}:${headerEndRow}`;

                // --- DATA RENDER ---
                const toRecognized = (min: number) => SpecialWorkCalculator.toRecognizedHours(min);

                const weekDates: string[] = [];
                const curr = new Date(wStart);
                for (let i = 0; i < 7; i++) {
                    const y = curr.getFullYear();
                    const m = String(curr.getMonth() + 1).padStart(2, '0');
                    const d = String(curr.getDate()).padStart(2, '0');
                    weekDates.push(`${y}-${m}-${d}`);
                    curr.setDate(curr.getDate() + 1);
                }

                const weekLogs = weekGroups[mondayStr];
                const userGroups = weekLogs.reduce<Record<string, ProcessedWorkLog[]>>((acc, log) => {
                    if (!acc[log.userId]) acc[log.userId] = [];
                    acc[log.userId].push(log);
                    return acc;
                }, {});

                const userIds = Object.keys(userGroups).filter(userId => {
                    const userLogs = userGroups[userId];
                    return userLogs.some(l =>
                        (l.actualWorkDuration > 0) || (l.overtimeDuration > 0) || (l.specialWorkMinutes > 0) ||
                        (['VACATION', 'TRIP', 'EDUCATION', 'SICK'].includes(l.logStatus))
                    );
                }).sort();

                let userSerial = 1;

                userIds.forEach(userId => {
                    const userLogs = userGroups[userId];
                    const user = userLogs[0];
                    const logMap = new Map<string, ProcessedWorkLog>(userLogs.map(l => [l.date, l]));

                    const summary = {
                        basicWorkHours: 0,
                        overtimeHours: 0,
                        specialWorkHours: 0,
                        totalRecognizedHours: 0
                    };

                    weekDates.forEach(dateStr => {
                        const log = logMap.get(dateStr);
                        if (!log) return;
                        const actualMin = log.actualWorkDuration || 0;
                        const overtimeMin = log.overtimeDuration || 0;
                        const specialMin = log.specialWorkMinutes || 0;
                        const [y, m, d] = dateStr.split('-').map(Number);
                        const dateObj = new Date(y, m - 1, d);
                        const day = dateObj.getDay();
                        const isSpecialDay = day === 0 || day === 6 || !!log.isHoliday;

                        if (isSpecialDay) {
                            if (log.logStatus !== 'REST') {
                                const dailyTotal = actualMin + specialMin;
                                summary.specialWorkHours += toRecognized(dailyTotal);
                                summary.totalRecognizedHours += toRecognized(dailyTotal);
                            }
                        } else {
                            const dailyTotal = actualMin + specialMin;
                            const basic = Math.min(actualMin, 480);
                            summary.basicWorkHours += toRecognized(basic);
                            const overtime = log.overtimeDuration || 0;
                            summary.overtimeHours += toRecognized(overtime);
                            if (specialMin > 0) {
                                summary.specialWorkHours += toRecognized(specialMin);
                            }
                            summary.totalRecognizedHours += toRecognized(dailyTotal);
                        }
                    });

                    // Render No.
                    const noCell = worksheet.getCell(`A${rowIndex}`);
                    noCell.value = String(userSerial).padStart(3, '0'); // 001, 002...
                    applyStyle(noCell);
                    userSerial++;

                    // Render Name
                    const nameCell = worksheet.getCell(`B${rowIndex}`);
                    nameCell.value = {
                        richText: [
                            { text: `${user.userName} (${user.userTitle || ''})`, font: { name: 'Malgun Gothic', size: 8, bold: true } },
                            { text: `\r\n${user.department || ''}`, font: { name: 'Malgun Gothic', size: 7, color: { argb: 'FF555555' } } }
                        ]
                    };
                    applyStyle(nameCell);
                    nameCell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
                    // Polish: Increase row height for readability (Adjusted to 30 based on user feedback)
                    worksheet.getRow(rowIndex).height = 30;

                    worksheet.getCell(`C${rowIndex}`).value = summary.totalRecognizedHours;
                    worksheet.getCell(`D${rowIndex}`).value = summary.basicWorkHours;
                    worksheet.getCell(`E${rowIndex}`).value = summary.overtimeHours;
                    worksheet.getCell(`F${rowIndex}`).value = summary.specialWorkHours;

                    ['C', 'D', 'E', 'F'].forEach(col => {
                        const c = worksheet.getCell(`${col}${rowIndex}`);
                        applyStyle(c);
                        c.numFmt = '0.0';
                        if (Number(c.value) === 0) c.value = '-';
                    });

                    colIdx = 7;
                    weekDates.forEach(date => {
                        const log = logMap.get(date);
                        let startStr = '';
                        let endStr = '';
                        if (log) {
                            if (['VACATION', 'TRIP', 'EDUCATION', 'SICK', 'REST'].includes(log.logStatus)) {
                                const map: any = { 'VACATION': '휴가', 'TRIP': '출장', 'EDUCATION': '교육', 'SICK': '병가', 'REST': '휴무' };
                                startStr = map[log.logStatus];
                                endStr = startStr;
                            } else {
                                startStr = log.rawStartTimeStr || (log.startTime > 0 ? TimeUtils.minutesToColonFormat(log.startTime) : '');
                                endStr = log.rawEndTimeStr || (log.endTime > 0 ? TimeUtils.minutesToColonFormat(log.endTime) : '');
                            }
                        }
                        const c1 = worksheet.getCell(rowIndex, colIdx);
                        const c2 = worksheet.getCell(rowIndex, colIdx + 1);
                        c1.value = startStr || '';
                        c2.value = endStr || '';
                        applyStyle(c1);
                        applyStyle(c2);
                        if (['휴가', '출장', '교육', '병가', '휴무'].includes(startStr)) {
                            worksheet.mergeCells(rowIndex, colIdx, rowIndex, colIdx + 1);
                            worksheet.getCell(rowIndex, colIdx).value = startStr;
                        }
                        colIdx += 2;
                    });
                    rowIndex++;
                });
            });

            // Generate Filename
            let companyName = "회사";
            let userName = "사용자";

            if (userContext) {
                if (userContext.name) userName = userContext.name;
                if (userContext.company_id === 'comp_eluon') companyName = "이루온";
                else if (userContext.company_id === 'comp_eluonins') companyName = "이루온아이앤에스";
                else if (userContext.company_id) companyName = userContext.company_id;
            } else {
                try {
                    const userStr = localStorage.getItem('user');
                    if (userStr) {
                        const userObj = JSON.parse(userStr);
                        if (userObj.name) userName = userObj.name;
                        if (userObj.company_id === 'comp_eluon') companyName = "이루온";
                        else if (userObj.company_id === 'comp_eluonins') companyName = "이루온아이앤에스";
                        else if (userObj.company_id) companyName = userObj.company_id;
                    }
                } catch (e) { console.warn("User parse fail", e); }
            }

            // Sanitize Company Name (remove (주))
            companyName = companyName.replace(/\(주\)/g, '').replace(/주식회사/g, '').trim();

            const startDateStr = sortedMondays[0]; // e.g., 2025-12-01
            const lastMondayStr = sortedMondays[sortedMondays.length - 1];
            const lastDateObj = new Date(lastMondayStr);
            lastDateObj.setDate(lastDateObj.getDate() + 6);
            const endDateStr = `${lastDateObj.getFullYear()}-${String(lastDateObj.getMonth() + 1).padStart(2, '0')}-${String(lastDateObj.getDate()).padStart(2, '0')}`;

            const startW = getCustomWeekNumber(new Date(startDateStr));
            const endW = getCustomWeekNumber(lastDateObj);
            const weekRange = `W${startW}-W${endW}`;

            const timestamp = Date.now();
            // Format: Company_근태대장_Start_End_Weeks_User_Timestamp
            const fileName = `${companyName}_근태대장_${startDateStr}_${endDateStr}_${weekRange}_${userName}_${timestamp}.xlsx`;

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            saveAs(blob, fileName);

        } catch (e) {
            console.error("Monthly Export failed", e);
            alert("월간 엑셀 내보내기 중 오류가 발생했습니다.");
        }
    }
}
