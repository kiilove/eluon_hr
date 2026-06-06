
import React, { useState, useEffect } from "react";
import { format, subMonths, addMonths, startOfMonth, endOfMonth, getYear } from "date-fns";
import { useNavigate } from "react-router-dom";
import {
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    Database,
    UploadCloud,
    Trash2,
    Clock,
    Coins,
    AlertCircle,
    Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMessageModal } from "@/contexts/MessageModalContext";
import { cn } from "@/lib/utils";

interface MonthlyStat {
    month: string; // YYYY-MM
    employee_count: number;
    record_count: number;
    total_minutes: number;
    total_overtime_minutes: number;
    // estimated_cost?: number; // Optional if we calculate it
}

interface SpecialWorkStatsResponse {
    success: boolean;
    data: MonthlyStat[];
}

export const SpecialWorkDashboardPage = () => {
    const navigate = useNavigate();
    const { showAlert, showConfirm } = useMessageModal();
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    const [stats, setStats] = useState<Record<string, MonthlyStat>>({});
    const [isLoading, setIsLoading] = useState(false);

    // [User Context]
    const [user, setUser] = useState<{ company_id: string } | null>(null);
    useEffect(() => {
        const userStr = localStorage.getItem('user');
        if (userStr) setUser(JSON.parse(userStr));
    }, []);

    // [Fetch Data]
    const fetchStats = async () => {
        if (!user?.company_id) return;
        setIsLoading(true);
        try {
            const res = await fetch(`/api/special-work/monthly-status?year=${currentYear}&companyId=${user.company_id}`);
            if (res.ok) {
                const json = (await res.json()) as SpecialWorkStatsResponse;
                if (json.success && Array.isArray(json.data)) {
                    const map: Record<string, MonthlyStat> = {};
                    json.data.forEach((item: MonthlyStat) => {
                        map[item.month] = item;
                    });
                    setStats(map);
                }
            }
        } catch (e) {
            console.error("Failed to fetch dashboard stats", e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (user) fetchStats();
    }, [user, currentYear]);

    // [Handlers]
    const handleMonthClick = (month: number) => {
        // Navigate with intent
        const monthStr = `${currentYear}-${String(month).padStart(2, '0')}`;
        const hasData = !!stats[monthStr];

        if (hasData) {
            // Go to list view for this month
            navigate('/special-work/list', { state: { targetMonth: monthStr, mode: 'view' } });
        } else {
            // Go to upload for this month
            // We pass 'targetMonth' so the upload page can pre-select it if possible
            navigate('/special-work/list', { state: { targetMonth: monthStr, mode: 'upload' } });
        }
    };

    const handleDeleteMonth = async (e: React.MouseEvent, monthStr: string) => {
        e.stopPropagation();
        const confirmed = await showConfirm(
            `${monthStr} 데이터가 모두 삭제됩니다. 계속하시겠습니까?`,
            { type: 'warning', title: '데이터 삭제' }
        );

        if (confirmed) {
            // Call Delete API (New or Existing)
            // Assuming we use the bulk delete or simple loop. 
            // Ideally we need a Delete API endpoint.
            // For now, let's just simulate or call an endpoint if it exists.
            // If API doesn't exist, we should block or create one.
            // Let's assume we navigate to management with delete intent? No, dashboard delete is better.
            // I'll create a DELETE endpoint for monthly logs later if needed.
            // For now, inform user to go to detail.
            await showAlert("상세 페이지에서 '전체 삭제'를 진행해주세요.", { type: 'info' });
            navigate('/special-work/list', { state: { targetMonth: monthStr, mode: 'view' } });
        }
    };

    const months = Array.from({ length: 12 }, (_, i) => i + 1);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">특근 데이터 대시보드</h1>
                    <p className="text-slate-500 mt-1">월별 특근 및 근태 현황을 한눈에 파악하고 관리하세요.</p>
                </div>

                <div className="flex items-center gap-4 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                    <Button variant="ghost" size="icon" onClick={() => setCurrentYear(y => y - 1)}>
                        <ChevronLeft className="w-5 h-5" />
                    </Button>
                    <div className="text-xl font-bold min-w-[100px] text-center">{currentYear}년</div>
                    <Button variant="ghost" size="icon" onClick={() => setCurrentYear(y => y + 1)}>
                        <ChevronRight className="w-5 h-5" />
                    </Button>
                </div>
            </div>

            {/* Unique Calendar Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {months.map(month => {
                    const monthStr = `${currentYear}-${String(month).padStart(2, '0')}`;
                    const stat = stats[monthStr];
                    const hasData = !!stat;
                    const isFuture = new Date(monthStr) > new Date(); // Simple check

                    return (
                        <div
                            key={month}
                            onClick={() => handleMonthClick(month)}
                            className={cn(
                                "group relative h-[280px] rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden backdrop-blur-sm",
                                hasData
                                    ? "bg-white border-indigo-100 hover:shadow-xl hover:shadow-indigo-100/50 hover:border-indigo-300"
                                    : "bg-slate-50 border-dashed border-slate-300 hover:border-slate-400 hover:bg-slate-100"
                            )}
                        >
                            {/* Month Header */}
                            <div className={cn(
                                "absolute top-0 left-0 w-full p-6 flex justify-between items-start",
                                hasData ? "bg-gradient-to-b from-indigo-50/50 to-transparent" : ""
                            )}>
                                <span className={cn(
                                    "text-4xl font-extrabold tracking-tighter",
                                    hasData ? "text-indigo-900" : "text-slate-300"
                                )}>
                                    {month}<span className="text-lg font-bold ml-1 opacity-50">월</span>
                                </span>
                                {hasData && (
                                    <div className="bg-indigo-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg shadow-indigo-200">
                                        등록됨
                                    </div>
                                )}
                            </div>

                            {/* Content - Data Exists */}
                            {hasData && (
                                <div className="absolute bottom-0 left-0 w-full p-6 pt-0 space-y-4">
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between text-sm text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                                            <div className="flex items-center gap-2">
                                                <Database className="w-4 h-4 text-indigo-500" />
                                                <span>데이터 건수</span>
                                            </div>
                                            <span className="font-bold text-slate-900">{stat.record_count.toLocaleString()}건</span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                                            <div className="flex items-center gap-2">
                                                <Clock className="w-4 h-4 text-amber-500" />
                                                <span>총 근무시간</span>
                                            </div>
                                            <span className="font-bold text-slate-900">
                                                {Math.round(stat.total_minutes / 60).toLocaleString()}h
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Content - Empty */}
                            {!hasData && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-3 group-hover:scale-105 transition-transform duration-300">
                                    <div className="p-4 rounded-full bg-slate-100 group-hover:bg-white group-hover:shadow-md transition-all">
                                        <Plus className="w-8 h-8 opacity-50 group-hover:opacity-100 text-slate-500 group-hover:text-indigo-500" />
                                    </div>
                                    <span className="text-sm font-medium group-hover:text-slate-600">데이터 등록하기</span>
                                </div>
                            )}

                            {/* Hover Overlay Actions */}
                            {hasData && (
                                <div className="absolute inset-0 bg-indigo-900/90 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center gap-4 z-10 backdrop-blur-[2px]">
                                    <div className="text-white font-bold text-lg mb-2">{currentYear}년 {month}월</div>
                                    <Button variant="outline" className="w-40 gap-2 border-white/20 text-indigo-100 hover:bg-white hover:text-indigo-700 bg-white/10"
                                        onClick={(e) => { e.stopPropagation(); handleMonthClick(month); }}
                                    >
                                        <UploadCloud className="w-4 h-4" />
                                        재등록 / 수정
                                    </Button>
                                    <Button variant="destructive" className="w-40 gap-2 shadow-lg shadow-red-900/20"
                                        onClick={(e) => handleDeleteMonth(e, monthStr)}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        삭제
                                    </Button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
