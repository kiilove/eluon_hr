
import React, { useState, useEffect } from 'react';
import { format, subMonths, addMonths } from 'date-fns';
import {
    Users, Clock, TrendingUp, AlertCircle,
    ChevronLeft, ChevronRight, BarChart3, PieChart
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    LineChart, Line
} from 'recharts';

interface DashboardStats {
    summary: {
        totalEmployees: number;
        totalOvertimeMinutes: number;
        totalWorkMinutes: number;
        avgWorkMinutes: number;
    };
    topUsers: Array<{
        user_name: string;
        user_title: string;
        department: string;
        totalOvertime: number;
    }>;
    weeklyTrend: Array<{
        week: string;
        totalOvertime: number;
        totalWork: number;
    }>;
    monthlyTrend: Array<{
        month: string;
        totalOvertime: number;
        totalWork: number;
    }>;
}

const DashboardPage = () => {
    // Default to Last Month for HR analysis context
    const [currentDate, setCurrentDate] = useState(subMonths(new Date(), 1));
    const selectedMonth = format(currentDate, 'yyyy-MM');
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [trendMode, setTrendMode] = useState<'weekly' | 'monthly'>('weekly');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchStats = async () => {
            setLoading(true);
            setError(null);
            try {
                // Get companyId from user context
                const userStr = localStorage.getItem('user');
                let companyId = '';
                if (userStr) {
                    const user = JSON.parse(userStr);
                    companyId = user.company_id;
                }

                if (!companyId) throw new Error("Company ID missing");

                const res = await fetch(`/api/dashboard/stats?month=${selectedMonth}&companyId=${companyId}`);
                const data = await res.json() as { success: boolean, message?: string } & DashboardStats;
                if (data.success) {
                    setStats(data);
                } else {
                    setError(data.message || "Failed to load data");
                    setStats(null);
                }
            } catch (e: any) {
                console.error("Failed to fetch stats", e);
                setError(e.message || "Network Error");
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, [selectedMonth]);

    // Format Helpers
    const minToHours = (min: number) => (min / 60).toFixed(1);

    if (!stats && loading) return <div className="p-8 text-center text-slate-500">Loading Dashboard...</div>;
    if (error) return <div className="p-8 text-center text-red-500">Error: {error}</div>;
    if (!stats) return <div className="p-8 text-center text-slate-500">No Data Available</div>;

    const trendData = (trendMode === 'weekly' ? stats.weeklyTrend : stats.monthlyTrend).map(d => ({
        ...d,
        totalWork: Number((d.totalWork / 60).toFixed(1)),
        totalOvertime: Number((d.totalOvertime / 60).toFixed(1))
    }));

    return (
        <div className="space-y-6 max-w-[1600px] mx-auto p-2">

            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">대시보드</h1>
                    <p className="text-slate-500 text-sm mt-1">
                        근태 현황 및 통계 요약 (데이터 기반)
                    </p>
                </div>

                {/* Month Picker */}
                <div className="flex items-center gap-2 bg-white rounded-lg p-1 border border-slate-200 shadow-sm">
                    <Button variant="ghost" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="h-8 w-8 hover:bg-slate-100 transition-all">
                        <ChevronLeft className="w-4 h-4 text-slate-600" />
                    </Button>
                    <span className="w-32 text-center font-bold text-slate-700 text-sm">
                        {format(currentDate, 'yyyy.MM')}
                    </span>
                    <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="h-8 w-8 hover:bg-slate-100 transition-all">
                        <ChevronRight className="w-4 h-4 text-slate-600" />
                    </Button>
                </div>
            </div>

            {/* 1. Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="shadow-sm border-l-4 border-l-indigo-500">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-slate-500">총 근무 인원</p>
                            <h3 className="text-2xl font-bold text-slate-800 mt-1">{stats.summary.totalEmployees}명</h3>
                        </div>
                        <div className="p-2 bg-indigo-50 rounded-full text-indigo-600">
                            <Users className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-l-4 border-l-amber-500">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-slate-500">이번 달 총 특근 (연장+휴일)</p>
                            <h3 className="text-2xl font-bold text-slate-800 mt-1">
                                {minToHours(stats.summary.totalOvertimeMinutes)} <span className="text-sm text-slate-400 font-normal">hrs</span>
                            </h3>
                        </div>
                        <div className="p-2 bg-amber-50 rounded-full text-amber-600">
                            <Clock className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-l-4 border-l-blue-500">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-slate-500">총 주간 근로</p>
                            <h3 className="text-2xl font-bold text-slate-800 mt-1">
                                {minToHours(stats.summary.totalWorkMinutes)} <span className="text-sm text-slate-400 font-normal">hrs</span>
                            </h3>
                        </div>
                        <div className="p-2 bg-blue-50 rounded-full text-blue-600">
                            <BarChart3 className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-l-4 border-l-emerald-500">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-slate-500">인당 평균 근무(일)</p>
                            <h3 className="text-2xl font-bold text-slate-800 mt-1">
                                {minToHours(stats.summary.avgWorkMinutes)} <span className="text-sm text-slate-400 font-normal">hrs</span>
                            </h3>
                        </div>
                        <div className="p-2 bg-emerald-50 rounded-full text-emerald-600">
                            <TrendingUp className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* 2. Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Trend Chart (Main) */}
                <Card className="lg:col-span-2 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-base text-slate-700">
                            {trendMode === 'weekly'
                                ? `${format(currentDate, 'M')}월 주간 근무 현황`
                                : `${format(currentDate, 'yyyy')}년 월간 근무 현황`
                            }
                        </CardTitle>
                        <div className="flex bg-slate-100 rounded-lg p-1 gap-1">
                            <button
                                onClick={() => setTrendMode('weekly')}
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${trendMode === 'weekly' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:bg-slate-200/50'}`}
                            >
                                주간 (Weekly)
                            </button>
                            <button
                                onClick={() => setTrendMode('monthly')}
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${trendMode === 'monthly' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:bg-slate-200/50'}`}
                            >
                                연간 (Monthly)
                            </button>
                        </div>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={trendData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis
                                    dataKey={trendMode === 'weekly' ? 'week' : 'month'}
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(val) => trendMode === 'weekly' ? `W${val}` : val}
                                />
                                <YAxis fontSize={12} tickLine={false} axisLine={false} unit="h" />
                                <Tooltip
                                    formatter={(value: number) => [`${value} hrs`, '']}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Legend />
                                <Bar dataKey="totalWork" name="주간 근로" fill="#cbd5e1" radius={[4, 4, 0, 0]} stackId="a" />
                                <Bar dataKey="totalOvertime" name="특근 근로" fill="#f59e0b" radius={[4, 4, 0, 0]} stackId="a" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Top Overtime Users */}
                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base text-slate-700">특근 상위 5인 ({selectedMonth})</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {stats.topUsers.length === 0 && (
                                <p className="text-center text-sm text-slate-400 py-8">데이터가 없습니다.</p>
                            )}
                            {stats.topUsers.map((u, i) => (
                                <div key={i} className="flex items-center justify-between group">
                                    <div className="flex items-center gap-3">
                                        <div className={`
                                            w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
                                            ${i === 0 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}
                                        `}>
                                            {i + 1}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-slate-800">{u.user_name || '이름없음'}</p>
                                            <p className="text-xs text-slate-500">{u.department || '부서미정'} {u.user_title}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-sm font-bold text-amber-600">
                                            {minToHours(u.totalOvertime)}
                                        </span>
                                        <span className="text-xs text-slate-400 ml-1">hrs</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Placeholder for future widgets */}
                <Card className="shadow-sm border-dashed border-2 border-slate-200 bg-slate-50/50">
                    <CardContent className="h-[200px] flex flex-col items-center justify-center text-slate-400">
                        <PieChart className="w-10 h-10 mb-2 opacity-50" />
                        <p>부서별 통계 (준비중)</p>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-dashed border-2 border-slate-200 bg-slate-50/50">
                    <CardContent className="h-[200px] flex flex-col items-center justify-center text-slate-400">
                        <AlertCircle className="w-10 h-10 mb-2 opacity-50" />
                        <p>근태 이상 감지 (준비중)</p>
                    </CardContent>
                </Card>
            </div>

        </div>
    );
};

export default DashboardPage;
