import { useData } from '../contexts/DataContext';
import { ProcessedWorkLog, WorkType } from '../types';
import { WorkHourCalculator } from '../lib/workHourCalculator';
import { TimeUtils } from '../lib/timeUtils';
import { HolidayUtils } from '../lib/holidayUtils';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Download, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import React from 'react';
import { cn } from '../lib/utils';
import ExcelJS from 'exceljs';

export const ExportPreviewPage = () => {
    const { logs } = useData();
    const navigate = useNavigate();

    // Helper: Get Monday of the week for grouping
    const getMondayOfWeek = (date: Date): string => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
        const monday = new Date(d.setDate(diff));

        const year = monday.getFullYear();
        const month = String(monday.getMonth() + 1).padStart(2, '0');
        const dt = String(monday.getDate()).padStart(2, '0');
        return `${year}-${month}-${dt}`;
    };

    // Group logs by Monday (Start of Week)
    const weekGroups: Record<string, ProcessedWorkLog[]> = {};
    logs.forEach(log => {
        const mondayStr = getMondayOfWeek(new Date(log.date));
        if (!weekGroups[mondayStr]) weekGroups[mondayStr] = [];
        weekGroups[mondayStr].push(log);
    });

    // Group logs by user within each week
    const getWeekUserGroups = (weekLogs: ProcessedWorkLog[]) => {
        const groups: Record<string, ProcessedWorkLog[]> = {};
        weekLogs.forEach(log => {
            if (!groups[log.userId]) groups[log.userId] = [];
            groups[log.userId].push(log);
        });
        return groups;
    }

    const sortedMondays = Object.keys(weekGroups).sort();

    // Generate fixed 7 dates for a week starting from Monday
    const getWeekDates = (mondayStr: string): string[] => {
        const dates: string[] = [];
        const current = new Date(mondayStr);
        // Ensure time is noon to avoid DST issues when adding days
        current.setHours(12, 0, 0, 0);

        for (let i = 0; i < 7; i++) {
            const year = current.getFullYear();
            const month = String(current.getMonth() + 1).padStart(2, '0');
            const day = String(current.getDate()).padStart(2, '0');
            dates.push(`${year}-${month}-${day}`);
            current.setDate(current.getDate() + 1);
        }
        return dates;
    };

    const handleExport = async () => {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('근태현황');

        // Page Setup: A4 Landscape, Fit to Width
        worksheet.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

        // Define Columns
        // Adjusted Widths for A4 fit
        worksheet.columns = [
            { width: 20 }, // A: Name (Increased width)
            { width: 9 },  // B: Total
            { width: 9 },  // C: Basic
            { width: 9 },  // D: OT
            { width: 9 },  // E: Special
            // 14 Daily Columns
            ...Array(14).fill({ width: 10 })
        ];

        let currentRow = 1;

        for (const mondayStr of sortedMondays) {
            const weekLogs = weekGroups[mondayStr];
            const weekDates = getWeekDates(mondayStr);
            const userGroups = getWeekUserGroups(weekLogs);
            const userIds = Object.keys(userGroups).sort();

            const mondayDate = new Date(mondayStr);
            const year = mondayDate.getFullYear();
            const month = mondayDate.getMonth() + 1;

            // 1. Title Row
            const titleRow = worksheet.getRow(currentRow);
            titleRow.getCell(1).value = `${year}년 ${month}월 주간 근태현황 (시작일: ${mondayStr})`;
            titleRow.getCell(1).font = { bold: true, size: 14, name: 'Malgun Gothic' };
            titleRow.getCell(1).alignment = { horizontal: 'center' };
            worksheet.mergeCells(currentRow, 1, currentRow, 19); // Merge A to S
            titleRow.height = 35;
            currentRow++;

            // 2. Header Row 1 (Dates)
            const headerRow1 = worksheet.getRow(currentRow);
            headerRow1.height = 30;

            // Name Header
            const nameCell = headerRow1.getCell(1);
            nameCell.value = "이름";
            nameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }; // Slate 200
            nameCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
            nameCell.alignment = { vertical: 'middle', horizontal: 'center' };
            nameCell.font = { bold: true, size: 10, name: 'Malgun Gothic' };
            // Merge Name vertically later (Row 1 & 2)

            // Summary Header
            const summaryCell = headerRow1.getCell(2);
            summaryCell.value = "주 근무시간";
            summaryCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
            summaryCell.alignment = { horizontal: 'center', vertical: 'middle' };
            summaryCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
            summaryCell.font = { bold: true, size: 10, name: 'Malgun Gothic' };
            worksheet.mergeCells(currentRow, 2, currentRow, 5); // Merge B to E

            // Date Headers
            let colIndex = 6;
            weekDates.forEach(dateStr => {
                const d = new Date(dateStr);
                const day = d.getDay();
                const isHoliday = HolidayUtils.isHoliday(d);
                const dayNames = ['(일)', '(월)', '(화)', '(수)', '(목)', '(금)', '(토)'];

                const cell = headerRow1.getCell(colIndex);
                cell.value = `${dateStr} ${dayNames[day]}`;

                // Color Logic
                let argb = 'FFE2E8F0'; // Default Slate
                if (day === 0 || isHoliday) argb = 'FFFFE4E6'; // Red
                else if (day === 6) argb = 'FFDBEAFE'; // Blue

                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
                cell.font = { bold: true, size: 10, name: 'Malgun Gothic', color: { argb: (day === 0 || isHoliday) ? 'FFDC2626' : (day === 6 ? 'FF2563EB' : 'FF000000') } };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };

                worksheet.mergeCells(currentRow, colIndex, currentRow, colIndex + 1);
                colIndex += 2;
            });
            currentRow++;

            // 3. Header Row 2 (Sub-headers)
            const headerRow2 = worksheet.getRow(currentRow);
            headerRow2.height = 25;

            // Name (Merge Check)
            worksheet.mergeCells(currentRow - 1, 1, currentRow, 1); // Merge Name A1:A2

            // Sub Headers: Total, Basic, OT, Special
            ['총', '기본', '연장', '특근'].forEach((text, idx) => {
                const cell = headerRow2.getCell(2 + idx);
                cell.value = text;
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }; // Slate 100
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
                cell.font = { size: 9, name: 'Malgun Gothic' };
            });

            // Start/End Headers
            colIndex = 6;
            weekDates.forEach(dateStr => {
                const d = new Date(dateStr);
                const day = d.getDay();
                const isHoliday = HolidayUtils.isHoliday(d);
                let argb = 'FFF1F5F9';
                if (day === 0 || isHoliday) argb = 'FFFFE4E6';
                else if (day === 6) argb = 'FFDBEAFE';

                ['시작', '종료'].forEach((text, idx) => {
                    const c = headerRow2.getCell(colIndex + idx);
                    c.value = text;
                    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
                    c.alignment = { horizontal: 'center', vertical: 'middle' };
                    c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
                    c.font = { size: 9, name: 'Malgun Gothic' };
                });
                colIndex += 2;
            });
            currentRow++;

            // 4. Data Rows
            userIds.forEach(userId => {
                const userLogs = userGroups[userId];
                const user = userLogs[0];
                const logMap = new Map(userLogs.map(l => [l.date, l]));
                const summary = WorkHourCalculator.calculateWeeklySummary(userId, userLogs, WorkType.STANDARD);

                const row = worksheet.getRow(currentRow);
                row.height = 42; // Fixed Height for consistency & 2 lines

                // Name Only
                const nameCell = row.getCell(1);
                nameCell.value = `${user.userName} (${user.userTitle || ''})\n${user.department || ''}`;
                nameCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; // Centered
                nameCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
                nameCell.font = { size: 10, name: 'Malgun Gothic' }; // Standardize Font Size

                // Summaries
                const summaries = [
                    TimeUtils.minutesToColonFormat(summary.totalWorkMinutes),
                    TimeUtils.minutesToColonFormat(summary.basicWorkMinutes),
                    TimeUtils.minutesToColonFormat(summary.overtimeMinutes),
                    TimeUtils.minutesToColonFormat(summary.specialWorkMinutes)
                ];

                summaries.forEach((val, idx) => {
                    const c = row.getCell(2 + idx);
                    c.value = val;
                    c.alignment = { horizontal: 'center', vertical: 'middle' };
                    c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
                    c.font = { size: 10, name: 'Malgun Gothic' }; // Standardize Font Size
                    if (idx === 0) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEDD5' } }; // Orange tint
                });

                // Daily Data
                colIndex = 6;
                weekDates.forEach(date => {
                    const log = logMap.get(date);
                    const startStr = log ? (log.rawStartTimeStr || (log.startTime > 0 ? TimeUtils.minutesToColonFormat(log.startTime) : '')) : '';
                    const endStr = log ? (log.rawEndTimeStr || (log.endTime > 0 ? TimeUtils.minutesToColonFormat(log.endTime) : '')) : '';

                    [startStr, endStr].forEach((val, idx) => {
                        const c = row.getCell(colIndex + idx);
                        c.value = val;
                        c.alignment = { horizontal: 'center', vertical: 'middle' };
                        c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
                        c.font = { size: 10, name: 'Malgun Gothic' };
                    });
                    colIndex += 2;
                });

                currentRow++;
            });

            // Spacer
            currentRow += 2;
        }

        // Generate Buffer & Download
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `근태현황_수정됨_${new Date().toISOString().split('T')[0]}.xlsx`;
        anchor.click();
        window.URL.revokeObjectURL(url);
    };

    if (logs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
                <div className="text-center space-y-2">
                    <h3 className="text-2xl font-semibold">데이터가 없습니다</h3>
                    <p className="text-muted-foreground">먼저 엑셀 파일을 업로드해주세요.</p>
                </div>
                <Button onClick={() => navigate('/upload')}>
                    데이터 업로드하기
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-20">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" onClick={() => navigate('/')}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        대시보드로
                    </Button>
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight">엑셀 내보내기 미리보기</h2>
                        <p className="text-muted-foreground">실제 엑셀 파일과 동일한 형식으로 표시됩니다 (월~일 고정)</p>
                    </div>
                </div>
                <Button variant="default" size="sm" onClick={handleExport}>
                    <Download className="mr-2 h-4 w-4" />
                    엑셀로 내보내기
                </Button>
            </div>

            {/* Weekly Tables */}
            {sortedMondays.map(mondayStr => {
                const weekLogs = weekGroups[mondayStr];
                const weekDates = getWeekDates(mondayStr);
                const userGroups = getWeekUserGroups(weekLogs);
                const userIds = Object.keys(userGroups).sort();

                // Get header info
                const mondayDate = new Date(mondayStr);
                const year = mondayDate.getFullYear();
                const month = mondayDate.getMonth() + 1;

                return (
                    <Card key={mondayStr} className="overflow-hidden border-2 border-slate-300 shadow-md">
                        <CardHeader className="bg-slate-100 border-b border-slate-300 py-4">
                            <CardTitle className="text-center text-xl font-bold text-slate-800">
                                {year}년 {month}월 주간 근태현황 (시작일: {mondayStr})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto custom-scrollbar">
                                <table className="w-full border-collapse text-xs table-fixed min-w-[1200px]">
                                    <colgroup>
                                        <col className="w-[180px]" /> {/* Name */}
                                        <col className="w-[60px]" /> {/* Total */}
                                        <col className="w-[60px]" /> {/* Basic */}
                                        <col className="w-[60px]" /> {/* OT */}
                                        <col className="w-[60px]" /> {/* Special */}
                                        {/* 7 Days * 2 Cols = 14 Cols */}
                                        {Array.from({ length: 14 }).map((_, i) => <col key={i} className="w-[75px]" />)}
                                    </colgroup>
                                    <thead>
                                        {/* Header Row 1 */}
                                        <tr className="bg-slate-200 text-slate-700">
                                            <th className="border border-slate-400 px-2 py-1 font-bold text-center h-10 align-middle bg-slate-200" rowSpan={2} style={{ position: 'sticky', left: 0, zIndex: 20 }}>
                                                이름
                                            </th>
                                            <th className="border border-slate-400 px-2 py-1 font-bold text-center h-10 align-middle" colSpan={4}>
                                                주 근무시간
                                            </th>
                                            {weekDates.map(dateStr => {
                                                const d = new Date(dateStr);
                                                const dayNames = ['(일)', '(월)', '(화)', '(수)', '(목)', '(금)', '(토)'];
                                                const dayIndex = d.getDay();
                                                const dayName = dayNames[dayIndex];
                                                const isHoliday = HolidayUtils.isHoliday(d);
                                                const holidayName = HolidayUtils.getHolidayName(d);

                                                // Style: Sunday/Holiday=Red, Saturday=Blue
                                                const textColor = (dayIndex === 0 || isHoliday) ? 'text-red-600' : (dayIndex === 6 ? 'text-blue-600' : 'text-slate-700');
                                                const bgColor = (dayIndex === 0 || isHoliday) ? 'bg-red-50' : (dayIndex === 6 ? 'bg-blue-50' : 'bg-slate-100');

                                                return (
                                                    <th key={dateStr} className={cn("border border-slate-400 px-1 py-1 font-bold text-center h-10 align-middle text-[11px]", textColor, bgColor)} colSpan={2}>
                                                        {dateStr} {dayName}
                                                        {holidayName && <span className="block text-[10px] opacity-80">{holidayName}</span>}
                                                    </th>
                                                );
                                            })}
                                        </tr>
                                        {/* Header Row 2 */}
                                        <tr className="bg-slate-100 text-slate-600">
                                            <th className="border border-slate-400 px-1 py-1 font-bold text-center text-[11px] bg-slate-100">총</th>
                                            <th className="border border-slate-400 px-1 py-1 font-bold text-center text-[11px] bg-slate-100">기본</th>
                                            <th className="border border-slate-400 px-1 py-1 font-bold text-center text-[11px] bg-slate-100">연장</th>
                                            <th className="border border-slate-400 px-1 py-1 font-bold text-center text-[11px] bg-slate-100">특근</th>

                                            {weekDates.map(dateStr => {
                                                const d = new Date(dateStr);
                                                const dayIndex = d.getDay();
                                                const isHoliday = HolidayUtils.isHoliday(d);
                                                const bgColor = (dayIndex === 0 || isHoliday) ? 'bg-red-50' : (dayIndex === 6 ? 'bg-blue-50' : 'bg-slate-100');

                                                return (
                                                    <React.Fragment key={dateStr}>
                                                        <th className={cn("border border-slate-400 px-1 py-1 font-bold text-center text-[10px]", bgColor)}>업무시작</th>
                                                        <th className={cn("border border-slate-400 px-1 py-1 font-bold text-center text-[10px]", bgColor)}>업무종료</th>
                                                    </React.Fragment>
                                                )
                                            })}
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white">
                                        {userIds.map(userId => {
                                            const userLogs = userGroups[userId];
                                            const user = userLogs[0];
                                            const logMap = new Map(userLogs.map(l => [l.date, l]));

                                            // Calculate Summary using Logic (Single Source of Truth)
                                            const summary = WorkHourCalculator.calculateWeeklySummary(userId, userLogs, WorkType.STANDARD);

                                            const totalHours = TimeUtils.minutesToColonFormat(summary.totalWorkMinutes);
                                            const basicHours = TimeUtils.minutesToColonFormat(summary.basicWorkMinutes);
                                            const overtimeHours = TimeUtils.minutesToColonFormat(summary.overtimeMinutes); // WeekDay OT Only
                                            const specialHours = TimeUtils.minutesToColonFormat(summary.specialWorkMinutes || 0); // Special Work

                                            return (
                                                <tr key={userId} className="hover:bg-slate-50 transition-colors">
                                                    {/* Name Column (Sticky) */}
                                                    <td className="border border-slate-300 px-2 py-1 bg-slate-50 font-medium text-slate-900 align-middle" style={{ position: 'sticky', left: 0, zIndex: 10 }}>
                                                        <div className="flex flex-col pl-1">
                                                            <div className="flex items-baseline gap-1">
                                                                <span className="font-bold text-sm whitespace-nowrap">{user.userName}</span>
                                                                <span className="text-xs text-slate-600 whitespace-nowrap">{user.userTitle}</span>
                                                            </div>
                                                            <span className="text-[10px] text-slate-500 whitespace-nowrap">{user.department}</span>
                                                        </div>
                                                    </td>

                                                    {/* Weekly Summary */}
                                                    <td className="border border-slate-300 px-1 py-1 text-center text-slate-700 font-mono text-xs bg-orange-50/30">{totalHours}</td>
                                                    <td className="border border-slate-300 px-1 py-1 text-center text-slate-700 font-mono text-xs">{basicHours}</td>
                                                    <td className="border border-slate-300 px-1 py-1 text-center text-slate-700 font-mono text-xs">{overtimeHours}</td>
                                                    <td className="border border-slate-300 px-1 py-1 text-center text-slate-700 font-mono text-xs">{specialHours}</td>

                                                    {/* Daily Columns */}
                                                    {weekDates.map(date => {
                                                        const log = logMap.get(date);
                                                        const exists = !!log;

                                                        const startStr = exists ? (log.rawStartTimeStr || (log.startTime > 0 ? TimeUtils.minutesToColonFormat(log.startTime) : '')) : '';
                                                        const endStr = exists ? (log.rawEndTimeStr || (log.endTime > 0 ? TimeUtils.minutesToColonFormat(log.endTime) : '')) : '';

                                                        return (
                                                            <React.Fragment key={date}>
                                                                <td className="border border-slate-300 px-1 py-1 text-center font-mono text-xs text-slate-600 whitespace-nowrap">
                                                                    {startStr}
                                                                </td>
                                                                <td className="border border-slate-300 px-1 py-1 text-center font-mono text-xs text-slate-600 whitespace-nowrap">
                                                                    {endStr}
                                                                </td>
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
};
