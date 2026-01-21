import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search, ArrowUpDown, Users, AlertTriangle, Clock, Plane, Filter, ArrowRight, CheckCircle2, Save, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LogStatus } from "../../types";

type SortOption = 'NAME' | 'DEPT' | 'TITLE';
type SidebarTab = 'ALL' | 'MANUAL_CHECK' | 'OVERTIME' | 'VACATION' | 'TF_ONLY';

interface SidebarControlsProps {
    isReadOnly: boolean;
    step: 1 | 2 | 3 | 4;
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    sortOption: SortOption;
    setSortOption: (option: SortOption) => void;
    activeTab: SidebarTab;
    handleTabChange: (tab: SidebarTab) => void;
    filterCounts: {
        ALL: number;
        MANUAL_CHECK: number;
        OVERTIME: number;
        VACATION: number;
        TF_ONLY: number; // Added to match usage
    };
    setStep: (step: 1 | 2 | 3 | 4) => void;
    isProcessing: boolean;
    handleOvertimeCorrection?: () => void;
    handleSaveToDB?: () => void;
    hasV3Data?: boolean;
    handleTfAutoCorrection?: () => void;
    onGlobalNightCorrection?: () => void; // Kept as optional
    // Deprecated legacy props - kept optional or remove if not used
    onAutoCorrect?: () => void;
    onReset?: () => void;
    onDownload?: () => void;
    filters?: {
        total: number;
        normal: number;
        overtime: number;
        special: number;
        vacation: number;
    };
    onMoveToStep4?: () => void; // [NEW] Link to Logic
}

export const SidebarControls: React.FC<SidebarControlsProps> = ({
    isReadOnly,
    step,
    searchTerm,
    setSearchTerm,
    sortOption,
    setSortOption,
    activeTab,
    handleTabChange,
    filterCounts,
    setStep,
    isProcessing,
    handleOvertimeCorrection,
    handleSaveToDB,
    hasV3Data,
    handleTfAutoCorrection,
    onGlobalNightCorrection,
    onMoveToStep4
}) => {
    return (
        <div className="w-full lg:w-72 shrink-0 space-y-4 lg:sticky lg:top-6 h-fit">
            {/* Filters */}
            <Card className="glass-card p-4 space-y-3 border-indigo-100 bg-indigo-50/30">
                <h3 className="text-sm font-semibold text-indigo-900 mb-2 flex items-center gap-2">
                    <Filter className="w-4 h-4" />
                    필터 및 정렬
                </h3>

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="이름/부서 검색..."
                        className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-indigo-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* Sort */}
                <div className="flex items-center border border-indigo-200 rounded-lg bg-white px-3 py-2 text-sm">
                    <ArrowUpDown className="mr-2 h-4 w-4 text-muted-foreground" />
                    <select
                        value={sortOption}
                        onChange={(e) => setSortOption(e.target.value as SortOption)}
                        className="bg-transparent outline-none flex-1 cursor-pointer"
                        title="Sort Options"
                    >
                        <option value="NAME">이름순</option>
                        <option value="DEPT">부서순</option>
                        <option value="TITLE">직급순</option>
                    </select>
                </div>

                {/* Tab Menu */}
                <div className="flex flex-col gap-1 w-full bg-white rounded-lg border border-indigo-100 p-1">
                    {[
                        { id: 'ALL', label: '전체 보기', icon: Users, count: filterCounts.ALL },
                        { id: 'MANUAL_CHECK', label: '수동 확인 필요', icon: AlertTriangle, color: 'text-amber-600', count: filterCounts.MANUAL_CHECK },
                        { id: 'OVERTIME', label: '연장 근무자', icon: Clock, color: 'text-purple-600', count: filterCounts.OVERTIME },
                        { id: 'VACATION', label: '휴가/출장', icon: Plane, color: 'text-sky-600', count: filterCounts.VACATION },
                        { id: 'TF_ONLY', label: '전략 인력', icon: Sparkles, color: 'text-indigo-600', count: filterCounts.TF_ONLY }
                    ]
                        .filter(tab => {
                            // in Step 3, hide Manual Check and Vacation
                            if (step === 3) {
                                return tab.id === 'ALL' || tab.id === 'OVERTIME';
                            }
                            return true;
                        })
                        .map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => handleTabChange(tab.id as SidebarTab)}
                                className={cn(
                                    "flex items-center justify-between w-full px-3 py-2 text-sm font-medium rounded-md transition-all",
                                    activeTab === tab.id
                                        ? "bg-indigo-50 text-indigo-700 shadow-sm"
                                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                )}
                            >
                                <div className="flex items-center">
                                    <tab.icon className={cn("w-4 h-4 mr-2", tab.color || "text-slate-500", activeTab === tab.id && "text-indigo-600")} />
                                    {tab.label}
                                </div>
                                {/* Count Badge */}
                                {(tab.count !== undefined && tab.count >= 0) && (
                                    <span className={cn(
                                        "px-1.5 py-0.5 rounded-md text-[10px] font-bold min-w-[20px] text-center",
                                        activeTab === tab.id ? "bg-indigo-200 text-indigo-800" : "bg-slate-100 text-slate-500"
                                    )}>
                                        {tab.count}
                                    </span>
                                )}
                            </button>
                        ))}
                </div>
            </Card>

            {/* Actions */}
            <Card className="glass-card p-4 space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground mb-2">
                    {isReadOnly ? '다음 단계' : '작업 완료'}
                </h3>
                {isReadOnly ? (
                    <Button
                        onClick={() => {
                            setStep(3);
                            handleTabChange('ALL');
                        }}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg py-6 text-base"
                    >
                        연장근로 관리 <ArrowRight className="ml-2 w-5 h-5" />
                    </Button>
                ) : (
                    <>
                        {step === 3 ? (
                            <>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">관리 도구</h4>
                                        <Button
                                            onClick={handleOvertimeCorrection}
                                            className={cn(
                                                "w-full justify-start shadow-sm transition-all",
                                                hasV3Data
                                                    ? "bg-white border text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                                    : "bg-orange-600 hover:bg-orange-700 text-white shadow-md py-6 text-base"
                                            )}
                                            variant={hasV3Data ? "outline" : "default"}
                                        >
                                            <div className={cn("p-1 rounded-full mr-2", hasV3Data ? "bg-slate-100" : "bg-white/20")}>
                                                <CheckCircle2 className={cn("w-4 h-4", hasV3Data ? "text-slate-500" : "text-white")} />
                                            </div>
                                            {hasV3Data ? "연장근로 재조치" : "연장근로 조치 실행"}
                                        </Button>

                                        {onGlobalNightCorrection && (
                                            <Button
                                                className="w-full justify-start gap-2 border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50"
                                                variant="outline"
                                                onClick={onGlobalNightCorrection}
                                            >
                                                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-200 text-xs font-medium text-indigo-700 dark:bg-indigo-800 dark:text-indigo-300">N</div>
                                                야간 근무 일괄 확인
                                            </Button>

                                        )}

                                        {handleTfAutoCorrection && (
                                            <Button
                                                className="w-full justify-start gap-2 border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50"
                                                variant="outline"
                                                onClick={handleTfAutoCorrection}
                                            >
                                                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-xs font-medium text-amber-700 dark:bg-amber-800 dark:text-amber-300">TF</div>
                                                전략 인력 자동 확인
                                            </Button>
                                        )}
                                    </div>

                                    {hasV3Data && (
                                        <>
                                            <div className="h-px bg-slate-200 my-2" />
                                            <div className="space-y-2">
                                                <h4 className="text-xs font-semibold text-green-600 uppercase tracking-wider pl-1 animate-pulse">다음 단계</h4>
                                                <Button
                                                    onClick={onMoveToStep4 || (() => setStep(4))}
                                                    className="w-full bg-green-600 hover:bg-green-700 text-white shadow-xl shadow-green-200/50 py-6 text-base font-bold transform hover:scale-[1.02] transition-all"
                                                >
                                                    최종 확인 및 리포트 생성 <ArrowRight className="ml-2 w-5 h-5" />
                                                </Button>
                                                <p className="text-[11px] text-center text-slate-400">
                                                    현재 상태 그대로 최종 리포트가 생성됩니다.
                                                </p>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </>
                        ) : (
                            <>
                                <Button
                                    onClick={() => setStep(3)}
                                    disabled={filterCounts.MANUAL_CHECK > 0}
                                    className={cn(
                                        "w-full shadow-lg py-6 text-base transition-all",
                                        filterCounts.MANUAL_CHECK > 0
                                            ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                                            : "bg-green-600 hover:bg-green-700 text-white shadow-green-200"
                                    )}
                                >
                                    연장근로 관리 <ArrowRight className="ml-2 w-5 h-5" />
                                </Button>
                                {filterCounts.MANUAL_CHECK > 0 && (
                                    <p className="text-xs text-amber-600 font-medium text-center mt-1">
                                        * 수동 확인 필요 항목({filterCounts.MANUAL_CHECK}건) 을 모두 처리해야 진행 가능합니다.
                                    </p>
                                )}
                                {/* [NEW] TF Manual Correction Button */}

                            </>
                        )}
                    </>
                )}
                <p className="text-xs text-center text-muted-foreground mt-2">
                    {isReadOnly
                        ? '수동 확인이 필요한 항목을 모두 처리한 후 연장근로 관리 단계로 진행합니다.'
                        : step === 3
                            ? (!hasV3Data
                                ? '연장근로 관리(조치)를 실행하여 연장근로를 확인합니다.'
                                : '조치 결과를 확인한 후 최종 확인 단계로 진행합니다.')
                            : '현재 상태로 최종 리포트를 생성합니다.'}
                </p>
            </Card>
        </div >
    );
};
