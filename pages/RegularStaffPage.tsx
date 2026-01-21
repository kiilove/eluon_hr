import React, { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Plus, Trash2, Upload, FileSpreadsheet, Pencil, MoreHorizontal, Loader2, X, Edit2, LayoutGrid, List as ListIcon, Camera, UserCog, User, ChevronDown, Filter } from 'lucide-react';
import { Employee } from '../types';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { ExcelParser } from '../lib/engine/excelParser';
import { EmployeeExtractor } from '../lib/engine/employeeExtractor';

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

    // Selection for Bulk Delete
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Dialog State
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isuploading, setIsUploading] = useState(false);
    const [currentEmployee, setCurrentEmployee] = useState<Partial<Employee> | null>(null);
    const [details, setDetails] = useState<{ memos: any[], wages: any[], status_history: any[] } | null>(null);
    const [activeTab, setActiveTab] = useState<'info' | 'wage' | 'status'>('info');
    const [newMemo, setNewMemo] = useState("");

    // Wage Editing State
    const [editingWageId, setEditingWageId] = useState<string | null>(null);
    const [editingWageValue, setEditingWageValue] = useState<number | string>("");

    // Status Editing State
    const [newStatus, setNewStatus] = useState("ACTIVE");
    const [newStatusDate, setNewStatusDate] = useState("");
    const [newStatusReason, setNewStatusReason] = useState("");

    const handleAddStatus = async () => {
        if (!currentEmployee?.id || !newStatus || !newStatusDate) {
            alert("날짜와 상태를 모두 입력해주세요.");
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
                alert("상태 추가 실패");
            }
        } catch (e) { console.error(e); }
    };

    const handleDeleteStatus = async (id: string) => {
        if (!confirm("상태 이력을 삭제하시겠습니까?")) return;
        try {
            const res = await fetch(`/api/employees/status?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                if (currentEmployee?.id) fetchDetails(currentEmployee.id);
                fetchEmployees();
            } else {
                alert("삭제 실패");
            }
        } catch (e) { console.error(e); }
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
            } else { alert("수정 실패"); }
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
        if (!currentEmployee?.id || !confirm("메모를 삭제하시겠습니까?")) return;
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

            const payload = { ...currentEmployee, companyId };

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error("Failed to save");

            await fetchEmployees(); // Refresh
            setIsDialogOpen(false);
            setCurrentEmployee(null);
        } catch (error) {
            console.error(error);
            alert("저장에 실패했습니다.");
        }
    };

    const handleDelete = async (ids: string[]) => {
        if (!confirm(`${ids.length}명의 직원을 삭제하시겠습니까?`)) return;

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
            alert("삭제에 실패했습니다.");
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const rawData = await ExcelParser.parse(file);
            if (rawData.length === 0) {
                alert("데이터를 찾을 수 없습니다.");
                return;
            }

            const userStr = localStorage.getItem('user');
            const user = userStr ? JSON.parse(userStr) : {};
            const companyId = user.company_id;

            if (!companyId) {
                alert("회사 정보를 찾을 수 없습니다.");
                return;
            }

            const currentListRes = await fetch(`/api/employees?companyId=${companyId}`);
            const currentList = await currentListRes.json() as any[];

            const newEmployees = EmployeeExtractor.extractFromLogs(rawData, currentList)
                .map(e => ({ ...e, companyId: companyId })); // [Fix] Inject Company ID

            if (newEmployees.length > 0) {
                await EmployeeExtractor.saveEmployees(newEmployees);
                alert(`${newEmployees.length}명의 신규 직원이 등록되었습니다.\n(회사: ${companyId})`);
                await fetchEmployees();
            } else {
                alert("등록할 신규 직원이 없습니다.");
            }
        } catch (error) {
            console.error(error);
            alert("파일 처리 중 오류가 발생했습니다.");
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleProfileImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Limit size to 100KB to prevent easy DB bloat
        if (file.size > 100 * 1024) {
            alert("이미지 크기는 100KB 이하여야 합니다.");
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
        setIsDialogOpen(true);
    };

    const openEditDialog = (emp: Employee) => {
        setCurrentEmployee({ ...emp });
        setDetails(null);
        setActiveTab('info');
        setNewMemo("");
        fetchDetails(emp.id);
        setIsDialogOpen(true);
    };

    return (
        <div className="space-y-6 h-full flex flex-col p-4">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-2">
                <div>
                    <h2 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
                        임직원 관리
                    </h2>
                    <p className="text-muted-foreground mt-2 text-lg font-light">
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
                        <div className="relative">
                            <Input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept=".xlsx,.xls"
                                onChange={handleFileUpload}
                            />
                            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isuploading} className="shadow-sm border-indigo-100 hover:bg-indigo-50">
                                {isuploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2 text-green-600" />}
                                엑셀 일괄 등록
                            </Button>
                        </div>
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
                                    <div key={emp.id} className="group relative bg-white/70 backdrop-blur-md rounded-3xl p-6 border border-white/50 shadow-sm hover:shadow-xl hover:shadow-indigo-100 hover:-translate-y-1 transition-all duration-300">
                                        <div className="absolute top-4 right-4">
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

                                            <Button
                                                variant="outline"
                                                className="w-full rounded-xl border-indigo-100 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                                                onClick={() => openEditDialog(emp)}
                                            >
                                                <Pencil className="w-3.5 h-3.5 mr-2" />
                                                정보 수정
                                            </Button>
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
                                            <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                                                <td className="p-4 text-center">
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
                                                </td>
                                                <td className="p-4">
                                                    <div className="text-xs text-slate-500 space-y-0.5">
                                                        <p>{emp.email}</p>
                                                        <p>{emp.phone}</p>
                                                    </div>
                                                </td>
                                                <td className="p-4 text-right">
                                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-indigo-600" onClick={() => openEditDialog(emp)}>
                                                        <Pencil className="w-4 h-4" />
                                                    </Button>
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
                <DialogContent className="sm:max-w-[600px] overflow-visible">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold flex items-center gap-2">
                            {currentEmployee?.id ? <UserCog className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                            {currentEmployee?.id ? '직원 정보 수정' : '신규 직원 등록'}
                        </DialogTitle>
                        <DialogDescription>
                            직원의 상세 프로필 정보를 입력하고 관리합니다.
                        </DialogDescription>
                    </DialogHeader>


                    <div className="flex border-b mb-4">
                        <button
                            className={cn("px-4 py-2 font-medium text-sm transition-colors border-b-2", activeTab === 'info' ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700")}
                            onClick={() => setActiveTab('info')}
                        >
                            기본 정보
                        </button>
                        <button
                            className={cn("px-4 py-2 font-medium text-sm transition-colors border-b-2", activeTab === 'status' ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700")}
                            onClick={() => setActiveTab('status')}
                            disabled={!currentEmployee?.id}
                        >
                            상태 이력
                        </button>
                        <button
                            className={cn("px-4 py-2 font-medium text-sm transition-colors border-b-2", activeTab === 'wage' ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700")}
                            onClick={() => setActiveTab('wage')}
                            disabled={!currentEmployee?.id}
                        >
                            시급 이력
                        </button>
                    </div>

                    {activeTab === 'status' && (
                        <div className="space-y-6 py-2">
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
                        </div>
                    )}

                    {activeTab === 'info' && (
                        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6 py-2 overflow-y-auto max-h-[60vh] pr-2">
                            {/* Left: Avatar Upload */}
                            <div className="flex flex-col items-center gap-4">
                                <div className="relative group cursor-pointer w-40 h-40" onClick={() => profileImageInputRef.current?.click()}>
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
                                <div className="space-y-4">
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

                                    <div className="pt-2">
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

                    {activeTab === 'wage' && (
                        <div className="min-h-[300px] border rounded-lg overflow-hidden">
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
                        </div>
                    )}


                    <DialogFooter className="mr-6 mb-4">
                        <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>취소</Button>
                        <Button type="submit" onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700">저장하기</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    );
};
