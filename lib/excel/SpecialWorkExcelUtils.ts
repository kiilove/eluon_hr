import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { SpecialWorkCalculator } from '../specialWorkCalculator';

interface ExportLog {
    employeeName: string;
    employeeId: string;
    date: string;
    startTime: string;
    endTime: string;
    breakMinutes: number;
    description: string;
    persona?: string;
    actualWorkMinutes?: number;
}

export const SpecialWorkExcelUtils = {

    /**
     * Helper to apply common page setup
     */
    applyPageSetup: (sheet: ExcelJS.Worksheet, orientation: 'portrait' | 'landscape' = 'portrait') => {
        sheet.pageSetup.paperSize = 9; // A4
        sheet.pageSetup.orientation = orientation;
        sheet.pageSetup.fitToPage = true;
        sheet.pageSetup.fitToWidth = 1;
        sheet.pageSetup.fitToHeight = 0; // Automatic height
        sheet.pageSetup.margins = {
            left: 0.7, right: 0.7,
            top: 0.75, bottom: 0.75,
            header: 0.3, footer: 0.3
        };
    },

    /**
     * Helper to add a Title Row
     */
    addTitleRow: (sheet: ExcelJS.Worksheet, title: string, mergeEndCol: number) => {
        // Row 1: Title
        const titleRow = sheet.getRow(1);
        titleRow.height = 35;
        sheet.mergeCells(1, 1, 1, mergeEndCol);
        const titleCell = titleRow.getCell(1);
        titleCell.value = title;
        titleCell.font = { size: 16, bold: true, name: 'Malgun Gothic' };
        titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    },

    /**
     * Export Attendance Detail View (Vertical A4)
     * Formerly exportToExcel
     */
    exportAttendance: async (logs: ExportLog[], targets: Record<string, number> = {}, filename = 'special_work_attendance.xlsx', reportTitle = '특근/근태 상세 내역') => {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('근태 상세');

        SpecialWorkExcelUtils.applyPageSetup(sheet, 'portrait');

        // Title
        SpecialWorkExcelUtils.addTitleRow(sheet, reportTitle, 9);

        // Columns Setup (Start at Row 2)
        sheet.getRow(2).values = ['이름', '사번', '날짜', '출근', '퇴근', '휴게(분)', '실제근무', '인정근무', '비고'];
        sheet.columns = [
            { key: 'name', width: 12 },
            { key: 'id', width: 10 },
            { key: 'date', width: 14 },
            { key: 'start', width: 12 },
            { key: 'end', width: 12 },
            { key: 'break', width: 10 },
            { key: 'actualWork', width: 12 },
            { key: 'recognizedWork', width: 12 },
            { key: 'desc', width: 30 },
        ];

        // Header Style (Row 2)
        const headerRow = sheet.getRow(2);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Malgun Gothic' };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4361EE' } };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
        headerRow.height = 25;

        // Group by Employee
        const groups = new Map<string, ExportLog[]>();
        logs.forEach(l => {
            const key = `${l.employeeName}_${l.employeeId}`; // Unique Key
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(l);
        });

        const sortedKeys = Array.from(groups.keys()).sort();
        let currentRowIdx = 3;

        sortedKeys.forEach(key => {
            const groupLogs = groups.get(key)!;
            groupLogs.sort((a, b) => a.date.localeCompare(b.date));
            const empName = groupLogs[0].employeeName;
            const empId = groupLogs[0].employeeId;
            const targetHours = targets[empId] || 0;

            // Calculate Total
            let totalRecognizedHours = 0;

            // Detail Rows
            groupLogs.forEach((log, idx) => {
                const r = sheet.getRow(currentRowIdx++);

                // Recalc hours if needed, or use supplied
                let minutes = log.actualWorkMinutes;
                if (!minutes) {
                    const [sh, sm] = (log.startTime || "0:0").split(':').map(Number);
                    const [eh, em] = (log.endTime || "0:0").split(':').map(Number);
                    minutes = (eh * 60 + em) - (sh * 60 + sm) - log.breakMinutes;
                }

                const h = Math.floor((minutes || 0) / 60);
                const m = (minutes || 0) % 60;

                // Use Centralized Rounding
                const recHours = SpecialWorkCalculator.toRecognizedHours(minutes || 0);
                totalRecognizedHours += recHours;

                r.values = {
                    name: idx === 0 ? empName : '', // Show name only on first row
                    id: idx === 0 ? empId : '',
                    date: log.date,
                    start: log.startTime,
                    end: log.endTime,
                    break: log.breakMinutes,
                    actualWork: `${h}h ${m}m`,
                    recognizedWork: `${recHours}H`,
                    desc: log.description
                };

                // Styles
                r.font = { name: 'Malgun Gothic', size: 10 };
                r.alignment = { vertical: 'middle' };
                r.getCell('date').alignment = { horizontal: 'center' };
                r.getCell('start').alignment = { horizontal: 'center' };
                r.getCell('end').alignment = { horizontal: 'center' };
                r.getCell('break').alignment = { horizontal: 'center' };
                r.getCell('actualWork').alignment = { horizontal: 'center' };
                const recognizedCell = r.getCell('recognizedWork');
                recognizedCell.alignment = { horizontal: 'center' };
                recognizedCell.font = { bold: true, color: { argb: 'FFEA580C' } }; // Orange

                r.eachCell((cell) => {
                    cell.border = {
                        bottom: { style: 'thin', color: { argb: 'FFEEEEEE' } }
                    };
                });
            });

            // Summary Row (Optional? Or just a divider?)
            // If targets exist, show comparison
            if (targetHours > 0) {
                const summaryRow = sheet.getRow(currentRowIdx++);
                summaryRow.values = {
                    name: '합계',
                    recognizedWork: `${totalRecognizedHours}H`,
                    desc: `목표: ${targetHours}H / 차이: ${totalRecognizedHours - targetHours}H`
                };
                summaryRow.font = { bold: true, name: 'Malgun Gothic', size: 10 };
                summaryRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
                summaryRow.eachCell(c => c.border = { top: { style: 'double', color: { argb: 'FFCCCCCC' } } });
                sheet.mergeCells(currentRowIdx - 1, 1, currentRowIdx - 1, 7); // Merge Name to Actual
                summaryRow.getCell('name').alignment = { horizontal: 'right' };
            }

            // Gap
            currentRowIdx++;
        });

        // Final Write
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, filename);
    },

    exportPivot: async (pivotData: { dates: string[], rows: any[] }, filename = 'special_work_pivot.xlsx', reportTitle = '특근 내역 (피벗)') => {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('피벗 상세');

        SpecialWorkExcelUtils.applyPageSetup(sheet, 'landscape');

        // Headers Config
        const cols = [
            { header: '성명', key: 'name', width: 12 },
            { header: '직위', key: 'position', width: 10 },
            { header: '부서', key: 'department', width: 15 },
            ...pivotData.dates.map(d => ({ header: d.slice(5), key: d, width: 6 })), // Short date header
            { header: '인정시간', key: 'hours', width: 12 },
            { header: '적용시급', key: 'wage', width: 15 },
            { header: '총 지급액', key: 'total', width: 18 }
        ];

        // Ensure columns index match correctly for merging
        const totalCols = cols.length;

        // Title
        SpecialWorkExcelUtils.addTitleRow(sheet, reportTitle, totalCols);

        // Header Row (Row 2)
        sheet.getRow(2).values = cols.map(c => c.header);
        sheet.columns = cols as any;

        const headerRow = sheet.getRow(2);
        headerRow.height = 30;
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Malgun Gothic' };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4361EE' } };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

        // Freeze
        sheet.views = [{ state: 'frozen', xSplit: 3, ySplit: 2 }];

        // Rows
        let rowIdx = 3;
        pivotData.rows.forEach(r => {
            const rowVal: any = {
                name: r.name,
                position: r.position,
                department: r.department,
                hours: r.totalHours ? `${r.totalHours}H` : '-',
                wage: r.specialWage || 0,
                total: r.total
            };

            // Logs
            if (r.logs && (r.logs instanceof Map || typeof r.logs === 'object')) {
                const entries = r.logs instanceof Map ? r.logs.entries() : Object.entries(r.logs);
                for (const [date, type] of entries) {
                    let sym = '';
                    if (type === 'REGULAR') sym = '◎';
                    else if (type === 'REMOTE') sym = '★';
                    else if (type === 'HOLIDAY') sym = 'H';
                    rowVal[date] = sym;
                }
            }

            const row = sheet.addRow(rowVal);
            row.height = 20;
            row.font = { name: 'Malgun Gothic', size: 10 };
            row.alignment = { vertical: 'middle' };

            // Borders
            row.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFEEEEEE' } },
                    left: { style: 'thin', color: { argb: 'FFEEEEEE' } },
                    bottom: { style: 'thin', color: { argb: 'FFEEEEEE' } },
                    right: { style: 'thin', color: { argb: 'FFEEEEEE' } }
                };
            });

            // Symbols Color
            pivotData.dates.forEach(d => {
                const cell = row.getCell(d);
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                const val = cell.value?.toString();
                if (val === '◎') {
                    cell.font = { color: { argb: 'FF2563EB' }, bold: true };
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F9FF' } };
                }
                else if (val === '★') {
                    cell.font = { color: { argb: 'FFD97706' }, bold: true };
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } };
                }
            });

            // Number formats
            row.getCell('wage').numFmt = '#,##0';
            row.getCell('total').numFmt = '#,##0';
            row.getCell('total').font = { bold: true };
            row.getCell('hours').alignment = { horizontal: 'center' };
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, filename);
    },

    exportList: async (listData: any[], filename = 'special_work_list.xlsx', reportTitle = '특근 내역 (리스트)') => {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('리스트 상세');

        SpecialWorkExcelUtils.applyPageSetup(sheet, 'portrait');
        SpecialWorkExcelUtils.addTitleRow(sheet, reportTitle, 7);

        // Header Row (Row 2)
        sheet.getRow(2).values = ['날짜', '성명', '직위', '부서', '근무유형', '적용시급', '지급액'];
        sheet.columns = [
            { key: 'date', width: 14 },
            { key: 'name', width: 12 },
            { key: 'position', width: 10 },
            { key: 'department', width: 15 },
            { key: 'type', width: 12 },
            { key: 'wage', width: 15 },
            { key: 'amount', width: 15 }
        ];

        // Header Style
        const headerRow = sheet.getRow(2);
        headerRow.height = 30;
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Malgun Gothic' };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4361EE' } };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

        listData.forEach(p => {
            if (p.items && Array.isArray(p.items)) {
                p.items.sort((a: any, b: any) => a.work_date.localeCompare(b.work_date)).forEach((item: any) => {
                    const row = sheet.addRow({
                        date: item.work_date,
                        name: p.name,
                        position: p.position,
                        department: p.department,
                        type: item.work_type === 'REGULAR' ? '특근' : item.work_type === 'REMOTE' ? '재택' : item.work_type,
                        wage: p.specialWage || 0,
                        amount: item.daily_allowance || 0
                    });

                    row.font = { name: 'Malgun Gothic', size: 10 };
                    row.alignment = { vertical: 'middle' };
                    row.getCell('date').alignment = { horizontal: 'center' };
                    row.getCell('position').alignment = { horizontal: 'center' };
                    row.getCell('type').alignment = { horizontal: 'center' };
                    row.getCell('wage').numFmt = '#,##0';
                    row.getCell('amount').numFmt = '#,##0';

                    row.eachCell((cell) => {
                        cell.border = {
                            bottom: { style: 'thin', color: { argb: 'FFEEEEEE' } }
                        };
                    });
                });
            }
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, filename);
    }
};
