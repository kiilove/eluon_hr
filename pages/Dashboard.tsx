import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Calendar } from 'lucide-react';
import { ExcelReportGenerator } from '../lib/excelReportGenerator';
import { ProcessedWorkLog, LogStatus, GlobalConfig } from '../types';
import { TimeUtils } from '../lib/timeUtils';

export const Dashboard = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [logs, setLogs] = useState<ProcessedWorkLog[]>([]);
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');

    // Default Config for calculation (assuming standard 1h break)
    const config: GlobalConfig = {
        standardStartTime: "09:00",
        standardEndTime: "18:00",
        clockInCutoffTime: "08:30",
        clockOutCutoffTime: "18:30",
        lateClockInGraceMinutes: 10,
        breakTimeMinutes: 60,
        maxWeeklyOvertimeMinutes: 720
    };

    const fetchLogs = async () => {
        setIsLoading(true);
        try {
            const query = new URLSearchParams();
            if (startDate) query.append('startDate', startDate);
            if (endDate) query.append('endDate', endDate);

            const res = await fetch(`/api/reports/logs?${query.toString()}`);
            const json = await res.json();

            if (json.success) {
                // Transform DB rows to ProcessedWorkLog
                const processed: ProcessedWorkLog[] = json.data.map((row: any) => {
                    const startMin = row.start_time ? TimeUtils.timeToMinutes(row.start_time.substring(0, 5)) : 0;
                    const endMin = row.end_time ? TimeUtils.timeToMinutes(row.end_time.substring(0, 5)) : 0;

                    let totalDuration = Math.max(0, endMin - startMin);
                    let breakDuration = 0;

                    // Simple Break Logic: If worked > 4h, deduct 1h break (standard)
                    // Or specific time range? 12:00-13:00?
                    // Let's use standard logic: if total > 4h (240m), break 60m.
                    // But check if work spans 12:00-13:00? 
                    // To match "WorkHourCalculator", we should be careful.
                    // For now, simple deduction if > 4h is safer for general summary.
                    if (totalDuration >= 240) breakDuration = 60;

                    let actualWork = Math.max(0, totalDuration - breakDuration);

                    // Overtime: > 8h
                    if (actualWork > 480) {
                        // actualWork includes overtime relative to 8h?
                        // If logic says actualWork is TOTAL effective work:
                        // then Overtime = actual - 480.
                        // And usually Basic = 480.
                    }

                    // Re-use logic from Step 4 Preview (re-calculate on fly)
                    const overtimeDuration = Math.max(0, actualWork - 480);

                    return {
                        id: row.id,
                        userId: row.userId,
                        userName: row.userName,
                        userTitle: row.userTitle,
                        department: row.department,
                        date: row.date,
                        startTime: startMin,
                        endTime: endMin,
                        rawStartTimeStr: row.start_time,
                        rawEndTimeStr: row.end_time,
                        logStatus: row.logStatus as LogStatus,
                        actualWorkDuration: actualWork,
                        overtimeDuration: overtimeDuration,
                        specialWorkMinutes: 0, // Will be calculated by Week logic if needed, or row.special? 
                        // DB DOES NOT STORE SPECIAL.
                        // We rely on DATE (Weekend/Holiday) to detect special.
                        // ExcelGenerator does this check internally!
                        totalDuration,
                        breakDuration,
                        note: '',
                        status: 'NORMAL' // UI Status
                    } as ProcessedWorkLog;
                });
                setLogs(processed);
            } else {
                alert(json.message);
            }
        } catch (e) {
            console.error(e);
            alert("데이터 조회 실패");
        } finally {
            setIsLoading(false);
        }
    };

    // Initial Load - Last 30 days? or Current Month?
    useEffect(() => {
        // Default: Current Month
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        setStartDate(`${y}-${m}-01`);
        // End of month
        const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
        setEndDate(`${y}-${m}-${lastDay}`);
    }, []);

    // Fetch on Date Change or Button Click? Button is better.

    const handleExport = async () => {
        await ExcelReportGenerator.generateWeeklyReport(logs);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold tracking-tight">근태 현황 (통합)</h1>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-medium">기간 조회 및 출력</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col md:flex-row gap-4 items-end">
                        <div className="grid gap-2">
                            <label className="text-sm font-medium">시작일</label>
                            <input
                                type="date"
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                            />
                        </div>
                        <div className="grid gap-2">
                            <label className="text-sm font-medium">종료일</label>
                            <input
                                type="date"
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                            />
                        </div>
                        <Button onClick={fetchLogs} disabled={isLoading}>
                            {isLoading ? '조회 중...' : '조회'}
                        </Button>
                        <div className="flex-1"></div>
                        <Button variant="default" onClick={handleExport} disabled={logs.length === 0} className="bg-green-600 hover:bg-green-700">
                            엑셀 다운로드 ({logs.length}건)
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <div className="rounded-md border bg-white">
                <div className="p-4 border-b">
                    <h3 className="font-medium">조회 결과: 총 {logs.length}건</h3>
                </div>
                <div className="relative w-full overflow-auto" style={{ maxHeight: '600px' }}>
                    <table className="w-full caption-bottom text-sm text-left">
                        <thead className="[&_tr]:border-b bg-gray-50 sticky top-0 z-10">
                            <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                <th className="h-10 px-4 align-middle font-medium text-muted-foreground w-[100px]">날짜</th>
                                <th className="h-10 px-4 align-middle font-medium text-muted-foreground">이름</th>
                                <th className="h-10 px-4 align-middle font-medium text-muted-foreground">부서</th>
                                <th className="h-10 px-4 align-middle font-medium text-muted-foreground">상태</th>
                                <th className="h-10 px-4 align-middle font-medium text-muted-foreground">출근</th>
                                <th className="h-10 px-4 align-middle font-medium text-muted-foreground">퇴근</th>
                                <th className="h-10 px-4 align-middle font-medium text-muted-foreground">실근무</th>
                                <th className="h-10 px-4 align-middle font-medium text-muted-foreground">연장</th>
                            </tr>
                        </thead>
                        <tbody className="[&_tr:last-child]:border-0">
                            {logs.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                                        데이터가 없습니다. 기간을 선택하고 조회를 눌러주세요.
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => (
                                    <tr key={log.id} className="border-b transition-colors hover:bg-muted/50">
                                        <td className="p-2 px-4">{log.date}</td>
                                        <td className="p-2 px-4 font-medium">{log.userName} <span className="text-xs text-muted-foreground">({log.userTitle})</span></td>
                                        <td className="p-2 px-4 text-muted-foreground">{log.department}</td>
                                        <td className="p-2 px-4">
                                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium 
                                                ${log.logStatus === 'NORMAL' ? 'bg-blue-50 text-blue-700' :
                                                    log.logStatus === 'VACATION' ? 'bg-purple-50 text-purple-700' : 'bg-gray-100 text-gray-800'}`}>
                                                {log.logStatus}
                                            </span>
                                        </td>
                                        <td className="p-2 px-4">{log.rawStartTimeStr}</td>
                                        <td className="p-2 px-4">{log.rawEndTimeStr}</td>
                                        <td className="p-2 px-4">{TimeUtils.minutesToColonFormat(log.actualWorkDuration)}</td>
                                        <td className="p-2 px-4">{TimeUtils.minutesToColonFormat(log.overtimeDuration)}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
