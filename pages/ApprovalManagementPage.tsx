import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format, subMonths, addMonths, startOfMonth, endOfMonth } from 'date-fns';
import { AlertTriangle, CheckCircle, FileDown, Lock, Unlock, Loader2, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { ExcelReportGenerator } from '@/lib/excelReportGenerator';
import { AttendanceMergeEngine } from '@/lib/engine/attendanceMergeEngine';
import { ProcessedWorkLog } from '@/types';

const ApprovalManagementPage = () => {
    const { config } = useData();
    const [currentDate, setCurrentDate] = useState(new Date());
    const selectedMonth = format(currentDate, 'yyyy-MM');

    const [isLocked, setIsLocked] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [logs, setLogs] = useState<ProcessedWorkLog[]>([]);
    const [validationError, setValidationError] = useState<string | null>(null);

    const fetchStatus = async () => {
        setIsLoading(true);
        setValidationError(null);
        try {
            // 1. Fetch Lock Status
            const lockRes = await fetch(`/api/management/lock-status?month=${selectedMonth}`);
            const lockData = await lockRes.json() as { isLocked: boolean; updatedAt: number };
            setIsLocked(lockData.isLocked || false);
            setLastUpdated(lockData.updatedAt);

            // 2. Fetch Logs for Preview/Export
            // We need full merged logs to export.
            // Using the existing logs API which returns { manualLogs, specialLogs }
            const [y, m] = selectedMonth.split('-');
            const year = parseInt(y);
            const month = parseInt(m);
            const startDate = `${selectedMonth}-01`;
            const endDate = format(endOfMonth(new Date(year, month - 1, 1)), 'yyyy-MM-dd');

            // Get User Company ID from local storage (simplified for this context)
            const userStr = localStorage.getItem('user');
            const companyId = userStr ? JSON.parse(userStr).company_id : '';

            if (companyId) {
                const logsRes = await fetch(`/api/attendance/logs?startDate=${startDate}&endDate=${endDate}&companyId=${companyId}`);
                const logsData = await logsRes.json() as { success: boolean, manualLogs: [], specialLogs: [] };

                if (logsData.success) {
                    const merged = AttendanceMergeEngine.mergeLogs(
                        logsData.manualLogs || [],
                        logsData.specialLogs || []
                    );
                    setLogs(merged);

                    // --- Validation Logic ---
                    if (!lockData.isLocked) { // Only validate if not locked (if locked, we allow unlock)
                        const totalDays = new Date(year, month, 0).getDate(); // Get last day of month
                        const uniqueDates = new Set(merged.map(l => l.date));

                        // Rule: Must have at least (Total Days - 5) days of data
                        // This prevents approving 1 week of data for a full month
                        // But lenient enough for a few missing days
                        if (uniqueDates.size < totalDays - 5) {
                            setValidationError(`검증 실패: 월간 데이터가 부족합니다. (현재: ${uniqueDates.size}일 / 기준: ${totalDays}일 - 5일 이내 누락 시 승인 불가)`);
                        }
                    }
                }
            }

        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();
    }, [selectedMonth]);

    const handleApprove = async (action: 'lock' | 'unlock') => {
        const isLockAction = action === 'lock';

        if (isLockAction && validationError) {
            alert(validationError);
            return;
        }

        const confirmMsg = isLockAction
            ? `${selectedMonth}월 근태를 [결재 완료] 처리하시겠습니까?\n결재 후에는 데이터 수정이 제한됩니다.`
            : `${selectedMonth}월 결재를 [취소/잠금 해제] 하시겠습니까?\n이제 데이터 수정이 가능해집니다.`;

        // eslint-disable-next-line no-restricted-globals
        if (!confirm(confirmMsg)) return;

        try {
            setIsLoading(true);
            const res = await fetch('/api/approval/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month: selectedMonth, action })
            });
            const data = await res.json() as { success: boolean, message?: string };
            if (data.success) {
                // Optimistically update
                setIsLocked(isLockAction);
                alert(isLockAction ? '결재가 완료되었습니다.' : '결재가 취소(잠금 해제)되었습니다.');
                fetchStatus();
            } else {
                alert('처리 실패: ' + (data.message || 'Unknown Error'));
            }
        } catch (error) {
            alert('오류 발생');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDownloadExcel = async () => {
        if (logs.length === 0) {
            alert('데이터가 없습니다.');
            return;
        }

        try {
            // Use existing Monthly Report Generator
            await ExcelReportGenerator.generateMonthlyReport(logs, selectedMonth);
        } catch (e) {
            console.error(e);
            alert('엑셀 생성 중 오류가 발생했습니다.');
        }
    };

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">결재 관리</h1>

                {/* Month Navigation (Calendar Style) */}
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Status Card */}
                <Card className={`md:col-span-1 border-l-4 shadow-sm ${isLocked ? 'border-l-indigo-500' : 'border-l-amber-500'}`}>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-500 uppercase">결재 상태</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-3">
                            {isLocked ? (
                                <div className="bg-indigo-100 text-indigo-700 p-3 rounded-full">
                                    <CheckCircle className="w-8 h-8" />
                                </div>
                            ) : (
                                <div className="bg-amber-100 text-amber-700 p-3 rounded-full">
                                    <Clock className="w-8 h-8" />
                                </div>
                            )}
                            <div>
                                <div className="text-2xl font-bold text-slate-900">
                                    {isLocked ? '결재 완료' : '결재 대기'}
                                </div>
                                {lastUpdated && (
                                    <p className="text-xs text-slate-400 mt-1">
                                        최종 처리: {format(lastUpdated, 'yyyy-MM-dd HH:mm')}
                                    </p>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Summary Card */}
                <Card className="md:col-span-2 shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-500 uppercase">데이터 요약</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-3 gap-4 text-center">
                            <div className="bg-slate-50 p-3 rounded-lg">
                                <p className="text-xs text-slate-500 mb-1">총 인원</p>
                                <p className="text-xl font-bold text-slate-800">{new Set(logs.map(l => l.userId)).size}명</p>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-lg">
                                <p className="text-xs text-slate-500 mb-1">근태 기록</p>
                                <p className="text-xl font-bold text-slate-800">{logs.length}건</p>
                            </div>
                            <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                                <p className="text-xs text-indigo-600 mb-1">다운로드 가능</p>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-indigo-700 hover:bg-indigo-100 p-0"
                                    onClick={handleDownloadExcel}
                                >
                                    <FileDown className="w-4 h-4 mr-1" /> 엑셀 다운로드
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Actions */}
            <Card className={`shadow-lg border-t-4 ${isLocked ? 'border-t-slate-400' : 'border-t-indigo-600'}`}>
                <CardContent className="p-8 flex flex-col items-center text-center space-y-4">
                    <div className={`${isLocked ? 'bg-slate-100' : 'bg-indigo-50'} p-4 rounded-full`}>
                        {isLocked ? <CheckCircle className="w-10 h-10 text-slate-400" /> : <Lock className="w-10 h-10 text-indigo-600" />}
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">
                            {isLocked ? `${selectedMonth}월 결재가 완료되었습니다` : `${selectedMonth}월 결재 승인`}
                        </h3>
                        <p className="text-slate-500 mt-2 max-w-md mx-auto">
                            {isLocked
                                ? "이미 결재가 완료되어 데이터가 잠금 상태입니다. 수정이 필요할 경우 아래 [잠금 해제] 버튼을 통해 결재를 취소할 수 있습니다."
                                : "결재 승인 시 해당 월의 모든 근태 및 특근 데이터가 '잠금(Locked)' 처리되며, 이후 수정이 제한됩니다."
                            }
                        </p>
                    </div>

                    <div className="pt-4 w-full max-w-sm space-y-3">
                        {isLocked ? (
                            <>
                                <Button
                                    variant="outline"
                                    className="w-full h-12 text-slate-500 cursor-default"

                                >
                                    <CheckCircle className="w-5 h-5 mr-2" />
                                    이미 결재됨 ({format(lastUpdated || 0, 'yyyy-MM-dd HH:mm')})
                                </Button>
                                <Button
                                    variant="ghost"
                                    className="w-full text-red-500 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => handleApprove('unlock')}
                                    disabled={isLoading}
                                >
                                    <Unlock className="w-4 h-4 mr-2" />
                                    결재 취소 / 잠금 해제
                                </Button>
                            </>
                        ) : (
                            <>
                                {validationError && (
                                    <div className="text-sm text-red-600 font-medium bg-red-50 p-3 rounded-md flex items-center gap-2 text-left mb-2">
                                        <AlertTriangle className="w-4 h-4 shrink-0" />
                                        {validationError}
                                    </div>
                                )}
                                <Button
                                    onClick={() => handleApprove('lock')}
                                    className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg shadow-xl shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                    disabled={isLoading || !!validationError}
                                >
                                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "결재 완료 승인"}
                                </Button>
                            </>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default ApprovalManagementPage;
