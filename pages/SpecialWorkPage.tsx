
import React, { useState, useEffect } from "react";
import { SpecialWorkUploadView } from '@/components/special-work/SpecialWorkUploadView';
import { SpecialWorkManageView } from '@/components/special-work/SpecialWorkManageView';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Plus, Database, Clock, Trash2, X } from 'lucide-react';
import { cn } from "@/lib/utils";
import { useMessageModal } from "@/contexts/MessageModalContext";
import { PageContainer, PageHeader, PageContent } from '@/components/layout/PageLayout';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface MonthlyStat {
    month: string;
    report_id: string; // Used to open detail view directly
    employee_count: number;
    record_count: number;
    total_recognized_hours: number; // Replaces total_minutes
    total_minutes: number; // Keep for compatibility if needed
}

export const SpecialWorkPage = () => {
    const { showAlert, showConfirm } = useMessageModal();
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    const [stats, setStats] = useState<Record<string, MonthlyStat>>({});
    const [user, setUser] = useState<{ company_id: string } | null>(null);

    // Modal States
    const [selectedMonth, setSelectedMonth] = useState<string | null>(null); // YYYY-MM
    const [selectedReportId, setSelectedReportId] = useState<string | null>(null); // For Detail View
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [showManageModal, setShowManageModal] = useState(false);

    useEffect(() => {
        const userStr = localStorage.getItem('user');
        if (userStr) setUser(JSON.parse(userStr));
    }, []);

    const fetchStats = async () => {
        if (!user?.company_id) return;
        try {
            // [Fix] Removed 'year' param to fetch ALL data first (or let API decide).
            // Actually, for calendar navigation, we still want to show current year's calendar grids.
            // But we need to know WHICH years have data to potentially auto-switch?
            // User complained 2025 data hidden in 2026 view.
            // Let's fetch ALL stats if efficient, or just fetch for currentYear.
            // The updated API supports optional year. Let's fetch ALL for now to handle "auto-jump" or indicators?
            // No, fetching all might be too heavy if years grow. Let's fetch strictly for currentYear BUT...
            // User said "10 works, 12 works exist". If I am in 2026, I don't see them.
            // So we should probably default currentYear to the latest year with data?
            // Or just allow user to switch years easily.
            // Let's stick to fetch by currentYear for standard calendar behavior, but maybe check if data exists?
            // Actually, the user complaint was likely because they were in 2026 (default) but data was 2025.

            const res = await fetch(`/api/special-work/monthly-status?companyId=${user.company_id}`);
            if (res.ok) {
                const json = await res.json() as any;
                if (json.success && Array.isArray(json.data)) {
                    const map: Record<string, MonthlyStat> = {};
                    json.data.forEach((item: MonthlyStat) => map[item.month] = item);
                    setStats(map);

                    // [UX Enhancement] Auto-detect most relevant year if current year has no data?
                    // Only on initial load (not every fetch).
                    // For now, we trust the users to switch years, OR we can set initial year based on data max.
                    // Let's not over-engineer auto-jump yet without request, 
                    // but simply having the data available handles the 'missing' perception if they navigate.
                }
            }
        } catch (e) { console.error(e); }
    };

    useEffect(() => {
        if (user) fetchStats();
    }, [user]);
    // Removed currentYear dependency for fetch, as we now fetch ALL (or let API handle). 
    // Wait, if API returns ALL, we don't need to refetch on year change. 
    // API `monthly-status` I just wrote supports `year` optional. 
    // If I omit it, it returns all. This is good for small datasets.

    // Calculate dynamic years based on data
    const availableYears = Object.keys(stats).map(k => parseInt(k.split('-')[0]));
    const maxYear = Math.max(new Date().getFullYear(), ...availableYears);
    const minYear = Math.min(new Date().getFullYear(), ...availableYears);

    // Helper to check if year has data
    const hasDataForYear = (year: number) => {
        return Object.keys(stats).some(k => k.startsWith(`${year}-`));
    };

    // Handle Month Click
    const handleMonthClick = (month: number) => {
        const monthStr = `${currentYear}-${String(month).padStart(2, '0')}`;
        setSelectedMonth(monthStr);

        if (stats[monthStr]) {
            // Data exists -> Show Manage Modal with specific ID
            setSelectedReportId(stats[monthStr].report_id); // Pass the ID!
            setShowManageModal(true);
        } else {
            // Empty -> Show Upload Modal
            setSelectedReportId(null);
            setShowUploadModal(true);
        }
    };

    // Close Modals & Refresh
    const handleCloseModal = () => {
        setShowUploadModal(false);
        setShowManageModal(false);
        setSelectedMonth(null);
        setSelectedReportId(null);
        fetchStats(); // Refresh data on close
    };

    const months = Array.from({ length: 12 }, (_, i) => i + 1);

    return (
        <PageContainer>
            <PageHeader
                title="특근 데이터 관리"
                description="연간 특근 현황 캘린더"
                actions={
                    <div className="flex items-center gap-4 bg-white px-4 py-1.5 rounded-full border shadow-sm">
                        <Button variant="ghost" size="icon" onClick={() => setCurrentYear(y => y - 1)}><ChevronLeft className="w-5 h-5 text-slate-600" /></Button>
                        <span className="font-extrabold text-xl text-slate-800 flex items-center gap-2">
                            {currentYear}년
                            {/* Dot indicator if data exists */}
                            {hasDataForYear(currentYear) && <span className="w-2 h-2 rounded-full bg-indigo-500"></span>}
                        </span>
                        <Button variant="ghost" size="icon" onClick={() => setCurrentYear(y => y + 1)}><ChevronRight className="w-5 h-5 text-slate-600" /></Button>
                    </div>
                }
            />
            <PageContent>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 p-4">
                    {months.map(month => {
                        const monthStr = `${currentYear}-${String(month).padStart(2, '0')}`;
                        const stat = stats[monthStr];
                        const hasData = !!stat;

                        return (
                            <div
                                key={month}
                                onClick={() => handleMonthClick(month)}
                                className={cn(
                                    "group relative h-60 rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden flex flex-col justify-between p-6 hover:-translate-y-1 hover:shadow-xl",
                                    hasData
                                        ? "bg-white border-indigo-100 hover:border-indigo-300"
                                        : "bg-slate-50/80 border-dashed border-slate-300 hover:bg-slate-100 hover:border-slate-400"
                                )}
                            >
                                <div className="flex justify-between items-start">
                                    <span className={cn("text-4xl font-black tracking-tight", hasData ? "text-indigo-900" : "text-slate-300")}>
                                        {month}<span className="text-lg font-bold ml-0.5 opacity-60">월</span>
                                    </span>
                                    {hasData && (
                                        <span className="bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm">등록됨</span>
                                    )}
                                </div>

                                {hasData ? (
                                    <div className="space-y-2.5 mt-4">
                                        <div className="flex justify-between text-sm text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                                            <span className="flex items-center gap-2 font-medium"><Database className="w-3.5 h-3.5 text-indigo-500" /> 인원</span>
                                            <span className="font-bold text-slate-800">{stat.employee_count}명</span>
                                        </div>
                                        <div className="flex justify-between text-sm text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                                            <span className="flex items-center gap-2 font-medium"><Clock className="w-3.5 h-3.5 text-amber-500" /> 인정 시간</span>
                                            {/* Use total_recognized_hours (already in hours) */}
                                            <span className="font-bold text-slate-800">{stat.total_recognized_hours?.toLocaleString() || 0}H</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full pb-4 text-slate-400 gap-2 opacity-60 group-hover:opacity-100 transition-all">
                                        <div className="p-3 bg-white rounded-full shadow-sm">
                                            <Plus className="w-6 h-6 text-indigo-500" />
                                        </div>
                                        <span className="text-xs font-bold text-slate-500">클릭하여 등록</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* --- Upload Modal --- */}
                <Dialog open={showUploadModal} onOpenChange={(open) => !open && handleCloseModal()}>
                    <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 gap-0 overflow-hidden bg-white">
                        <DialogHeader className="p-6 pb-2 border-b bg-slate-50/50">
                            <DialogTitle className="flex items-center gap-2 text-xl">
                                <span className="bg-indigo-600 text-white w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold">{selectedMonth?.split('-')[1]}월</span>
                                <span>특근 데이터 업로드</span>
                            </DialogTitle>
                            <p className="text-sm text-slate-500 mt-1">
                                {selectedMonth}월 데이터를 업로드해주세요.
                            </p>
                        </DialogHeader>
                        <div className="flex-1 overflow-y-auto p-0 bg-slate-50">
                            {selectedMonth && (
                                <div className="h-full">
                                    <SpecialWorkUploadView
                                        key={`upload-${selectedMonth}`}
                                        setActiveTab={() => handleCloseModal()}
                                    />
                                </div>
                            )}
                        </div>
                    </DialogContent>
                </Dialog>

                {/* --- Manage (Detail) Modal --- */}
                <Dialog open={showManageModal} onOpenChange={(open) => !open && handleCloseModal()}>
                    <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-white">
                        <div className="flex items-center justify-between p-4 border-b">
                            <h2 className="text-lg font-bold flex items-center gap-2">
                                <Database className="w-5 h-5 text-indigo-600" />
                                {selectedMonth} 특근 상세 내역
                            </h2>
                        </div>
                        <div className="flex-1 overflow-y-auto bg-slate-50">
                            {selectedMonth && (
                                <SpecialWorkManageView
                                    key={`manage-${selectedMonth}`}
                                    active={true}
                                    initialReportId={selectedReportId} // Pass ID for auto-open!
                                    onReportDeleted={handleCloseModal} // Close/Refresh on delete
                                />
                            )}
                        </div>
                    </DialogContent>
                </Dialog>

            </PageContent>
        </PageContainer>
    );
};
