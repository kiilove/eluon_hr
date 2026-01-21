import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, Upload, Trash2, Calendar as CalendarIcon, AlertTriangle, CheckCircle2, ChevronRight, ChevronLeft } from "lucide-react";
import { cn } from '@/lib/utils';
import { startOfMonth, endOfMonth, eachWeekOfInterval, startOfWeek, endOfWeek, format, isSameMonth, addMonths, getISOWeek } from 'date-fns';
import { TimeUtils } from '@/lib/timeUtils';

interface SmartUploadStepProps {
    isProcessing: boolean;
    onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const SmartUploadStep: React.FC<SmartUploadStepProps> = ({ isProcessing, onUpload }) => {
    // [UX] Default to Previous Month (Per User Request)
    const [targetMonth, setTargetMonth] = useState<string>(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1); // Subtract 1 month
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });

    const [stats, setStats] = useState<Record<string, number>>({});
    const [isLoadingStats, setIsLoadingStats] = useState(false);
    const [deletedWeeks, setDeletedWeeks] = useState<Set<number>>(new Set());

    // [User Context] Retrieve for Company Isolation
    const [user, setUser] = useState<{ company_id: string } | null>(null);
    useEffect(() => {
        const userStr = localStorage.getItem('user');
        if (userStr) {
            setUser(JSON.parse(userStr));
        }
    }, []);

    // Fetch Stats
    const fetchStats = async () => {
        if (!user?.company_id) return; // Wait for user context

        setIsLoadingStats(true);
        try {
            // Use Standard Logs API (Same as Calendar)
            const res = await fetch(`/api/attendance/logs?month=${targetMonth}&companyId=${user.company_id}`);
            const data = await res.json() as any;

            if (data.success) {
                // Aggregate locally
                const newStats: Record<string, number> = {};

                // Process Manual Logs
                if (Array.isArray(data.manualLogs)) {
                    data.manualLogs.forEach((l: any) => {
                        const d = l.date || l.work_date;
                        if (d) newStats[d] = (newStats[d] || 0) + 1;
                    });
                }

                // Process Special Logs
                if (Array.isArray(data.specialLogs)) {
                    data.specialLogs.forEach((l: any) => {
                        const d = l.date || l.work_date;
                        if (d) newStats[d] = (newStats[d] || 0) + 1;
                    });
                } else if (Array.isArray(data.logs)) {
                    // Fallback
                    data.logs.forEach((l: any) => {
                        const d = l.date;
                        if (d) newStats[d] = (newStats[d] || 0) + 1;
                    });
                }

                setStats(newStats);
            } else {
                throw new Error(data.message || data.error || "Unknown Error");
            }
        } catch (e: any) {
            console.error("Failed to fetch stats", e);
            alert(`데이터 조회 실패: ${e.message}`);
        } finally {
            setIsLoadingStats(false);
        }
    };

    useEffect(() => {
        if (targetMonth && user?.company_id) fetchStats();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [targetMonth, user?.company_id]);

    // Navigate Month
    const handleMoveMonth = (delta: number) => {
        setTargetMonth(prev => {
            const date = new Date(prev + '-01'); // Ensure YYYY-MM-01 parsing
            return format(addMonths(date, delta), 'yyyy-MM');
        });
    };


    // Handle Delete Range
    const handleDeleteRange = async (start: Date, end: Date, weekIdx?: number) => {
        if (!user?.company_id) {
            alert("사용자 정보를 찾을 수 없습니다.");
            return;
        }

        const startStr = format(start, 'yyyy-MM-dd');
        const endStr = format(end, 'yyyy-MM-dd');

        if (!confirm(`${startStr} ~ ${endStr} 기간의 모든 근태 데이터를 삭제하시겠습니까?\n(이 작업은 되돌릴 수 없습니다)`)) {
            return;
        }

        try {
            // Use logs API (GET with mode=delete to avoid Method issues without restart)
            const res = await fetch(`/api/attendance/logs?mode=delete&startDate=${startStr}&endDate=${endStr}&companyId=${user.company_id}`, {
                headers: { 'Content-Type': 'application/json' }
            });
            const result = await res.json() as any;
            if (res.ok && result.success) {
                alert(`${result.deletedCount}건의 데이터가 삭제되었습니다.`);
                fetchStats(); // Refresh
                if (weekIdx !== undefined) {
                    setDeletedWeeks(prev => new Set(prev).add(weekIdx));
                }
            } else {
                alert("삭제 실패: " + result.message || result.error);
            }
        } catch (e: any) {
            console.error("Delete Error", e);
            alert("오류 발생: " + e.message);
        }
    };

    // Calculate Week Ranges for the selected Month
    // We want full weeks that overlap with the month? Or just strict month weeks?
    // User wants to clear "Weekly". Usually payroll is by week.
    // Let's list weeks that have at least one day in this month.


    const monthStart = startOfMonth(new Date(targetMonth));
    const monthEnd = endOfMonth(new Date(targetMonth));
    const weeks = eachWeekOfInterval({ start: monthStart, end: monthEnd }, { weekStartsOn: 1 }); // Monday start

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Col: Month & Data Management */}
            <Card className="glass-card border-indigo-100 bg-white/50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-indigo-900">
                        <CalendarIcon className="w-5 h-5" />
                        작업 대상 월 선택
                    </CardTitle>
                    <CardDescription>
                        데이터를 업로드하거나 초기화할 기준 월을 선택하세요.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-slate-50/50">
                        <Button variant="ghost" size="icon" onClick={() => handleMoveMonth(-1)}>
                            <ChevronLeft className="w-5 h-5 text-slate-600" />
                        </Button>

                        <div className="text-xl font-bold text-slate-800 tabular-nums">
                            {format(new Date(targetMonth + '-01'), 'yyyy년 MM월')}
                        </div>

                        <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleMoveMonth(1)}>
                                <ChevronRight className="w-5 h-5 text-slate-600" />
                            </Button>
                            <div className="w-px h-6 bg-slate-300 mx-1 my-auto" />
                            <Button variant="ghost" size="icon" onClick={fetchStats} title="새로고침">
                                <RefreshCw className={cn("w-4 h-4 text-slate-500", isLoadingStats && "animate-spin")} />
                            </Button>
                        </div>
                    </div>

                    {/* Weekly Stats List */}
                    <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-slate-700 flex justify-between items-center">
                            <span>등록된 데이터 현황</span>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-500 hover:text-red-600 hover:bg-red-50 text-xs h-6"
                                onClick={() => handleDeleteRange(monthStart, monthEnd)}
                            >
                                <Trash2 className="w-3 h-3 mr-1" />
                                월 전체 삭제
                            </Button>
                        </h4>

                        <div className="relative rounded-md border border-slate-200 bg-white overflow-hidden max-h-[300px] overflow-y-auto">
                            {weeks.map((weekStart, idx) => {
                                const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
                                // Count records in this range
                                let count = 0;
                                let curr = new Date(weekStart);
                                while (curr <= weekEnd) {
                                    const dStr = format(curr, 'yyyy-MM-dd');
                                    if (stats[dStr]) count += stats[dStr];
                                    curr.setDate(curr.getDate() + 1);
                                }

                                const hasData = count > 0;
                                const isCurrentMonth = isSameMonth(weekStart, monthStart) || isSameMonth(weekEnd, monthStart);

                                return (
                                    <div key={idx} className={cn(
                                        "flex items-center justify-between p-3 border-b last:border-0 hover:bg-slate-50 transition-colors",
                                        !isCurrentMonth && "bg-slate-50 opacity-60"
                                    )}>
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "w-2 h-2 rounded-full",
                                                hasData ? "bg-green-500" : "bg-slate-300"
                                            )} />
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-slate-700">
                                                    {TimeUtils.getWeekKey(weekStart)} ({format(weekStart, 'MM.dd')} ~ {format(weekEnd, 'MM.dd')})
                                                </span>
                                                <span className="text-xs text-slate-500">
                                                    {hasData ? `${count}건의 데이터` : '데이터 없음'}
                                                </span>
                                            </div>
                                        </div>
                                        {hasData && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 text-xs border-red-200 text-red-600 hover:bg-red-50"
                                                onClick={() => handleDeleteRange(weekStart, weekEnd, idx)}
                                            >
                                                삭제
                                            </Button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Right Col: Upload Area */}
            <Card className={cn(
                "border-dashed flex flex-col items-center justify-center bg-slate-50/50 transition-all",
                isProcessing && "bg-white border-solid"
            )}>
                <CardContent className="text-center space-y-6 py-12">
                    <div className={cn(
                        "p-6 rounded-full bg-white shadow-lg mx-auto w-fit transition-transform duration-500",
                        isProcessing && "scale-110"
                    )}>
                        {isProcessing ? (
                            <RefreshCw className="w-10 h-10 text-primary animate-spin" />
                        ) : (
                            <Upload className="w-10 h-10 text-primary" />
                        )}
                    </div>

                    <div className="space-y-2">
                        <h3 className="text-2xl font-bold text-slate-800">
                            {isProcessing ? '데이터 분석 중...' : '엑셀 업로드'}
                        </h3>
                        <p className="text-muted-foreground max-w-sm mx-auto">
                            선택한 <strong>{targetMonth}</strong>월의 데이터를 업로드합니다.<br />
                            <span className="text-xs text-amber-600 mt-1 block">
                                * 기존 데이터가 있는 주차는 자동으로 덮어쓰기 되거나 중복될 수 있습니다.
                            </span>
                        </p>
                    </div>

                    {!isProcessing && (
                        <div className="relative">
                            <Input
                                type="file"
                                accept=".xlsx, .xls"
                                className="hidden"
                                id="smart-upload-input"
                                onChange={onUpload}
                            />
                            <Button
                                size="lg"
                                className="bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200 shadow-lg"
                                onClick={() => document.getElementById('smart-upload-input')?.click()}
                            >
                                <Upload className="w-4 h-4 mr-2" />
                                파일 선택 및 업로드
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};
