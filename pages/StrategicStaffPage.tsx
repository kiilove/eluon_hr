import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Plus, RefreshCw, UserCheck, ShieldAlert, MoreHorizontal, Pencil, Trash2, Calendar, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { useData } from '@/contexts/DataContext';

interface ProjectStaff {
    id: string;
    name: string;
    employee_code: string;
    target_persona: string;
    daily_work_hours: string; // Display purposes
    work_start_time: string;
    work_end_time: string;
    risk_level: 'low' | 'high';
}

interface LeaveRecord {
    id: string;
    leave_date: string;
    reason: string;
}

export const StrategicStaffPage = () => {
    const [staff, setStaff] = useState<ProjectStaff[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Scenario State
    const [scenario, setScenario] = useState('month_end');

    // Staff Dialog State
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingStaff, setEditingStaff] = useState<ProjectStaff | null>(null);
    const [formData, setFormData] = useState<Partial<ProjectStaff> & { scenario?: string }>({
        name: '', employee_code: '', target_persona: '',
        work_start_time: '09:00', work_end_time: '18:00',
        daily_work_hours: '09:00-18:00', risk_level: 'low', scenario: 'month_end'
    });

    // Leave Dialog State
    const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
    const [selectedStaffForLeave, setSelectedStaffForLeave] = useState<ProjectStaff | null>(null);
    const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
    const [isLoadingLeaves, setIsLoadingLeaves] = useState(false);

    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    const companyId = user?.company_id || 'comp_eluon';

    const fetchStaff = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/strategic?companyId=${companyId}`);
            if (res.ok) {
                const data = await res.json();
                setStaff(data);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchLeaves = async (staffId: string) => {
        setIsLoadingLeaves(true);
        try {
            const res = await fetch(`/api/strategic/leaves?staffId=${staffId}`);
            if (res.ok) {
                const data = await res.json();
                setLeaves(data);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoadingLeaves(false);
        }
    };

    useEffect(() => {
        fetchStaff();
    }, [companyId]);

    const handleOpenDialog = (staffToEdit?: ProjectStaff) => {
        if (staffToEdit) {
            setEditingStaff(staffToEdit);
            setFormData(staffToEdit);
        } else {
            setEditingStaff(null);
            const randNum = Math.floor(Math.random() * 900) + 100;
            const suggestedCode = `TF-${new Date().getFullYear()}-${randNum}`;
            setFormData({
                name: '', employee_code: suggestedCode, target_persona: '프로젝트 매니저',
                work_start_time: '09:00', work_end_time: '18:00',
                daily_work_hours: '09:00-18:00', risk_level: 'low', scenario: 'month_end'
            });
        }
        setIsDialogOpen(true);
    };

    const handleSave = async () => {
        try {
            const url = editingStaff ? `/api/strategic/${editingStaff.id}` : '/api/strategic';
            const method = editingStaff ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...formData, companyId })
            });

            if (res.ok) {
                setIsDialogOpen(false);
                fetchStaff();
            } else {
                alert('저장에 실패했습니다.');
            }
        } catch (error) {
            console.error(error);
            alert('오류가 발생했습니다.');
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`'${name}' 인력을 삭제하시겠습니까?`)) return;
        try {
            const res = await fetch(`/api/strategic/${id}`, { method: 'DELETE' });
            if (res.ok) fetchStaff();
        } catch (error) {
            console.error(error);
        }
    };

    const handleOpenLeaveDialog = (s: ProjectStaff) => {
        setSelectedStaffForLeave(s);
        setLeaves([]);
        setIsLeaveDialogOpen(true);
        fetchLeaves(s.id);
    };

    const getScenarioName = (key: string) => {
        switch (key) {
            case 'month_end': return '월말 집중형';
            case 'random': return '랜덤 분포형';
            case 'long_vacation': return '장기 휴가형 (하계/동계)';
            case 'bridge_holiday': return '징검다리 연휴형';
            default: return '기본';
        }
    };

    const handleGenerateLeaves = async () => {
        if (!selectedStaffForLeave) return;
        if (!confirm(`${new Date().getFullYear()}년도 정기 연차 계획을 '${getScenarioName(scenario)}' 시나리오로 생성하시겠습니까?\n(기존 계획에 추가됩니다)`)) return;

        try {
            const res = await fetch(`/api/strategic/leaves`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'generate',
                    staffId: selectedStaffForLeave.id,
                    scenario
                })
            });
            if (res.ok) {
                fetchLeaves(selectedStaffForLeave.id);
            }
        } catch (error) {
            console.error(error);
        }
    };

    const handleDeleteLeave = async (id: string) => {
        try {
            const res = await fetch(`/api/strategic/leaves?id=${id}`, { method: 'DELETE' });
            if (res.ok && selectedStaffForLeave) fetchLeaves(selectedStaffForLeave.id);
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">전략 인력 관리 (Project Staff)</h2>
                    <p className="text-muted-foreground mt-1">
                        프로젝트 단위로 투입되는 전략적 파견 인력 현황입니다.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={fetchStaff} disabled={isLoading}>
                        <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                        새로고침
                    </Button>
                    <Button onClick={() => handleOpenDialog()}>
                        <Plus className="w-4 h-4 mr-2" />
                        인력 추가 (Add Staff)
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">총 파견 인력</CardTitle>
                        <UserCheck className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{staff.length}명</div>
                        <p className="text-xs text-muted-foreground">현재 프로젝트 투입 인원</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">관리 필요 인원</CardTitle>
                        <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-destructive">
                            {staff.filter(s => s.risk_level === 'high').length}명
                        </div>
                        <p className="text-xs text-muted-foreground">근태 기록 점검 필요</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="relative w-full overflow-auto">
                        <table className="w-full caption-bottom text-sm text-left">
                            <thead className="[&_tr]:border-b">
                                <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                    <th className="h-12 px-4 align-middle font-medium text-muted-foreground">사번 (Code)</th>
                                    <th className="h-12 px-4 align-middle font-medium text-muted-foreground">이름</th>
                                    <th className="h-12 px-4 align-middle font-medium text-muted-foreground">직무 (Persona)</th>
                                    <th className="h-12 px-4 align-middle font-medium text-muted-foreground">근무 시간</th>
                                    <th className="h-12 px-4 align-middle font-medium text-muted-foreground">상태</th>
                                    <th className="h-12 px-4 align-middle font-medium text-muted-foreground text-right">관리</th>
                                </tr>
                            </thead>
                            <tbody className="[&_tr:last-child]:border-0">
                                {staff.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-muted-foreground">
                                            등록된 전략 인력이 없습니다.
                                        </td>
                                    </tr>
                                ) : (
                                    staff.map((s) => (
                                        <tr key={s.id} className="border-b transition-colors hover:bg-muted/50 bg-white">
                                            <td className="p-4 align-middle font-medium font-mono">{s.employee_code}</td>
                                            <td className="p-4 align-middle">{s.name}</td>
                                            <td className="p-4 align-middle">
                                                <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80">
                                                    {s.target_persona}
                                                </span>
                                            </td>
                                            <td className="p-4 align-middle">{s.daily_work_hours}</td>
                                            <td className="p-4 align-middle">
                                                {s.risk_level === 'high' ? (
                                                    <span className="text-destructive font-bold text-xs">관리 필요</span>
                                                ) : (
                                                    <span className="text-green-600 font-medium text-xs">정상</span>
                                                )}
                                            </td>
                                            <td className="p-4 align-middle text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => handleOpenLeaveDialog(s)}>
                                                        <Calendar className="w-3.5 h-3.5" />
                                                        연차 관리
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(s)}>
                                                        <Pencil className="h-4 w-4 text-zinc-500" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id, s.name)}>
                                                        <Trash2 className="h-4 w-4 text-red-500" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {isDialogOpen && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-background rounded-lg shadow-lg w-full max-w-lg border p-6 space-y-6 animate-in fade-in zoom-in-95 duration-200">
                        <div className="space-y-2">
                            <h3 className="text-lg font-semibold leading-none tracking-tight">
                                {editingStaff ? '인력 정보 수정' : '신규 인력 등록'}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                인력 정보를 입력하고 저장하세요. 사번은 고유해야 합니다.
                            </p>
                        </div>

                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <label className="text-right text-sm font-medium">이름</label>
                                <Input
                                    className="col-span-3"
                                    value={formData.name}
                                    onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                                    placeholder="예: 김전략"
                                />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <label className="text-right text-sm font-medium">관리 사번</label>
                                <Input
                                    className="col-span-3 font-mono"
                                    value={formData.employee_code}
                                    onChange={e => setFormData(p => ({ ...p, employee_code: e.target.value }))}
                                />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <label className="text-right text-sm font-medium">직무 (Persona)</label>
                                <Input
                                    className="col-span-3"
                                    value={formData.target_persona}
                                    onChange={e => setFormData(p => ({ ...p, target_persona: e.target.value }))}
                                    placeholder="예: 프로젝트 매니저"
                                />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <label className="text-right text-sm font-medium">근무 시간</label>
                                <Input
                                    className="col-span-3"
                                    value={formData.daily_work_hours}
                                    onChange={e => setFormData(p => ({ ...p, daily_work_hours: e.target.value }))}
                                    placeholder="09:00-18:00"
                                />
                            </div>
                        </div>

                        {!editingStaff && (
                            <div className="grid grid-cols-4 items-center gap-4">
                                <label className="text-right text-sm font-medium">연차 시나리오</label>
                                <div className="col-span-3">
                                    <Select
                                        value={formData.scenario}
                                        onValueChange={v => setFormData(p => ({ ...p, scenario: v }))}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="시나리오 선택" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="month_end">월말 집중형 (기본)</SelectItem>
                                            <SelectItem value="random">랜덤 분포형</SelectItem>
                                            <SelectItem value="long_vacation">장기 휴가형 (집중)</SelectItem>
                                            <SelectItem value="bridge_holiday">징검다리 연휴형</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        생성 시 해당 시나리오로 금년도 연차 계획이 자동 수립됩니다.
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end gap-3">
                            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>취소</Button>
                            <Button onClick={handleSave}>저장</Button>
                        </div>
                    </div>
                </div>
            )}

            {isLeaveDialogOpen && selectedStaffForLeave && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-background rounded-lg shadow-lg w-full max-w-2xl border p-6 space-y-6 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <h3 className="text-lg font-semibold tracking-tight">
                                        {selectedStaffForLeave.name}님의 연차 계획
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                        전략 인력의 근태 관리를 위한 연차 일정을 계획합니다.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 p-4 bg-muted/30 rounded-lg border">
                                <span className="text-sm font-medium whitespace-nowrap">시나리오 선택:</span>
                                <Select value={scenario} onValueChange={setScenario}>
                                    <SelectTrigger className="w-[240px] bg-white">
                                        <SelectValue placeholder="시나리오 선택" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="month_end">월말 집중형 (기본)</SelectItem>
                                        <SelectItem value="random">랜덤 분포형</SelectItem>
                                        <SelectItem value="long_vacation">장기 휴가형 (집중)</SelectItem>
                                        <SelectItem value="bridge_holiday">징검다리 연휴형</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button onClick={handleGenerateLeaves} variant="default" className="gap-2 bg-indigo-600 hover:bg-indigo-700 ml-auto">
                                    <Sparkles className="w-4 h-4" />
                                    계획 생성
                                </Button>
                            </div>
                        </div>

                        <div className="border rounded-md min-h-[300px] max-h-[400px] overflow-y-auto">
                            {isLoadingLeaves ? (
                                <div className="flex items-center justify-center h-full text-muted-foreground">로딩 중...</div>
                            ) : leaves.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 p-8 text-center">
                                    <Calendar className="w-10 h-10 opacity-20" />
                                    <p>등록된 연차 계획이 없습니다.</p>
                                    <p className="text-xs">상단의 시나리오를 선택하여 계획을 수립하세요.</p>
                                </div>
                            ) : (
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/50 sticky top-0">
                                        <tr>
                                            <th className="p-3 text-left font-medium">날짜</th>
                                            <th className="p-3 text-left font-medium">사유</th>
                                            <th className="p-3 text-right font-medium">관리</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {leaves.map((leave) => (
                                            <tr key={leave.id} className="group hover:bg-muted/30">
                                                <td className="p-3 font-medium">{leave.leave_date}</td>
                                                <td className="p-3 text-muted-foreground">{leave.reason}</td>
                                                <td className="p-3 text-right">
                                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleDeleteLeave(leave.id)}>
                                                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        <div className="flex justify-end pt-2">
                            <Button variant="outline" onClick={() => setIsLeaveDialogOpen(false)}>닫기</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
