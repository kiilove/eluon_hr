import React, { useState, useEffect } from 'react';
import { DailySettlementParser, SettlementReport } from '../../lib/engine/DailySettlementParser';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { UploadCloud, BadgeCheck, ChevronLeft, ChevronRight, Save, FileSpreadsheet, AlertCircle, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LoadingOverlay } from '../ui/LoadingOverlay';

export const SpecialWorkUploadView = ({ setActiveTab }: { setActiveTab: (tab: any) => void }) => {
    const [report, setReport] = useState<SettlementReport | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const today = new Date();
    const initYear = today.getFullYear();
    const initMonth = String(today.getMonth() + 1).padStart(2, '0');
    const [targetMonth, setTargetMonth] = useState<string>(`${initYear}-${initMonth}`);
    const navigate = useNavigate();
    const [configs, setConfigs] = useState<any[]>([]);

    useEffect(() => {
        const date = `${targetMonth}-01`;
        fetch(`/api/settings/special-work?date=${date}`)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setConfigs(data);
            })
            .catch(err => console.error("Failed to load configs", err));
    }, [targetMonth]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        setIsProcessing(true);
        try {
            const file = e.target.files[0];
            const initialResult = await DailySettlementParser.parse(file, { configs: [] });
            const inferredMonth = initialResult.targetMonth;
            let dynamicConfigs: any[] = [];
            if (inferredMonth) {
                try {
                    const date = `${inferredMonth}-01`;
                    const res = await fetch(`/api/settings/special-work?date=${date}`);
                    const data = await res.json();
                    if (Array.isArray(data)) {
                        dynamicConfigs = data;
                        setConfigs(data);
                    }
                } catch (fetchErr) {
                    console.error("Failed to fetch dynamic configs for inferred month", fetchErr);
                }
            }
            const finalResult = await DailySettlementParser.parse(file, {
                configs: dynamicConfigs.length > 0 ? dynamicConfigs : undefined
            });

            if (finalResult.details.length === 0) alert("파싱된 데이터가 없습니다.");

            setReport(finalResult);
            if (finalResult.targetMonth) setTargetMonth(finalResult.targetMonth);

        } catch (error) {
            console.error(error);
            alert(`파일 파싱 중 오류가 발생했습니다: ${error}`);
        } finally {
            setIsProcessing(false);
            e.target.value = '';
        }
    };

    const handleSaveToDB = async () => {
        if (!report) return;
        setIsProcessing(true);
        await new Promise(resolve => setTimeout(resolve, 100)); // Force UI Update

        try {
            const [y, m] = targetMonth.split('-');
            const dynamicTitle = `${y}년 ${m}월 특근데이터 분석`;

            // Get Company ID
            const userStr = localStorage.getItem('user');
            const user = userStr ? JSON.parse(userStr) : null;
            const companyId = user?.company_id;

            if (!companyId) {
                alert("사용자 정보(회사 코드)를 찾을 수 없습니다. 다시 로그인해주세요.");
                return;
            }

            const response = await fetch('/api/special-work/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...report,
                    title: dynamicTitle,
                    reportTitle: dynamicTitle,
                    targetMonth: targetMonth,
                    companyId: companyId
                })
            });
            const result: any = await response.json();
            if (response.ok && result.success) {
                let msg = `저장이 완료되었습니다. (저장된 건수: ${result.insertedCount})`;
                if (result.missingNames?.length > 0) msg += `\n\n[주의] 매칭 실패: ${result.missingNames.join(', ')}`;
                alert(msg);
                setReport(null);
                setActiveTab('manage');
            } else {
                throw new Error(result.error || '저장 중 오류가 발생했습니다.');
            }
        } catch (error) {
            console.error(error);
            alert(`저장 실패: ${error}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const handlePrevMonth = () => {
        if (!targetMonth) return;
        const [y, m] = targetMonth.split('-').map(Number);
        const date = new Date(y, m - 1 - 1, 1);
        setTargetMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    };

    const handleNextMonth = () => {
        if (!targetMonth) return;
        const [y, m] = targetMonth.split('-').map(Number);
        const date = new Date(y, m - 1 + 1, 1);
        setTargetMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    };

    const formatCurrency = (val: number) => new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(val);

    return (
        <div className="space-y-6">
            <Card className="border-orange-100 shadow-sm bg-white/70 backdrop-blur-md">
                <CardHeader className="pb-4 border-b border-orange-50">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2 text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-900 to-orange-600">
                                <UploadCloud className="w-6 h-6 text-orange-600" />
                                특근 엑셀 업로드
                            </CardTitle>
                            <CardDescription className="text-slate-500 mt-1">
                                특근표 엑셀 파일을 업로드하여 데이터를 분석합니다.
                            </CardDescription>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className="gap-2 text-orange-700 bg-orange-50/50 border-orange-200 hover:bg-orange-100 hover:border-orange-300 transition-all font-medium"
                            onClick={() => navigate('/special-work/export')}
                        >
                            <FileSpreadsheet className="w-4 h-4" />
                            검증용 양식 다운로드
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-8 pt-6">
                    <div className="flex flex-col items-center justify-center space-y-3">
                        <label className="text-sm font-semibold text-slate-700 flex flex-col items-center gap-1">
                            분석 대상 월
                            <span className="text-[11px] font-normal text-slate-400">파일 업로드 시 날짜가 자동으로 감지됩니다</span>
                        </label>
                        <div className="flex items-center gap-1 bg-white p-1 rounded-xl shadow-sm border border-orange-100">
                            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-slate-100 text-slate-500" onClick={handlePrevMonth}><ChevronLeft className="w-5 h-5" /></Button>
                            <input
                                type="month"
                                value={targetMonth}
                                onChange={(e) => setTargetMonth(e.target.value)}
                                className="w-40 h-9 px-3 border-none bg-transparent text-center font-mono font-bold text-lg text-slate-800 focus:outline-none focus:ring-0"
                            />
                            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-slate-100 text-slate-500" onClick={handleNextMonth}><ChevronRight className="w-5 h-5" /></Button>
                        </div>
                    </div>

                    <div className="max-w-xl mx-auto w-full">
                        <label className={`
                            relative flex flex-col items-center justify-center w-full h-40 
                            border-2 border-dashed rounded-2xl cursor-pointer 
                            transition-all duration-300 ease-in-out group overflow-hidden
                            ${isProcessing ? 'border-orange-300 bg-orange-50/50 cursor-not-allowed' : 'border-orange-100 hover:border-orange-400 hover:bg-orange-50/20 bg-slate-50/50'}
                        `}>
                            <div className="absolute inset-0 bg-gradient-to-tr from-orange-100/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>

                            <div className="flex flex-col items-center justify-center py-6 px-4 z-10">
                                {isProcessing ? (
                                    <>
                                        <div className="w-10 h-10 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin mb-3"></div>
                                        <p className="font-semibold text-orange-700">데이터 분석 중...</p>
                                        <p className="text-xs text-orange-500 mt-1">잠시만 기다려주세요</p>
                                    </>
                                ) : (
                                    <>
                                        <div className="p-3 bg-white rounded-full shadow-sm mb-3 group-hover:scale-110 transition-transform duration-300 ring-1 ring-orange-50">
                                            <UploadCloud className="w-8 h-8 text-orange-500 group-hover:text-orange-600" />
                                        </div>
                                        <p className="text-sm font-semibold text-slate-700 group-hover:text-orange-700 transition-colors">
                                            엑셀 파일 선택 또는 드래그
                                        </p>
                                        <p className="text-xs text-slate-400 mt-1">
                                            .xlsx, .xls 파일 지원
                                        </p>
                                    </>
                                )}
                            </div>
                            <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleFileUpload} disabled={isProcessing} />
                        </label>
                    </div>
                </CardContent>
            </Card>

            {report && (
                <div className="space-y-6 animate-in slide-in-from-bottom-4 fade-in-0 duration-500">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <BadgeCheck className="w-5 h-5 text-orange-600" />
                            분석 결과 확인
                        </h3>
                        <Button onClick={handleSaveToDB} disabled={isProcessing} className="bg-orange-600 hover:bg-orange-700 text-white gap-2 shadow-sm rounded-lg pl-3 pr-4 py-5 font-semibold text-sm transition-all hover:shadow-md hover:-translate-y-0.5">
                            {isProcessing ? <><span className="animate-spin">⏳</span> 저장 중...</> : <><Save className="w-4 h-4" /> 데이터 시스템 저장</>}
                        </Button>
                    </div>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card className="bg-slate-900 text-white border-none shadow-xl relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-8 w-24 h-24 bg-white/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none group-hover:bg-white/10 transition-colors"></div>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs font-semibold text-slate-300 uppercase tracking-widest flex items-center gap-2">
                                    <FileText className="w-3 h-3" /> 파일 정보
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-xl font-bold truncate tracking-tight text-white mb-1">
                                    {targetMonth.split('-')[0]}년 {targetMonth.split('-')[1]}월 데이터
                                </div>
                                <div className="text-xs text-slate-400">대상 기간: {targetMonth}</div>
                            </CardContent>
                        </Card>

                        <Card className="bg-white border-orange-100 shadow-sm">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-widest">분석 인원</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
                                    {report.details.length}<span className="text-base font-medium text-slate-400 ml-1">명</span>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-gradient-to-br from-orange-600 to-amber-600 text-white border-none shadow-lg shadow-orange-200">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs font-semibold text-orange-100 uppercase tracking-widest">총 지급 예상액</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold tracking-tight">
                                    {formatCurrency(report.totalPayout)}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Report Details Table */}
                    <Card className="border-orange-100 shadow-lg bg-white overflow-hidden rounded-xl">
                        <CardContent className="p-0">
                            <div className="overflow-x-auto max-w-full scrollbar-thin scrollbar-thumb-orange-50 scrollbar-track-transparent">
                                <table className="min-w-full text-xs text-left border-collapse">
                                    <thead className="bg-slate-50/80 backdrop-blur-sm text-slate-500 font-semibold border-b border-orange-50">
                                        <tr>
                                            <th className="px-4 py-3 sticky left-0 bg-slate-50 z-10 w-[100px] border-r border-orange-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">성명</th>
                                            {(report.headers || []).map((h, i) => (
                                                <th key={i} className="px-1 py-3 text-center min-w-[36px] border-r border-orange-50 font-normal">
                                                    {h.slice(8)} <span className="text-[9px] text-slate-400 block">{h.slice(5, 7)}월</span>
                                                </th>
                                            ))}
                                            <th className="px-4 py-3 text-right font-bold w-[120px] bg-slate-50 sticky right-0 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.05)]">지급액</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-orange-50 bg-white">
                                        {report.details.map((item, idx) => {
                                            const dailyMap = new Map(item.dailyLogs.map(l => [l.date, l.type]));
                                            return (
                                                <tr key={idx} className="hover:bg-orange-50/30 transition-colors group">
                                                    <td className="px-4 py-3 font-medium text-slate-900 sticky left-0 bg-white group-hover:bg-orange-50/30 border-r border-orange-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                                                        {item.name}
                                                    </td>
                                                    {(report.headers || []).map((h, i) => {
                                                        const type = dailyMap.get(h);
                                                        return (
                                                            <td key={i} className={`border-r border-orange-50 text-center ${type ? (type === 'REGULAR' ? 'bg-orange-50/50' : 'bg-amber-50/50') : ''}`}>
                                                                {type === 'REGULAR' && <span className="text-orange-600 font-bold text-[10px]">◎</span>}
                                                                {type === 'REMOTE' && <span className="text-amber-600 font-bold text-[10px]">★</span>}
                                                            </td>
                                                        );
                                                    })}
                                                    <td className="px-4 py-3 text-right font-bold text-slate-700 bg-white sticky right-0 group-hover:bg-orange-50/30 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.05)] font-mono">
                                                        {formatCurrency(item.totalAllowance)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                    <div className="flex justify-center pb-8">
                        <p className="text-xs text-slate-400 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            데이터를 저장하면 '데이터 목록 관리' 탭에서 상세 내역을 확인하고 근태를 생성할 수 있습니다.
                        </p>
                    </div>
                </div>
            )}


            <LoadingOverlay isVisible={isProcessing} message="데이터 분석 및 저장 중입니다..." />
        </div>
    );
};
