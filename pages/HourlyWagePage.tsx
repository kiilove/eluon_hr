import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HourlyWageParser, HourlyWageItem } from '../lib/engine/HourlyWageParser';
import { UploadCloud, FileSpreadsheet, List, Trash2, Eye, Calendar, Save, Search, Edit2, Plus, Download, ChevronRight, History } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useMessageModal } from '@/contexts/MessageModalContext';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export const HourlyWagePage = () => {
    const [view, setView] = useState<'upload' | 'detail'>('upload');
    const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const handleSelectSet = (id: string) => {
        setSelectedSetId(id);
        setView('detail');
    };

    const handleNewUpload = () => {
        setSelectedSetId(null);
        setView('upload');
    };

    const triggerRefresh = () => setRefreshTrigger(prev => prev + 1);

    return (
        <div className="p-6 max-w-[1800px] mx-auto h-[calc(100vh-60px)] flex flex-col">
            <div className="flex flex-col gap-1 mb-6 flex-shrink-0">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                    시급 데이터 관리
                </h1>
                <p className="text-sm text-slate-500">기간별 적용되는 시급 테이블을 관리합니다. 좌측 목록에서 이력을 선택하거나 새로운 데이터를 업로드하세요.</p>
            </div>

            <div className="flex flex-1 gap-6 min-h-0">
                {/* Sidebar (Master) */}
                <div className="w-[320px] flex-shrink-0 flex flex-col gap-4">
                    <Button
                        onClick={handleNewUpload}
                        className={`w-full justify-start gap-2 h-12 text-md ${view === 'upload' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'}`}
                        variant={view === 'upload' ? 'default' : 'outline'}
                    >
                        <div className={`p-1.5 rounded-full ${view === 'upload' ? 'bg-indigo-500/20' : 'bg-slate-100'}`}>
                            <Plus size={18} />
                        </div>
                        새로운 시급 업로드
                    </Button>

                    <Card className="flex-1 flex flex-col min-h-0 border-slate-200 shadow-sm">
                        <CardHeader className="py-4 px-5 border-b border-slate-100 folder-header bg-slate-50/50">
                            <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                <History size={16} className="text-slate-400" />
                                시급 이력 목록
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 flex-1 overflow-y-auto">
                            <HourlyWageSidebar
                                selectedId={selectedSetId}
                                onSelect={handleSelectSet}
                                refreshTrigger={refreshTrigger}
                            />
                        </CardContent>
                    </Card>
                </div>

                {/* Main Content (Detail) */}
                <div className="flex-1 min-w-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    {view === 'upload' ? (
                        <HourlyWageUploadView onSuccess={() => { triggerRefresh(); handleNewUpload(); }} />
                    ) : (
                        <HourlyWageDetailView
                            setId={selectedSetId}
                            onDelete={() => { triggerRefresh(); handleNewUpload(); }}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

const HourlyWageSidebar = ({ selectedId, onSelect, refreshTrigger }: { selectedId: string | null, onSelect: (id: string) => void, refreshTrigger: number }) => {
    const [sets, setSets] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const loadSets = async () => {
        setLoading(true);
        try {
            const userStr = localStorage.getItem('user');
            if (!userStr) return;
            const user = JSON.parse(userStr);
            const companyId = user.company_id;

            if (companyId) {
                const res = await fetch(`/api/hourly-wages?companyId=${companyId}`);
                const json = await res.json() as any;
                if (json.success) setSets(json.data);
            }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    useEffect(() => { loadSets(); }, [refreshTrigger]);

    if (loading && sets.length === 0) return <div className="p-8 text-center text-xs text-slate-400">목록 로딩 중...</div>;
    if (sets.length === 0) return <div className="p-8 text-center text-xs text-slate-400">등록된 이력이 없습니다.</div>;

    return (
        <div className="divide-y divide-slate-100">
            {sets.map(s => (
                <button
                    key={s.id}
                    onClick={() => onSelect(s.id)}
                    className={`w-full text-left p-4 hover:bg-slate-50 transition-colors flex items-center justify-between group ${selectedId === s.id ? 'bg-indigo-50/80 border-l-4 border-indigo-500' : 'border-l-4 border-transparent'}`}
                >
                    <div className="min-w-0">
                        <div className={`font-mono text-sm font-bold flex items-center gap-2 ${selectedId === s.id ? 'text-indigo-700' : 'text-slate-700'}`}>
                            {s.effective_date}
                            {selectedId === s.id && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>}
                        </div>
                        <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                            <span>직원 {s.item_count}명</span>
                            <span className="w-px h-2 bg-slate-300"></span>
                            <span>{new Date(s.created_at).toLocaleDateString()}</span>
                        </div>
                    </div>
                    <ChevronRight size={16} className={`text-slate-300 transition-transform ${selectedId === s.id ? 'text-indigo-400 translate-x-1' : 'group-hover:translate-x-1'}`} />
                </button>
            ))}
        </div>
    );
};

const HourlyWageUploadView = ({ onSuccess }: { onSuccess: () => void }) => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [items, setItems] = useState<HourlyWageItem[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const { showAlert, showConfirm } = useMessageModal();

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        setIsProcessing(true);
        try {
            const data = await HourlyWageParser.parse(e.target.files[0]);
            setItems(data);
        } catch (err) {
            await showAlert("파싱 실패: " + err, { type: 'error' });
        } finally {
            setIsProcessing(false);
            e.target.value = '';
        }
    };

    const handleSave = async () => {
        const confirmed = await showConfirm(`${date} 일자로 ${items.length}건의 시급 데이터를 저장(덮어쓰기)하시겠습니까?\n미등록 직원은 자동 생성됩니다.`, { title: '저장 확인', type: 'info', confirmText: '저장' });
        if (!confirmed) return;

        const userStr = localStorage.getItem('user');
        if (!userStr || !JSON.parse(userStr).company_id) {
            await showAlert("로그인/회사 정보가 없습니다.", { type: 'error' });
            return;
        }
        const user = JSON.parse(userStr);

        setIsProcessing(true);
        try {
            const res = await fetch('/api/hourly-wages/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ effectiveDate: date, items, companyId: user.company_id })
            });
            const json = await res.json() as any;
            if (json.success) {
                let msg = `저장 완료. (신규 생성: ${json.createdCount}명)`;
                if (json.newEmployees?.length > 0) msg += `\n[자동 생성]\n${json.newEmployees.join(', ')}`;
                await showAlert(msg, { type: 'success' });
                setItems([]);
                onSuccess();
            } else {
                await showAlert("저장 실패: " + json.error, { type: 'error' });
            }
        } catch (e) {
            console.error(e);
            await showAlert("오류 발생", { type: 'error' });
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50/30">
            <div className="p-6 border-b border-slate-100 bg-white">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <UploadCloud className="text-indigo-600" size={20} />
                    새로운 시급 데이터 업로드
                </h2>
                <p className="text-sm text-slate-500 mt-1">엑셀 파일을 업로드하여 새로운 시급 이력을 생성합니다.</p>
            </div>

            <div className="p-8 max-w-2xl mx-auto w-full flex-1 flex flex-col gap-8">
                <div className="grid gap-6 p-6 bg-white rounded-xl border border-slate-200 shadow-sm">
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700">1. 적용 시작일 (Effective Date)</label>
                        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="block w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                        <p className="text-xs text-slate-400">이 날짜부터 해당 시급이 적용됩니다.</p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700">2. 엑셀 파일 선택</label>
                        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 border-dashed rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                <FileSpreadsheet className="w-8 h-8 mb-2 text-slate-400" />
                                <p className="mb-1 text-sm text-slate-500"><span className="font-semibold text-indigo-600">클릭하여 파일 선택</span> (xls, xlsx)</p>
                                <p className="text-xs text-slate-400">필수 컬럼: 성명, 시급</p>
                            </div>
                            <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleFileUpload} disabled={isProcessing} />
                        </label>
                    </div>
                </div>

                {items.length > 0 && (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4">
                        <div className="flex justify-between items-center px-2">
                            <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                <Search size={16} />
                                데이터 미리보기 ({items.length}건)
                            </span>
                            <Button onClick={handleSave} disabled={isProcessing} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 shadow-sm">
                                <Save size={16} /> 데이터베이스 저장
                            </Button>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm max-h-[400px] overflow-y-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 sticky top-0 z-10">
                                    <tr>
                                        <th className="p-3 border-b text-slate-600 font-medium w-1/2">성명</th>
                                        <th className="p-3 border-b text-right text-slate-600 font-medium w-1/2">시급</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((i, idx) => (
                                        <tr key={idx} className="border-b last:border-0 hover:bg-slate-50">
                                            <td className="p-3 font-medium text-slate-700">{i.name}</td>
                                            <td className="p-3 text-right font-mono text-indigo-600 font-bold">{i.amount.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const HourlyWageDetailView = ({ setId, onDelete }: { setId: string | null, onDelete: () => void }) => {
    const [detail, setDetail] = useState<any>(null);
    const [search, setSearch] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingValue, setEditingValue] = useState<number | string>("");
    const { showAlert, showConfirm } = useMessageModal();
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!setId) { setDetail(null); return; }
        setLoading(true);
        fetch(`/api/hourly-wages/details?id=${setId}`)
            .then(r => r.json())
            .then((d: any) => {
                if (d.success) setDetail(d.data);
                else setDetail(null);
            })
            .catch(() => setDetail(null))
            .finally(() => setLoading(false));
    }, [setId]);

    const handleExportExcel = async () => {
        if (!detail) return;
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('시급데이터');

        sheet.columns = [
            { header: '적용일자', key: 'date', width: 15 },
            { header: '이름', key: 'name', width: 15 },
            { header: '사번', key: 'code', width: 15 },
            { header: '시급', key: 'amount', width: 15 },
        ];

        // Style header
        sheet.getRow(1).font = { bold: true };
        sheet.getRow(1).alignment = { horizontal: 'center' };

        detail.items.forEach((item: any) => {
            sheet.addRow({
                date: detail.effective_date,
                name: item.employee_name,
                code: item.employee_code,
                amount: item.amount
            });
        });

        // Format number column
        sheet.getColumn('amount').numFmt = '#,##0';

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/octet-stream' });
        saveAs(blob, `시급명부_${detail.effective_date}.xlsx`);
    };

    const handleSaveEdit = async () => {
        if (!editingId || !setId) return;
        try {
            const res = await fetch('/api/hourly-wages/values', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: editingId, amount: Number(editingValue) })
            });
            if (res.ok) {
                setEditingId(null);
                // Refresh
                const d = await fetch(`/api/hourly-wages/details?id=${setId}`).then(r => r.json()) as any;
                if (d.success) setDetail(d.data);
            } else {
                await showAlert("수정 실패", { type: 'error' });
            }
        } catch (e) { await showAlert("오류 발생", { type: 'error' }); }
    };

    const handleDeleteSet = async () => {
        if (!detail) return;
        const confirmed = await showConfirm(`정말 삭제하시겠습니까? 관련 데이터가 모두 사라집니다.`, { title: '삭제 확인', type: 'warning', confirmText: '삭제' });
        if (!confirmed) return;
        try {
            await fetch(`/api/hourly-wages/details?id=${setId}`, { method: 'DELETE' });
            onDelete();
        } catch (e) { await showAlert("삭제 실패", { type: 'error' }); }
    };

    const filteredItems = React.useMemo(() => {
        if (!detail?.items) return [];
        if (!search) return detail.items;
        return detail.items.filter((i: any) => i?.employee_name?.includes(search) || i?.employee_code?.includes(search));
    }, [detail, search]);

    if (!setId) return <div className="h-full flex items-center justify-center text-slate-400">좌측 목록에서 내역을 선택해주세요.</div>;
    if (loading) return <div className="h-full flex items-center justify-center text-slate-400">데이터 로딩 중...</div>;
    if (!detail) return <div className="h-full flex items-center justify-center text-slate-400">데이터를 불러올 수 없습니다.</div>;

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Header */}
            <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-white z-10">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        {detail.effective_date}
                        <span className="text-sm font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">시급 테이블</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">등록일: {new Date(detail.created_at).toLocaleString()}</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleExportExcel} className="gap-2 text-green-700 bg-white hover:bg-green-50 hover:border-green-200">
                        <Download size={14} /> 엑셀 다운로드
                    </Button>
                    <div className="w-px h-8 bg-slate-200 mx-2"></div>
                    <Button variant="ghost" size="sm" onClick={handleDeleteSet} className="text-red-500 hover:bg-red-50 hover:text-red-600">
                        <Trash2 size={16} /> 삭제
                    </Button>
                </div>
            </div>

            {/* Toolbar */}
            <div className="px-8 py-3 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                <div className="relative w-[300px]">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="이름, 사번 검색..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 h-10 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                </div>
                <div className="text-xs text-slate-500 font-medium">
                    총 {filteredItems.length}명
                </div>
            </div>

            {/* Data Table */}
            <div className="flex-1 overflow-y-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 sticky top-0 z-10">
                        <tr>
                            <th className="p-4 border-b text-slate-500 w-[120px]">사번</th>
                            <th className="p-4 border-b text-slate-500 w-[150px]">이름</th>
                            <th className="p-4 border-b text-right text-slate-500">시급 (원)</th>
                            <th className="p-4 border-b w-[100px] text-center">관리</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {filteredItems.map((item: any) => (
                            <tr key={item.id} className="hover:bg-slate-50 group transition-colors">
                                <td className="p-4 font-mono text-slate-500">{item.employee_code || '-'}</td>
                                <td className="p-4 font-bold text-slate-700">{item.employee_name}</td>
                                <td className="p-4 text-right">
                                    {editingId === item.id ? (
                                        <div className="flex items-center justify-end gap-2">
                                            <input
                                                type="number"
                                                value={editingValue}
                                                onChange={e => setEditingValue(e.target.value)}
                                                className="w-24 border border-indigo-300 rounded px-2 py-1 text-right focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                autoFocus
                                            />
                                            <Button size="sm" className="h-7 px-2 text-xs" onClick={handleSaveEdit}>확인</Button>
                                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditingId(null)}>취소</Button>
                                        </div>
                                    ) : (
                                        <span className="font-mono text-indigo-700 font-medium text-base">
                                            {item.amount.toLocaleString()}
                                        </span>
                                    )}
                                </td>
                                <td className="p-4 text-center">
                                    {editingId !== item.id && (
                                        <Button
                                            size="sm" variant="ghost"
                                            className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-indigo-600 transition-all"
                                            onClick={() => { setEditingId(item.id); setEditingValue(item.amount); }}
                                        >
                                            <Edit2 size={14} />
                                        </Button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
