import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { TimeUtils } from '../../lib/timeUtils';
import { ProcessedWorkLog, LogStatus } from "../../types";
import { SpecialWorkCalculator } from '../../lib/specialWorkCalculator';

interface WeeklyPreviewTableProps {
    mondayStr: string;
    weekLogs: ProcessedWorkLog[];
    title?: string;
}

export const WeeklyPreviewTable: React.FC<WeeklyPreviewTableProps> = ({ mondayStr, weekLogs, title }) => {
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

    const userGroups = weekLogs.reduce((acc: Record<string, ProcessedWorkLog[]>, log: ProcessedWorkLog) => {
        if (!acc[log.userId]) acc[log.userId] = [];
        acc[log.userId].push(log);
        return acc;
    }, {});

    const userIds = Object.keys(userGroups).sort();
    const mondayDate = new Date(mondayStr);

    return (
        <Card className="overflow-hidden border-2 border-slate-300 shadow-md flex flex-col h-full">
            <CardHeader className="bg-slate-50 border-b-2 border-slate-300 py-3 px-5 flex flex-row items-center justify-between shrink-0">
                <CardTitle className="text-base font-bold text-slate-800">
                    {title || `${mondayDate.getFullYear()}년 ${mondayDate.getMonth() + 1}월 주간 근태현황 (시작일: ${mondayStr})`}
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-hidden relative">
                <div className="overflow-auto custom-scrollbar h-full w-full">
                    <table className="border-collapse text-xs table-fixed min-w-max">
                        {/* Sticky Header requires z-index handling */}
                        <colgroup>
                            <col className="w-[120px]" /> {/* Name - Sticky 1 */}
                            <col className="w-[60px]" />  {/* Total - Sticky 2 */}
                            <col className="w-[60px]" />  {/* Basic - Sticky 3 */}
                            <col className="w-[60px]" />  {/* Overtime - Sticky 4 */}
                            <col className="w-[60px]" />  {/* Special - Sticky 5 */}
                            {Array.from({ length: 14 }).map((_, i) => <col key={i} className="w-[70px]" />)}
                        </colgroup>
                        <thead className="sticky top-0 z-40 shadow-sm">
                            <tr className="bg-slate-100 text-slate-700 border-b-2 border-slate-300">
                                {/* Name Header - Highest z-index for sticky intersection */}
                                <th className="border border-slate-300 px-2 py-2 font-bold text-center align-middle bg-slate-100 sticky left-0 z-50" rowSpan={2}>
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-sm">이름</span>
                                        <span className="text-[10px] text-slate-500 font-normal">(부서/직급)</span>
                                    </div>
                                </th>
                                {/* Work Hours Group Header */}
                                <th className="border border-slate-300 px-2 py-2 font-bold text-center align-middle bg-slate-100 sticky left-[120px] z-40" colSpan={4}>
                                    주 근무시간 (시간)
                                </th>
                                {/* Days Headers */}
                                {weekDates.map((dateStr) => {
                                    const d = new Date(dateStr);
                                    const dayMap = ['(일)', '(월)', '(화)', '(수)', '(목)', '(금)', '(토)'];
                                    const dayIdx = d.getDay();
                                    const isWeekend = dayIdx === 0 || dayIdx === 6;
                                    const textColor = dayIdx === 0 ? 'text-red-700' : (dayIdx === 6 ? 'text-blue-700' : 'text-slate-700');
                                    const bgColor = dayIdx === 0 ? 'bg-red-50' : (dayIdx === 6 ? 'bg-blue-50' : 'bg-slate-100');

                                    return (
                                        <th key={dateStr} className={cn("border border-slate-300 px-1 py-2 font-bold text-center align-middle text-[11px]", textColor, bgColor)} colSpan={2}>
                                            <div className="flex flex-col gap-0.5">
                                                <span className="font-bold">{dateStr.slice(5)}</span>
                                                <span className="text-[10px] font-normal opacity-80">{dayMap[dayIdx]}</span>
                                            </div>
                                        </th>
                                    );
                                })}
                            </tr>
                            <tr className="bg-slate-50 text-slate-600 border-b border-slate-300">
                                {/* Sticky Sub-headers for Work Hours */}
                                <th className="border border-slate-300 px-1 py-1.5 font-bold text-center text-[11px] bg-slate-50 sticky left-[120px] z-40">총</th>
                                <th className="border border-slate-300 px-1 py-1.5 font-bold text-center text-[11px] bg-slate-50 sticky left-[180px] z-40">기본</th>
                                <th className="border border-slate-300 px-1 py-1.5 font-bold text-center text-[11px] bg-slate-50 sticky left-[240px] z-40">연장</th>
                                <th className="border border-slate-300 px-1 py-1.5 font-bold text-center text-[11px] bg-slate-50 sticky left-[300px] z-40">특근</th>

                                {weekDates.map(dateStr => (
                                    <React.Fragment key={dateStr}>
                                        <th className="border border-slate-300 px-1 py-1.5 font-semibold text-center text-[10px] bg-slate-50">시작</th>
                                        <th className="border border-slate-300 px-1 py-1.5 font-semibold text-center text-[10px] bg-slate-50">종료</th>
                                    </React.Fragment>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-white">
                            {userIds.map(userId => {
                                const userLogs = userGroups[userId];
                                const user = userLogs[0];
                                const logMap = new Map<string, ProcessedWorkLog>(userLogs.map(l => [l.date, l]));

                                const summary = userLogs.reduce((acc, l) => {
                                    // [Unification] Apply Recognized Hour Logic BEFORE splitting
                                    const recognizedMinutes = SpecialWorkCalculator.toRecognizedHours(l.actualWorkDuration || 0) * 60;

                                    const [y, m, d] = l.date.split('-').map(Number);
                                    const dateObj = new Date(y, m - 1, d);
                                    const day = dateObj.getDay();
                                    const isWeekend = day === 0 || day === 6;
                                    const isSpecialDay = isWeekend || l.isHoliday;

                                    if (l.logStatus === LogStatus.REST) return acc;

                                    if (isSpecialDay) {
                                        // Holiday/Weekend -> All to Special
                                        // (Or Check if logStatus is strictly special? logic seems to rely on Day Type)
                                        acc.specialWorkMinutes += recognizedMinutes;
                                        acc.totalWorkMinutes += recognizedMinutes;
                                    } else {
                                        // Normal Day -> Basic + Overtime
                                        const basic = Math.min(recognizedMinutes, 480);
                                        const overtime = Math.max(0, recognizedMinutes - 480);

                                        acc.basicWorkMinutes += basic;
                                        acc.overtimeMinutes += overtime;
                                        acc.totalWorkMinutes += recognizedMinutes;
                                    }
                                    return acc;
                                }, { totalWorkMinutes: 0, basicWorkMinutes: 0, overtimeMinutes: 0, specialWorkMinutes: 0 });

                                return (
                                    <tr key={userId} className="hover:bg-slate-50 transition-colors border-b border-slate-200">
                                        <td className="border border-slate-300 px-2 py-2 bg-white font-medium text-slate-900 align-middle sticky left-0 z-30">
                                            <div className="flex flex-col pl-1">
                                                <div className="flex items-baseline gap-1.5">
                                                    <span className="font-bold text-sm whitespace-nowrap text-slate-800">{user.userName}</span>
                                                    <span className="text-xs text-slate-500 whitespace-nowrap">({user.userTitle})</span>
                                                </div>
                                                <span className="text-[10px] text-slate-400 whitespace-nowrap mt-0.5">{user.department}</span>
                                            </div>
                                        </td>
                                        {/* Total - Sticky 2 */}
                                        <td className="border border-slate-300 px-1 py-2 text-center text-slate-800 font-mono text-xs font-semibold bg-slate-50 sticky left-[120px] z-20">{TimeUtils.minutesToColonFormat(summary.totalWorkMinutes)}</td>
                                        {/* Basic - Sticky 3 */}
                                        <td className="border border-slate-300 px-1 py-2 text-center text-slate-700 font-mono text-xs bg-white sticky left-[180px] z-20">{TimeUtils.minutesToColonFormat(summary.basicWorkMinutes)}</td>
                                        {/* Overtime - Sticky 4 */}
                                        <td className="border border-slate-300 px-1 py-2 text-center text-slate-700 font-mono text-xs bg-white sticky left-[240px] z-20">{TimeUtils.minutesToColonFormat(summary.overtimeMinutes)}</td>
                                        {/* Special - Sticky 5 */}
                                        <td className="border border-slate-300 px-1 py-2 text-center text-slate-700 font-mono text-xs bg-white sticky left-[300px] z-20">{TimeUtils.minutesToColonFormat(summary.specialWorkMinutes || 0)}</td>

                                        {weekDates.map(date => {
                                            const log = logMap.get(date);
                                            const exists = !!log;
                                            let startStr = '';
                                            let endStr = '';

                                            if (exists && log) {
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

                                            return (
                                                <React.Fragment key={date}>
                                                    <td className="border border-slate-300 px-1 py-1 text-center font-mono text-xs text-slate-600 whitespace-nowrap">
                                                        {startStr}
                                                    </td>
                                                    <td className="border border-slate-300 px-1 py-1 text-center font-mono text-xs text-slate-600 whitespace-nowrap">
                                                        {endStr}
                                                    </td>
                                                </React.Fragment>
                                            )
                                        })}
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    );
};
