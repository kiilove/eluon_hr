import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Eye, FileDown, Search, List, FileSpreadsheet, Trash2, CalendarClock, MoreHorizontal } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SpecialWorkExcelUtils } from '../../lib/excel/SpecialWorkExcelUtils';
import { SpecialWorkCalculator } from '../../lib/specialWorkCalculator';
import { AttendancePreviewDialog } from './AttendancePreviewDialog';

export const SpecialWorkManageView = ({ active }: { active: boolean }) => {
    const [reports, setReports] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detailReport, setDetailReport] = useState<any>(null);
    const [viewMode, setViewMode] = useState<'list' | 'pivot' | 'attendance'>('pivot'); // Default to pivot as requested
    const [searchQuery, setSearchQuery] = useState("");

    const [user, setUser] = useState<{ name: string; email: string; company_id: string } | null>(null);

    useEffect(() => {
        const userStr = localStorage.getItem('user');
        if (userStr) {
            setUser(JSON.parse(userStr));
        }
    }, []);

    const getCompanyName = (id?: string) => {
        if (id === 'comp_eluon') return '이루온';
        if (id === 'comp_eluonins') return '이루온아이앤에스';
        return '회사';
    };

    // Preview State
    const [previewLogs, setPreviewLogs] = useState<any[]>([]);
    const [previewTargets, setPreviewTargets] = useState<Record<string, number>>({});
    const [showPreview, setShowPreview] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSavingLogs, setIsSavingLogs] = useState(false);

    const handleGeneratePreview = async () => {
        if (!selectedId || !user?.company_id) {
            if (!user?.company_id) alert("로그인 정보가 올바르지 않습니다.");
            return;
        }
        setIsGenerating(true);
        try {
            // 1. Initial Request (All)
            const res = await fetch('/api/special-work/generate-attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reportId: selectedId, save: false, companyId: user.company_id })
            });
            const data = await res.json() as any;

            if (data.success) {
                let currentLogs = data.preview || [];
                let currentTargets = data.targets || {};

                // 2. Identify Errors Helper
                const calcErrors = () => {
                    const errorIds: string[] = [];
                    const logMap = new Map<string, number>(); // ID -> Actual Minutes
                    currentLogs.forEach((l: any) => {
                        const [sh, sm] = l.startTime.split(':').map(Number);
                        const [eh, em] = l.endTime.split(':').map(Number);
                        const diff = (eh * 60 + em) - (sh * 60 + sm);
                        const act = diff - l.breakMinutes;
                        logMap.set(l.employeeId, (logMap.get(l.employeeId) || 0) + act);
                    });

                    Object.keys(currentTargets).forEach(empId => {
                        const targetMin = currentTargets[empId] * 60;
                        const actualMin = logMap.get(empId) || 0;
                        if (Math.abs(targetMin - actualMin) > 1) { // >1 min error
                            errorIds.push(empId);
                        }
                    });
                    return errorIds;
                };

                let errorIds = calcErrors();

                // 3. Retry Loop (Max 3 attempts for errors)
                if (errorIds.length > 0) {
                    console.log(`Found ${errorIds.length} errors. Retrying...`, errorIds);

                    for (let i = 0; i < 3; i++) {
                        if (errorIds.length === 0) break;

                        const retryRes = await fetch('/api/special-work/generate-attendance', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                reportId: selectedId,
                                save: false,
                                targetEmployeeIds: errorIds, // Filter
                                companyId: user.company_id
                            })
                        });
                        const retryData = await retryRes.json() as any;
                        if (retryData.success && retryData.preview) {
                            // Merge: Remove old logs for these IDs and add new ones
                            const newLogs = retryData.preview;
                            const newIds = new Set(newLogs.map((l: any) => l.employeeId));

                            // Filter out OLD logs for ONLY the IDs we just retried
                            currentLogs = currentLogs.filter((l: any) => !newIds.has(l.employeeId));
                            currentLogs = [...currentLogs, ...newLogs];

                            // Re-calc errors
                            errorIds = calcErrors();
                            console.log(`Retry ${i + 1} complete. Remaining errors: ${errorIds.length}`);
                        } else {
                            break;
                        }
                    }
                }

                setPreviewLogs(currentLogs);
                setPreviewTargets(currentTargets);
                setShowPreview(true);
            } else {
                alert("생성 실패: " + data.message);
            }
        } catch (e) {
            console.error(e);
            alert("오류 발생");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleApplyAttendance = async () => {
        if (!selectedId || !user?.company_id) return;
        setIsSavingLogs(true);
        try {
            const res = await fetch('/api/special-work/generate-attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reportId: selectedId,
                    save: true,
                    providedLogs: previewLogs, // [WYSIWYG] Pass the exact logs seen in preview
                    companyId: user.company_id
                })
            });
            const data = await res.json() as any;
            if (data.success) {
                alert("적용되었습니다.");
                setShowPreview(false);
            } else {
                alert("저장 실패: " + data.message);
            }
        } catch (e) {
            console.error(e);
            alert("오류 발생");
        } finally {
            setIsSavingLogs(false);
        }
    };

    const filteredRecords = React.useMemo(() => {
        if (!detailReport?.records) return [];
        if (!searchQuery.trim()) return detailReport.records;
        const lower = searchQuery.toLowerCase();
        return detailReport.records.filter((rec: any) =>
            (rec.employee_name && rec.employee_name.toLowerCase().includes(lower)) ||
            (rec.employee_id && rec.employee_id.toLowerCase().includes(lower))
        );
    }, [detailReport, searchQuery]);

    const pivotData = React.useMemo(() => {
        // [UX Fix] Consistently generate columns from FULL dataset (detailReport) 
        // regardless of search filter. This maintains the "frame" of the table.
        const allRecords = detailReport?.records || [];
        const allDates = new Set<string>();

        allRecords.forEach((rec: any) => {
            if (rec.items) rec.items.forEach((i: any) => allDates.add(i.work_date));
        });
        const dates = Array.from(allDates).sort() as string[];

        // If no records match filter, we still return the full dates structure + empty rows
        if (!filteredRecords || filteredRecords.length === 0) return { dates, rows: [] };

        // 2. Map Filtered Records to Table Rows
        const rows = filteredRecords.map((rec: any) => {
            const logMap = new Map();
            if (rec.items) rec.items.forEach((i: any) => logMap.set(i.work_date, i.work_type));

            return {
                id: rec.id,
                name: rec.employee_name || rec.employee_id,
                position: rec.employee_position,
                department: rec.employee_department,
                logs: logMap,
                total: rec.total_amount,
                wage: rec.base_hourly_wage,
                specialWage: rec.special_hourly_wage,
                totalHours: rec.calculated_hours
            };
        });

        return { dates, rows };
    }, [detailReport, filteredRecords]);

    const groupedListData = React.useMemo(() => {
        if (!filteredRecords || filteredRecords.length === 0) return [];

        return filteredRecords.map((rec: any) => ({
            id: rec.id,
            name: rec.employee_name || rec.employee_id,
            position: rec.employee_position,
            department: rec.employee_department,
            items: rec.items || [],
            total: rec.total_amount,
            wage: rec.base_hourly_wage,
            specialWage: rec.special_hourly_wage,
            totalHours: rec.calculated_hours
        }));
    }, [filteredRecords]);

    const fetchReports = async () => {
        setLoading(true);
        try {
            // [Fix] Filter by Company ID
            const companyId = user?.company_id;
            const res = await fetch(`/api/special-work/reports?companyId=${companyId || ''}`);
            const json = await res.json() as any;
            if (json.success) setReports(json.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (active && user?.company_id) fetchReports(); // Wait for user load
    }, [active, user]);

    // Fetch Detail on Open
    useEffect(() => {
        if (selectedId) {
            fetch(`/api/special-work/reports?id=${selectedId}`)
                .then(res => res.json())
                .then((data: any) => {
                    if (data.success) setDetailReport(data.data);
                });
        } else {
            setDetailReport(null);
        }
    }, [selectedId]);

    const handleDelete = async (id: string) => {
        if (!confirm("정말 삭제하시겠습니까? 관련 데이터가 모두 삭제됩니다.")) return;
        try {
            const res = await fetch(`/api/special-work/reports?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                alert("삭제되었습니다.");
                fetchReports();
            } else {
                alert("삭제 실패");
            }
        } catch (e) {
            console.error(e);
        }
    };

    const formatCurrency = (val: number) => new Intl.NumberFormat('ko-KR').format(val) + '원';

    return (
        <Card className="border-none shadow-lg ring-1 ring-slate-200 bg-white/70 backdrop-blur-md">
            <CardHeader className="pb-4">
                <CardTitle className="text-xl font-bold text-slate-800">데이터 목록 ({reports.length})</CardTitle>
                <CardDescription>시스템에 저장된 특근 데이터 내역입니다.</CardDescription>
            </CardHeader>
            <CardContent>
                {loading ? <div className="p-12 text-center text-slate-500 animate-pulse">로딩 중...</div> :
                    reports.length === 0 ? <div className="p-12 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">저장된 데이터가 없습니다.</div> : (
                        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                            <table className="min-w-full text-sm">
                                <thead className="bg-slate-50/80 text-left border-b border-slate-200 text-slate-500">
                                    <tr>
                                        <th className="px-6 py-4 font-medium w-32">대상 월</th>
                                        <th className="px-6 py-4 font-medium">데이터 제목</th>
                                        <th className="px-6 py-4 font-medium text-right">총 지급액</th>
                                        <th className="px-6 py-4 font-medium text-center">인원</th>
                                        <th className="px-6 py-4 font-medium text-right text-xs uppercase tracking-wider">등록일시</th>
                                        <th className="px-6 py-4 font-medium text-center w-24">관리</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {reports.map((r: any) => (
                                        <tr key={r.id} className="hover:bg-slate-50/80 transition-colors group">
                                            <td className="px-6 py-4 font-medium text-slate-700 bg-slate-50/30">{r.target_month}</td>
                                            <td className="px-6 py-4">
                                                <Dialog open={selectedId === r.id} onOpenChange={(open) => !open && setSelectedId(null)}>
                                                    <DialogTrigger asChild>
                                                        <button
                                                            onClick={() => setSelectedId(r.id)}
                                                            className="font-semibold text-slate-800 hover:text-orange-700 hover:underline underline-offset-4 decoration-orange-300 transition-all text-left"
                                                        >
                                                            {r.title}
                                                        </button>
                                                    </DialogTrigger>
                                                    <DialogContent className="max-w-[1400px] h-[90vh] flex flex-col p-0 gap-0 border-none shadow-2xl rounded-2xl overflow-hidden bg-white">
                                                        <DialogHeader className="px-6 py-4 border-b border-slate-100 bg-white z-20 flex flex-row items-center justify-between">
                                                            <DialogTitle className="flex items-center gap-2 text-xl">
                                                                <span className="text-slate-400 font-normal">상세 내역:</span>
                                                                <span className="text-slate-800 font-bold decoration-orange-200 underline decoration-4 underline-offset-4">{r.title}</span>
                                                            </DialogTitle>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => setSelectedId(null)}
                                                                className="h-8 w-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x h-5 w-5"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                                                            </Button>
                                                        </DialogHeader>
                                                        {detailReport ? (
                                                            <div className="flex-1 flex flex-col min-h-0 bg-slate-50/30">
                                                                {/* Toolbar */}
                                                                <div className="flex items-center justify-between gap-4 px-6 py-3 border-b border-slate-200 bg-white/80 backdrop-blur-sm z-10 sticky top-0">
                                                                    <div className="relative w-[300px] shadow-sm">
                                                                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                                                        <input
                                                                            type="text"
                                                                            placeholder="이름, 사번 검색..."
                                                                            value={searchQuery}
                                                                            onChange={(e) => setSearchQuery(e.target.value)}
                                                                            className="w-full h-10 pl-10 pr-4 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-slate-50 focus:bg-white transition-all"
                                                                        />
                                                                    </div>
                                                                    <div className="flex bg-slate-100/80 p-1.5 rounded-xl border border-slate-200 shadow-sm gap-1">
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            onClick={handleGeneratePreview}
                                                                            disabled={isGenerating}
                                                                            className="h-9 text-xs font-bold text-slate-600 hover:bg-white hover:text-orange-700 hover:shadow-sm rounded-lg border border-transparent hover:border-slate-100 transition-all px-3"
                                                                        >
                                                                            {isGenerating ? "생성 중..." : <><CalendarClock className="w-4 h-4 mr-1.5 text-orange-500" /> 근태 자동 생성</>}
                                                                        </Button>
                                                                        <div className="w-px h-5 bg-slate-300 my-auto mx-1"></div>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            onClick={() => {
                                                                                const title = detailReport?.title || '특근 데이터';
                                                                                if (viewMode === 'pivot') {
                                                                                    SpecialWorkExcelUtils.exportPivot(pivotData, `${title}_피벗.xlsx`, `${title} (집계)`);
                                                                                } else if (viewMode === 'attendance') {
                                                                                    // Prepare data for Attendance Detail Export
                                                                                    // We need to map detailReport.logs (if exists) to ExportLog format
                                                                                    const rawLogs = detailReport?.logs || [];
                                                                                    // Merge with Employee Name/Id mapping from records? 
                                                                                    // records has name/id. logs has employee_id.
                                                                                    const empMap = new Map<string, string>();
                                                                                    detailReport?.records?.forEach((r: any) => {
                                                                                        if (r.employee_id) empMap.set(r.employee_id, r.employee_name || r.employee_id);
                                                                                    });

                                                                                    const exportLogs = rawLogs.map((l: any) => ({
                                                                                        employeeName: empMap.get(l.employee_id) || l.employee_id,
                                                                                        employeeId: l.employee_id,
                                                                                        date: l.work_date,
                                                                                        startTime: l.start_time,
                                                                                        endTime: l.end_time,
                                                                                        breakMinutes: l.break_minutes,
                                                                                        actualWorkMinutes: l.actual_work_minutes,
                                                                                        description: '',
                                                                                    }));

                                                                                    SpecialWorkExcelUtils.exportAttendance(exportLogs, {}, `${title}_근태상세.xlsx`, `${title} (근태 상세)`);
                                                                                } else {
                                                                                    SpecialWorkExcelUtils.exportList(groupedListData, `${title}_리스트.xlsx`, `${title} (내역)`);
                                                                                }
                                                                            }}
                                                                            className="h-9 text-xs font-bold text-green-700 hover:bg-white hover:shadow-sm rounded-lg border border-transparent hover:border-green-100 px-3"
                                                                        >
                                                                            <FileDown size={14} className="mr-1.5" /> 엑셀 저장
                                                                        </Button>
                                                                        <div className="w-px h-5 bg-slate-300 my-auto mx-1"></div>

                                                                        <div className="flex bg-white rounded-lg shadow-sm ring-1 ring-slate-200 ml-1">
                                                                            <button onClick={() => setViewMode('list')} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-l-lg transition-all ${viewMode === 'list' ? 'bg-orange-50 text-orange-700 ring-1 ring-orange-200 z-10' : 'text-slate-500 hover:bg-slate-50'}`}>
                                                                                <List size={14} /> 목록
                                                                            </button>
                                                                            <div className="w-px bg-slate-200 my-1"></div>
                                                                            <button onClick={() => setViewMode('pivot')} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold transition-all ${viewMode === 'pivot' ? 'bg-green-50 text-green-700 ring-1 ring-green-200 z-10' : 'text-slate-500 hover:bg-slate-50'}`}>
                                                                                <FileSpreadsheet size={14} /> 피벗
                                                                            </button>
                                                                            <div className="w-px bg-slate-200 my-1"></div>
                                                                            <button onClick={() => setViewMode('attendance')} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-r-lg transition-all ${viewMode === 'attendance' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200 z-10' : 'text-slate-500 hover:bg-slate-50'}`}>
                                                                                <CalendarClock size={14} /> 근태
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                <AttendancePreviewDialog
                                                                    open={showPreview}
                                                                    onOpenChange={setShowPreview}
                                                                    logs={previewLogs}
                                                                    targets={previewTargets}
                                                                    onSave={handleApplyAttendance}
                                                                    isSaving={isSavingLogs}
                                                                    onRegenerate={handleGeneratePreview}
                                                                    isGenerating={isGenerating}
                                                                />

                                                                {/* Content Area */}
                                                                <div className="flex-1 overflow-auto p-6 bg-slate-100/30">
                                                                    {viewMode === 'list' || viewMode === 'attendance' ? (
                                                                        <div className="space-y-4 min-w-[1000px] w-full px-2 max-w-7xl mx-auto">
                                                                            {/* Attendance View: Check if logs exist */}
                                                                            {viewMode === 'attendance' && (!detailReport.logs || detailReport.logs.length === 0) ? (
                                                                                <div className="p-20 text-center bg-white rounded-2xl border border-slate-200 border-dashed shadow-sm flex flex-col items-center gap-4">
                                                                                    <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center text-orange-500 mb-2">
                                                                                        <CalendarClock size={32} />
                                                                                    </div>
                                                                                    <h3 className="text-xl font-bold text-slate-800">아직 근태 데이터가 생성되지 않았습니다.</h3>
                                                                                    <p className="text-slate-500 max-w-md">특근 데이터를 기반으로 출퇴근 기록을 자동 생성하시겠습니까?<br />생성 전 미리보기가 제공되며, 필요 시 수정할 수 있습니다.</p>
                                                                                    <Button onClick={handleGeneratePreview} className="mt-4 bg-orange-600 hover:bg-orange-700 text-white font-bold px-8 h-12 rounded-xl text-base shadow-lg shadow-orange-200">
                                                                                        근태 자동 생성 시작
                                                                                    </Button>
                                                                                </div>
                                                                            ) : (
                                                                                groupedListData.length === 0 ? <div className="p-16 text-center text-slate-400 bg-white rounded-2xl border border-slate-200 border-dashed shadow-sm">검색 결과가 없습니다.</div> : (
                                                                                    groupedListData.map((group: any) => {
                                                                                        // For Attendance View, filter logs for this user
                                                                                        const myLogs = viewMode === 'attendance' && detailReport.logs
                                                                                            ? detailReport.logs.filter((l: any) => l.employee_id === (group.id /* This is record ID? Check logic */) || l.employee_id === group.name /*Fallback*/)
                                                                                            // Wait, group.id is record ID. records have employee_id field.
                                                                                            // detailReport.records contains all fields. groupedListData maps fields.
                                                                                            // Let's assume group object needs employee_id.
                                                                                            // In previous 'pivotData', we didn't explicitly pass employee_id to group, we used name or id as fallback.
                                                                                            // Let's re-verify groupedListData definition below.
                                                                                            : [];

                                                                                        // To make this robust, I'll access the RAW record from filteredRecords if needed, 
                                                                                        // or better: let's update groupedListData to include employee_id properly.

                                                                                        // Temporary fix: using the raw filteredRecords based parallel index or lookup?
                                                                                        // Actually, 'groupedListData' is derived from 'filteredRecords'.
                                                                                        // Let's fix the logic inside the map to find the correct logs.
                                                                                        // The logs have 'employee_id'. The group has 'name'. 
                                                                                        // The safest way is to use the raw record's employee_id.
                                                                                        // Let's duplicate the lookup logic:
                                                                                        const rec = filteredRecords.find((r: any) => r.id === group.id);
                                                                                        const empId = rec?.employee_id;
                                                                                        const empLogs = (viewMode === 'attendance' && detailReport.logs)
                                                                                            ? detailReport.logs.filter((l: any) => l.employee_id === empId)
                                                                                            : [];

                                                                                        return (
                                                                                            <div key={group.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                                                                                                {/* Improved Group Header */}
                                                                                                <div className="bg-slate-50/50 px-6 py-5 flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 gap-4">
                                                                                                    <div className="flex items-center gap-4">
                                                                                                        <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white font-bold p-2 rounded-xl text-lg w-12 h-12 flex items-center justify-center shadow-md shadow-orange-200">
                                                                                                            {group.name.slice(0, 1)}
                                                                                                        </div>
                                                                                                        <div>
                                                                                                            <div className="font-bold text-slate-900 text-xl flex items-center gap-2">
                                                                                                                {group.name}
                                                                                                                <span className="text-xs font-medium text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200 shadow-sm">{group.position || '직급미상'}</span>
                                                                                                            </div>
                                                                                                            <div className="text-sm text-slate-500 flex items-center gap-2 mt-0.5">
                                                                                                                <span className="font-medium text-slate-600">{group.department || '부서 미지정'}</span>
                                                                                                                <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                                                                                                                <span className="text-orange-600 font-bold">{viewMode === 'attendance' ? empLogs.length : group.items.length}일</span>
                                                                                                                <span className="text-slate-400">근무 기록</span>
                                                                                                            </div>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                    <div className="flex items-center gap-0 bg-white px-2 py-3 rounded-xl border border-slate-200 shadow-sm">
                                                                                                        <div className="text-right px-4 shrink-0 w-[70px]">
                                                                                                            <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold whitespace-nowrap">인정 시간</div>
                                                                                                            <div className="font-bold text-orange-600 text-lg">{group.totalHours}H</div>
                                                                                                        </div>
                                                                                                        <div className="w-px h-8 bg-slate-100 shrink-0"></div>
                                                                                                        <div className="text-right px-4 shrink-0 w-[100px]">
                                                                                                            <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold whitespace-nowrap">기본 시급</div>
                                                                                                            <div className="font-bold text-slate-600 text-sm whitespace-nowrap">{formatCurrency(group.wage)}</div>
                                                                                                        </div>
                                                                                                        <div className="w-px h-8 bg-slate-100 shrink-0"></div>
                                                                                                        <div className="text-right px-4 shrink-0 w-[120px]">
                                                                                                            <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold whitespace-nowrap">
                                                                                                                적용 시급
                                                                                                                {group.wage > 0 && (
                                                                                                                    <span className="ml-1 text-orange-500">
                                                                                                                        ({(group.specialWage / group.wage).toFixed(1)}배)
                                                                                                                    </span>
                                                                                                                )}
                                                                                                            </div>
                                                                                                            <div className="font-bold text-slate-700 text-sm whitespace-nowrap">{formatCurrency(group.specialWage)}</div>
                                                                                                        </div>
                                                                                                        <div className="w-px h-8 bg-slate-100 shrink-0"></div>
                                                                                                        <div className="text-right px-4 shrink-0 w-[120px]">
                                                                                                            <div className="text-[10px] text-emerald-600/70 uppercase tracking-wider font-bold whitespace-nowrap">총 지급액</div>
                                                                                                            <div className="font-extrabold text-emerald-600 text-lg whitespace-nowrap">{formatCurrency(group.total)}</div>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                </div>

                                                                                                {viewMode === 'list' ? (
                                                                                                    // Existing List Table
                                                                                                    <table className="w-full text-xs text-left">
                                                                                                        <thead className="bg-slate-50/50 text-slate-500 border-b border-slate-100">
                                                                                                            <tr>
                                                                                                                <th className="px-6 py-2.5 w-32 font-medium">근무일자</th>
                                                                                                                <th className="px-6 py-2.5 w-48 font-medium">근무유형</th>
                                                                                                                <th className="px-6 py-2.5 w-24 font-medium">비고</th>
                                                                                                                <th className="px-6 py-2.5 font-medium"></th>
                                                                                                            </tr>
                                                                                                        </thead>
                                                                                                        <tbody className="divide-y divide-slate-50">
                                                                                                            {group.items.map((item: any, idx: number) => (
                                                                                                                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                                                                                    <td className="px-6 py-3 text-slate-600 font-medium">{item.work_date}</td>
                                                                                                                    <td className="px-6 py-3">
                                                                                                                        <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border shadow-sm ${item.work_type === 'REGULAR' ? 'bg-white border-blue-100 text-blue-700' : 'bg-white border-amber-100 text-amber-700'}`}>
                                                                                                                            <span className={`w-2 h-2 rounded-full ${item.work_type === 'REGULAR' ? 'bg-blue-500' : 'bg-amber-500'}`}></span>
                                                                                                                            {item.work_type === 'REGULAR' ? '주말/휴일특근' : '원격/재택근무'}
                                                                                                                        </span>
                                                                                                                    </td>
                                                                                                                    <td className="px-6 py-3 text-slate-400 italic w-24 truncate">-</td>
                                                                                                                    <td></td>
                                                                                                                </tr>
                                                                                                            ))}
                                                                                                        </tbody>
                                                                                                    </table>
                                                                                                ) : (
                                                                                                    // Attendance Log Table
                                                                                                    <table className="w-full text-xs text-left">
                                                                                                        <thead className="bg-slate-50/50 text-slate-500 border-b border-slate-100">
                                                                                                            <tr>
                                                                                                                <th className="px-6 py-2.5 w-32 font-medium">근무일자</th>
                                                                                                                <th className="px-6 py-2.5 w-32 font-medium">출근시각</th>
                                                                                                                <th className="px-6 py-2.5 w-32 font-medium">퇴근시각</th>
                                                                                                                <th className="px-6 py-2.5 w-32 font-medium">휴게시간</th>
                                                                                                                <th className="px-6 py-2.5 w-32 font-medium">인정근무</th>
                                                                                                            </tr>
                                                                                                        </thead>
                                                                                                        <tbody className="divide-y divide-slate-50">
                                                                                                            {empLogs.length === 0 ? (
                                                                                                                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400 italic">생성된 근태 기록이 없습니다.</td></tr>
                                                                                                            ) : (
                                                                                                                empLogs.map((log: any, idx: number) => (
                                                                                                                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                                                                                        <td className="px-6 py-3 text-slate-600 font-medium">{log.work_date}</td>
                                                                                                                        <td className="px-6 py-3 font-mono text-slate-700">{log.start_time}</td>
                                                                                                                        <td className="px-6 py-3 font-mono text-slate-700">{log.end_time}</td>
                                                                                                                        <td className="px-6 py-3 text-slate-500">{log.break_minutes}분</td>
                                                                                                                        <td className="px-6 py-3 font-bold text-orange-600">
                                                                                                                            {/* Calculate actual hours simply */}
                                                                                                                            {(() => {
                                                                                                                                let minutes = log.actual_work_minutes;
                                                                                                                                if (!minutes) {
                                                                                                                                    const [sh, sm] = log.start_time.split(':').map(Number);
                                                                                                                                    const [eh, em] = log.end_time.split(':').map(Number);
                                                                                                                                    minutes = (eh * 60 + em) - (sh * 60 + sm) - log.break_minutes;
                                                                                                                                }
                                                                                                                                return SpecialWorkCalculator.toRecognizedHours(minutes) + 'H';
                                                                                                                            })()}
                                                                                                                        </td>
                                                                                                                    </tr>
                                                                                                                ))
                                                                                                            )}
                                                                                                        </tbody>
                                                                                                    </table>
                                                                                                )}
                                                                                            </div>
                                                                                        );
                                                                                    })
                                                                                )
                                                                            )}
                                                                        </div>
                                                                    ) : (
                                                                        // PIVOT VIEW (Excel Style)
                                                                        <div className="relative rounded-xl border border-slate-300 bg-white shadow-xl overflow-auto h-full max-h-[750px] ring-4 ring-slate-100">
                                                                            <table className="w-max text-xs text-left border-collapse border-spacing-0">
                                                                                <thead className="bg-slate-50 text-slate-700 font-bold border-b-2 border-slate-300 sticky top-0 z-[60] shadow-sm h-[42px]">
                                                                                    <tr>
                                                                                        <th className="px-3 py-0 sticky left-0 bg-slate-50 z-[70] w-[110px] min-w-[110px] border-r border-slate-300 border-b border-slate-300 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] text-center">성명</th>
                                                                                        {pivotData.dates.map((d: string) => (
                                                                                            <th key={d} className="px-0 py-0 font-medium min-w-[44px] w-[44px] text-center border-r border-slate-200 border-b border-slate-300 text-[10px] text-slate-500 bg-slate-50 hover:bg-slate-100 transition-colors">
                                                                                                <div className="flex flex-col justify-center h-full">
                                                                                                    <span className="text-[9px] text-slate-400 leading-none mb-0.5">{d.slice(5, 7)}월</span>
                                                                                                    <span className="font-bold text-slate-700 leading-none">{d.slice(8)}</span>
                                                                                                </div>
                                                                                            </th>
                                                                                        ))}
                                                                                        {/* Fixed Right Columns Headers */}
                                                                                        <th className="px-2 py-0 font-bold w-[40px] min-w-[40px] text-center border-l border-slate-300 border-b border-slate-300 bg-slate-50 text-slate-700 sticky right-[330px] z-[70] shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.1)]">횟수</th>
                                                                                        <th className="px-2 py-0 font-bold w-[80px] min-w-[80px] text-right border-l border-slate-300 border-b border-slate-300 bg-slate-50 text-slate-600 sticky right-[250px] z-[70]">기본시급</th>
                                                                                        <th className="px-2 py-0 font-bold w-[90px] min-w-[90px] text-right border-l border-slate-300 border-b border-slate-300 bg-slate-50 text-slate-600 sticky right-[160px] z-[70]">적용시급</th>
                                                                                        <th className="px-2 py-0 font-bold w-[80px] min-w-[80px] text-center border-l border-slate-300 border-b border-slate-300 bg-orange-50 text-orange-700 sticky right-[80px] z-[70]">인정시간</th>
                                                                                        <th className="px-3 py-0 font-extrabold w-[80px] min-w-[80px] text-right border-l border-slate-300 border-b border-slate-300 bg-slate-100 text-slate-900 sticky right-0 z-[70] shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]">수당</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody className="divide-y divide-slate-100 bg-white">
                                                                                    {pivotData?.rows.length === 0 ? <tr><td colSpan={100} className="p-12 text-center text-slate-400">데이터가 없습니다.</td></tr> : (
                                                                                        pivotData?.rows.map((row: any) => (
                                                                                            <tr key={row.id} className="hover:bg-orange-50/20 transition-colors h-[38px] group">
                                                                                                <td className="px-3 py-0 font-medium sticky left-0 bg-white group-hover:bg-orange-50/20 z-[50] border-r border-slate-300 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] w-[110px] min-w-[110px]">
                                                                                                    <div className="flex flex-col justify-center h-full truncate max-w-[100px]">
                                                                                                        <div className="flex items-center gap-1.5 overflow-hidden">
                                                                                                            <span className="truncate text-slate-900 font-semibold text-[11px]">{row.name}</span>
                                                                                                            {row.position && <span className="text-[9px] text-slate-500 font-normal shrink-0 bg-slate-100 px-1 rounded border border-slate-200"> {row.position}</span>}
                                                                                                        </div>
                                                                                                        {row.department && (
                                                                                                            <div className="text-[9px] text-slate-400 truncate mt-0.5 font-normal">
                                                                                                                {row.department}
                                                                                                            </div>
                                                                                                        )}
                                                                                                    </div>
                                                                                                </td>
                                                                                                {pivotData.dates.map((d: string) => {
                                                                                                    const type = row.logs.get(d);
                                                                                                    return (
                                                                                                        <td key={d} className={`px-0 py-0 text-center border-r border-slate-100 text-[10px] min-w-[44px] w-[44px] h-[38px] ${type ? (type === 'REGULAR' ? 'bg-blue-50/50 text-blue-600 font-bold' : 'bg-amber-50/50 text-amber-600 font-bold') : 'group-hover:bg-slate-50/50'}`}>
                                                                                                            <div className="flex items-center justify-center w-full h-full">
                                                                                                                {type ? (type === 'REGULAR' ? '◎' : '★') : <span className="w-1 h-1 rounded-full bg-slate-100 opacity-0 group-hover:opacity-100"></span>}
                                                                                                            </div>
                                                                                                        </td>
                                                                                                    );
                                                                                                })}

                                                                                                {/* Right Sticky Section Start - Added Shadow here to separate from scrollable content */}
                                                                                                <td className="px-2 py-0 text-center font-medium text-slate-600 border-l border-slate-300 bg-white group-hover:bg-orange-50 sticky right-[330px] z-[50] w-[40px] min-w-[40px] shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.1)]">
                                                                                                    {row.logs.size}
                                                                                                </td>
                                                                                                <td className="px-2 py-0 text-right text-[10px] text-slate-400 border-l border-slate-300 border-r border-slate-100 bg-white group-hover:bg-orange-50 sticky right-[250px] z-[50] w-[80px] min-w-[80px]">
                                                                                                    {row.wage ? row.wage.toLocaleString() : '-'}
                                                                                                </td>
                                                                                                <td className="px-2 py-0 text-right text-[10px] text-slate-500 border-l border-slate-300 border-r border-slate-100 bg-white group-hover:bg-orange-50 sticky right-[160px] z-[50] w-[90px] min-w-[90px]">
                                                                                                    {row.specialWage ? row.specialWage.toLocaleString() : '-'}
                                                                                                </td>
                                                                                                <td className="px-2 py-0 text-center font-bold text-orange-600 text-[11px] border-l border-slate-300 bg-orange-50 group-hover:bg-orange-100 sticky right-[80px] z-[50] w-[80px] min-w-[80px]">
                                                                                                    {row.totalHours || 0}
                                                                                                </td>
                                                                                                <td className="px-3 py-0 text-right font-bold text-slate-900 text-[11px] border-l border-slate-300 bg-slate-50 group-hover:bg-slate-100 sticky right-0 z-[50] shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] w-[80px] min-w-[80px]">
                                                                                                    {formatCurrency(row.total).replace('원', '')}
                                                                                                </td>
                                                                                            </tr>
                                                                                        ))
                                                                                    )}
                                                                                </tbody>
                                                                                <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300 sticky bottom-0 z-[60] shadow-sm">
                                                                                    <tr>
                                                                                        <td className="px-3 py-2 sticky left-0 bg-slate-200 z-[70] border-r border-slate-300 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] text-center text-xs w-[110px]">총계</td>
                                                                                        {pivotData.dates.map((d: string) => <td key={d} className="bg-slate-100 border-r border-slate-200"></td>)}
                                                                                        <td className="text-center font-bold text-slate-700 bg-slate-100 sticky right-[330px] z-[70] border-l border-slate-300 text-xs shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.1)]">
                                                                                            {pivotData.rows.reduce((acc: number, row: any) => acc + row.logs.size, 0)}
                                                                                        </td>
                                                                                        <td className="sticky right-[250px] z-[70] bg-slate-100 border-l border-slate-300"></td>
                                                                                        <td className="sticky right-[160px] z-[70] bg-slate-100 border-l border-slate-300"></td>
                                                                                        <td className="px-2 py-2 text-center bg-orange-100 sticky right-[80px] z-[70] border-l border-slate-300 text-xs text-orange-800 font-extrabold">
                                                                                            {pivotData.rows.reduce((acc: number, row: any) => acc + (row.totalHours || 0), 0)}
                                                                                        </td>
                                                                                        <td className="px-3 py-2 text-right bg-slate-800 text-white sticky right-0 z-[70] border-l border-slate-300 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] text-xs">
                                                                                            {pivotData.rows.reduce((acc: number, row: any) => acc + (row.total || 0), 0).toLocaleString()}
                                                                                        </td>
                                                                                    </tr>
                                                                                </tfoot>
                                                                            </table>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="flex-1 flex items-center justify-center min-h-[400px]">
                                                                <div className="flex flex-col items-center gap-3 animate-pulse text-slate-400">
                                                                    <div className="w-8 h-8 border-4 border-slate-200 border-t-orange-500 rounded-full animate-spin"></div>
                                                                    <span className="text-sm">상세 데이터를 불러오는 중입니다...</span>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </DialogContent>
                                                </Dialog>
                                            </td>
                                            <td className="px-6 py-4 text-right font-bold text-emerald-600 bg-emerald-50/5 group-hover:bg-emerald-50/20 transition-colors">{formatCurrency(r.total_payout)}</td>
                                            <td className="px-6 py-4 text-center">
                                                <span className="inline-flex items-center justify-center bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full text-xs font-bold border border-slate-200">
                                                    {r.item_count}명
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right text-slate-400 text-xs">{new Date(r.created_at).toLocaleString()}</td>
                                            <td className="px-6 py-4 text-center flex items-center justify-center gap-2">
                                                <Button variant="ghost" size="icon" onClick={() => handleDelete(r.id)} className="text-red-400 hover:bg-red-50 hover:text-red-500 w-8 h-8 rounded-lg"><Trash2 size={16} /></Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
            </CardContent>
        </Card>
    );
};
