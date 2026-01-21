
import { useState, useEffect } from "react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Clock, Shield, AlertTriangle, Plus, Trash2, Calendar, Briefcase, Coins, LayoutList } from "lucide-react";
import { cn } from "@/lib/utils";

import { useData } from "../contexts/DataContext";

// --- Types ---
interface WorkPolicy {
    id: string;
    effective_date: string;
    standard_start_time: string;
    standard_end_time: string;
    break_time_4h_deduction: number;
    break_time_8h_deduction: number;
    clock_in_grace_minutes: number;
    clock_in_cutoff_time: string | null;
    clock_out_cutoff_time: string | null;
    max_weekly_overtime_minutes: number;
    weekly_basic_work_minutes: number;
}

interface WagePolicy {
    id?: string;
    name: string;
    effective_date: string;
    base_multiplier: number;
    special_work_multiplier: number;
    night_work_multiplier: number;
}


// --- Helper Component: TimeInput ---
const TimeInput = ({ value, onChange, label }: { value: string; onChange: (val: string) => void; label?: string }) => {
    const [h, setH] = useState(value ? value.split(':')[0] : "00");
    const [m, setM] = useState(value ? value.split(':')[1] : "00");

    useEffect(() => {
        if (value) {
            const [vh, vm] = value.split(':');
            setH(vh || "00");
            setM(vm || "00");
        }
    }, [value]);

    const handleChange = (type: 'h' | 'm', val: string) => {
        let cleanVal = val.replace(/[^0-9]/g, '');
        if (cleanVal.length > 2) cleanVal = cleanVal.slice(0, 2);

        if (type === 'h') setH(cleanVal);
        else setM(cleanVal);
    };

    const handleBlur = () => {
        let numH = parseInt(h || "0");
        let numM = parseInt(m || "0");

        if (isNaN(numH)) numH = 0;
        if (isNaN(numM)) numM = 0;

        numH = Math.max(0, Math.min(23, numH));
        numM = Math.max(0, Math.min(59, numM));

        const finalH = String(numH).padStart(2, '0');
        const finalM = String(numM).padStart(2, '0');

        setH(finalH);
        setM(finalM);
        onChange(`${finalH}:${finalM}`);
    };

    return (
        <div className="flex items-center gap-2">
            <div className="flex flex-col items-center">
                <Input
                    type="text"
                    value={h}
                    onChange={e => handleChange('h', e.target.value)}
                    onBlur={handleBlur}
                    className="w-16 text-center"
                    placeholder="HH"
                    inputMode="numeric"
                />
            </div>
            <span className="font-bold">:</span>
            <div className="flex flex-col items-center">
                <Input
                    type="text"
                    value={m}
                    onChange={e => handleChange('m', e.target.value)}
                    onBlur={handleBlur}
                    className="w-16 text-center"
                    placeholder="MM"
                    inputMode="numeric"
                />
            </div>
            <span className="text-xs text-slate-400 ml-1">(24H)</span>
        </div>
    );
};

export const SettingsPage = () => {
    const { refreshPolicies } = useData();
    // Top Level Tabs
    const [activeTab, setActiveTab] = useState<'attendance' | 'allowance' | 'wage'>('attendance');

    // --- Tab 1: Attendance Policy State ---
    const [policies, setPolicies] = useState<WorkPolicy[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [newPolicy, setNewPolicy] = useState<Partial<WorkPolicy>>({
        effective_date: new Date().toISOString().slice(0, 10),
        standard_start_time: "09:00",
        standard_end_time: "18:00",
        break_time_4h_deduction: 30,
        break_time_8h_deduction: 60,
        clock_in_grace_minutes: 0,
        clock_in_cutoff_time: "",
        clock_out_cutoff_time: "",
        max_weekly_overtime_minutes: 720,
        weekly_basic_work_minutes: 2400
    });

    // --- Tab 2: Allowance Policy State ---
    const [policySets, setPolicySets] = useState<any[]>([]);
    const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
    const [currentSetItems, setCurrentSetItems] = useState<any[]>([]);
    const [currentEffectiveDate, setCurrentEffectiveDate] = useState(new Date().toISOString().slice(0, 10));

    // --- Tab 3: Wage Policy State ---
    const [wagePolicies, setWagePolicies] = useState<WagePolicy[]>([]);
    const [selectedWagePolicyId, setSelectedWagePolicyId] = useState<string | null>(null);
    const [currentWagePolicy, setCurrentWagePolicy] = useState<WagePolicy>({
        name: '',
        effective_date: new Date().toISOString().slice(0, 10),
        base_multiplier: 1.0,
        special_work_multiplier: 1.5,
        night_work_multiplier: 0.5
    });

    // Initial Fetch
    useEffect(() => {
        fetchPolicies();
        fetchSpecialPolicySets();
        fetchWagePolicies();
    }, []);

    // --- API Interactions: Attendance ---
    const fetchPolicies = async () => {
        try {
            const userStr = localStorage.getItem('user');
            if (userStr) {
                const user = JSON.parse(userStr);
                const companyId = user.company_id;
                if (companyId) {
                    const res = await fetch(`/api/policies?companyId=${companyId}`);
                    const data = await res.json() as any;
                    setPolicies(data);
                }
            }
        } catch (error) {
            console.error("Failed to fetch policies:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("정말 이 정책을 삭제하시겠습니까?")) return;
        try {
            const res = await fetch(`/api/policies?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                fetchPolicies();
                refreshPolicies();
            }
            else alert("삭제 실패");
        } catch (error) {
            console.error(error);
        }
    };

    const handleSaveNew = async () => {
        try {
            const payload = {
                ...newPolicy,
                breakTime4hDeduction: newPolicy.break_time_4h_deduction,
                breakTime8hDeduction: newPolicy.break_time_8h_deduction,
                clockInGraceMinutes: newPolicy.clock_in_grace_minutes,
                clockInCutoffTime: newPolicy.clock_in_cutoff_time || null,
                clockOutCutoffTime: newPolicy.clock_out_cutoff_time || null,
                maxWeeklyOvertimeMinutes: newPolicy.max_weekly_overtime_minutes,
                weeklyBasicWorkMinutes: newPolicy.weekly_basic_work_minutes,
                standardStartTime: newPolicy.standard_start_time,
                standardEndTime: newPolicy.standard_end_time,
                effectiveDate: newPolicy.effective_date,
            };

            const isUpdate = !!newPolicy.id;

            const userStr = localStorage.getItem('user');
            const user = userStr ? JSON.parse(userStr) : {};
            const companyId = user.company_id;

            const res = await fetch('/api/policies', {
                method: isUpdate ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...payload, companyId })
            });

            if (res.ok) {
                alert(isUpdate ? "수정되었습니다." : "생성되었습니다.");
                setIsCreating(false);
                fetchPolicies();
                refreshPolicies();
            } else {
                const err = await res.json() as any;
                alert("저장 실패: " + err.error);
            }
        } catch (error) {
            alert("저장 중 오류가 발생했습니다.");
        }
    };

    // --- API Interactions: Allowance ---
    const fetchSpecialPolicySets = async () => {
        try {
            const userStr = localStorage.getItem('user');
            if (userStr) {
                const user = JSON.parse(userStr);
                const companyId = user.company_id;
                if (companyId) {
                    const res = await fetch(`/api/settings/special-work?companyId=${companyId}`);
                    const data = await res.json() as any;
                    setPolicySets(data);
                    if (data.length > 0 && !selectedSetId) {
                        selectSet(data[0]);
                    } else if (data.length === 0) {
                        setCurrentSetItems([
                            { id: crypto.randomUUID(), name: '정규 특근', code: 'REGULAR', symbol: '◎', rate: 70000 },
                            { id: crypto.randomUUID(), name: '재택 근무', code: 'REMOTE', symbol: '★', rate: 50000 }
                        ]);
                    }
                }
            }
        } catch (error) { console.error(error); }
    };

    const selectSet = (set: any) => {
        setSelectedSetId(set.id);
        setCurrentEffectiveDate(set.effective_date);
        setCurrentSetItems(set.items || []);
    };

    const handleCreateNewSet = () => {
        setSelectedSetId(null);
        setCurrentEffectiveDate(new Date().toISOString().slice(0, 10));
        if (policySets.length > 0) {
            const latest = policySets[0];
            setCurrentSetItems(latest.items.map((i: any) => ({ ...i, id: crypto.randomUUID() })));
        } else {
            setCurrentSetItems([
                { id: crypto.randomUUID(), name: '정규 특근', code: 'REGULAR', symbol: '◎', rate: 70000 },
                { id: crypto.randomUUID(), name: '재택 근무', code: 'REMOTE', symbol: '★', rate: 50000 }
            ]);
        }
    };

    const handleSaveCurrentSet = async () => {
        try {
            const userStr = localStorage.getItem('user');
            const user = userStr ? JSON.parse(userStr) : {};
            const companyId = user.company_id;

            const res = await fetch('/api/settings/special-work', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    companyId: companyId || 'comp_eluon',
                    effectiveDate: currentEffectiveDate,
                    items: currentSetItems
                })
            });
            if (res.ok) {
                alert("저장되었습니다.");
                setIsCreating(false); // Close form
                fetchSpecialPolicySets();
            } else {
                alert("저장 실패");
            }
        } catch (e) {
            alert("오류 발생");
        }
    };

    const handleDeleteSet = async (setId: string) => {
        // NOTE: Currently backend DELETE for set is not implemented in previous steps. 
        // We will add a quick implementation or just mock it, but user asked for UI Redesign. 
        // I should probably support it if I added the button.
        // Let's rely on the POST (Upsert) for now, but to really DELETE a set we need an endpoint.
        // For this step I will leave it as alert since backend wasn't requested to change.
        // Wait, I should do it right. Let's add DELETE support to the API too?
        // Actually, the user's prompt was UI redesign. I'll just alert for now or try to call delete.
        // Let's implement DELETE in the API in the next step if needed. 
        // For now, I will use a placeholder or check if I can add it.
        // Actually, I can allow "Editing" old sets by selecting them (which I did in the list click handler).
        // But true DELETE needs API. I will add the function signature but maybe not fetch yet if API missing.
        // Oh, I see I used 'handleDeleteSet' in the code. I should implement it.

        // Let's assuming I'll update the API or just hide the button if not supported. 
        // But better to support it. I'll add the API change call next.
        // Here is the frontend function:

        if (!confirm("이 정책을 삭제하시겠습니까? (복구 불가)")) return;

        try {
            const res = await fetch(`/api/settings/special-work?id=${setId}`, { method: 'DELETE' });
            if (res.ok) fetchSpecialPolicySets();
            else alert("삭제 실패 (지원되지 않는 기능이거나 오류)");
        } catch (e) { console.error(e); }
    };

    const updateItem = (idx: number, field: string, val: any) => {
        const newItems = [...currentSetItems];
        newItems[idx] = { ...newItems[idx], [field]: val };
        setCurrentSetItems(newItems);
    };

    // --- API Interactions: Wage Policy ---
    const fetchWagePolicies = async () => {
        try {
            const userStr = localStorage.getItem('user');
            if (userStr) {
                const user = JSON.parse(userStr);
                const companyId = user.company_id;
                if (companyId) {
                    const res = await fetch(`/api/settings/wage-policies?companyId=${companyId}`);
                    const data = await res.json() as any;
                    setWagePolicies(data);
                    if (data.length > 0 && !selectedWagePolicyId) {
                        selectWagePolicy(data[0]);
                    } else if (data.length === 0) {
                        // Defaults
                        setCurrentWagePolicy({
                            name: '기본 시급 정책',
                            effective_date: new Date().toISOString().slice(0, 10),
                            base_multiplier: 1.0,
                            special_work_multiplier: 1.5,
                            night_work_multiplier: 0.5
                        });
                    }
                }
            }
        } catch (error) { console.error(error); }
    };

    const selectWagePolicy = (policy: WagePolicy) => {
        setSelectedWagePolicyId(policy.id || null);
        setCurrentWagePolicy(policy);
    };

    const handleCreateNewWagePolicy = () => {
        setSelectedWagePolicyId(null);
        setCurrentWagePolicy({
            name: '시급 정책',
            effective_date: new Date().toISOString().slice(0, 10),
            base_multiplier: 1.0,
            special_work_multiplier: 1.5,
            night_work_multiplier: 0.5
        });
    };

    const handleSaveWagePolicy = async () => {
        try {
            const userStr = localStorage.getItem('user');
            const user = userStr ? JSON.parse(userStr) : {};
            const companyId = user.company_id;

            const res = await fetch('/api/settings/wage-policies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: selectedWagePolicyId, // If null, backend handles insert
                    ...currentWagePolicy,
                    companyId
                })
            });

            if (res.ok) {
                alert("저장되었습니다.");
                setIsCreating(false); // Close form
                fetchWagePolicies();
            } else {
                alert("저장 실패");
            }
        } catch (e) { alert("오류 발생"); }
    };

    const handleDeleteWagePolicy = async (id: string) => {
        if (!confirm("정말 삭제하시겠습니까?")) return;
        try {
            const res = await fetch(`/api/settings/wage-policies?id=${id}`, { method: 'DELETE' });
            if (res.ok) fetchWagePolicies();
            else alert("삭제 실패");
        } catch (e) { console.error(e); }
    };

    return (
        <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-8">
            <header className="mb-4">
                <h2 className="text-3xl font-bold tracking-tight text-slate-900">환경 설정</h2>
                <p className="text-slate-500 mt-2">
                    급여 및 근태 관리에 필요한 정책과 규칙을 정의합니다.
                </p>
            </header>

            {/* Tabs Navigation */}
            <div className="flex items-center space-x-1 border-b border-slate-200">
                <button
                    onClick={() => { setActiveTab('attendance'); setIsCreating(false); }}
                    className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2",
                        activeTab === 'attendance'
                            ? "border-indigo-600 text-indigo-600"
                            : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                    )}
                >
                    <Clock className="w-4 h-4" />
                    근태 규정
                </button>
                <button
                    onClick={() => { setActiveTab('allowance'); setIsCreating(false); }}
                    className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2",
                        activeTab === 'allowance'
                            ? "border-indigo-600 text-indigo-600"
                            : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                    )}
                >
                    <Coins className="w-4 h-4" />
                    수당 정책 (항목)
                </button>
                <button
                    onClick={() => { setActiveTab('wage'); setIsCreating(false); }}
                    className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2",
                        activeTab === 'wage'
                            ? "border-indigo-600 text-indigo-600"
                            : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                    )}
                >
                    <LayoutList className="w-4 h-4" />
                    시급/배율 설정
                </button>
            </div>

            <div className="pt-4">
                {/* --- TAB 1: Attendance Config --- */}
                {activeTab === 'attendance' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">근태 규칙 정의</h3>
                                <p className="text-sm text-slate-500">근무 시간, 지각 허용, 휴게 시간 정책을 관리합니다.</p>
                            </div>
                            <Button onClick={() => {
                                if (!isCreating) {
                                    // Reset to defaults when opening create form
                                    setNewPolicy({
                                        effective_date: new Date().toISOString().slice(0, 10),
                                        standard_start_time: "09:00",
                                        standard_end_time: "18:00",
                                        break_time_4h_deduction: 30,
                                        break_time_8h_deduction: 60,
                                        clock_in_grace_minutes: 0,
                                        clock_in_cutoff_time: "",
                                        clock_out_cutoff_time: "",
                                        max_weekly_overtime_minutes: 720,
                                        weekly_basic_work_minutes: 2400
                                    });
                                }
                                setIsCreating(!isCreating);
                            }} variant={isCreating ? "destructive" : "default"} className={!isCreating ? "bg-indigo-600 hover:bg-indigo-700" : ""}>
                                {isCreating ? "작성 취소" : <><Plus className="w-4 h-4 mr-2" /> 새 정책 추가</>}
                            </Button>
                        </div>


                        {isCreating && (
                            <Card className="bg-white border-indigo-100 shadow-md">
                                <CardHeader className="bg-indigo-50/30 pb-4 border-b border-indigo-50">
                                    <CardTitle className="text-base text-indigo-900 flex items-center gap-2">
                                        <Calendar className="w-4 h-4" /> 새 정책 적용일 설정
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6 space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        {/* Row 1 */}
                                        <div className="space-y-4">
                                            <Label>적용 시작일</Label>
                                            <Input type="date" value={newPolicy.effective_date} onChange={e => setNewPolicy({ ...newPolicy, effective_date: e.target.value })} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-4 tab-section">
                                                <Label>출근 시간</Label>
                                                <TimeInput value={newPolicy.standard_start_time || "09:00"} onChange={v => setNewPolicy({ ...newPolicy, standard_start_time: v })} />
                                            </div>
                                            <div className="space-y-4">
                                                <Label>퇴근 시간 <span className="text-xs font-normal text-slate-400 ml-1">(24시간제)</span></Label>
                                                <div className="flex items-center gap-2">
                                                    <TimeInput value={newPolicy.standard_end_time || "18:00"} onChange={v => setNewPolicy({ ...newPolicy, standard_end_time: v })} />
                                                    {newPolicy.standard_start_time && newPolicy.standard_end_time && newPolicy.standard_end_time < newPolicy.standard_start_time && (
                                                        <span className="text-xs text-amber-600 font-bold whitespace-nowrap ml-2">+1일 (익일)</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="border-t border-slate-100 pt-4">
                                        <h4 className="font-medium text-slate-700 mb-3 flex items-center gap-2"><Briefcase className="w-4 h-4" /> 휴게 및 초과근무</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                            <div className="border p-4 rounded-lg space-y-3">
                                                <Label className="text-xs text-slate-500 uppercase font-bold">휴게 공제</Label>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm">4시간 근무시</span>
                                                    <div className="flex items-center gap-1"><Input className="w-16 h-8 text-right" type="number" value={newPolicy.break_time_4h_deduction} onChange={(e) => setNewPolicy({ ...newPolicy, break_time_4h_deduction: Number(e.target.value) })} /> <span className="text-xs">분</span></div>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm">8시간 근무시</span>
                                                    <div className="flex items-center gap-1"><Input className="w-16 h-8 text-right" type="number" value={newPolicy.break_time_8h_deduction} onChange={(e) => setNewPolicy({ ...newPolicy, break_time_8h_deduction: Number(e.target.value) })} /> <span className="text-xs">분</span></div>
                                                </div>
                                            </div>
                                            <div className="border p-4 rounded-lg space-y-3">
                                                <Label className="text-xs text-slate-500 uppercase font-bold">유예/절사/인정</Label>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm">지각 유예</span>
                                                    <div className="flex items-center gap-1"><Input className="w-16 h-8 text-right" type="number" value={newPolicy.clock_in_grace_minutes} onChange={(e) => setNewPolicy({ ...newPolicy, clock_in_grace_minutes: Number(e.target.value) })} /> <span className="text-xs">분</span></div>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm">출근 인정 시작</span>
                                                    <TimeInput value={newPolicy.clock_in_cutoff_time || ""} onChange={v => setNewPolicy({ ...newPolicy, clock_in_cutoff_time: v })} />
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm">퇴근 인정 종료</span>
                                                    <TimeInput value={newPolicy.clock_out_cutoff_time || ""} onChange={v => setNewPolicy({ ...newPolicy, clock_out_cutoff_time: v })} />
                                                </div>
                                            </div>
                                            <div className="border p-4 rounded-lg space-y-3">
                                                <Label className="text-xs text-slate-500 uppercase font-bold">근로 한도 (주간)</Label>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm">기본 근로</span>
                                                    <div className="flex items-center gap-1"><Input className="w-16 h-8 text-right" value={(newPolicy.weekly_basic_work_minutes || 0) / 60} onChange={(e) => setNewPolicy({ ...newPolicy, weekly_basic_work_minutes: Number(e.target.value) * 60 })} /> <span className="text-xs">시간</span></div>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm text-amber-600 font-medium">연장 한도</span>
                                                    <div className="flex items-center gap-1"><Input className="w-16 h-8 text-right" value={(newPolicy.max_weekly_overtime_minutes || 0) / 60} onChange={(e) => setNewPolicy({ ...newPolicy, max_weekly_overtime_minutes: Number(e.target.value) * 60 })} /> <span className="text-xs">시간</span></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex justify-end">
                                        <Button onClick={handleSaveNew} className="bg-indigo-600 px-8">저장하기</Button>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* List */}
                        <div className="space-y-3">
                            {policies.map(p => {
                                const today = new Date().toISOString().slice(0, 10);
                                const isActive = p.effective_date <= today &&
                                    (!policies.some(other => other.effective_date <= today && other.effective_date > p.effective_date));

                                return (
                                    <div
                                        key={p.id}
                                        className={cn("p-4 rounded-lg border flex items-center justify-between group bg-white cursor-pointer hover:border-indigo-300 transition-colors", isActive ? "border-indigo-500 shadow-sm ring-1 ring-indigo-500" : "border-slate-200")}
                                        onClick={() => {
                                            setNewPolicy({ ...p });
                                            setIsCreating(true);
                                            window.scrollTo({ top: 0, behavior: 'smooth' });
                                        }}
                                    >
                                        <div className="flex items-center gap-4 pointer-events-none">
                                            <div className={cn("w-2 h-12 rounded-full", isActive ? "bg-indigo-500" : "bg-slate-200")}></div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-slate-800 text-lg">{p.effective_date} ~</span>
                                                    {isActive && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">Active</span>}
                                                </div>
                                                <div className="text-sm text-slate-500 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                                                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {p.standard_start_time} - {p.standard_end_time}</span>
                                                    <span className="text-slate-300">|</span>
                                                    <span>휴게: {p.break_time_4h_deduction}/{p.break_time_8h_deduction}분</span>
                                                    <span className="text-slate-300">|</span>
                                                    <span>유예: {p.clock_in_grace_minutes}분</span>
                                                    <span className="text-slate-300">|</span>
                                                    <span>기본: {(p.weekly_basic_work_minutes || 2400) / 60}H</span>
                                                </div>
                                            </div>
                                        </div>
                                        <Button variant="ghost" size="icon" onClick={(e) => {
                                            e.stopPropagation();
                                            handleDelete(p.id);
                                        }} className="text-slate-400 hover:text-red-500 hover:bg-red-50"><Trash2 className="w-4 h-4" /></Button>
                                    </div>
                                );

                            })}
                        </div>
                    </div>
                )}

                {/* --- TAB 2: Allowance Config --- */}
                {activeTab === 'allowance' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">수당 정책 정의</h3>
                                <p className="text-sm text-slate-500">특근, 재택 근무 등 수당 지급 기준과 금액을 관리합니다.</p>
                            </div>
                            <Button onClick={() => setIsCreating(!isCreating)} variant={isCreating ? "destructive" : "default"} className={!isCreating ? "bg-indigo-600 hover:bg-indigo-700" : ""}>
                                {isCreating ? "작성 취소" : <><Plus className="w-4 h-4 mr-2" /> 새 정책 추가</>}
                            </Button>
                        </div>

                        {/* Creation / Edit Form */}
                        {isCreating && (
                            <Card className="bg-white border-indigo-100 shadow-md">
                                <CardHeader className="bg-indigo-50/30 pb-4 border-b border-indigo-50">
                                    <CardTitle className="text-base text-indigo-900 flex items-center gap-2">
                                        <Calendar className="w-4 h-4" /> 새 수당 정책 적용일 설정
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6 space-y-6">
                                    <div className="space-y-4">
                                        <Label>적용 시작일</Label>
                                        <Input type="date" value={currentEffectiveDate} onChange={e => setCurrentEffectiveDate(e.target.value)} className="w-full md:w-1/3" />
                                    </div>

                                    <div className="border rounded-lg overflow-hidden">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
                                                <tr>
                                                    <th className="px-6 py-3">항목명</th>
                                                    <th className="px-6 py-3">코드</th>
                                                    <th className="px-6 py-3 text-center">심볼</th>
                                                    <th className="px-6 py-3 text-right">단가</th>
                                                    <th className="px-6 py-3 text-center">삭제</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 bg-white">
                                                {currentSetItems.map((item, idx) => (
                                                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                                                        <td className="px-6 py-2"><Input value={item.name} onChange={e => updateItem(idx, 'name', e.target.value)} className="h-9 border-slate-200" /></td>
                                                        <td className="px-6 py-2"><Input value={item.code} onChange={e => updateItem(idx, 'code', e.target.value)} className="h-9 border-slate-200 font-mono text-xs uppercase text-slate-600" /></td>
                                                        <td className="px-6 py-2"><Input value={item.symbol} onChange={e => updateItem(idx, 'symbol', e.target.value)} className="h-9 w-14 text-center mx-auto border-slate-200" /></td>
                                                        <td className="px-6 py-2">
                                                            <div className="flex items-center justify-end gap-2">
                                                                <Input type="number" value={item.rate} onChange={e => updateItem(idx, 'rate', parseInt(e.target.value))} className="h-9 w-28 text-right border-slate-200 font-medium" />
                                                                <span className="text-slate-400">원</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-2 text-center">
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50" onClick={() => {
                                                                const next = [...currentSetItems];
                                                                next.splice(idx, 1);
                                                                setCurrentSetItems(next);
                                                            }}><Trash2 className="w-4 h-4" /></Button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        <div className="p-4 bg-slate-50/30 border-t border-slate-100">
                                            <Button variant="outline" size="sm" className="w-full border-dashed text-slate-500 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50" onClick={() => {
                                                setCurrentSetItems([...currentSetItems, { id: crypto.randomUUID(), name: '', code: 'CUSTOM', symbol: '', rate: 0 }]);
                                            }}><Plus className="w-4 h-4 mr-2" /> 새 항목 추가</Button>
                                        </div>
                                    </div>
                                    <div className="flex justify-end">
                                        <Button onClick={handleSaveCurrentSet} className="bg-indigo-600 px-8">저장하기</Button>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* Policy List */}
                        <div className="space-y-3">
                            {policySets.map(set => {
                                const today = new Date().toISOString().slice(0, 10);
                                const isActive = set.effective_date <= today &&
                                    (!policySets.some(other => other.effective_date <= today && other.effective_date > set.effective_date));

                                return (
                                    <div key={set.id}
                                        className={cn("p-4 rounded-lg border flex items-center justify-between group bg-white transition-all",
                                            isActive ? "border-indigo-500 shadow-sm ring-1 ring-indigo-500" : "border-slate-200 hover:border-indigo-200"
                                        )}
                                    >
                                        <div className="flex items-center gap-4 cursor-pointer flex-1" onClick={() => {
                                            selectSet(set);
                                            setIsCreating(true);
                                            window.scrollTo({ top: 0, behavior: 'smooth' });
                                        }}>
                                            <div className={cn("w-2 h-12 rounded-full", isActive ? "bg-indigo-500" : "bg-slate-200")}></div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-slate-800 text-lg">{set.effective_date} ~</span>
                                                    {isActive && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">Active</span>}
                                                </div>
                                                <div className="text-sm text-slate-500 mt-1">
                                                    등록된 수당 항목: <span className="font-medium text-slate-700">{set.items?.length || 0}개</span>
                                                    <span className="text-slate-300 mx-2">|</span>
                                                    <span className="text-slate-400">
                                                        {set.items?.map((i: any) => i.name).slice(0, 3).join(", ")}
                                                        {(set.items?.length || 0) > 3 && "..."}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity" onClick={(e) => {
                                            e.stopPropagation();
                                            // TODO: Add delete functionality for sets if needed
                                            if (confirm("정말 삭제하시겠습니까?")) {
                                                // Call delete API (Need implementation if not exists, but for now UI only)
                                                // For now just alert or implement simple delete
                                                handleDeleteSet(set.id);
                                            }
                                        }}>
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                );
                            })}
                            {policySets.length === 0 && !loading && (
                                <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                                    <p className="text-slate-500">등록된 수당 정책이 없습니다.</p>
                                    <Button variant="link" onClick={() => setIsCreating(true)}>첫 번째 정책 만들기</Button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                {/* --- TAB 3: Wage Policy Config --- */}
                {activeTab === 'wage' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">시급/배율 정책 정의</h3>
                                <p className="text-sm text-slate-500">기본 시급, 특근 및 야근 수당의 배율을 관리합니다.</p>
                            </div>
                            <Button onClick={() => {
                                if (!isCreating) {
                                    handleCreateNewWagePolicy();
                                }
                                setIsCreating(!isCreating);
                            }} variant={isCreating ? "destructive" : "default"} className={!isCreating ? "bg-indigo-600 hover:bg-indigo-700" : ""}>
                                {isCreating ? "작성 취소" : <><Plus className="w-4 h-4 mr-2" /> 새 정책 추가</>}
                            </Button>
                        </div>

                        {/* Creation / Edit Form */}
                        {isCreating && (
                            <Card className="bg-white border-indigo-100 shadow-md">
                                <CardHeader className="bg-indigo-50/30 pb-4 border-b border-indigo-50">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base text-indigo-900 flex items-center gap-2">
                                            <Calendar className="w-4 h-4" /> {selectedWagePolicyId ? '정책 수정' : '새 정책 설정'}
                                        </CardTitle>
                                        {selectedWagePolicyId && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDeleteWagePolicy(selectedWagePolicyId!)}
                                                className="text-red-500 hover:bg-red-50 hover:text-red-600"
                                            >
                                                <Trash2 className="w-4 h-4 mr-1" /> 삭제
                                            </Button>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent className="p-6 space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                                        <div className="space-y-2">
                                            <Label className="text-sm font-semibold text-slate-700">적용 시작일</Label>
                                            <div className="relative">
                                                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                                <Input
                                                    type="date"
                                                    value={currentWagePolicy.effective_date}
                                                    onChange={(e) => setCurrentWagePolicy({ ...currentWagePolicy, effective_date: e.target.value })}
                                                    className="pl-9 bg-white font-mono"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-slate-50/50 p-6 rounded-lg border border-slate-200">
                                        <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                                            <Coins className="w-4 h-4 text-indigo-500" />
                                            배율 설정 (Multiplier)
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                            <div className="space-y-2">
                                                <Label className="text-xs text-slate-500">기본 시급 배율 (Base)</Label>
                                                <div className="relative">
                                                    <Input
                                                        type="number"
                                                        step="0.1"
                                                        value={currentWagePolicy.base_multiplier}
                                                        onChange={(e) => setCurrentWagePolicy({ ...currentWagePolicy, base_multiplier: parseFloat(e.target.value) })}
                                                        className="bg-white font-mono text-center pr-8"
                                                    />
                                                    <span className="absolute right-3 top-2.5 text-sm text-slate-400">x</span>
                                                </div>
                                                <p className="text-[10px] text-slate-400 text-center">통상 1.0</p>
                                            </div>

                                            <div className="space-y-2">
                                                <Label className="text-xs text-blue-600 font-bold">특근 수당 배율 (Special)</Label>
                                                <div className="relative">
                                                    <Input
                                                        type="number"
                                                        step="0.1"
                                                        value={currentWagePolicy.special_work_multiplier}
                                                        onChange={(e) => setCurrentWagePolicy({ ...currentWagePolicy, special_work_multiplier: parseFloat(e.target.value) })}
                                                        className="bg-blue-50 border-blue-200 text-blue-700 font-bold text-center font-mono pr-8"
                                                    />
                                                    <span className="absolute right-3 top-2.5 text-sm text-blue-400">x</span>
                                                </div>
                                                <p className="text-[10px] text-slate-400 text-center">통상 1.5</p>
                                            </div>

                                            <div className="space-y-2">
                                                <Label className="text-xs text-purple-600 font-bold">야간 수당 배율 (Night)</Label>
                                                <div className="relative">
                                                    <Input
                                                        type="number"
                                                        step="0.1"
                                                        value={currentWagePolicy.night_work_multiplier}
                                                        onChange={(e) => setCurrentWagePolicy({ ...currentWagePolicy, night_work_multiplier: parseFloat(e.target.value) })}
                                                        className="bg-purple-50 border-purple-200 text-purple-700 font-bold text-center font-mono pr-8"
                                                    />
                                                    <span className="absolute right-3 top-2.5 text-sm text-purple-400">x</span>
                                                </div>
                                                <p className="text-[10px] text-slate-400 text-center">통상 2.0</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-end pt-4 border-t border-slate-100">
                                        <Button onClick={handleSaveWagePolicy} className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[120px]">
                                            {selectedWagePolicyId ? '변경사항 저장' : '정책 생성하기'}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* Policy List */}
                        <div className="space-y-3">
                            {wagePolicies.map((policy) => {
                                const today = new Date().toISOString().slice(0, 10);
                                const isActive = policy.effective_date <= today &&
                                    (!wagePolicies.some(other => other.effective_date <= today && other.effective_date > policy.effective_date));

                                return (
                                    <div
                                        key={policy.id}
                                        onClick={() => {
                                            selectWagePolicy(policy);
                                            setIsCreating(true);
                                            window.scrollTo({ top: 0, behavior: 'smooth' });
                                        }}
                                        className={cn("p-4 rounded-lg border flex items-center justify-between group bg-white cursor-pointer hover:border-indigo-300 transition-colors",
                                            isActive ? "border-indigo-500 shadow-sm ring-1 ring-indigo-500" : "border-slate-200"
                                        )}
                                    >
                                        <div className="flex items-center gap-4 pointer-events-none">
                                            <div className={cn("w-2 h-12 rounded-full", isActive ? "bg-indigo-500" : "bg-slate-200")}></div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-slate-800 text-lg">{policy.effective_date} ~</span>
                                                    {isActive && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">Active</span>}

                                                </div>
                                                <div className="text-sm text-slate-500 mt-1 flex gap-4">
                                                    <span>기본: <span className="font-mono text-slate-700">{policy.base_multiplier}x</span></span>
                                                    <span className="text-slate-300">|</span>
                                                    <span>특근: <span className="font-mono text-blue-600 font-bold">{policy.special_work_multiplier}x</span></span>
                                                    <span className="text-slate-300">|</span>
                                                    <span>야간: <span className="font-mono text-purple-600 font-bold">{policy.night_work_multiplier}x</span></span>
                                                </div>
                                            </div>
                                        </div>
                                        <Button variant="ghost" size="icon" onClick={(e) => {
                                            e.stopPropagation();
                                            if (policy.id) handleDeleteWagePolicy(policy.id);
                                        }} className="text-slate-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                );
                            })}
                            {wagePolicies.length === 0 && (
                                <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                                    <p className="text-slate-500">등록된 정책이 없습니다.</p>
                                    <Button variant="link" onClick={() => {
                                        handleCreateNewWagePolicy();
                                        setIsCreating(true);
                                    }}>첫 번째 정책 만들기</Button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
