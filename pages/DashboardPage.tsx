
import React, { useState, useEffect } from 'react';
import { format, subMonths, addMonths } from 'date-fns';
import {
    Users, Clock, TrendingUp, AlertCircle,
    ChevronLeft, ChevronRight, BarChart3, PieChart,
    AlertTriangle, ShieldAlert, ArrowUpRight, ArrowDownRight,
    Activity
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    LineChart, Line, Cell, PieChart as RePieChart, Pie
} from 'recharts';

interface DashboardStats {
    summary: {
        totalEmployees: number;
        totalOvertimeMinutes: number;
        totalWorkMinutes: number;
        avgWorkMinutes: number;
    };
    complianceRisk: {
        highRiskCount: number;
        warningCount: number;
    };
    departmentOvertime: Array<{
        department: string;
        totalOvertimeMinutes: number;
        percentage: number;
    }>;
    previousMonthComparison: {
        overtimeChangePercentage: number;
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
    anomalies: string[];
    anomalyCount: number;
}

const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];

const DashboardPage = () => {
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

    const minToHours = (min: number) => (min / 60).toFixed(1);

    if (!stats && loading) return <div className="p-8 text-center text-slate-500">Loading Actionable Insights...</div>;
    if (error) return <div className="p-8 text-center text-red-500">Error: {error}</div>;
    if (!stats) return <div className="p-8 text-center text-slate-500">No Data Available</div>;

    const trendData = (trendMode === 'weekly' ? stats.weeklyTrend : stats.monthlyTrend).map(d => ({
        ...d,
        totalWork: Number((d.totalWork / 60).toFixed(1)),
        totalOvertime: Number((d.totalOvertime / 60).toFixed(1))
    }));

    const topDept = stats.departmentOvertime[0] || { department: '없음', percentage: 0 };

    return (
        <div className="space-y-6 max-w-[1600px] mx-auto p-4 bg-slate-50/50 min-h-screen">

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-end gap-4 mb-2">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                        인사 관리 대시보드
                    </h1>
                    <p className="text-sm text-slate-500">
                        근무 리스크 감지 및 자원 최적화 분석
                    </p>
                </div>

                {/* Month Picker */}
                <div className="flex items-center gap-2 bg-white rounded-xl p-1.5 border border-slate-200 shadow-sm transition-shadow hover:shadow-md">
                    <Button variant="ghost" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="h-8 w-8 hover:bg-slate-50 text-slate-500">
                        <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="w-28 text-center font-bold text-slate-700 text-sm">
                        {format(currentDate, 'yyyy.MM')}
                    </span>
                    <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="h-8 w-8 hover:bg-slate-50 text-slate-500">
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {/* 1. Actionable Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Card 1: Compliance Risk */}
                <Card className={cn(
                    "shadow-sm border-t-4 transition-all hover:shadow-md",
                    stats.complianceRisk.highRiskCount > 0 ? "border-t-red-500" : "border-t-emerald-500"
                )}>
                    <CardContent className="p-5">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider text-sm mb-1">법정 준수 리스크</p>
                                <h3 className="text-3xl font-bold text-slate-800">
                                    {stats.complianceRisk.highRiskCount}<span className="text-sm font-medium ml-1">명 (위험)</span>
                                </h3>
                                <p className="text-xs text-slate-500 mt-2">
                                    <span className="text-amber-600 font-bold">{stats.complianceRisk.warningCount}명</span>은 48시간 초과 주의
                                </p>
                            </div>
                            <div className={cn(
                                "p-2.5 rounded-xl",
                                stats.complianceRisk.highRiskCount > 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                            )}>
                                {stats.complianceRisk.highRiskCount > 0 ? <ShieldAlert className="w-6 h-6" /> : <Activity className="w-6 h-6" />}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Card 2: Workload Concentration */}
                <Card className="shadow-sm border-t-4 border-t-indigo-500 transition-all hover:shadow-md">
                    <CardContent className="p-5">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">업무 쏠림 부서</p>
                                <h3 className="text-2xl font-bold text-slate-800 leading-tight">
                                    {topDept.department}
                                </h3>
                                <p className="text-xs text-slate-500 mt-2">
                                    전체 연장근로의 <span className="text-indigo-600 font-bold">{topDept.percentage}%</span> 집중
                                </p>
                            </div>
                            <div className="p-2.5 bg-indigo-50 rounded-xl text-indigo-600">
                                <Users className="w-6 h-6" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Card 3: Overtime Trend */}
                <Card className="shadow-sm border-t-4 border-t-amber-500 transition-all hover:shadow-md">
                    <CardContent className="p-5">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">연장근로 변동 (WLB)</p>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-3xl font-bold text-slate-800">
                                        {Math.abs(stats.previousMonthComparison.overtimeChangePercentage)}%
                                    </h3>
                                    {stats.previousMonthComparison.overtimeChangePercentage > 0 ? (
                                        <ArrowUpRight className="w-6 h-6 text-red-500" />
                                    ) : (
                                        <ArrowDownRight className="w-6 h-6 text-emerald-500" />
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 mt-2">
                                    지난달 대비 {stats.previousMonthComparison.overtimeChangePercentage > 0 ? '증가' : '감소'}
                                </p>
                            </div>
                            <div className="p-2.5 bg-amber-50 rounded-xl text-amber-600">
                                <TrendingUp className="w-6 h-6" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Card 4: Anomalies */}
                <Card className={cn(
                    "shadow-sm border-t-4 transition-all hover:shadow-md",
                    stats.anomalyCount > 0 ? "border-t-orange-500" : "border-t-blue-500"
                )}>
                    <CardContent className="p-5">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">데이터 확인 필요</p>
                                <h3 className="text-3xl font-bold text-slate-800">
                                    {stats.anomalyCount}<span className="text-sm font-medium ml-1">건</span>
                                </h3>
                                <p className="text-xs text-slate-500 mt-2">
                                    미퇴근 등 이상 기록 감지됨
                                </p>
                            </div>
                            <div className={cn(
                                "p-2.5 rounded-xl",
                                stats.anomalyCount > 0 ? "bg-orange-50 text-orange-600" : "bg-blue-50 text-blue-600"
                            )}>
                                <AlertTriangle className="w-6 h-6" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* 2. Main Analysis Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left: Department Distribution & Anomly List */}
                <div className="lg:col-span-1 space-y-6">
                    {/* Department Distribution (Donut) */}
                    <Card className="shadow-sm overflow-hidden">
                        <CardHeader className="pb-0">
                            <CardTitle className="text-sm font-bold text-slate-600">부서별 연장근로 비중</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <div className="h-[220px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <RePieChart>
                                        <Pie
                                            data={stats.departmentOvertime}
                                            dataKey="totalOvertimeMinutes"
                                            nameKey="department"
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                        >
                                            {stats.departmentOvertime.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={(value: number) => [`${minToHours(value)}h`, '']} />
                                    </RePieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="space-y-2 mt-2">
                                {stats.departmentOvertime.map((item, i) => (
                                    <div key={i} className="flex items-center justify-between text-xs">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                            <span className="text-slate-600">{item.department}</span>
                                        </div>
                                        <span className="font-bold text-slate-800">{item.percentage}%</span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Detailed Anomalies */}
                    <Card className="shadow-sm border-l-4 border-l-orange-400">
                        <CardHeader className="py-4">
                            <CardTitle className="text-sm font-bold text-slate-600 flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 text-orange-500" />
                                확인 대상자 목록
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0 pb-4">
                            <div className="space-y-2">
                                {stats.anomalies.length > 0 ? (
                                    stats.anomalies.map((detail, i) => (
                                        <div key={i} className="text-xs bg-slate-100 p-2.5 rounded-lg border border-slate-200 text-slate-600 flex justify-between items-center">
                                            <span>{detail}</span>
                                            <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">미퇴근</span>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-center text-xs text-slate-400 py-4">모든 데이터가 정상입니다.</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right: Trend Chart */}
                <div className="lg:col-span-2">
                    <Card className="shadow-sm h-full">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-base text-slate-800 font-bold">근로 시간 추이 분석</CardTitle>
                                <p className="text-xs text-slate-500 mt-1">주간/월간 근로 패턴 시각화</p>
                            </div>
                            <div className="flex bg-slate-100 rounded-xl p-1 gap-1 border border-slate-200">
                                <button
                                    onClick={() => setTrendMode('weekly')}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${trendMode === 'weekly' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:bg-slate-200/50'}`}
                                >
                                    주간
                                </button>
                                <button
                                    onClick={() => setTrendMode('monthly')}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${trendMode === 'monthly' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:bg-slate-200/50'}`}
                                >
                                    월간
                                </button>
                            </div>
                        </CardHeader>
                        <CardContent className="h-[400px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={trendData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis
                                        dataKey={trendMode === 'weekly' ? 'week' : 'month'}
                                        fontSize={11}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(val) => trendMode === 'weekly' ? `W${val}` : val.split('-')[1] + '월'}
                                    />
                                    <YAxis fontSize={11} tickLine={false} axisLine={false} unit="h" />
                                    <Tooltip
                                        formatter={(value: number) => [`${value} 시간`, '']}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
                                    <Bar dataKey="totalWork" name="기본 근로" fill="#e2e8f0" radius={[4, 4, 0, 0]} stackId="a" />
                                    <Bar dataKey="totalOvertime" name="연장/휴일" fill="#6366f1" radius={[4, 4, 0, 0]} stackId="a" />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </div>

            </div>

            {/* 3. Bottom Row: Risk Leaders */}
            <div className="grid grid-cols-1 gap-6">
                {/* Top Overtime Users (Action Item: Mentoring/Adjustment) */}
                <Card className="shadow-sm border-l-4 border-l-red-500">
                    <CardHeader>
                        <CardTitle className="text-base text-slate-800 font-bold flex items-center gap-2">
                            <Clock className="w-5 h-5 text-red-500" />
                            업무 과부하 의심자 (Top 5)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                            {stats.topUsers.map((u, i) => (
                                <div key={i} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl hover:border-red-200 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                            {i + 1}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-800">{u.user_name}</p>
                                            <p className="text-xs text-slate-500">{u.department} · {u.user_title}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-lg font-black text-red-600">{minToHours(u.totalOvertime)}</span>
                                        <span className="text-[10px] text-slate-400 ml-1">hrs</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

        </div>
    );
};

export default DashboardPage;
