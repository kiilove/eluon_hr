import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ReactMarkdown from 'react-markdown';
import { ChevronLeft, ChevronRight, Loader2, AlertTriangle, CheckCircle, Clock, CalendarDays, TableProperties, Lock, RefreshCw, User, Briefcase, Search, FileDown, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameMonth, isSameDay, parseISO, startOfWeek, endOfWeek } from 'date-fns';
import { ko } from 'date-fns/locale';
import { ProcessedWorkLog, LogStatus } from '@/types';
import { WeeklyPreviewTable } from '@/components/processing/WeeklyPreviewTable';
import { DayEditDialog } from '@/components/processing/DayEditDialog';
import { HolidayUtils } from '@/lib/holidayUtils';
import { useData } from '../contexts/DataContext';
import { PolicyUtils } from '../lib/policyUtils';
import { calculateStatusChangeUpdates } from '../lib/engine/statusChangeEngine';
import { ExcelReportGenerator } from '@/lib/excelReportGenerator';
import { SpecialWorkCalculator } from '../lib/specialWorkCalculator';

// --- Types ---
interface DailyStat {
    date: string;
    totalLogs: number;
    totalWorkMinutes: number;
    totalOvertimeMinutes: number;
    issueCount: number; // Error or Warning
    logs: ProcessedWorkLog[];
    status: 'NORMAL' | 'WARNING' | 'ERROR' | 'MISSING';
}

// Custom Week Number Logic
const getCustomWeekNumber = (date: Date) => {
    const year = date.getFullYear();
    const jan1 = new Date(year, 0, 1);
    const jan1Day = jan1.getDay();
    let daysToNextMonday = (8 - jan1Day) % 7;
    if (jan1Day === 1) daysToNextMonday = 0;
    const firstMonday = new Date(year, 0, 1 + daysToNextMonday);

    // Handle dates before the current year's first Monday
    if (date < firstMonday) {
        const prevYear = year - 1;
        const prevJan1 = new Date(prevYear, 0, 1);
        const prevJan1Day = prevJan1.getDay();
        let prevDaysToNextMonday = (8 - prevJan1Day) % 7;
        if (prevJan1Day === 1) prevDaysToNextMonday = 0;
        const prevFirstMonday = new Date(prevYear, 0, 1 + prevDaysToNextMonday);

        const diffTime = Math.abs(date.getTime() - prevFirstMonday.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const weekNum = Math.floor(diffDays / 7) + 1;
        return weekNum;
    }

    const diffTime = Math.abs(date.getTime() - firstMonday.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const weekNum = Math.floor(diffDays / 7) + 1;

    return weekNum;
};

interface AiAuditResult {
    summary: {
        totalUsers: number;
        period: string;
        status: "안전" | "주의" | "위험";
        comment: string;
    };
    keyRisks: {
        name: string;
        date: string;
        type: string;
        detail: string;
    }[];
    detailedAnalysis: {
        over52h: string;
        restAndConsecutive: string;
        recordIntegrity: string;
    };
    recommendations: string[];
}

const AttendanceCalendarPage = () => {
    // --- State ---
    const { config, policies } = useData();
    const [currentDate, setCurrentDate] = useState(subMonths(new Date(), 1));
    const [monthlyLogs, setMonthlyLogs] = useState<ProcessedWorkLog[]>([]);

    // [User Context] Retrieve for Company Isolation
    const [user, setUser] = useState<{ company_id: string } | null>(null);
    useEffect(() => {
        const userStr = localStorage.getItem('user');
        if (userStr) {
            setUser(JSON.parse(userStr));
        }
    }, []);

    // [Dual Table] State Separation
    const [manualLogs, setManualLogs] = useState<ProcessedWorkLog[]>([]);
    const [specialLogs, setSpecialLogs] = useState<ProcessedWorkLog[]>([]);

    const [isLoading, setIsLoading] = useState(false);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [isLocked, setIsLocked] = useState(false);
    // [View Mode] 3-State View
    type ViewMode = 'MERGED' | 'MANUAL' | 'SPECIAL';
    const [viewMode, setViewMode] = useState<ViewMode>('MERGED');

    // Derived State for Current Month (YYYY-MM)
    const currentMonth = useMemo(() => {
        return currentDate.toISOString().slice(0, 7);
    }, [currentDate]);

    // Dialogs
    const [isDayDialogOpen, setIsDayDialogOpen] = useState(false);
    const [selectedLogForEdit, setSelectedLogForEdit] = useState<ProcessedWorkLog | null>(null);
    const [isWeeklyPreviewOpen, setIsWeeklyPreviewOpen] = useState(false);
    const [selectedWeekData, setSelectedWeekData] = useState<{ mondayStr: string, logs: ProcessedWorkLog[] } | null>(null);

    // Filter for Side Panel
    const [sidePanelSearch, setSidePanelSearch] = useState("");

    // --- AI Audit State ---
    const [isAiAuditLoading, setIsAiAuditLoading] = useState(false);
    const [aiResult, setAiResult] = useState<AiAuditResult | null>(null);
    const [isAiDialogOpen, setIsAiDialogOpen] = useState(false);

    // [AI Audit] Handler
    const handleAiAudit = async () => {
        setIsAiAuditLoading(true);
        setAiResult(null);
        setIsAiDialogOpen(true);

        try {
            // 1. Prepare Data with Weekly and Monthly Separation
            const userStats: Record<string, {
                weeks: Record<string, number>; // weekNum -> totalMinutes
                issues: string[];
            }> = {};

            // Track unique employees per week for weekly stats
            const weeklyEmployeeCounts: Record<string, Set<string>> = {};

            monthlyLogs.forEach(log => {
                const name = log.userName;
                if (!userStats[name]) {
                    userStats[name] = { weeks: {}, issues: [] };
                }

                // A. Week Aggregation
                const weekNum = getCustomWeekNumber(parseISO(log.date));
                const totalMinutes = (log.actualWorkDuration || 0);

                // Accumulate weekly hours
                userStats[name].weeks[weekNum] = (userStats[name].weeks[weekNum] || 0) + totalMinutes;

                // Track employee in this week
                if (!weeklyEmployeeCounts[weekNum]) {
                    weeklyEmployeeCounts[weekNum] = new Set();
                }
                weeklyEmployeeCounts[weekNum].add(name);

                // B. Issue Detection (Missing Clock-out)
                if (log.logStatus !== 'REST' && log.logStatus !== 'VACATION') {
                    if (log.rawStartTimeStr && !log.rawEndTimeStr) {
                        userStats[name].issues.push(`${log.date}: 미퇴근 의심 (퇴근기록 없음)`);
                    }
                }
            });

            // 2. Calculate Weekly Statistics
            const weeklyStats = Object.entries(weeklyEmployeeCounts).map(([week, employees]) => ({
                week: `Week ${week}`,
                employeeCount: employees.size,
                employees: Array.from(employees)
            }));

            // 3. Calculate Monthly Statistics
            const monthlyEmployeeCount = Object.keys(userStats).length;
            const monthKey = format(currentDate, 'yyyy-MM');

            // 4. Format Payload for AI
            const simplifiedPayload = Object.entries(userStats).map(([name, data]) => {
                const weekly = Object.entries(data.weeks).map(([week, minutes]) => {
                    const hours = Number((minutes / 60).toFixed(1));
                    return {
                        week: `Week ${week}`,
                        totalHours: hours,
                        violation: hours > 52 ? 'YES (Over 52h)' : 'NO'
                    };
                });

                return {
                    name,
                    weeklySummary: weekly,
                    riskFactors: data.issues
                };
            });

            // 5. Call API with enhanced metadata
            const response = await fetch('/api/audit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    auditData: simplifiedPayload,
                    metadata: {
                        month: monthKey,
                        totalEmployees: monthlyEmployeeCount,
                        weeklyStats: weeklyStats
                    }
                })
            });

            if (!response.ok) {
                throw new Error("Audit request failed");
            }

            const result = await response.json<AiAuditResult>();
            setAiResult(result);

        } catch (error) {
            console.error("AI Audit Error:", error);
            setAiResult(null);
        } finally {
            setIsAiAuditLoading(false);
        }
    };

    // --- Data Fetching ---
    const fetchData = useCallback(async () => {
        if (!user?.company_id) return; // Wait for user context

        setIsLoading(true);
        try {
            // [Range Fetch] Use Calendar Start/End to ensure cross-month data
            const mStart = startOfMonth(currentDate);
            const mEnd = endOfMonth(currentDate);
            const cStart = startOfWeek(mStart, { weekStartsOn: 1 });
            const cEnd = endOfWeek(mEnd, { weekStartsOn: 1 });

            const sDate = format(cStart, 'yyyy-MM-dd');
            const eDate = format(cEnd, 'yyyy-MM-dd');

            // Parallel Fetch: Logs (Range) + Lock Status (Month)
            const [logsRes, lockRes] = await Promise.all([
                fetch(`/api/attendance/logs?startDate=${sDate}&endDate=${eDate}&companyId=${user.company_id}`),
                fetch(`/api/management/lock-status?month=${currentMonth}`)
            ]);

            const logsData = await logsRes.json() as any;
            const lockData = await lockRes.json() as any;

            if (logsData.success) {
                setManualLogs(logsData.manualLogs || []);
                setSpecialLogs(logsData.specialLogs || logsData.logs || []);
            } else {
                console.error("Failed to fetch logs:", logsData.message);
            }
            setIsLocked(lockData.isLocked || false);

        } catch (error) {
            console.error("Error fetching data:", error);
        } finally {
            setIsLoading(false);
        }
    }, [currentDate, currentMonth, user?.company_id]);

    useEffect(() => {
        if (user?.company_id) {
            fetchData();
        }
    }, [fetchData, user?.company_id]);


    // [Dual Table] Runtime Merge Logic
    // Priority: Special Work (if valid work exists) > Manual (Base)
    useEffect(() => {
        if (viewMode === 'SPECIAL') {
            const sorted = [...specialLogs].sort((a, b) =>
                a.date.localeCompare(b.date) || a.employeeId.localeCompare(b.employeeId)
            );
            setMonthlyLogs(sorted);
            return;
        }

        if (viewMode === 'MANUAL') {
            const sorted = [...manualLogs].sort((a, b) =>
                a.date.localeCompare(b.date) || a.employeeId.localeCompare(b.employeeId)
            );
            setMonthlyLogs(sorted);
            return;
        }

        const mergedMap = new Map<string, ProcessedWorkLog>();

        // 1. Start with Manual Logs
        manualLogs.forEach(log => {
            const key = `${log.employeeId}-${log.date}`;
            mergedMap.set(key, log);
        });

        // 2. Overlay Special Logs
        specialLogs.forEach(log => {
            const key = `${log.employeeId}-${log.date}`;
            const hasWork = log.actualWorkDuration > 0 || log.overtimeDuration > 0;
            if (!hasWork && log.logStatus === 'REST') {
                return;
            }

            const existingLog = mergedMap.get(key);

            if (existingLog) {
                if (hasWork) {
                    const specialLog: ProcessedWorkLog = {
                        ...log,
                        logStatus: 'SPECIAL' as LogStatus
                    };
                    mergedMap.set(key, specialLog);
                }
            } else {
                const specialLog: ProcessedWorkLog = {
                    ...log,
                    logStatus: 'SPECIAL' as LogStatus
                };
                mergedMap.set(key, specialLog);
            }
        });

        const mergedList = Array.from(mergedMap.values()).sort((a, b) =>
            a.date.localeCompare(b.date) || a.employeeId.localeCompare(b.employeeId)
        );

        setMonthlyLogs(mergedList);
    }, [manualLogs, specialLogs, viewMode]);

    // [New] Handle Opening Week Preview
    const handleOpenWeekPreview = (date: Date) => {
        const monday = startOfWeek(date, { weekStartsOn: 1 });
        const sunday = endOfWeek(date, { weekStartsOn: 1 });
        const mondayStr = format(monday, 'yyyy-MM-dd');

        // 1. Identify Dates in Week
        const weekDates = eachDayOfInterval({ start: monday, end: sunday });
        const weekDateStrs = weekDates.map(d => format(d, 'yyyy-MM-dd'));

        // 2. Filter Logs for this Week
        const weekLogs = monthlyLogs.filter(l => weekDateStrs.includes(l.date));

        if (weekLogs.length === 0) {
            alert(`[주의] 해당 주차(${mondayStr} 주간)의 데이터가 없습니다.`);
        }

        setSelectedWeekData({
            mondayStr,
            logs: weekLogs
        });

        setIsDayDialogOpen(false);
        setSelectedLogForEdit(null);
        setIsWeeklyPreviewOpen(true);
    };


    // --- Client-Side Processing ---
    const dailyStatsMap = useMemo(() => {
        const stats: Record<string, DailyStat> = {};

        // Initialize aggregation with logs
        monthlyLogs.forEach(log => {
            const d = log.date;
            if (!stats[d]) {
                stats[d] = {
                    date: d,
                    totalLogs: 0,
                    totalWorkMinutes: 0,
                    totalOvertimeMinutes: 0,
                    issueCount: 0,
                    logs: [],
                    status: 'NORMAL'
                };
            }

            // [Unification] Match Billing/Excel Logic:
            // Sum of (Rounded Individual Hours), NOT Round(Sum of Minutes).
            const recognizedHours = SpecialWorkCalculator.toRecognizedHours(log.actualWorkDuration || 0);
            const standardizedMinutes = recognizedHours * 60;

            stats[d].logs.push(log);
            stats[d].totalLogs++;

            stats[d].totalWorkMinutes += standardizedMinutes;
            stats[d].totalOvertimeMinutes += log.overtimeDuration || 0;

            if (log.status === 'ERROR' || log.status === 'WARNING' || log.logStatus === 'OTHER') {
                stats[d].issueCount++;
            }
        });

        // Determine Final Status for the Day
        Object.values(stats).forEach(day => {
            if (day.issueCount > 0) day.status = 'WARNING'; // Simplified for now
        });

        return stats;
    }, [monthlyLogs]);

    const selectedDayStat = selectedDate ? dailyStatsMap[format(selectedDate, 'yyyy-MM-dd')] : null;


    // --- Calendar Layout (Monday Start & Full Weeks) ---
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    // Expand to full weeks (Mon-Sun)
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const daysInMonth = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    // Custom Week Number Logic - Moved to module scope


    // Group days into weeks for Row rendering
    const calendarWeeks = useMemo(() => {
        const weeks = [];
        let currentWeek: (Date | null)[] = []; // Type Explicit

        daysInMonth.forEach(day => {
            currentWeek.push(day);
            if (currentWeek.length === 7) {
                weeks.push(currentWeek);
                currentWeek = [];
            }
        });
        if (currentWeek.length > 0) {
            while (currentWeek.length < 7) currentWeek.push(null);
            weeks.push(currentWeek);
        }

        return weeks;
    }, [daysInMonth]);


    // --- Side Panel Logic ---
    const sidePanelLogs = useMemo(() => {
        if (!selectedDayStat) return [];
        if (!sidePanelSearch.trim()) return selectedDayStat.logs;
        return selectedDayStat.logs.filter(l =>
            l.userName.includes(sidePanelSearch) ||
            (l.department || "").includes(sidePanelSearch)
        );
    }, [selectedDayStat, sidePanelSearch]);

    // Sorting Side Panel: Warning first, then Name
    const sortedSidePanelLogs = useMemo(() => {
        const validLogs = sidePanelLogs.filter(l =>
            !((l.logStatus === 'REST' || l.logStatus === 'NORMAL') && l.actualWorkDuration === 0 && l.overtimeDuration === 0)
        );

        return [...validLogs].sort((a, b) => {
            const aIssue = a.status !== 'NORMAL' || a.logStatus === 'OTHER';
            const bIssue = b.status !== 'NORMAL' || b.logStatus === 'OTHER';
            if (aIssue && !bIssue) return -1;
            if (!aIssue && bIssue) return 1;
            return a.userName.localeCompare(b.userName);
        });
    }, [sidePanelLogs]);

    // [New] Handle Side Panel Status Change
    const handleQuickStatusChange = async (id: string, newStatus: LogStatus) => {

        // 1. Find the log
        const logIndex = monthlyLogs.findIndex(l => l.id === id);
        if (logIndex === -1) return;
        const log = monthlyLogs[logIndex];

        // 2. Calculate Updates
        const effectivePolicy = PolicyUtils.getPolicyForDate(log.date, policies);
        const activeConfig = effectivePolicy ? PolicyUtils.toGlobalConfig(effectivePolicy) : config;

        const updates = calculateStatusChangeUpdates(log, newStatus, activeConfig);
        const updatedLog = { ...log, ...updates };

        // 3. Optimistic Update
        const newLogs = [...monthlyLogs];
        newLogs[logIndex] = updatedLog;
        setMonthlyLogs(newLogs);

        // 4. API Save
        try {
            const response = await fetch('/api/processing/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    logs: [updatedLog],
                    companyId: user?.company_id // [New] Pass Context
                })
            });
            const res = await response.json() as any;
            if (!response.ok || !res.success) throw new Error("Save failed");
        } catch (e) {
            console.error("Quick Status Save Error:", e);
            alert("상태 변경 저장 실패");
            fetchData(); // Revert
        }
    };


    // --- Render ---
    return (
        <div className="h-[calc(100vh-100px)] flex flex-col space-y-4 max-w-[1800px] mx-auto">
            {/* Header */}
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm shrink-0">
                <div className="flex items-center gap-4">
                    <div className="p-2.5 bg-indigo-600 rounded-lg text-white shadow-md shadow-indigo-200">
                        <CalendarDays className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900">근태 캘린더</h1>
                        <p className="text-xs text-slate-500 font-medium">
                            {format(currentDate, 'yyyy년 M월')} 데이터 조회 및 보정
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* [View Mode] 3-State Toggle */}
                    <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200 mr-2">
                        <button
                            onClick={() => setViewMode('MERGED')}
                            className={cn(
                                "text-xs font-bold px-3 py-1.5 rounded-md transition-all",
                                viewMode === 'MERGED' ? "bg-white text-indigo-600 shadow-sm border border-indigo-100" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                            )}
                        >
                            전체(통합)
                        </button>
                        <button
                            onClick={() => setViewMode('MANUAL')}
                            className={cn(
                                "text-xs font-bold px-3 py-1.5 rounded-md transition-all",
                                viewMode === 'MANUAL' ? "bg-white text-indigo-600 shadow-sm border border-indigo-100" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                            )}
                        >
                            일반 근태
                        </button>
                        <button
                            onClick={() => setViewMode('SPECIAL')}
                            className={cn(
                                "text-xs font-bold px-3 py-1.5 rounded-md transition-all",
                                viewMode === 'SPECIAL' ? "bg-white text-indigo-600 shadow-sm border border-indigo-100" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                            )}
                        >
                            특근만
                        </button>
                    </div>

                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800"
                        onClick={handleAiAudit}
                        disabled={isAiAuditLoading}
                    >
                        {isAiAuditLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        AI 노무감수
                    </Button>

                    <Button variant="outline" size="sm" className="gap-2" onClick={() => ExcelReportGenerator.generateMonthlyReport(monthlyLogs, format(currentDate, 'yyyy-MM'), { name: '관리자', company_id: user?.company_id || 'Unknown' })}>
                        <FileDown className="w-4 h-4" />
                        월간 엑셀
                    </Button>
                    <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200">
                        <Button variant="ghost" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="h-8 w-8 hover:bg-white hover:shadow-sm transition-all"><ChevronLeft className="w-4 h-4" /></Button>
                        <span className="w-32 text-center font-bold text-slate-700 text-sm">
                            {format(currentDate, 'yyyy.MM')}
                        </span>
                        <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="h-8 w-8 hover:bg-white hover:shadow-sm transition-all"><ChevronRight className="w-4 h-4" /></Button>
                    </div>

                    <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>오늘</Button>
                    <Button variant="outline" size="sm" onClick={fetchData} title="새로고침">
                        <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
                    </Button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden flex relative">
                {isLoading && (
                    <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-[1px] z-50 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-2">
                            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                            <p className="text-sm text-slate-500">데이터를 불러오는 중입니다...</p>
                        </div>
                    </div>
                )}

                {/* 1. Calendar Grid (Left) */}
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                    {/* Header Row: W + Mon-Sun */}
                    <div className="grid grid-cols-[50px_1fr_1fr_1fr_1fr_1fr_1fr_1fr] border-b border-slate-200 bg-slate-50">
                        <div className="py-3 text-center text-xs font-bold text-slate-400 bg-slate-100/50 border-r border-slate-200 flex items-center justify-center">
                            주차
                        </div>
                        {['월', '화', '수', '목', '금', '토', '일'].map((day, i) => (
                            <div key={day} className={cn(
                                "py-3 text-center text-sm font-bold",
                                i === 5 ? "text-blue-500" : i === 6 ? "text-red-500" : "text-slate-600"
                            )}>
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Days */}
                    <div className="flex-1 overflow-y-auto">
                        {calendarWeeks.map((week, wIndex) => {
                            const representativeDate = week.find(d => d !== null);
                            const weekNum = representativeDate ? getCustomWeekNumber(representativeDate) : '-';
                            const mondayStr = week[0] ? format(week[0], 'yyyy-MM-dd') : '';

                            return (
                                <div key={wIndex} className="grid grid-cols-[50px_1fr_1fr_1fr_1fr_1fr_1fr_1fr] border-b border-slate-100 min-h-[100px]">
                                    {/* Week Number Cell */}
                                    <div
                                        onClick={() => {
                                            if (mondayStr) {
                                                const weekDatesStr = week.map(d => d ? format(d, 'yyyy-MM-dd') : null).filter(Boolean) as string[];
                                                const weekLogs = monthlyLogs.filter(l => weekDatesStr.includes(l.date));

                                                setSelectedWeekData({
                                                    mondayStr,
                                                    logs: weekLogs
                                                });
                                                // Safety: Ensure other dialogs are closed
                                                setIsDayDialogOpen(false);
                                                setSelectedLogForEdit(null);

                                                setIsWeeklyPreviewOpen(true);
                                            }
                                        }}
                                        className="bg-slate-50/50 border-r border-slate-200 flex items-center justify-center text-xs font-bold text-slate-400 select-none hover:bg-indigo-50 hover:text-indigo-600 hover:cursor-pointer transition-colors"
                                        title="주간 리포트 보기"
                                    >
                                        {typeof weekNum === 'number' ? `W${String(weekNum).padStart(2, '0')}` : weekNum}
                                    </div>

                                    {/* Days */}
                                    {week.map((date, dIndex) => {
                                        if (!date) return <div key={dIndex} className="bg-slate-50/30 border-r border-slate-100" />;

                                        const dateKey = format(date, 'yyyy-MM-dd');
                                        const stat = dailyStatsMap[dateKey];
                                        const isSelected = selectedDate && isSameDay(date, selectedDate);
                                        const isToday = isSameDay(date, new Date());
                                        const isCurrentMonth = isSameMonth(date, currentDate);
                                        const holidayName = HolidayUtils.getHolidayName(date);
                                        const isHoliday = !!holidayName;
                                        const isSun = getDay(date) === 0;
                                        const isSat = getDay(date) === 6;

                                        let bgClass = isCurrentMonth ? "bg-white" : "bg-slate-50/50";
                                        if (isSelected) bgClass = "bg-indigo-50 ring-2 ring-indigo-500 ring-inset z-10";
                                        const hasIssues = stat && stat.issueCount > 0;

                                        return (
                                            <div
                                                key={dIndex}
                                                onClick={() => setSelectedDate(date)}
                                                className={cn(
                                                    "relative border-r border-slate-100 p-2 cursor-pointer transition-all flex flex-col justify-between hover:bg-slate-50",
                                                    bgClass
                                                )}
                                            >
                                                <div className="flex justify-between items-start">
                                                    <div className="flex flex-col">
                                                        <span className={cn(
                                                            "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full transition-colors",
                                                            isToday ? "bg-red-500 text-white shadow-md scale-110" :
                                                                (isHoliday || isSun) ? "text-red-500" :
                                                                    isSat ? "text-blue-500" :
                                                                        !isCurrentMonth ? "text-slate-400" : "text-slate-700"
                                                        )}>
                                                            {date.getDate()}
                                                        </span>
                                                        {isHoliday && (
                                                            <span className="text-[10px] text-red-500 font-medium ml-1 truncate max-w-[60px] block leading-tight mt-0.5">
                                                                {holidayName}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {isLocked && isCurrentMonth && (
                                                        <div className="bg-slate-100 p-1 rounded-full border border-slate-200" title="Locked">
                                                            <Lock className="w-3 h-3 text-slate-400" />
                                                        </div>
                                                    )}
                                                    {hasIssues && (
                                                        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-sm shadow-red-200" title="확인 필요" />
                                                    )}
                                                </div>

                                                {stat && stat.totalLogs > 0 && (
                                                    <div className={cn("space-y-1.5 mt-2", !isCurrentMonth && "opacity-50")}>
                                                        <div className="flex items-center gap-1.5">
                                                            <div className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium border border-slate-200 flex items-center gap-1">
                                                                <User className="w-3 h-3 text-slate-400" />
                                                                {stat.totalLogs}
                                                            </div>
                                                            <div className={cn(
                                                                "text-[10px] px-1.5 py-0.5 rounded font-medium border flex items-center gap-1",
                                                                stat.totalOvertimeMinutes > 0 ? "bg-amber-50 text-amber-600 border-amber-100" : "bg-green-50 text-green-600 border-green-100"
                                                            )}>
                                                                <Clock className="w-3 h-3" />
                                                                {SpecialWorkCalculator.toRecognizedHours(stat.totalWorkMinutes)}h
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 2. Side Panel (Right) */}
                <div className="w-96 bg-white rounded-xl shadow-lg border border-slate-200 flex flex-col shrink-0">
                    {/* Header */}
                    <div className="p-5 border-b border-slate-100 bg-slate-50/50">
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            {selectedDate ? format(selectedDate, 'd일 (EEEE)', { locale: ko }) : '날짜 선택'}
                        </h2>
                        <p className="text-xs text-slate-500 mt-1">
                            {selectedDate ? format(selectedDate, 'yyyy년 M월') : ''} 상세 근태 내역
                        </p>

                        {/* Summary Cards */}
                        {selectedDayStat ? (
                            <div className="grid grid-cols-2 gap-2 mt-4">
                                <div className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                                    <div className="text-xs text-slate-500 mb-1">총 근무 시간</div>
                                    <div className="text-lg font-bold text-indigo-600">
                                        {SpecialWorkCalculator.toRecognizedHours(selectedDayStat.totalWorkMinutes)}<span className="text-xs text-slate-400 ml-0.5">h</span>
                                        <span className="text-[10px] text-slate-300 ml-1 font-normal">(인정)</span>
                                    </div>
                                </div>
                                <div className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                                    <div className="text-xs text-slate-500 mb-1">특이사항</div>
                                    <div className={cn("text-lg font-bold", selectedDayStat.issueCount > 0 ? "text-red-500" : "text-green-500")}>
                                        {selectedDayStat.issueCount}<span className="text-xs text-slate-400 ml-0.5">건</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-4 p-4 bg-slate-100/50 rounded-lg text-center text-xs text-slate-400">
                                데이터 없음
                            </div>
                        )}
                    </div>

                    {/* Search & List */}
                    <div className="p-3 border-b border-slate-100">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                placeholder="이름, 부서 검색..."
                                value={sidePanelSearch}
                                onChange={(e) => setSidePanelSearch(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-slate-50/30">
                        {sortedSidePanelLogs.length > 0 ? (
                            sortedSidePanelLogs.map(log => {
                                const isWarning = log.status !== 'NORMAL' || log.logStatus === 'OTHER';
                                return (
                                    <div key={log.id} className="relative bg-white p-3 rounded-lg border border-slate-100 shadow-sm hover:shadow-md transition-all group">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <div className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                                                    {log.userName}
                                                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                                                        <select
                                                            value={log.logStatus || 'NORMAL'}
                                                            onChange={(e) => handleQuickStatusChange(log.id, e.target.value as LogStatus)}
                                                            className={cn(
                                                                "appearance-none text-[10px] px-2 py-0.5 rounded-full font-medium border cursor-pointer outline-none focus:ring-1 focus:ring-offset-1 text-center min-w-[50px]",
                                                                log.logStatus === 'NORMAL' ? "bg-slate-100 text-slate-600 border-slate-200 focus:ring-slate-400" :
                                                                    log.logStatus === 'VACATION' ? "bg-blue-50 text-blue-600 border-blue-100 focus:ring-blue-400" :
                                                                        log.logStatus === 'TRIP' ? "bg-indigo-50 text-indigo-600 border-indigo-100 focus:ring-indigo-400" :
                                                                            log.logStatus === 'REST' ? "bg-slate-100 text-slate-500 border-slate-200 focus:ring-slate-400" :
                                                                                "bg-amber-50 text-amber-600 border-amber-100 focus:ring-amber-400"
                                                            )}
                                                        >
                                                            <option value="NORMAL">정상</option>
                                                            <option value="VACATION">휴가</option>
                                                            <option value="TRIP">출장</option>
                                                            <option value="EDUCATION">교육</option>
                                                            <option value="SICK">병가</option>
                                                            <option value="REST">휴무</option>
                                                            <option value="OTHER">기타</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                                                    <Briefcase className="w-3 h-3" /> {log.department || '부서미지정'}
                                                </div>
                                            </div>
                                            {isWarning && (
                                                <AlertTriangle className="w-4 h-4 text-red-500" />
                                            )}
                                        </div>

                                        <div className="flex items-center justify-between text-xs bg-slate-50 rounded p-2 text-slate-600">
                                            <div className="flex gap-3">
                                                <span><span className="text-slate-400 mr-1">출근</span>{log.rawStartTimeStr || '-'}</span>
                                                <span><span className="text-slate-400 mr-1">퇴근</span>{log.rawEndTimeStr || '-'}</span>
                                            </div>
                                            <div className="font-bold text-slate-800">
                                                {SpecialWorkCalculator.toRecognizedHours(log.actualWorkDuration)}h
                                            </div>
                                        </div>
                                        <div
                                            className="absolute inset-0 z-10 cursor-pointer"
                                            onClick={() => {
                                                setSelectedLogForEdit(log);
                                                setIsDayDialogOpen(true);
                                            }}
                                            title="클릭하여 상세 수정"
                                        />
                                    </div>
                                );
                            })
                        ) : (
                            <div className="text-center py-10 text-slate-400 text-sm">
                                {selectedDate ? "표시할 데이터가 없습니다." : "날짜를 선택해주세요."}
                            </div>
                        )}
                    </div>

                    <div className="p-4 border-t border-slate-200 bg-white">
                        <div className="text-xs text-slate-400 text-center">
                            W(주차)를 클릭하여 주간 리포트를 확인하세요.
                        </div>
                    </div>
                </div>
            </div>

            {/* Dialogs */}
            {selectedDate && (
                <DayEditDialog
                    isOpen={isDayDialogOpen}
                    onClose={() => setIsDayDialogOpen(false)}
                    date={format(selectedDate, 'yyyy-MM-dd')}
                    initialLogs={selectedLogForEdit ? [selectedLogForEdit] : []}
                    onSaveSuccess={() => {
                        fetchData();
                        setIsDayDialogOpen(false);
                        setSelectedLogForEdit(null);
                    }}
                />
            )}

            <Dialog open={isWeeklyPreviewOpen} onOpenChange={setIsWeeklyPreviewOpen}>
                <DialogContent className="max-w-[95vw] w-fit h-[90vh] overflow-hidden flex flex-col p-4 bg-white">
                    {selectedWeekData && (
                        <WeeklyPreviewTable
                            mondayStr={selectedWeekData.mondayStr}
                            weekLogs={selectedWeekData.logs}
                        />
                    )}
                </DialogContent>
            </Dialog>

            {/* 2. AI Audit Dialog */}
            <Dialog open={isAiDialogOpen} onOpenChange={setIsAiDialogOpen}>
                <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto bg-white p-0 overflow-hidden flex flex-col">
                    <DialogHeader className="p-6 border-b border-slate-100 bg-white sticky top-0 z-10">
                        <DialogTitle className="flex items-center gap-2 text-xl font-bold text-slate-800">
                            <Sparkles className="w-6 h-6 text-indigo-600" />
                            AI 노무 감수 리포트
                        </DialogTitle>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
                        {isAiAuditLoading ? (
                            <div className="flex flex-col items-center justify-center h-[400px] gap-4">
                                <div className="relative">
                                    <div className="absolute inset-0 bg-indigo-200 rounded-full animate-ping opacity-20"></div>
                                    <Loader2 className="w-12 h-12 text-indigo-600 animate-spin relative z-10" />
                                </div>
                                <p className="text-slate-600 font-medium animate-pulse">AI가 근태 기록을 정밀 분석 중입니다...</p>
                                <p className="text-xs text-slate-400">약 5~10초 정도 소요됩니다.</p>
                            </div>
                        ) : aiResult ? (
                            <div className="space-y-6 animate-in fade-in duration-500">
                                {/* 1. Summary Card */}
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm md:col-span-3">
                                        <h3 className="text-sm font-bold text-slate-500 mb-2 uppercase tracking-wider">종합 요약</h3>
                                        <p className="text-slate-700 leading-relaxed font-medium text-lg">"{aiResult.summary.comment}"</p>
                                    </div>
                                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
                                        <h3 className="text-xs font-bold text-slate-400 uppercase mb-1">컴플라이언스 상태</h3>
                                        <span className={cn(
                                            "text-2xl font-black px-4 py-1 rounded-full",
                                            aiResult.summary.status === '안전' ? "bg-green-100 text-green-600" :
                                                aiResult.summary.status === '주의' ? "bg-yellow-100 text-yellow-600" :
                                                    "bg-red-100 text-red-600"
                                        )}>
                                            {aiResult.summary.status}
                                        </span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 text-sm bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">분석 대상</span>
                                        <span className="font-bold text-slate-800">{aiResult.summary.totalUsers}명</span>
                                    </div>
                                    <div className="flex justify-between border-l border-slate-100 pl-4">
                                        <span className="text-slate-500">분석 기간</span>
                                        <span className="font-bold text-slate-800">{aiResult.summary.period}</span>
                                    </div>
                                </div>

                                {/* 2. Key Risks Table */}
                                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                    <div className="p-4 border-b border-slate-100 bg-red-50/50 flex justify-between items-center">
                                        <h3 className="font-bold text-red-700 flex items-center gap-2">
                                            <AlertTriangle className="w-4 h-4" />
                                            주요 위반 위험 사례
                                        </h3>
                                        <span className="text-xs font-medium text-red-600 bg-red-100 px-2 py-1 rounded-md">
                                            {aiResult.keyRisks.length}건 발견
                                        </span>
                                    </div>
                                    {aiResult.keyRisks.length > 0 ? (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm text-left">
                                                <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                                                    <tr>
                                                        <th className="px-4 py-3 w-[100px]">성명</th>
                                                        <th className="px-4 py-3 w-[120px]">날짜/주차</th>
                                                        <th className="px-4 py-3 w-[150px]">위반 유형</th>
                                                        <th className="px-4 py-3">상세 내용</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {[...aiResult.keyRisks]
                                                        .sort((a, b) => {
                                                            const dateDiff = a.date.localeCompare(b.date, undefined, { numeric: true });
                                                            if (dateDiff !== 0) return dateDiff;
                                                            return a.name.localeCompare(b.name);
                                                        })
                                                        .map((risk, idx) => (
                                                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                                <td className="px-4 py-3 font-bold text-slate-800">{risk.name}</td>
                                                                <td className="px-4 py-3 text-slate-600">{risk.date}</td>
                                                                <td className="px-4 py-3 text-red-600 font-medium">{risk.type}</td>
                                                                <td className="px-4 py-3 text-slate-700">{risk.detail}</td>
                                                            </tr>
                                                        ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="p-8 text-center text-slate-400 flex flex-col items-center">
                                            <CheckCircle className="w-8 h-8 mb-2 text-green-500 opacity-50" />
                                            <p>위반 사항이 발견되지 않았습니다.</p>
                                        </div>
                                    )}
                                </div>

                                {/* 3. Detailed Analysis */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                        <h3 className="font-bold text-indigo-900 mb-3 flex items-center gap-2">
                                            <Clock className="w-4 h-4 text-indigo-500" /> 주 52시간 근무제
                                        </h3>
                                        <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{aiResult.detailedAnalysis.over52h}</p>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                            <h3 className="font-bold text-slate-800 mb-2 text-sm flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-orange-400"></div> 휴게 및 연속 근무
                                            </h3>
                                            <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{aiResult.detailedAnalysis.restAndConsecutive}</p>
                                        </div>
                                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                            <h3 className="font-bold text-slate-800 mb-2 text-sm flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div> 근태 기록 정합성
                                            </h3>
                                            <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{aiResult.detailedAnalysis.recordIntegrity}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* 4. Recommendations */}
                                <div className="bg-indigo-50/50 p-5 rounded-xl border border-indigo-100">
                                    <h3 className="font-bold text-indigo-900 mb-4 flex items-center gap-2">
                                        <Sparkles className="w-4 h-4" /> AI 조치 권고
                                    </h3>
                                    <ul className="space-y-2">
                                        {aiResult.recommendations.map((rec: string, idx: number) => (
                                            <li key={idx} className="flex items-start gap-2 text-sm text-indigo-800">
                                                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0"></span>
                                                {rec}
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-[400px] text-slate-400">
                                <AlertTriangle className="w-10 h-10 mb-3 opacity-30" />
                                <p>분석 데이터가 존재하지 않습니다.</p>
                            </div>
                        )}
                    </div>
                    <div className="p-4 border-t border-slate-100 bg-white flex justify-end">
                        <Button variant="outline" onClick={() => setIsAiDialogOpen(false)}>닫기</Button>
                    </div>
                </DialogContent>
            </Dialog>

        </div>
    );
};

export default AttendanceCalendarPage;
