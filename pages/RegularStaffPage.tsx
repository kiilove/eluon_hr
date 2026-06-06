import React, { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Plus, Trash2, Upload, FileSpreadsheet, Pencil, MoreHorizontal, Loader2, X, Edit2, LayoutGrid, List as ListIcon, Camera, UserCog, User, ChevronDown, Filter, CheckCircle2 } from 'lucide-react';
import { Employee } from '../types';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { ExcelParser } from '../lib/engine/excelParser';
import { EmployeeExtractor } from '../lib/engine/employeeExtractor';
import { useMessageModal } from '@/contexts/MessageModalContext';

// Helper Component for Dropdown Filter
const FilterDropdown = ({
    title,
    options,
    selected,
    onToggle,
    activeCount
}: {
    title: string;
    options: string[];
    selected: Set<string>;
    onToggle: (val: string) => void;
    activeCount: number;
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [localSearch, setLocalSearch] = useState("");
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Reset local search when closed
    useEffect(() => {
        if (!isOpen) setLocalSearch("");
    }, [isOpen]);

    const filteredOptions = options.filter(opt =>
        (opt || "").toLowerCase().includes(localSearch.toLowerCase())
    );

    return (
        <div className="relative" ref={ref}>
            <Button
                variant="outline"
                size="sm"
                className={cn("h-10 rounded-xl border-slate-200 bg-white hover:bg-slate-50 transition-all font-medium text-slate-600",
                    isOpen && "ring-2 ring-indigo-100 border-indigo-300",
                    activeCount > 0 && "text-indigo-600 border-indigo-200 bg-indigo-50"
                )}
                onClick={() => setIsOpen(!isOpen)}
            >
                {title}
                {activeCount > 0 && <span className="ml-1.5 bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full text-xs font-bold">{activeCount}</span>}
                <ChevronDown className={cn("ml-2 w-3.5 h-3.5 transition-transform", isOpen && "rotate-180")} />
            </Button>

            {isOpen && (
                <div className="absolute top-full mt-2 left-0 w-[240px] sm:w-[320px] bg-white/95 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 p-3 z-50 animate-in fade-in slide-in-from-top-2 duration-200 flex flex-col gap-2">
                    {options.length > 8 && (
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                            <input
                                className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                                placeholder={`...`}
                                value={localSearch}
                                onChange={e => setLocalSearch(e.target.value)}
                                autoFocus
                            />
                        </div>
                    )}

                    <div className={cn(
                        "overflow-y-auto pr-1 space-y-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent",
                        filteredOptions.length > 8 ? "max-h-[300px]" : "max-h-auto"
                    )}>
                        {filteredOptions.length === 0 && <p className="text-xs text-center text-muted-foreground py-4">결과가 없습니다.</p>}

                        <div className={cn("grid gap-1", filteredOptions.length > 6 ? "grid-cols-2" : "grid-cols-1")}>
                            {filteredOptions.map(option => (
                                <label key={option} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors group select-none">
                                    <Checkbox
                                        checked={selected.has(option)}
                                        onChange={() => onToggle(option)}
                                        className="h-4 w-4 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600 rounded-[4px]"
                                    />
                                    <span className={cn("text-xs sm:text-sm font-medium text-slate-700 group-hover:text-slate-900 truncate", selected.has(option) && "text-indigo-700")}>
                                        {option || '(미지정)'}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex items-center justify-between border-t border-slate-100 pt-2 px-1">
                        <span className="text-[10px] text-slate-400">
                            {selected.size}개 선택됨
                        </span>
                        {selected.size > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[10px] px-2 text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                                onClick={() => {
                                    options.forEach(opt => {
                                        if (selected.has(opt)) onToggle(opt);
                                    });
                                }}
                            >
                                초기화
                            </Button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export const RegularStaffPage = () => {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    // Filters
    const [selectedDepts, setSelectedDepts] = useState<Set<string>>(new Set());
    const [selectedPositions, setSelectedPositions] = useState<Set<string>>(new Set());
    const [showTFOnly, setShowTFOnly] = useState(false);

    // View Mode: 'list' | 'grid'
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
    const { showConfirm, showAlert } = useMessageModal();

    // Selection for Bulk Delete
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Dialog State
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [isuploading, setIsUploading] = useState(false);
    const [currentEmployee, setCurrentEmployee] = useState<Partial<Employee> & { initial_wage?: number } | null>(null);
    const [details, setDetails] = useState<{ memos: any[], wages: any[], status_history: any[], position_history?: any[] } | null>(null);
    const [activeTab, setActiveTab] = useState<'info' | 'wage' | 'status' | 'position'>('info');
    const [newMemo, setNewMemo] = useState("");

    // Wage Editing State
    const [editingWageId, setEditingWageId] = useState<string | null>(null);
    const [editingWageValue, setEditingWageValue] = useState<number | string>("");

    // Status Editing State
    const [newStatus, setNewStatus] = useState("ACTIVE");
    const [newStatusDate, setNewStatusDate] = useState("");
    const [newStatusReason, setNewStatusReason] = useState("");

    // Position History State
    const [newPositionDate, setNewPositionDate] = useState("");
    const [newPositionDept, setNewPositionDept] = useState("");
    const [newPositionTitle, setNewPositionTitle] = useState("");
    const [newPositionReason, setNewPositionReason] = useState("");

    // [New] Manual Wage Add State
    const [newWageDate, setNewWageDate] = useState("");
    const [newWageAmount, setNewWageAmount] = useState<number | string>("");

    // Discretionary History State
    const [newDiscStartDate, setNewDiscStartDate] = useState("");
    const [newDiscEndDate, setNewDiscEndDate] = useState("");
    const [newDiscStartTime, setNewDiscStartTime] = useState("10:00");
    const [newDiscEndTime, setNewDiscEndTime] = useState("19:00");

    const handleAddStatus = async () => {
        if (!currentEmployee?.id || !newStatus || !newStatusDate) {
            await showAlert("날짜와 상태를 모두 입력해주세요.", { type: 'warning' });
            return;
        }
        try {
            const res = await fetch('/api/employees/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employeeId: currentEmployee.id,
                    status: newStatus,
                    effectiveDate: newStatusDate,
                    reason: newStatusReason
                })
            });
            if (res.ok) {
                setNewStatusReason("");
                fetchDetails(currentEmployee.id);
                // Also refresh main list to update badge
                fetchEmployees();
            } else {
                await showAlert("상태 추가 실패", { type: 'error' });
            }
        } catch (e) { console.error(e); }
    };

    const handleDeleteStatus = async (id: string) => {
        const confirmed = await showConfirm("상태 이력을 삭제하시겠습니까?", { title: '삭제 확인', type: 'warning' });
        if (!confirmed) return;
        try {
            const res = await fetch(`/api/employees/status?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                if (currentEmployee?.id) fetchDetails(currentEmployee.id);
                fetchEmployees();
            } else {
                await showAlert("삭제 실패", { type: 'error' });
            }
        } catch (e) { console.error(e); }
    };

    const handleAddPosition = async () => {
        if (!currentEmployee?.id || !newPositionDate) {
            await showAlert("적용일을 입력해주세요.", { type: 'warning' });
            return;
        }
        try {
            const res = await fetch('/api/employees/position-history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employeeId: currentEmployee.id,
                    department: newPositionDept || null,
                    position: newPositionTitle || null,
                    effectiveDate: newPositionDate,
                    reason: newPositionReason || null
                })
            });
            if (res.ok) {
                setNewPositionDate("");
                setNewPositionDept("");
                setNewPositionTitle("");
                setNewPositionReason("");
                fetchDetails(currentEmployee.id);
                fetchEmployees(); // Refresh to update current dept/position
            } else {
                await showAlert("추가 실패", { type: 'error' });
            }
        } catch (e) { console.error(e); }
    };

    const handleDeletePosition = async (id: string) => {
        const confirmed = await showConfirm("이력을 삭제하시겠습니까?", { title: '삭제 확인', type: 'warning' });
        if (!confirmed) return;
        try {
            const res = await fetch(`/api/employees/position-history?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                if (currentEmployee?.id) fetchDetails(currentEmployee.id);
                fetchEmployees();
            } else {
                await showAlert("삭제 실패", { type: 'error' });
            }
        } catch (e) { console.error(e); }
    };

    const handleAddDiscretionary = async () => {
        if (!currentEmployee?.id || !newDiscStartDate || !newDiscEndDate) {
            await showAlert("적용 시작일과 종료일을 모두 입력해주세요.", { type: 'warning' });
            return;
        }
        try {
            const res = await fetch('/api/employees/discretionary-history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employeeId: currentEmployee.id,
                    startDate: newDiscStartDate,
                    endDate: newDiscEndDate,
                    startTime: newDiscStartTime,
                    endTime: newDiscEndTime
                })
            });
            if (res.ok) {
                setNewDiscStartDate("");
                setNewDiscEndDate("");
                fetchDetails(currentEmployee.id);
                fetchEmployees();
            } else {
                await showAlert("재량근무 이력 추가 실패", { type: 'error' });
            }
        } catch (e) { console.error(e); }
    };

    const handleDeleteDiscretionary = async (id: string) => {
        const confirmed = await showConfirm("재량근무 이력을 삭제하시겠습니까?", { title: '삭제 확인', type: 'warning' });
        if (!confirmed) return;
        try {
            const res = await fetch(`/api/employees/discretionary-history?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                if (currentEmployee?.id) fetchDetails(currentEmployee.id);
                fetchEmployees();
            } else {
                await showAlert("삭제 실패", { type: 'error' });
            }
        } catch (e) { console.error(e); }
    };

    const handleAddWage = async () => {
        if (!currentEmployee?.id || !newWageDate || !newWageAmount) {
            await showAlert("적용일과 시급을 모두 입력해주세요.", { type: 'warning' });
            return;
        }
        try {
            const res = await fetch('/api/hourly-wages/values', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employeeId: currentEmployee.id,
                    amount: Number(newWageAmount),
                    effectiveDate: newWageDate,
                    companyId: currentEmployee.company_id || 'comp_eluon'
                })
            });
            if (res.ok) {
                setNewWageDate("");
                setNewWageAmount("");
                if (currentEmployee.id) fetchDetails(currentEmployee.id);
            } else {
                const err = await res.json().catch(() => ({})) as any;
                await showAlert(`시급 추가 실패: ${err.error || "알 수 없는 오류"}`, { type: 'error' });
            }
        } catch (e) {
            console.error(e);
            await showAlert(`오류 발생: ${(e as Error).message}`, { type: 'error' });
        }
    };

    const handleUpdateWage = async () => {
        if (!editingWageId) return;
        try {
            const res = await fetch('/api/hourly-wages/values', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: editingWageId, amount: Number(editingWageValue) })
            });
            if (res.ok) {
                setEditingWageId(null);
                if (currentEmployee?.id) fetchDetails(currentEmployee.id);
            } else { await showAlert("수정 실패", { type: 'error' }); }
        } catch (e) { console.error(e); }
    };

    const fetchDetails = async (id: string) => {
        try {
            const res = await fetch(`/api/employees/details?id=${id}`);
            const json = await res.json() as any;
            if (json.success) setDetails(json.data);
        } catch (e) { console.error(e); }
    };

    const handleAddMemo = async () => {
        if (!currentEmployee?.id || !newMemo.trim()) return;
        try {
            await fetch('/api/employees/memos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ employee_id: currentEmployee.id, content: newMemo })
            });
            setNewMemo("");
            fetchDetails(currentEmployee.id);
        } catch (e) { console.error(e); }
    };

    const handleDeleteMemo = async (id: string) => {
        const confirmed = await showConfirm("메모를 삭제하시겠습니까?", { title: '삭제 확인', type: 'warning' });
        if (!currentEmployee?.id || !confirmed) return;
        try {
            await fetch(`/api/employees/memos?id=${id}`, { method: 'DELETE' });
            fetchDetails(currentEmployee.id);
        } catch (e) { console.error(e); }
    };

    const fileInputRef = useRef<HTMLInputElement>(null);
    const profileImageInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchEmployees();
    }, []);

    const fetchEmployees = async () => {
        setLoading(true);
        try {
            const userStr = localStorage.getItem('user');
            if (userStr) {
                const user = JSON.parse(userStr);
                const companyId = user.company_id;
                if (companyId) {
                    const res = await fetch(`/api/employees?companyId=${companyId}`);
                    const data = await res.json() as any;
                    if (Array.isArray(data)) {
                        setEmployees(data);
                    }
                }
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    // Filter Computation
    const uniqueDepartments = Array.from(new Set(employees.map(e => e.department || "").filter(Boolean))).sort();
    const uniquePositions = Array.from(new Set(employees.map(e => e.position || "").filter(Boolean))).sort();

    const toggleFilter = (set: Set<string>, setFunction: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) => {
        const newSet = new Set(set);
        if (newSet.has(value)) newSet.delete(value);
        else newSet.add(value);
        setFunction(newSet);
    };

    const filtered = employees
        .filter(e => {
            const matchesSearch =
                e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (e.department || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
                (e.position || "").toLowerCase().includes(searchTerm.toLowerCase());

            const matchesDept = selectedDepts.size === 0 || selectedDepts.has(e.department || "");
            const matchesPos = selectedPositions.size === 0 || selectedPositions.has(e.position || "");
            const matchesTF = !showTFOnly || e.is_TF;

            return matchesSearch && matchesDept && matchesPos && matchesTF;
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'ko')); // Sort by Name (Korean supported)

    // --- CRUD Handlers ---

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentEmployee) return;

        const isEdit = !!currentEmployee.id;
        const method = isEdit ? 'PATCH' : 'POST';
        const url = '/api/employees';

        try {
            const userStr = localStorage.getItem('user');
            const user = userStr ? JSON.parse(userStr) : {};
            const companyId = user.company_id || 'comp_eluon'; // Fallback

            const payload = { ...currentEmployee, companyId, initial_wage: currentEmployee.initial_wage };
            console.log('[RegularStaffPage] Saving employee:', payload);

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
                console.error('[RegularStaffPage] Save failed:', errorData);
                throw new Error(errorData.error || `HTTP ${res.status}`);
            }

            // [Auto-Save Check] If discretionary history dates are filled but not saved yet, save them now
            if (currentEmployee?.id && newDiscStartDate && newDiscEndDate) {
                try {
                    await fetch('/api/employees/discretionary-history', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            employeeId: currentEmployee.id,
                            startDate: newDiscStartDate,
                            endDate: newDiscEndDate,
                            startTime: newDiscStartTime,
                            endTime: newDiscEndTime
                        })
                    });
                    setNewDiscStartDate("");
                    setNewDiscEndDate("");
                } catch (e) {
                    console.error('[RegularStaffPage] Auto-save discretionary failed:', e);
                }
            }

            await fetchEmployees(); // Refresh
            if (currentEmployee?.id) {
                await fetchDetails(currentEmployee.id);
            }

            // [UX Checkpoint] Show Success & Exit Edit Mode, but keep Dialog Open
            await showAlert("저장되었습니다.", { type: 'success' });
            setIsEditing(false); // Switch back to View Mode
            // isDialogOpen remains true
        } catch (error) {
            console.error('[RegularStaffPage] Error:', error);
            await showAlert(`저장에 실패했습니다: ${(error as Error).message}`, { type: 'error' });
        }
    };

    const handleDelete = async (ids: string[]) => {
        const confirmed = await showConfirm(`${ids.length}명의 직원을 삭제하시겠습니까?`, {
            title: '삭제 확인',
            type: 'warning',
            confirmText: '삭제',
            cancelText: '취소'
        });
        if (!confirmed) return;

        try {
            const res = await fetch('/api/employees', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids })
            });

            if (!res.ok) throw new Error("Failed to delete");

            setSelectedIds(new Set()); // Clear selection
            await fetchEmployees();
        } catch (error) {
            console.error(error);
            await showAlert("삭제에 실패했습니다.", { type: 'error' });
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const rawData = await ExcelParser.parse(file);
            if (rawData.length === 0) {
                await showAlert("데이터를 찾을 수 없습니다.", { type: 'warning' });
                return;
            }

            const userStr = localStorage.getItem('user');
            const user = userStr ? JSON.parse(userStr) : {};
            const companyId = user.company_id;

            if (!companyId) {
                await showAlert("회사 정보를 찾을 수 없습니다.", { type: 'error' });
                return;
            }

            const currentListRes = await fetch(`/api/employees?companyId=${companyId}`);
            const currentList = await currentListRes.json() as any[];

            const newEmployees = EmployeeExtractor.extractFromLogs(rawData, currentList)
                .map(e => ({ ...e, companyId: companyId })); // [Fix] Inject Company ID

            if (newEmployees.length > 0) {
                await EmployeeExtractor.saveEmployees(newEmployees);
                await showAlert(`${newEmployees.length}명의 신규 직원이 등록되었습니다.\n(회사: ${companyId})`, { type: 'success' });
                await fetchEmployees();
            } else {
                await showAlert("등록할 신규 직원이 없습니다.");
            }
        } catch (error) {
            console.error(error);
            await showAlert("파일 처리 중 오류가 발생했습니다.", { type: 'error' });
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleProfileImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Limit size to 100KB to prevent easy DB bloat
        if (file.size > 100 * 1024) {
            await showAlert("이미지 크기는 100KB 이하여야 합니다.", { type: 'warning' });
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            if (currentEmployee) {
                setCurrentEmployee({ ...currentEmployee, profile_image: reader.result as string });
            }
        };
        reader.readAsDataURL(file);
    };

    // --- UI Helpers ---

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const toggleAll = () => {
        if (selectedIds.size === filtered.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(filtered.map(e => e.id)));
    };

    const openAddDialog = () => {
        setCurrentEmployee({ is_TF: false });
        setIsEditing(true);
        setIsDialogOpen(true);
    };

    const openEditDialog = (emp: Employee) => {
        setCurrentEmployee({ ...emp });
        setDetails(null);
        setActiveTab('info');
        setNewMemo("");
        fetchDetails(emp.id);
        setIsEditing(false);
        setIsDialogOpen(true);
    };

    return (
        <div className="space-y-6 h-full flex flex-col p-4">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-2">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                        임직원 관리
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">
                        전체 임직원 현황을 한눈에 관리하고 전략 인력을 배치하세요.
                    </p>
                </div>
                <div className="flex flex-col items-end gap-3 w-full md:w-auto">
                    <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg border border-slate-200 shadow-inner">
                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn("h-8 px-3 rounded-md transition-all", viewMode === 'list' ? "bg-white shadow text-indigo-600" : "text-muted-foreground")}
                            onClick={() => setViewMode('list')}
                        >
                            <ListIcon className="w-4 h-4 mr-2" />
                            목록형
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn("h-8 px-3 rounded-md transition-all", viewMode === 'grid' ? "bg-white shadow text-indigo-600" : "text-muted-foreground")}
                            onClick={() => setViewMode('grid')}
                        >
                            <LayoutGrid className="w-4 h-4 mr-2" />
                            카드형
                        </Button>
                    </div>

                    <div className="flex gap-2 w-full md:w-auto">
                        {selectedIds.size > 0 && (
                            <Button
                                variant="destructive"
                                onClick={() => handleDelete(Array.from(selectedIds))}
                                className="shadow-red-200 shadow-md"
                            >
                                <Trash2 className="w-4 h-4 mr-2" />
                                선택 삭제 ({selectedIds.size})
                            </Button>
                        )}
                        <Button onClick={openAddDialog} className="bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all hover:-translate-y-0.5">
                            <Plus className="w-4 h-4 mr-2" />
                            직원 추가
                        </Button>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 flex flex-col gap-4">
                {/* Search & Filter Bar */}
                <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center w-full bg-slate-50/50 p-1.5 rounded-2xl border border-slate-100/50">
                    <div className="relative w-full sm:w-[320px]">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-indigo-400" />
                        </div>
                        <Input
                            placeholder="이름, 부서, 직급..."
                            className="pl-9 h-10 w-full text-sm rounded-xl border-slate-200 bg-white shadow-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {/* Divider for PC */}
                    <div className="hidden sm:block w-px h-6 bg-slate-200 mx-2"></div>
                    <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto flex-wrap sm:flex-nowrap">
                        <FilterDropdown
                            title="부서"
                            options={uniqueDepartments}
                            selected={selectedDepts}
                            onToggle={(val) => toggleFilter(selectedDepts, setSelectedDepts, val)}
                            activeCount={selectedDepts.size}
                        />
                        <FilterDropdown
                            title="직급"
                            options={uniquePositions}
                            selected={selectedPositions}
                            onToggle={(val) => toggleFilter(selectedPositions, setSelectedPositions, val)}
                            activeCount={selectedPositions.size}
                        />
                        <Button
                            variant="outline"
                            size="sm"
                            className={cn("h-10 rounded-xl border-slate-200 bg-white hover:bg-slate-50 transition-all font-medium text-slate-600",
                                showTFOnly && "bg-amber-50 text-amber-700 border-amber-200 ring-2 ring-amber-100"
                            )}
                            onClick={() => setShowTFOnly(!showTFOnly)}
                        >
                            <span className={cn("inline-block w-2 h-2 rounded-full mr-2", showTFOnly ? "bg-amber-500" : "bg-slate-300")} />
                            전략 인력(TF)
                        </Button>

                        {(selectedDepts.size > 0 || selectedPositions.size > 0 || searchTerm || showTFOnly) && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-10 px-3 text-muted-foreground hover:text-slate-900 rounded-xl whitespace-nowrap"
                                onClick={() => {
                                    setSearchTerm("");
                                    setSelectedDepts(new Set());
                                    setSelectedPositions(new Set());
                                    setShowTFOnly(false);
                                }}
                            >
                                <X className="w-4 h-4 mr-1.5" />
                                초기화
                            </Button>
                        )}
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <Loader2 className="w-12 h-12 animate-spin text-indigo-500" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 text-muted-foreground gap-4 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50 min-h-[400px]">
                        <X className="w-16 h-16 text-slate-300" />
                        <p className="text-lg font-medium">검색 및 필터 결과가 없습니다.</p>
                        <Button variant="link" onClick={() => {
                            setSearchTerm("");
                            setSelectedDepts(new Set());
                            setSelectedPositions(new Set());
                        }}>필터 초기화</Button>
                    </div>
                ) : (
                    <>
                        {viewMode === 'grid' ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-12">
                                {filtered.map((emp) => (
                                    <div key={emp.id} onClick={() => openEditDialog(emp)} className="group relative bg-white/70 backdrop-blur-md rounded-3xl p-6 border border-white/50 shadow-sm hover:shadow-xl hover:shadow-indigo-100 hover:-translate-y-1 transition-all duration-300 cursor-pointer">
                                        <div className="absolute top-4 right-4" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                className="h-5 w-5 rounded-md border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                                                checked={selectedIds.has(emp.id)}
                                                onChange={() => toggleSelection(emp.id)}
                                            />
                                        </div>

                                        <div className="flex flex-col items-center">
                                            <div className="relative mb-4">
                                                <div className={cn("w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold bg-gradient-to-br shadow-lg overflow-hidden border-4 border-white",
                                                    "bg-white"
                                                )}>
                                                    <img
                                                        src={emp.profile_image || `https://api.dicebear.com/7.x/avataaars/svg?seed=${emp.id}`}
                                                        alt={emp.name}
                                                        className="w-full h-full object-cover"
                                                    />
                                                </div>

                                                {/* Status Icons Overlay */}
                                                <div className="absolute -bottom-1 -right-1 flex gap-1">
                                                    {Boolean(emp.is_TF) && (
                                                        <div className="bg-amber-500 text-white p-1.5 rounded-full shadow-md border-2 border-white" title="전략 인력 (TF)">
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                                                        </div>
                                                    )}
                                                    {Boolean(emp.is_pregnant) && (
                                                        <div className="bg-pink-500 text-white p-1.5 rounded-full shadow-md animate-pulse border-2 border-white" title="임산부 보호 대상">
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /></svg>
                                                        </div>
                                                    )}
                                                    {Boolean(emp.discretionary_history && emp.discretionary_history.length > 0) && (
                                                        <div className="bg-indigo-600 text-white p-1.5 rounded-full shadow-md border-2 border-white" title="재량근무제">
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20" /><path d="m4.93 4.93 14.14 14.14" /><path d="M2 12h20" /><path d="m4.93 19.07 14.14-14.14" /></svg>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <h3 className="text-xl font-bold text-gray-900">{emp.name}</h3>
                                            <p className="text-sm text-gray-500 font-medium mb-1">{emp.position || '직급 미정'}</p>
                                            <p className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full mb-4">
                                                {emp.department || '부서 미정'}
                                            </p>

                                            <div className="w-full border-t border-gray-100 my-2"></div>

                                            <div className="grid grid-cols-2 gap-2 w-full text-xs text-gray-500 mb-4">
                                                <div className="flex flex-col items-center p-2 rounded-lg bg-gray-50/50">
                                                    <span className="font-semibold text-gray-900">이메일</span>
                                                    <span className="truncate max-w-full" title={emp.email}>{emp.email || '-'}</span>
                                                </div>
                                                <div className="flex flex-col items-center p-2 rounded-lg bg-gray-50/50">
                                                    <span className="font-semibold text-gray-900">연락처</span>
                                                    <span>{emp.phone || '-'}</span>
                                                </div>
                                            </div>


                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="bg-white/80 backdrop-blur rounded-2xl border border-white/50 shadow-sm overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 border-b border-slate-100">
                                        <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                            <th className="p-4 w-12 text-center">
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-gray-300"
                                                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                                                    onChange={toggleAll}
                                                />
                                            </th>
                                            <th className="p-4">이름</th>
                                            <th className="p-4">사번</th>
                                            <th className="p-4">소속/직급</th>
                                            <th className="p-4">상태</th>
                                            <th className="p-4">연락처</th>
                                            <th className="p-4 text-right">관리</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100/50">
                                        {filtered.map((emp) => (
                                            <tr key={emp.id} onClick={() => openEditDialog(emp)} className="hover:bg-slate-50/80 transition-colors cursor-pointer">
                                                <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        className="rounded border-gray-300"
                                                        checked={selectedIds.has(emp.id)}
                                                        onChange={() => toggleSelection(emp.id)}
                                                    />
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shadow-sm overflow-hidden",
                                                            "bg-white"
                                                        )}>
                                                            <img
                                                                src={emp.profile_image || `https://api.dicebear.com/7.x/avataaars/svg?seed=${emp.id}`}
                                                                alt={emp.name}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        </div>
                                                        <div>
                                                            <p className="font-semibold text-slate-900">{emp.name}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-4 text-slate-600 font-mono text-xs">{emp.employee_code || '-'}</td>
                                                <td className="p-4">
                                                    <div className="flex flex-col">
                                                        <span className="text-slate-900 font-medium">{emp.position || '-'}</span>
                                                        <span className="text-xs text-slate-500">{emp.department}</span>
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    {emp.is_TF ? (
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                                                            전략 인력 (TF)
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                                            일반 직원
                                                        </span>
                                                    )}
                                                    {/* Status Badge */}
                                                    <span className={cn("ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
                                                        emp.current_status === 'ACTIVE' ? "bg-green-100 text-green-800 border-green-200" :
                                                            emp.current_status === 'RESIGNED' ? "bg-red-100 text-red-800 border-red-200" :
                                                                "bg-gray-100 text-gray-800 border-gray-200"
                                                    )}>
                                                        {emp.current_status === 'ACTIVE' ? '재직' :
                                                            emp.current_status === 'RESIGNED' ? '퇴사' :
                                                                emp.current_status || '미지정'}
                                                    </span>

                                                    {/* Policy Badges */}
                                                    {Boolean(emp.is_TF) && (
                                                        <span className="ml-1.5 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-600 border border-amber-200">
                                                            TF
                                                        </span>
                                                    )}
                                                    {Boolean(emp.is_pregnant) && (
                                                        <span className="ml-1.5 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-pink-100 text-pink-600 border border-pink-200">
                                                            임산부
                                                        </span>
                                                    )}
                                                    {Boolean(emp.discretionary_history && emp.discretionary_history.length > 0) && (
                                                        <span className="ml-1.5 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-600 border border-indigo-200">
                                                            재량
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="p-4">
                                                    <div className="text-xs text-slate-500 space-y-0.5">
                                                        <p>{emp.email}</p>
                                                        <p>{emp.phone}</p>
                                                    </div>
                                                </td>
                                                <td className="p-4 text-right">

                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Add/Edit Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[800px] w-full h-[750px] flex flex-col overflow-hidden">
                    <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
                        <DialogTitle className="text-xl font-bold flex items-center gap-2">
                            {currentEmployee?.id ? <UserCog className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                            {!currentEmployee?.id ? '신규 직원 등록' : isEditing ? '직원 정보 수정' : '직원 상세 정보'}
                            {isEditing && currentEmployee?.id && (
                                <span className="ml-2 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold animate-pulse">
                                    편집 중
                                </span>
                            )}
                        </DialogTitle>
                        <DialogDescription>
                            직원의 상세 프로필 정보를 입력하고 관리합니다.
                        </DialogDescription>
                    </DialogHeader>


                    <div className="flex border-b px-6 shrink-0 bg-white z-10">
                        <button
                            className={cn("px-4 py-3 font-medium text-sm transition-colors border-b-2 relative top-[1px]", activeTab === 'info' ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700")}
                            onClick={() => setActiveTab('info')}
                        >
                            기본 정보
                        </button>
                        <button
                            className={cn("px-4 py-3 font-medium text-sm transition-colors border-b-2 relative top-[1px]", activeTab === 'status' ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700")}
                            onClick={() => setActiveTab('status')}
                        >
                            상태 이력
                        </button>
                        <button
                            className={cn("px-4 py-3 font-medium text-sm transition-colors border-b-2 relative top-[1px]", activeTab === 'wage' ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700")}
                            onClick={() => setActiveTab('wage')}
                        >
                            시급 이력
                        </button>
                        <button
                            className={cn("px-4 py-3 font-medium text-sm transition-colors border-b-2 relative top-[1px]", activeTab === 'position' ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700")}
                            onClick={() => setActiveTab('position')}
                        >
                            부서/직급 이력
                        </button>
                        <button
                            className={cn("px-4 py-3 font-medium text-sm transition-colors border-b-2 relative top-[1px]", activeTab === 'discretionary' ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700")}
                            onClick={() => setActiveTab('discretionary')}
                        >
                            재량근무 이력
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-6 py-4">

                        {activeTab === 'status' && (
                            <div className="space-y-6 py-2">
                                {!currentEmployee?.id ? (
                                    <div className="p-8 text-center text-slate-500 border border-dashed rounded-xl bg-slate-50">
                                        <p>신규 직원 등록을 완료한 후 상태 이력을 추가할 수 있습니다.</p>
                                        <p className="text-xs mt-2 text-slate-400">기본 정보를 입력하고 [저장하기]를 눌러주세요.</p>
                                    </div>
                                ) : (<>
                                    {isEditing && (
                                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                                            <h4 className="text-sm font-semibold text-slate-800">새로운 상태 추가</h4>
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                                <Input
                                                    type="date"
                                                    value={newStatusDate}
                                                    onChange={e => setNewStatusDate(e.target.value)}
                                                    className="bg-white"
                                                />
                                                <select
                                                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                    value={newStatus}
                                                    onChange={e => setNewStatus(e.target.value)}
                                                >
                                                    <option value="ACTIVE">재직</option>
                                                    <option value="UNPAID_LEAVE">무급휴가</option>
                                                    <option value="PAID_LEAVE">유급휴가</option>
                                                    <option value="RESIGNED">퇴사</option>
                                                </select>
                                                <Input
                                                    placeholder="변동 사유 (선택)"
                                                    value={newStatusReason}
                                                    onChange={e => setNewStatusReason(e.target.value)}
                                                    className="bg-white col-span-2 sm:col-span-1"
                                                />
                                                <Button onClick={handleAddStatus} className="bg-indigo-600 hover:bg-indigo-700 col-span-2 sm:col-span-1">추가</Button>
                                            </div>
                                        </div>
                                    )}

                                    <div className="border rounded-xl overflow-hidden">
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-50 border-b">
                                                <tr>
                                                    <th className="p-3 text-left font-medium text-slate-500">적용 시작일</th>
                                                    <th className="p-3 text-left font-medium text-slate-500">상태</th>
                                                    <th className="p-3 text-left font-medium text-slate-500">사유</th>
                                                    <th className="p-3 text-right font-medium text-slate-500">관리</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {details?.status_history?.map((Item: any) => (
                                                    <tr key={Item.id} className="hover:bg-slate-50">
                                                        <td className="p-3 font-mono text-slate-700">{Item.effective_date}</td>
                                                        <td className="p-3">
                                                            <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                                                                Item.status === 'ACTIVE' ? "bg-green-100 text-green-800" :
                                                                    Item.status === 'RESIGNED' ? "bg-red-100 text-red-800" :
                                                                        "bg-gray-100 text-gray-800"
                                                            )}>
                                                                {Item.status === 'ACTIVE' ? '재직' :
                                                                    Item.status === 'RESIGNED' ? '퇴사' :
                                                                        Item.status === 'UNPAID_LEAVE' ? '무급휴가' :
                                                                            Item.status === 'PAID_LEAVE' ? '유급휴가' :
                                                                                Item.status}
                                                            </span>
                                                        </td>
                                                        <td className="p-3 text-slate-600 max-w-[150px] truncate" title={Item.reason}>{Item.reason || '-'}</td>
                                                        <td className="p-3 text-right">
                                                            <Button size="sm" variant="ghost" className="h-7 text-rose-500 hover:text-rose-700 hover:bg-rose-50" onClick={() => handleDeleteStatus(Item.id)}>
                                                                삭제
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {(!details?.status_history || details.status_history.length === 0) && (
                                                    <tr>
                                                        <td colSpan={4} className="p-8 text-center text-slate-400">
                                                            이력이 없습니다.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </>)}
                            </div>
                        )}

                        {activeTab === 'info' && (
                            <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
                                {/* Left: Avatar Upload */}
                                <div className="flex flex-col items-center gap-4">
                                    <div className={cn("relative group w-40 h-40", isEditing ? "cursor-pointer" : "pointer-events-none")} onClick={() => profileImageInputRef.current?.click()}>
                                        <input
                                            type="file"
                                            ref={profileImageInputRef}
                                            className="hidden"
                                            accept="image/*"
                                            onChange={handleProfileImageUpload}
                                        />
                                        <div className={cn("w-full h-full rounded-full flex items-center justify-center text-4xl font-bold bg-slate-100 border-4 border-white shadow-lg overflow-hidden transition-all group-hover:blur-[2px]",
                                            !currentEmployee?.profile_image && "text-slate-300"
                                        )}>
                                            {currentEmployee?.profile_image ? (
                                                <img src={currentEmployee.profile_image} alt="Profile" className="w-full h-full object-cover" />
                                            ) : (
                                                <User className="w-16 h-16" />
                                            )}
                                        </div>
                                        <div className="absolute inset-0 bg-black/30 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Camera className="w-8 h-8 text-white" />
                                        </div>
                                    </div>
                                    <p className="text-xs text-muted-foreground text-center">
                                        클릭하여 프로필 사진 업로드<br />(최대 100KB)
                                    </p>
                                </div>

                                {/* Right: Form Fields + Memo */}
                                <div className="space-y-6">
                                    {/* Form Fields */}
                                    <div className={cn("space-y-4 p-5 rounded-2xl transition-all duration-300",
                                        isEditing
                                            ? "bg-white ring-2 ring-indigo-500/20 shadow-lg shadow-indigo-500/10"
                                            : "bg-slate-50/50 border border-slate-100 opacity-90 pointer-events-none"
                                    )}>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="name">이름 <span className="text-red-500">*</span></Label>
                                                <Input
                                                    id="name"
                                                    value={currentEmployee?.name || ''}
                                                    onChange={e => setCurrentEmployee({ ...currentEmployee, name: e.target.value })}
                                                    required
                                                    className="bg-slate-50"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="employee_code">사번</Label>
                                                <Input
                                                    id="employee_code"
                                                    value={currentEmployee?.employee_code || ''}
                                                    onChange={e => setCurrentEmployee({ ...currentEmployee, employee_code: e.target.value })}
                                                    className="bg-slate-50"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="position">직급</Label>
                                                <Input
                                                    id="position"
                                                    value={currentEmployee?.position || ''}
                                                    onChange={e => setCurrentEmployee({ ...currentEmployee, position: e.target.value })}
                                                    className="bg-slate-50"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="join_date">입사일 (Entrance Date)</Label>
                                                <Input
                                                    id="join_date"
                                                    type="date"
                                                    value={currentEmployee?.join_date || ''}
                                                    onChange={e => setCurrentEmployee({ ...currentEmployee, join_date: e.target.value })}
                                                    className="bg-slate-50"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="department">부서</Label>
                                            <Input
                                                id="department"
                                                value={currentEmployee?.department || ''}
                                                onChange={e => setCurrentEmployee({ ...currentEmployee, department: e.target.value })}
                                                className="bg-slate-50"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="email">이메일</Label>
                                            <Input
                                                id="email"
                                                type="email"
                                                value={currentEmployee?.email || ''}
                                                onChange={e => setCurrentEmployee({ ...currentEmployee, email: e.target.value })}
                                                className="bg-slate-50"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="phone">연락처</Label>
                                            <Input
                                                id="phone"
                                                value={currentEmployee?.phone || ''}
                                                onChange={e => setCurrentEmployee({ ...currentEmployee, phone: e.target.value })}
                                                className="bg-slate-50"
                                            />
                                        </div>

                                        {/* [New] Initial Wage for New Employees */}
                                        {!currentEmployee?.id && (
                                            <div className="space-y-2 col-span-2 sm:col-span-1 border-t pt-4 mt-2 sm:border-0 sm:pt-0 sm:mt-0">
                                                <Label htmlFor="initial_wage" className="text-indigo-600 font-semibold">초기 시급 (Initial Wage)</Label>
                                                <div className="relative">
                                                    <Input
                                                        id="initial_wage"
                                                        type="number"
                                                        placeholder="0"
                                                        value={currentEmployee?.initial_wage || ''}
                                                        onChange={e => setCurrentEmployee({ ...currentEmployee, initial_wage: Number(e.target.value) })}
                                                        className="bg-indigo-50 border-indigo-100 focus:border-indigo-500 pr-8"
                                                    />
                                                    <span className="absolute right-3 top-2.5 text-xs text-slate-400">원</span>
                                                </div>
                                                <p className="text-[10px] text-slate-500">
                                                    * 입력 시 입사일 기준으로 시급이 자동 생성됩니다.
                                                </p>
                                            </div>
                                        )}

                                        <div className="pt-2 space-y-2">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                className={cn("w-full justify-start border bg-white hover:bg-slate-50", currentEmployee?.is_TF && "border-amber-500 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800")}
                                                onClick={() => setCurrentEmployee(prev => ({ ...prev, is_TF: !prev?.is_TF }))}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={cn("w-4 h-4 rounded-full border", currentEmployee?.is_TF ? "bg-amber-500 border-amber-500" : "border-slate-300")} />
                                                    <span className="font-medium">전략 인력 (TF)으로 지정</span>
                                                </div>
                                            </Button>

                                            {/* [New] Pregnancy Protection */}
                                            <div className={cn("rounded-xl border p-4 space-y-4 transition-all", currentEmployee?.is_pregnant ? "border-pink-500 bg-pink-50/30" : "border-slate-200 bg-slate-50/50")}>
                                                <button
                                                    type="button"
                                                    className="flex items-center gap-3 w-full text-left"
                                                    onClick={() => setCurrentEmployee(prev => ({ ...prev, is_pregnant: !prev?.is_pregnant }))}
                                                >
                                                    <div className={cn("w-4 h-4 rounded-full border", currentEmployee?.is_pregnant ? "bg-pink-500 border-pink-500" : "border-slate-300")} />
                                                    <span className="font-bold text-sm text-slate-700">임산부 보호 (연장/특근 제외 및 단축근로)</span>
                                                </button>

                                                {Boolean(currentEmployee?.is_pregnant) && (
                                                    <div className="grid grid-cols-1 gap-4 animate-in slide-in-from-top-2 duration-200 pl-7">
                                                        <div className="p-3 bg-white/60 rounded-lg border border-pink-100">
                                                            <h5 className="text-xs font-bold text-pink-700 mb-2 flex items-center gap-1">
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                                                                단축 근로 설정 (선택 사항)
                                                            </h5>
                                                            <div className="grid grid-cols-2 gap-3 mb-3">
                                                                <div className="space-y-1.5">
                                                                    <Label className="text-[11px] text-slate-500">단축 근무 시작 시간</Label>
                                                                    <Input
                                                                        type="time"
                                                                        value={currentEmployee?.pregnancy_reduced_start_time || ""}
                                                                        onChange={e => setCurrentEmployee({ ...currentEmployee, pregnancy_reduced_start_time: e.target.value })}
                                                                        className="h-8 text-xs bg-white"
                                                                        placeholder="09:00"
                                                                    />
                                                                </div>
                                                                <div className="space-y-1.5">
                                                                    <Label className="text-[11px] text-slate-500">단축 근무 종료 시간</Label>
                                                                    <Input
                                                                        type="time"
                                                                        value={currentEmployee?.pregnancy_reduced_end_time || ""}
                                                                        onChange={e => setCurrentEmployee({ ...currentEmployee, pregnancy_reduced_end_time: e.target.value })}
                                                                        className="h-8 text-xs bg-white"
                                                                        placeholder="18:00"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-3">
                                                                <div className="space-y-1.5">
                                                                    <Label className="text-[11px] text-slate-500">적용 시작일</Label>
                                                                    <Input
                                                                        type="date"
                                                                        value={currentEmployee?.pregnancy_reduced_start_date || ""}
                                                                        onChange={e => setCurrentEmployee({ ...currentEmployee, pregnancy_reduced_start_date: e.target.value })}
                                                                        className="h-8 text-xs bg-white"
                                                                    />
                                                                </div>
                                                                <div className="space-y-1.5">
                                                                    <Label className="text-[11px] text-slate-500">적용 종료일</Label>
                                                                    <Input
                                                                        type="date"
                                                                        value={currentEmployee?.pregnancy_reduced_end_date || ""}
                                                                        onChange={e => setCurrentEmployee({ ...currentEmployee, pregnancy_reduced_end_date: e.target.value })}
                                                                        className="h-8 text-xs bg-white"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                                                                * 설정된 기간 동안은 해당 시간이 '정규 근무 시간'으로 간주되어 <br />
                                                                지각/조퇴가 발생하지 않으며, 이를 초과한 근무는 연장근로로 계산되지 않습니다(단축근로).
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                        </div>
                                    </div>

                                    {/* Divider */}
                                    {currentEmployee?.id && <div className="border-t border-slate-100 my-4" />}

                                    {/* Memo Section */}
                                    {currentEmployee?.id && (
                                        <div className="space-y-3">
                                            <Label className="flex items-center gap-2 text-slate-600">
                                                <FileSpreadsheet className="w-4 h-4" /> 관리 메모
                                            </Label>
                                            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 max-h-[150px] overflow-y-auto space-y-2">
                                                {details?.memos?.length === 0 && <p className="text-xs text-slate-400 text-center py-2">등록된 메모가 없습니다.</p>}
                                                {details?.memos?.map((m: any) => (
                                                    <div key={m.id} className="text-sm bg-white p-2 rounded border border-slate-100 shadow-sm group relative">
                                                        <div className="flex justify-between items-start mb-1">
                                                            <span className="text-xs text-slate-400 font-mono">{new Date(m.created_at * 1000).toLocaleDateString()}</span>
                                                            <button onClick={() => handleDeleteMemo(m.id)} className="text-slate-300 hover:text-red-500"><X className="w-3 h-3" /></button>
                                                        </div>
                                                        <p className="whitespace-pre-wrap text-slate-700">{m.content}</p>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="flex gap-2">
                                                <Input
                                                    value={newMemo}
                                                    onChange={e => setNewMemo(e.target.value)}
                                                    placeholder="새로운 메모 입력..."
                                                    className="h-8 text-sm"
                                                    onKeyDown={e => e.key === 'Enter' && handleAddMemo()}
                                                />
                                                <Button size="sm" onClick={handleAddMemo} disabled={!newMemo.trim()} className="h-8 px-3">등록</Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'position' && (
                            <div className="space-y-4 py-2">
                                {!currentEmployee?.id ? (
                                    <div className="p-8 text-center text-slate-500 border border-dashed rounded-xl bg-slate-50">
                                        <p>신규 직원 등록을 완료한 후 부서/직급 이력을 추가할 수 있습니다.</p>
                                        <p className="text-xs mt-2 text-slate-400">기본 정보를 입력하고 [저장하기]를 눌러주세요.</p>
                                    </div>
                                ) : (<>
                                    {isEditing && (
                                        <div className="bg-slate-50 p-4 rounded-lg border">
                                            <h4 className="font-medium text-slate-700 mb-3">새 이력 추가</h4>
                                            <div className="grid grid-cols-2 gap-3">
                                                <Input
                                                    type="date"
                                                    placeholder="적용일"
                                                    value={newPositionDate}
                                                    onChange={e => setNewPositionDate(e.target.value)}
                                                    className="bg-white"
                                                />
                                                <Input
                                                    placeholder="부서"
                                                    value={newPositionDept}
                                                    onChange={e => setNewPositionDept(e.target.value)}
                                                    className="bg-white"
                                                />
                                                <Input
                                                    placeholder="직급"
                                                    value={newPositionTitle}
                                                    onChange={e => setNewPositionTitle(e.target.value)}
                                                    className="bg-white"
                                                />
                                                <Input
                                                    placeholder="변동 사유 (선택)"
                                                    value={newPositionReason}
                                                    onChange={e => setNewPositionReason(e.target.value)}
                                                    className="bg-white"
                                                />
                                            </div>
                                            <Button onClick={handleAddPosition} className="bg-indigo-600 hover:bg-indigo-700 mt-3 w-full">추가</Button>
                                        </div>
                                    )}

                                    <div className="border rounded-xl overflow-hidden">
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-50 border-b">
                                                <tr>
                                                    <th className="p-3 text-left font-medium text-slate-500">적용일</th>
                                                    <th className="p-3 text-left font-medium text-slate-500">부서</th>
                                                    <th className="p-3 text-left font-medium text-slate-500">직급</th>
                                                    <th className="p-3 text-left font-medium text-slate-500">사유</th>
                                                    <th className="p-3 text-right font-medium text-slate-500">관리</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {details?.position_history?.map((item: any) => (
                                                    <tr key={item.id} className="hover:bg-slate-50">
                                                        <td className="p-3 font-mono text-slate-700">{item.effective_date}</td>
                                                        <td className="p-3 text-slate-700">{item.department || '-'}</td>
                                                        <td className="p-3 text-slate-700">{item.position || '-'}</td>
                                                        <td className="p-3 text-slate-600 max-w-[150px] truncate" title={item.reason}>{item.reason || '-'}</td>
                                                        <td className="p-3 text-right">
                                                            <Button size="sm" variant="ghost" className="h-7 text-rose-500 hover:text-rose-700 hover:bg-rose-50" onClick={() => handleDeletePosition(item.id)}>
                                                                삭제
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {(!details?.position_history || details.position_history.length === 0) && (
                                                    <tr>
                                                        <td colSpan={5} className="p-8 text-center text-slate-400">
                                                            이력이 없습니다.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </>)}
                            </div>
                        )}

                        {activeTab === 'discretionary' && (
                            <div className="space-y-4 py-2">
                                {!currentEmployee?.id ? (
                                    <div className="p-8 text-center text-slate-500 border border-dashed rounded-xl bg-slate-50">
                                        <p>신규 직원 등록을 완료한 후 재량근무 이력을 추가할 수 있습니다.</p>
                                        <p className="text-xs mt-2 text-slate-400">기본 정보를 입력하고 [저장하기]를 눌러주세요.</p>
                                    </div>
                                ) : (<>
                                    {isEditing && (
                                        <div className="bg-slate-50 p-4 rounded-lg border">
                                            <h4 className="font-medium text-slate-700 mb-3">새 이력 추가</h4>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1">
                                                    <Label className="text-[11px] text-slate-500">적용 시작일</Label>
                                                    <Input
                                                        type="date"
                                                        value={newDiscStartDate}
                                                        onChange={e => setNewDiscStartDate(e.target.value)}
                                                        className="bg-white"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-[11px] text-slate-500">적용 종료일</Label>
                                                    <Input
                                                        type="date"
                                                        value={newDiscEndDate}
                                                        onChange={e => setNewDiscEndDate(e.target.value)}
                                                        className="bg-white"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-[11px] text-slate-500">지정 출근 시각</Label>
                                                    <Input
                                                        type="time"
                                                        value={newDiscStartTime}
                                                        onChange={e => setNewDiscStartTime(e.target.value)}
                                                        className="bg-white"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-[11px] text-slate-500">지정 퇴근 시각</Label>
                                                    <Input
                                                        type="time"
                                                        value={newDiscEndTime}
                                                        onChange={e => setNewDiscEndTime(e.target.value)}
                                                        className="bg-white"
                                                    />
                                                </div>
                                            </div>
                                            <Button onClick={handleAddDiscretionary} className="bg-indigo-600 hover:bg-indigo-700 mt-3 w-full">추가</Button>
                                        </div>
                                    )}

                                    <div className="border rounded-xl overflow-hidden">
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-50 border-b">
                                                <tr>
                                                    <th className="p-3 text-left font-medium text-slate-500">시작일</th>
                                                    <th className="p-3 text-left font-medium text-slate-500">종료일</th>
                                                    <th className="p-3 text-left font-medium text-slate-500">지정 출근</th>
                                                    <th className="p-3 text-left font-medium text-slate-500">지정 퇴근</th>
                                                    <th className="p-3 text-right font-medium text-slate-500">관리</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {details?.discretionary_history?.map((item: any) => (
                                                    <tr key={item.id} className="hover:bg-slate-50">
                                                        <td className="p-3 font-mono text-slate-700">{item.start_date}</td>
                                                        <td className="p-3 font-mono text-slate-700">{item.end_date}</td>
                                                        <td className="p-3 text-slate-700">{item.start_time || '09:00'}</td>
                                                        <td className="p-3 text-slate-700">{item.end_time || '18:00'}</td>
                                                        <td className="p-3 text-right">
                                                            <Button size="sm" variant="ghost" className="h-7 text-rose-500 hover:text-rose-700 hover:bg-rose-50" onClick={() => handleDeleteDiscretionary(item.id)}>
                                                                삭제
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {(!details?.discretionary_history || details.discretionary_history.length === 0) && (
                                                    <tr>
                                                        <td colSpan={5} className="p-8 text-center text-slate-400">
                                                            이력이 없습니다.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </>)}
                            </div>
                        )}

                        {activeTab === 'wage' && (
                            <div className="min-h-[300px] border rounded-lg overflow-hidden">
                                {!currentEmployee?.id ? (
                                    <div className="p-8 text-center text-slate-500">
                                        <p>신규 직원 등록을 완료한 후 시급 이력을 추가할 수 있습니다.</p>
                                        <p className="text-xs mt-2 text-slate-400">기본 정보를 입력하고 [저장하기]를 눌러주세요.</p>
                                    </div>
                                ) : (
                                    <>
                                        {isEditing && (
                                            <div className="bg-slate-50 p-4 rounded-lg border mb-4">
                                                <h4 className="font-medium text-slate-700 mb-3">새 시급 추가</h4>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <Input
                                                        type="date"
                                                        placeholder="적용일"
                                                        value={newWageDate}
                                                        onChange={e => setNewWageDate(e.target.value)}
                                                        className="bg-white"
                                                    />
                                                    <Input
                                                        type="number"
                                                        placeholder="시급(원)"
                                                        value={newWageAmount}
                                                        onChange={e => setNewWageAmount(e.target.value)}
                                                        className="bg-white"
                                                    />
                                                </div>
                                                <Button onClick={handleAddWage} className="bg-indigo-600 hover:bg-indigo-700 mt-3 w-full">추가</Button>
                                            </div>
                                        )}
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-50 text-slate-500 border-b">
                                                <tr>
                                                    <th className="p-3 text-left">적용 시작일</th>
                                                    <th className="p-3 text-right">시급(원)</th>
                                                    <th className="p-3 text-right">변동 내역</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {details?.wages?.length === 0 && (
                                                    <tr><td colSpan={3} className="p-8 text-center text-slate-400">시급 이력이 없습니다.</td></tr>
                                                )}
                                                {details?.wages?.map((w: any, idx: number) => {
                                                    const prev = details?.wages?.[idx + 1];
                                                    const diff = prev ? w.amount - prev.amount : 0;
                                                    return (
                                                        <tr key={idx} className="hover:bg-slate-50">
                                                            <td className="p-3 font-mono font-bold text-slate-700">{w.effective_date}</td>
                                                            <td className="p-3 text-right font-medium">
                                                                {editingWageId === w.value_id ? (
                                                                    <div className="flex items-center justify-end gap-2">
                                                                        <Input
                                                                            type="number"
                                                                            value={editingWageValue}
                                                                            onChange={e => setEditingWageValue(e.target.value)}
                                                                            className="h-7 w-24 text-right"
                                                                            autoFocus
                                                                        />
                                                                        <Button size="sm" className="h-7 px-2" onClick={handleUpdateWage}>저장</Button>
                                                                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingWageId(null)}>취소</Button>
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex items-center justify-end gap-2 group">
                                                                        <span>{w.amount.toLocaleString()}</span>
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            className="h-6 w-6 opacity-0 group-hover:opacity-100 p-0 text-slate-400 hover:text-indigo-600"
                                                                            onClick={() => {
                                                                                setEditingWageId(w.value_id);
                                                                                setEditingWageValue(w.amount);
                                                                            }}
                                                                        >
                                                                            <Edit2 className="w-3 h-3" />
                                                                        </Button>
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className={cn("p-3 text-right text-xs", diff > 0 ? "text-red-500" : diff < 0 ? "text-blue-500" : "text-slate-400")}>
                                                                {diff > 0 ? `+${diff.toLocaleString()}` : diff < 0 ? diff.toLocaleString() : '-'}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </>
                                )}
                            </div>
                        )}



                    </div>

                    <div className="border-t p-4 shrink-0 bg-slate-50 flex justify-end gap-2">
                        {!isEditing ? (
                            <>
                                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>닫기</Button>
                                <Button type="button" onClick={() => setIsEditing(true)} className="bg-indigo-600 hover:bg-indigo-700">
                                    <Edit2 className="w-4 h-4 mr-2" />
                                    수정하기
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button type="button" variant="outline" onClick={() => {
                                    if (currentEmployee?.id) setIsEditing(false);
                                    else setIsDialogOpen(false);
                                }}>취소</Button>
                                <Button type="submit" onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100">
                                    <CheckCircle2 className="w-4 h-4 mr-2" />
                                    저장하기
                                </Button>
                            </>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div >
    );
};
