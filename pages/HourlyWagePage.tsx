import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HourlyWageParser, HourlyWageItem } from '../lib/engine/HourlyWageParser';
import { UploadCloud, FileSpreadsheet, List, Trash2, Eye, Calendar, Save, Search, Edit2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const HourlyWagePage = () => {
    const [activeTab, setActiveTab] = useState("upload");

    return (
        <div className="p-4 space-y-4 max-w-[1600px] mx-auto animate-in fade-in duration-500">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">시급 데이터 관리 (Hourly Wage Management)</h1>
                <p className="text-xs text-slate-500">기간별 적용되는 시급 테이블을 관리합니다.</p>
            </div>

            <div className="flex space-x-1 rounded-lg bg-slate-100 p-1 w-fit">
                <button
                    onClick={() => setActiveTab("upload")}
                    className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'upload' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}
                >
                    <UploadCloud size={16} />
                    데이터 업로드
                </button>
                <button
                    onClick={() => setActiveTab("list")}
                    className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'list' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}
                >
                    <List size={16} />
                    이력 조회
                </button>
            </div>

            {activeTab === 'upload' && <HourlyWageUploadView setActiveTab={setActiveTab} />}
            {activeTab === 'list' && <HourlyWageListView active={true} />}
        </div>
    );
};

const HourlyWageUploadView = ({ setActiveTab }: { setActiveTab: (t: string) => void }) => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [items, setItems] = useState<HourlyWageItem[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        setIsProcessing(true);
        try {
            const data = await HourlyWageParser.parse(e.target.files[0]);
            setItems(data);
        } catch (err) {
            alert("파싱 실패: " + err);
        } finally {
            setIsProcessing(false);
            e.target.value = '';
        }
    };

    const handleSave = async () => {
        if (!confirm(`${date} 일자로 ${items.length}건의 시급 데이터를 저장(덮어쓰기)하시겠습니까?\n미등록 직원은 자동 생성됩니다.`)) return;

        // Get company_id from user
        const userStr = localStorage.getItem('user');
        if (!userStr) {
            alert("로그인 정보가 없습니다.");
            return;
        }
        const user = JSON.parse(userStr);
        if (!user.company_id) {
            alert("회사 정보가 없습니다.");
            return;
        }

        setIsProcessing(true);
        try {
            const res = await fetch('/api/hourly-wages/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ effectiveDate: date, items, companyId: user.company_id })
            });
            const json = await res.json() as any;
            if (json.success) {
                let msg = `저장 완료. (신규 생성 직원: ${json.createdCount}명)`;
                if (json.newEmployees?.length > 0) {
                    msg += `\n[자동 생성된 직원 목록]\n${json.newEmployees.join(', ')}`;
                }
                alert(msg);
                setItems([]);
                setActiveTab('list');
            } else {
                alert("저장 실패: " + json.error);
            }
        } catch (e) {
            console.error(e);
            alert("오류 발생");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <Card>
            <CardHeader><CardTitle>시급 테이블 업로드</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-700">적용 시작일 (Effective Date)</label>
                        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="block w-[150px] border border-slate-300 rounded-md px-2 py-1 text-sm font-mono" />
                    </div>
                </div>

                <div className="flex items-center justify-center w-full">
                    <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-slate-300 border-dashed rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <UploadCloud className="w-6 h-6 mb-2 text-slate-400" />
                            <p className="mb-1 text-xs text-slate-500"><span className="font-semibold">클릭하여 엑셀 업로드 (성명, 시급 컬럼 필수)</span></p>
                        </div>
                        <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleFileUpload} disabled={isProcessing} />
                    </label>
                </div>

                {items.length > 0 && (
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-slate-600">미리보기 ({items.length}건)</span>
                            <Button onClick={handleSave} disabled={isProcessing} className="bg-blue-600 text-white gap-2">
                                <Save size={14} /> DB 저장
                            </Button>
                        </div>
                        <div className="border border-slate-200 rounded-md max-h-[400px] overflow-y-auto">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-slate-50 sticky top-0">
                                    <tr>
                                        <th className="p-2 border-b">성명</th>
                                        <th className="p-2 border-b text-right">시급</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((i, idx) => (
                                        <tr key={idx} className="border-b last:border-0 hover:bg-slate-50">
                                            <td className="p-2">{i.name}</td>
                                            <td className="p-2 text-right font-mono">{i.amount.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

const HourlyWageListView = ({ active }: { active: boolean }) => {
    const [sets, setSets] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detail, setDetail] = useState<any>(null);
    const [search, setSearch] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingValue, setEditingValue] = useState<number | string>("");

    const handleStartEdit = (item: any) => {
        setEditingId(item.id); // Value ID
        setEditingValue(item.amount);
    };

    const handleSaveEdit = async () => {
        if (!editingId || !selectedId) return; // selectedId is Set ID
        try {
            const res = await fetch('/api/hourly-wages/values', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: editingId, amount: Number(editingValue) })
            });
            if (res.ok) {
                setEditingId(null);
                // Refresh Detail
                fetch(`/api/hourly-wages/details?id=${selectedId}`).then(r => r.json()).then((d: any) => {
                    if (d.success) setDetail(d.data);
                });
            } else {
                alert("수정 실패");
            }
        } catch (e) { alert("오류 발생"); }
    };

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

    useEffect(() => { if (active) loadSets(); }, [active]);

    useEffect(() => {
        if (selectedId) {
            fetch(`/api/hourly-wages/details?id=${selectedId}`).then(r => r.json()).then((d: any) => {
                if (d.success) setDetail(d.data);
            });
        } else setDetail(null);
    }, [selectedId]);

    const handleDelete = async (id: string, date: string) => {
        if (!confirm(`${date} 데이터를 삭제하시겠습니까?`)) return;
        try {
            await fetch(`/api/hourly-wages/details?id=${id}`, { method: 'DELETE' });
            loadSets();
        } catch (e) { alert("삭제 실패"); }
    };

    // Filter detail items
    const filteredItems = React.useMemo(() => {
        if (!detail?.items) return [];
        if (!search) return detail.items;
        return detail.items.filter((i: any) => i?.employee_name?.includes(search) || i?.employee_code?.includes(search));
    }, [detail, search]);

    return (
        <Card>
            <CardHeader><CardTitle>시급 이력 조회</CardTitle></CardHeader>
            <CardContent>
                {loading ? <div>Loading...</div> : sets.length === 0 ? <div className="text-center text-slate-500 py-8">데이터가 없습니다.</div> : (
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left">
                            <tr>
                                <th className="p-3 font-medium">적용일자</th>
                                <th className="p-3 font-medium text-center">인원수</th>
                                <th className="p-3 font-medium text-right">등록일시</th>
                                <th className="p-3 font-medium text-center">관리</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {sets.map((s) => (
                                <tr key={s.id} className="hover:bg-slate-50">
                                    <td className="p-3 font-mono font-bold text-blue-600">{s.effective_date}</td>
                                    <td className="p-3 text-center">{s.item_count}명</td>
                                    <td className="p-3 text-right text-slate-500 text-xs">{new Date(s.created_at).toLocaleString()}</td>
                                    <td className="p-3 text-center flex justify-center gap-2">
                                        <Dialog onOpenChange={open => !open && setSelectedId(null)}>
                                            <DialogTrigger asChild>
                                                <Button size="sm" variant="ghost" onClick={() => setSelectedId(s.id)}><Eye size={14} /></Button>
                                            </DialogTrigger>
                                            <DialogContent className="max-w-[800px] h-[80vh] flex flex-col">
                                                <DialogHeader>
                                                    <DialogTitle>{s.effective_date} 시급 상세</DialogTitle>
                                                </DialogHeader>
                                                {detail ? (
                                                    <div className="flex-1 flex flex-col min-h-0 space-y-4">
                                                        <div className="relative">
                                                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                                                            <input type="text" placeholder="이름 검색" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 w-full border rounded-md text-sm" />
                                                        </div>
                                                        <div className="flex-1 overflow-auto border rounded-md">
                                                            <table className="w-full text-xs text-left">
                                                                <thead className="bg-slate-50 sticky top-0">
                                                                    <tr>
                                                                        <th className="p-2 border-b">이름 (사번)</th>
                                                                        <th className="p-2 border-b text-right">시급</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y">
                                                                    {filteredItems.map((item: any) => (
                                                                        <tr key={item.id}>
                                                                            <td className="p-2">{item.employee_name} <span className="text-slate-400">({item.employee_code || '-'})</span></td>
                                                                            <td className="p-2 text-right font-mono flex items-center justify-end gap-2">
                                                                                {editingId === item.id ? (
                                                                                    <div className="flex items-center gap-1">
                                                                                        <input
                                                                                            type="number"
                                                                                            value={editingValue}
                                                                                            onChange={e => setEditingValue(e.target.value)}
                                                                                            className="w-20 border rounded px-1 py-0.5 text-right"
                                                                                            autoFocus
                                                                                        />
                                                                                        <Button size="sm" className="h-6 px-2 text-xs" onClick={handleSaveEdit}>확인</Button>
                                                                                        <Button size="sm" variant="ghost" className="h-6 px-1 text-xs" onClick={() => setEditingId(null)}>취소</Button>
                                                                                    </div>
                                                                                ) : (
                                                                                    <div className="flex items-center gap-2 group">
                                                                                        <span>{item.amount.toLocaleString()}</span>
                                                                                        <Button size="sm" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100 p-0 text-slate-400 hover:text-blue-600" onClick={() => handleStartEdit(item)}>
                                                                                            <Edit2 className="w-3 h-3" />
                                                                                        </Button>
                                                                                    </div>
                                                                                )}
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                ) : <div className="p-8 text-center">로딩 중...</div>}
                                            </DialogContent>
                                        </Dialog>
                                        <Button size="sm" variant="ghost" className="text-red-500" onClick={() => handleDelete(s.id, s.effective_date)}><Trash2 size={14} /></Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </CardContent>
        </Card>
    );
};
