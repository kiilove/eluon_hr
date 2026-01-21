import { ProcessedWorkLog, ProcessedWorkLog as WorkLog, LogStatus, WeeklySummary, WorkType } from "../types";
import { TimeUtils } from "../lib/timeUtils";
import { snapTime, calculateActualWork, getLogCellDisplay, generateSafeTimeString } from "../lib/correctionUtils";
import { calculateStatusChangeUpdates } from "../lib/engine/statusChangeEngine";
import { PolicyUtils } from "../lib/policyUtils";
import { cn } from "../lib/utils";
import React, { useState } from 'react';
import { useData } from '../contexts/DataContext';
import { WorkHourCalculator } from "../lib/workHourCalculator";
import { Edit2, X } from 'lucide-react';
import { CorrectionBadge } from "./CorrectionBadge";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"

interface WorkLogTableProps {
    logs: ProcessedWorkLog[];
    sortOption?: 'NAME' | 'DEPT' | 'TITLE';
    onUpdateLog?: (id: string, updates: Partial<ProcessedWorkLog>) => void;
    changeMap?: Map<string, { field: string, before: string, after: string }[]>; // For V2 vs V3 comparison
}

// Helper function to calculate snapped time for display
// const calculateSnappedTime = (time: number, isStart: boolean, config: any): number => {
//     // Delegated to shared utility
//     return snapTime(time, isStart, config);
// };

const StatusBadge = ({ status }: { status: 'PASS' | 'WARNING' | 'VIOLATION' }) => {
    if (status === 'VIOLATION') {
        return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                위반
            </span>
        );
    }
    if (status === 'WARNING') {
        return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                주의
            </span>
        );
    }
    return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            정상
        </span>
    );
};

export const WorkLogTable = ({ logs, sortOption = 'NAME', onUpdateLog, changeMap }: WorkLogTableProps) => {
    const { config } = useData();

    if (logs.length === 0) {
        return <div className="p-8 text-center text-muted-foreground">데이터가 없습니다.</div>;
    }

    // Group logs by userID
    const groupedLogs = logs.reduce((acc, log) => {
        if (!acc[log.userId]) {
            acc[log.userId] = {
                userId: log.userId,
                userName: log.userName,
                userTitle: log.userTitle || "",
                department: log.department || "",
                logs: [],
                summary: {} as WeeklySummary // Placeholder
            };
        }
        acc[log.userId].logs.push(log);
        return acc;
    }, {} as Record<string, { userId: string, userName: string, userTitle: string, department: string, logs: ProcessedWorkLog[], summary: WeeklySummary }>);

    // Calculate Summary for each group & Sort
    const sortedUserGroups = Object.values(groupedLogs).map(group => {
        // Calculate summary on the fly
        const summary = WorkHourCalculator.calculateWeeklySummary(group.userId, group.logs, WorkType.STANDARD);
        return { ...group, summary };
    }).sort((a, b) => {
        // Dynamic Sorting
        if (sortOption === 'DEPT') {
            const deptCompare = a.department.localeCompare(b.department, 'ko');
            if (deptCompare !== 0) return deptCompare;
            return a.userName.localeCompare(b.userName, 'ko');
        }

        if (sortOption === 'TITLE') {
            const titleCompare = a.userTitle.localeCompare(b.userTitle, 'ko');
            if (titleCompare !== 0) return titleCompare;
            return a.userName.localeCompare(b.userName, 'ko');
        }

        // Default: NAME
        return a.userName.localeCompare(b.userName, 'ko');
    });

    // Pagination / Limit for Performance
    const [displayLimit, setDisplayLimit] = useState(10);
    const visibleGroups = sortedUserGroups.slice(0, displayLimit);
    const hasMore = sortedUserGroups.length > displayLimit;

    const handleLoadMore = () => {
        setDisplayLimit(prev => prev + 20); // Load 20 more
    };

    return (
        <div className="w-full space-y-8">
            {visibleGroups.map((userGroup) => {
                // Sort logs by date to ensure columns are ordered Mon->Sun or by date
                const sortedLogs = userGroup.logs.sort((a, b) => a.date.localeCompare(b.date));
                const dates = sortedLogs.map(l => l.date);

                return (
                    <div key={userGroup.userId} className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm shadow-sm overflow-hidden mb-8">
                        {/* User Header */}
                        <div className="px-6 py-4 border-b border-border/50 bg-muted/20 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                                    {userGroup.userName.charAt(0)}
                                </div>
                                <div>
                                    <h3 className="font-semibold text-lg flex items-center gap-2">
                                        {userGroup.userName}
                                        <span className="text-xs font-normal text-muted-foreground px-2 py-0.5 rounded-full bg-background border border-border">
                                            {userGroup.userTitle}
                                        </span>
                                    </h3>
                                    <p className="text-sm text-muted-foreground">{userGroup.department}</p>
                                </div>
                            </div>

                            <div className="flex gap-8 text-sm">
                                {/* Summary Stats */}
                                <div className="flex flex-col items-end">
                                    <span className="text-muted-foreground text-xs">총 근무</span>
                                    <span className="font-mono font-bold">{TimeUtils.minutesToDisplay(userGroup.summary.totalWorkMinutes)}</span>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-muted-foreground text-xs">실근무</span>
                                    <span className="font-mono font-bold text-primary">{TimeUtils.minutesToDisplay(userGroup.summary.basicWorkMinutes)}</span>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-muted-foreground text-xs">연장</span>
                                    <span className={cn("font-mono font-bold", userGroup.summary.overtimeMinutes > 0 ? "text-amber-500" : "text-muted-foreground")}>
                                        +{TimeUtils.minutesToDisplay(userGroup.summary.overtimeMinutes)}
                                    </span>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-muted-foreground text-xs">특근</span>
                                    <span className={cn("font-mono font-bold", userGroup.summary.specialWorkMinutes > 0 ? "text-purple-500" : "text-muted-foreground")}>
                                        +{TimeUtils.minutesToDisplay(userGroup.summary.specialWorkMinutes || 0)}
                                    </span>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-muted-foreground text-xs">상태</span>
                                    <StatusBadge status={userGroup.summary.complianceStatus} />
                                </div>
                            </div>
                        </div>

                        {/* Horizontal Table */}
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left">
                                <thead>
                                    <tr className="border-b border-border/50 bg-muted/10">
                                        <th className="px-4 py-3 w-24 font-medium text-muted-foreground bg-muted/20 sticky left-0 z-10 border-r border-border/50">구분</th>
                                        {sortedLogs.map(log => {
                                            const dateObj = new Date(log.date);
                                            const dayOfWeek = dateObj.getDay();
                                            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                                            const changes = changeMap?.get(log.id) || [];
                                            const hasChanges = changes.length > 0;

                                            return (

                                                <TooltipProvider key={log.id}>
                                                    <Tooltip delayDuration={200}>
                                                        <TooltipTrigger asChild>
                                                            <th
                                                                className={cn(
                                                                    "px-2 py-3 text-center min-w-[70px] font-medium border-r border-border/50 last:border-0 relative group cursor-help transition-colors",
                                                                    isWeekend ? "bg-slate-50/80 dark:bg-slate-900/40 text-slate-600" : "",
                                                                    hasChanges ? "bg-green-100 dark:bg-green-900/40 hover:bg-green-200" : "hover:bg-slate-100 dark:hover:bg-slate-800"
                                                                )}
                                                            >
                                                                <div className="flex flex-col items-center justify-center gap-1 whitespace-nowrap h-full w-full">
                                                                    <span className={cn(
                                                                        "text-xs font-semibold",
                                                                        (dayOfWeek === 0 || log.isHoliday) && "text-red-500",
                                                                        dayOfWeek === 6 && !log.isHoliday && "text-blue-500"
                                                                    )}>
                                                                        {log.date.substring(5)} ({['일', '월', '화', '수', '목', '금', '토'][dayOfWeek]})
                                                                    </span>
                                                                    {/* Only show badge icon if changed */}
                                                                    {hasChanges && (
                                                                        <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                                                                    )}
                                                                </div>
                                                            </th>
                                                        </TooltipTrigger>
                                                        {hasChanges && (
                                                            <TooltipContent side="right" className="bg-white/95 backdrop-blur-sm dark:bg-slate-900/95 border-green-200 dark:border-green-900 p-0 shadow-2xl rounded-xl overflow-hidden animate-in slide-in-from-left-2 transition-all">
                                                                <div className="bg-green-50/50 dark:bg-green-900/20 px-4 py-2 border-b border-green-100 dark:border-green-800/50 flex justify-between items-center">
                                                                    <span className="text-xs font-bold text-green-800 dark:text-green-300">
                                                                        {log.date} 변경 내역
                                                                    </span>
                                                                    <span className="text-[10px] bg-green-200 dark:bg-green-900 text-green-800 px-1.5 py-0.5 rounded-full">
                                                                        {changes.length}건
                                                                    </span>
                                                                </div>
                                                                <div className="p-3 space-y-2.5">
                                                                    {changes.map((c, idx) => {
                                                                        const label = c.field === 'startTime' ? '출근' : c.field === 'endTime' ? '퇴근' : c.field === 'overtime' ? '연장' : c.field;
                                                                        return (
                                                                            <div key={idx} className="text-xs grid grid-cols-[40px_1fr] gap-2 items-center">
                                                                                <span className="text-slate-500 font-medium bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-center">{label}</span>
                                                                                <div className="flex items-center gap-2 font-mono">
                                                                                    <span className="text-red-400 line-through decoration-red-400/50 decoration-2">{c.before || '-'}</span>
                                                                                    <span className="text-slate-300">→</span>
                                                                                    <span className="text-green-600 dark:text-green-400 font-bold bg-green-50 dark:bg-green-900/30 px-1 rounded">{c.after || '-'}</span>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </TooltipContent>
                                                        )}
                                                    </Tooltip>
                                                </TooltipProvider>
                                            );

                                        })}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/50">
                                    {/* Row 1: Status ( Attendance Type ) */}
                                    <tr className="hover:bg-muted/30">
                                        <td className="px-4 py-3 font-medium text-muted-foreground bg-muted/10 sticky left-0 z-10 border-r border-border/50">근태 구분</td>
                                        {sortedLogs.map(log => (
                                            <td key={`status-${log.id}`} className={cn(
                                                "px-2 py-2 text-center border-r border-border/50 last:border-0",
                                                log.status === 'ERROR' && "bg-red-50 dark:bg-red-900/20 border-x-2 border-red-500"
                                            )}>
                                                <div className="flex flex-col items-center gap-1">
                                                    <LogStatusSelect log={log} onUpdateLog={onUpdateLog} />
                                                    {log.status === 'ERROR' && log.note && (
                                                        <span className="text-[10px] text-red-600 font-bold break-words w-24 leading-tight">
                                                            {log.note}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        ))}
                                    </tr>

                                    {/* Row 2: Clock In (Start Work) */}
                                    <tr className="hover:bg-muted/30">
                                        <td className="px-4 py-3 font-medium text-muted-foreground bg-muted/10 sticky left-0 z-10 border-r border-border/50">
                                            업무시작
                                        </td>
                                        {sortedLogs.map(log => {
                                            const { text, subText, className, isTime } = getLogCellDisplay(log, 'start', config);
                                            return (
                                                <td key={`in-${log.id}`} className={cn(
                                                    "px-2 py-2 text-center border-r border-border/50 last:border-0 align-top",
                                                    log.status === 'ERROR' && "bg-red-50 dark:bg-red-900/20 border-x-2 border-red-500"
                                                )}>
                                                    {!isTime ? (
                                                        <span className={className}>{text}</span>
                                                    ) : (
                                                        <TimeEditButton log={log} onUpdateLog={onUpdateLog}>
                                                            <div className="flex flex-col items-center gap-1 min-h-[32px] justify-center">
                                                                <div className="flex flex-col items-center">
                                                                    <span className={cn("font-mono text-xs font-semibold tracking-tight", className)}>
                                                                        {text}
                                                                    </span>
                                                                    {subText && (
                                                                        <span className="text-[10px] text-indigo-600 dark:text-indigo-400 mt-0.5">
                                                                            {subText}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </TimeEditButton>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>

                                    {/* Row 3: Clock Out (End Work) */}
                                    <tr className="hover:bg-muted/30">
                                        <td className="px-4 py-3 font-medium text-muted-foreground bg-muted/10 sticky left-0 z-10 border-r border-border/50">
                                            업무종료
                                        </td>
                                        {sortedLogs.map(log => {
                                            const { text, subText, className, isTime } = getLogCellDisplay(log, 'end', config);
                                            return (
                                                <td key={`out-${log.id}`} className={cn(
                                                    "px-2 py-2 text-center border-r border-border/50 last:border-0 align-top",
                                                    log.status === 'ERROR' && "bg-red-50 dark:bg-red-900/20 border-x-2 border-red-500"
                                                )}>
                                                    {!isTime ? (
                                                        <span className={className}>{text}</span>
                                                    ) : (
                                                        <TimeEditButton log={log} onUpdateLog={onUpdateLog} type="end">
                                                            <div className="flex flex-col items-center gap-1 min-h-[32px] justify-center">
                                                                <div className="flex flex-col items-center">
                                                                    <span className={cn("font-mono text-xs font-semibold tracking-tight", className)}>
                                                                        {text}
                                                                    </span>
                                                                    {subText && (
                                                                        <span className="text-[10px] text-indigo-600 dark:text-indigo-400 mt-0.5">
                                                                            {subText}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </TimeEditButton>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>

                                    {/* Row 4: Total & Break */}
                                    <tr className="hover:bg-muted/30">
                                        <td className="px-4 py-2 font-medium text-muted-foreground bg-muted/10 sticky left-0 z-10 border-r border-border/50">총체류/휴게</td>
                                        {sortedLogs.map(log => {
                                            const { text, className } = getLogCellDisplay(log, 'total', config);
                                            return (
                                                <td key={`total-${log.id}`} className={cn(
                                                    "px-4 py-2 text-center font-mono text-xs text-muted-foreground border-r border-border/50 last:border-0",
                                                    log.status === 'ERROR' && "bg-red-50 dark:bg-red-900/20 border-x-2 border-red-500"
                                                )}>
                                                    <span className={className}>{text}</span>
                                                </td>
                                            );
                                        })}
                                    </tr>

                                    {/* Row 5: Actual Work */}
                                    <tr className="hover:bg-muted/30 bg-primary/5">
                                        <td className="px-4 py-2 font-medium text-primary bg-primary/10 sticky left-0 z-10 border-r border-border/50">실근무</td>
                                        {sortedLogs.map(log => {
                                            const { text, className } = getLogCellDisplay(log, 'actual', config);
                                            return (
                                                <td key={`actual-${log.id}`} className={cn(
                                                    "px-4 py-2 text-center font-mono font-bold text-primary border-r border-border/50 last:border-0",
                                                    log.status === 'ERROR' && "bg-red-50 dark:bg-red-900/20 border-x-2 border-red-500"
                                                )}>
                                                    <span className={className}>{text}</span>
                                                </td>
                                            );
                                        })}
                                    </tr>

                                    {/* Row 6: Overtime (Week Day Only) */}
                                    <tr className="hover:bg-muted/30">
                                        <td className="px-4 py-2 font-medium text-muted-foreground bg-muted/10 sticky left-0 z-10 border-r border-border/50">연장</td>
                                        {sortedLogs.map(log => {
                                            const isSpecial = log.isHoliday || new Date(log.date).getDay() % 6 === 0;
                                            const showOvertime = !isSpecial && log.overtimeDuration > 0;
                                            return (
                                                <td key={`ot-${log.id}`} className={cn(
                                                    "px-4 py-2 text-center font-mono font-bold text-xs border-r border-border/50 last:border-0",
                                                    showOvertime ? "text-amber-500" : "text-slate-300",
                                                    log.status === 'ERROR' && "bg-red-50 dark:bg-red-900/20 border-x-2 border-red-500"
                                                )}>
                                                    {showOvertime ? `+${TimeUtils.minutesToDisplay(log.overtimeDuration)}` : "-"}
                                                </td>
                                            );
                                        })}
                                    </tr>

                                    {/* Row 7: Special Work (Holyday/Weekend) */}
                                    <tr className="hover:bg-muted/30">
                                        <td className="px-4 py-2 font-medium text-muted-foreground bg-muted/10 sticky left-0 z-10 border-r border-border/50">특근</td>
                                        {sortedLogs.map(log => {
                                            const isSpecial = log.isHoliday || new Date(log.date).getDay() % 6 === 0;
                                            const showSpecial = isSpecial && log.actualWorkDuration > 0;
                                            return (
                                                <td key={`sp-${log.id}`} className={cn(
                                                    "px-4 py-2 text-center font-mono font-bold text-xs border-r border-border/50 last:border-0",
                                                    showSpecial ? "text-purple-500" : "text-slate-300",
                                                    log.status === 'ERROR' && "bg-red-50 dark:bg-red-900/20 border-x-2 border-red-500"
                                                )}>
                                                    {showSpecial ? `+${TimeUtils.minutesToDisplay(log.actualWorkDuration)}` : "-"}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            })}

            {hasMore && (
                <div className="flex justify-center pt-4 pb-8">
                    <button
                        onClick={handleLoadMore}
                        className="px-6 py-2 bg-white border border-border rounded-full shadow-sm text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-2"
                    >
                        <span>더 보기 ({displayLimit} / {sortedUserGroups.length})</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                </div>
            )}
        </div >
    );
};

// Sub-component for Status Select & Duplicate Resolution
const LogStatusSelect = ({ log, onUpdateLog }: { log: any, onUpdateLog?: any }) => {
    const { updateLog: contextUpdateLog, config, policies } = useData();
    const updateLog = onUpdateLog || contextUpdateLog;

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newStatus = e.target.value as LogStatus;

        // [Policy Aware] Use active config for the specific date
        const effectivePolicy = PolicyUtils.getPolicyForDate(log.date, policies);
        const activeConfig = effectivePolicy ? PolicyUtils.toGlobalConfig(effectivePolicy) : config;

        const updates = calculateStatusChangeUpdates(log, newStatus, activeConfig);
        updateLog(log.id, updates);
    };

    // [New] Duplicate Resolution UI
    if (log.candidates && log.candidates.length > 0) {
        return (
            <div className="flex flex-col gap-1">
                <span className="text-[10px] text-red-600 font-bold">동명이인 감지</span>
                <select
                    className="text-xs border border-red-300 rounded px-1 py-1 bg-red-50 focus:ring-1 focus:ring-red-500 outline-none max-w-[100px]"
                    onChange={(e) => {
                        const selectedId = e.target.value;
                        if (!selectedId) return;

                        // Find full employee object
                        const selectedEmp = log.candidates.find((c: any) => c.id === selectedId);

                        // Update Log: Set ID, Clear Candidates, Set Status to Normal
                        updateLog(log.id, {
                            employeeId: selectedId,
                            candidates: undefined, // Clear candidates
                            status: 'NORMAL',
                            note: (log.note || "").replace("[동명이인 확인 필요]", "") + `[선택: ${selectedEmp?.department || '부서미정'} ${selectedEmp?.position || ''}]`
                        });
                    }}
                    defaultValue=""
                >
                    <option value="" disabled>직원 선택</option>
                    {log.candidates.map((c: any) => (
                        <option key={c.id} value={c.id}>
                            {c.department || '부서미정'} {c.position || ''}
                        </option>
                    ))}
                </select>
            </div>
        );
    }

    return (
        <select
            value={log.logStatus || LogStatus.NORMAL}
            onChange={handleChange}
            className={cn(
                "text-xs border border-border/50 rounded px-2 py-1 bg-background focus:ring-1 focus:ring-primary outline-none",
                log.logStatus === LogStatus.VACATION && "text-blue-500 border-blue-200 bg-blue-50",
                log.logStatus === LogStatus.TRIP && "text-indigo-500 border-indigo-200 bg-indigo-50",
                log.logStatus === LogStatus.SPECIAL && "text-purple-500 border-purple-200 bg-purple-50",
                log.logStatus === LogStatus.REST && "text-slate-500 border-slate-200 bg-slate-50",
                log.logStatus === LogStatus.SICK && "text-red-500 border-red-200 bg-red-50"
            )}
        >
            <option value={LogStatus.NORMAL}>정상</option>
            <option value={LogStatus.REST}>휴무</option>
            <option value={LogStatus.SPECIAL}>특근</option>
            <option value={LogStatus.VACATION}>휴가</option>
            <option value={LogStatus.TRIP}>출장</option>
            <option value={LogStatus.EDUCATION}>교육</option>
            <option value={LogStatus.SICK}>병가</option>
            <option value={LogStatus.OTHER}>기타</option>
        </select>
    );
};

// Time Edit Component (Wrapper)
const TimeEditButton = ({ log, onUpdateLog, children, type = 'start' }: { log: ProcessedWorkLog, onUpdateLog?: any, children?: React.ReactNode, type?: 'start' | 'end' }) => {
    const { updateLog: contextUpdateLog, config } = useData();
    const updateLog = onUpdateLog || contextUpdateLog;
    const [isOpen, setIsOpen] = useState(false);
    const [startTimeInput, setStartTimeInput] = useState('');
    const [endTimeInput, setEndTimeInput] = useState('');

    const handleOpen = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent bubbling
        // Initialize with current values
        setStartTimeInput(log.startTime > 0 ? TimeUtils.minutesToTime(log.startTime) : '09:00');
        setEndTimeInput(log.endTime > 0 ? TimeUtils.minutesToTime(log.endTime) : '18:00');
        setIsOpen(true);
    };

    const handleSave = () => {
        // Parse input times
        const newStartTime = TimeUtils.timeToMinutes(startTimeInput);
        const newEndTime = TimeUtils.timeToMinutes(endTimeInput);

        // Calculate durations (Simple Logic)
        // Calculate durations using shared logic (Snap Applied)
        const { actualWork, totalDuration, breakDuration } = calculateActualWork(newStartTime, newEndTime, config);
        const overtimeDuration = Math.max(0, actualWork - 8 * 60);

        const startStr = generateSafeTimeString(newStartTime, newStartTime, log.id + "manual-start-" + startTimeInput);
        const endStr = generateSafeTimeString(newEndTime, newEndTime, log.id + "manual-end-" + endTimeInput);

        // Update log
        updateLog(log.id, {
            startTime: newStartTime,
            endTime: newEndTime,
            totalDuration,
            breakDuration,
            actualWorkDuration: actualWork,
            overtimeDuration,
            rawStartTimeStr: startStr,
            rawEndTimeStr: endStr,
            originalStartTimeStr: '', // Clear original to force display update
            originalEndTimeStr: '',   // Clear original to force display update
            status: 'NORMAL',
            note: (log.note || "").replace(/\[.*?\]/g, "") + "[수기 수정]"
        });

        setIsOpen(false);
    };

    return (
        <>
            <div
                onClick={handleOpen}
                className={cn(
                    "cursor-pointer hover:bg-primary/5 rounded px-2 py-1 transition-colors group relative border border-transparent hover:border-primary/20",
                    children ? "" : "text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                )}
                title="클릭하여 시간 수정"
            >
                {children || (
                    <>
                        <Edit2 className="w-3 h-3" />
                        <span>수정</span>
                    </>
                )}
                {/* Hover Pencil Icon Overlay (only if children exist) */}
                {children && (
                    <div className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Edit2 className="w-2.5 h-2.5 text-primary/70" />
                    </div>
                )}
            </div>

            {isOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 text-left" onClick={() => setIsOpen(false)}>
                    <div className="bg-card border border-border rounded-lg shadow-xl p-6 w-96" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold">근무 시간 수정</h3>
                            <button onClick={() => setIsOpen(false)} className="text-muted-foreground hover:text-foreground">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="text-sm text-muted-foreground mb-2 bg-muted/50 p-3 rounded">
                                <div className="flex justify-between">
                                    <span>날짜:</span>
                                    <span className="font-medium text-foreground">{log.date}</span>
                                </div>
                                <div className="flex justify-between mt-1">
                                    <span>직원:</span>
                                    <span className="font-medium text-foreground">{log.userName}</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium mb-1.5 text-muted-foreground">출근 시각</label>
                                    <input
                                        type="time"
                                        value={startTimeInput}
                                        onChange={(e) => setStartTimeInput(e.target.value)}
                                        className="w-full px-3 py-2 border border-border rounded-md bg-background focus:ring-2 focus:ring-primary outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium mb-1.5 text-muted-foreground">퇴근 시각</label>
                                    <input
                                        type="time"
                                        value={endTimeInput}
                                        onChange={(e) => setEndTimeInput(e.target.value)}
                                        className="w-full px-3 py-2 border border-border rounded-md bg-background focus:ring-2 focus:ring-primary outline-none"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-2 mt-6 pt-2 border-t border-border/50">
                                <button
                                    onClick={handleSave}
                                    className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 font-medium text-sm"
                                >
                                    저장하기
                                </button>
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="flex-1 px-4 py-2 border border-border rounded-md hover:bg-muted text-sm"
                                >
                                    취소
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
