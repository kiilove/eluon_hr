
import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';
import { TimeUtils } from '../lib/timeUtils';
import { calculateActualWork, generateSafeTimeString, applyNewPolicies } from '../lib/correctionUtils';
import { ProcessedWorkLog, LogStatus, GlobalConfig, WorkPolicy } from "../types";
import { WorkHourCalculator } from '@/lib/workHourCalculator';
import { useData } from '../contexts/DataContext';
import { ExcelReportGenerator } from '@/lib/excelReportGenerator';
import { HolidayUtils } from '@/lib/holidayUtils';
import { PolicyUtils } from '../lib/policyUtils';
import { EmployeeDateValidator } from '../lib/employeeDateValidator';
import { useMessageModal } from '@/contexts/MessageModalContext';

// Components
import { ProcessingHeader } from '../components/processing/ProcessingHeader';
import { Step1Upload } from '../components/processing/Step1Upload';
import { AlertTriangle } from 'lucide-react';
import { Step2Verification } from '../components/processing/Step2Verification';
import { Step3Correction } from '../components/processing/Step3Correction';
import { Step4Preview } from '../components/processing/Step4Preview';
import { Button } from '@/components/ui/button';
import { LogStatusSelect } from '../components/common/LogStatusSelect';
import { LoadingOverlay } from '../components/ui/LoadingOverlay';

// Handlers
import * as RosterHandlers from '../lib/attendance/rosterHandlers';
import * as ProcessingHandlers from '../lib/attendance/processingHandlers';
import * as CorrectionHandlers from '../lib/attendance/correctionHandlers';
import * as StepTransitionHandlers from '../lib/attendance/stepTransitionHandlers';
import * as BulkConfirmationHandlers from '../lib/attendance/bulkConfirmationHandlers';
import * as MissingEmployeeHandlers from '../lib/attendance/missingEmployeeHandlers';
import * as PersistenceHandlers from '../lib/attendance/persistenceHandlers';
import * as ExportHandlers from '../lib/attendance/exportHandlers';
import * as ViewHandlers from '../lib/attendance/viewHandlers';
import * as DataFilterHandlers from '../lib/attendance/dataFilterHandlers';

// Engine Type Interfaces
interface ProcessedData {
    raw: any[];
    v1: ProcessedWorkLog[];
    v2: ProcessedWorkLog[];
    v3?: ProcessedWorkLog[];
    v4?: ProcessedWorkLog[];
    final: ProcessedWorkLog[];
}

type SortOption = 'NAME' | 'DEPT' | 'TITLE';
type SidebarTab = 'ALL' | 'MANUAL_CHECK' | 'OVERTIME' | 'VACATION' | 'TF_ONLY' | 'WEEK_VACATION';

export const AttendanceManagementPage = () => {
    const { config, policies } = useData();
    const { showAlert, showConfirm } = useMessageModal();
    const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
    const [data, setData] = useState<ProcessedData | null>(null);
    const [isDirectEdit, setIsDirectEdit] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState("");

    // Step 3 Filters
    const [searchTerm, setSearchTerm] = useState("");
    const [sortOption, setSortOption] = useState<SortOption>('NAME');
    const [activeTab, setActiveTab] = useState<SidebarTab>('ALL');
    const [stickyViolationUserIds, setStickyViolationUserIds] = useState<Set<string> | null>(null);
    const [tfUserNames, setTfUserNames] = useState<Set<string>>(new Set());
    const [tfUserIds, setTfUserIds] = useState<Set<string>>(new Set());

    const [hasCheckedMissing, setHasCheckedMissing] = useState(false);
    const [employeeCount, setEmployeeCount] = useState<number | null>(null);

    const location = useLocation();

    const refreshEmployees = () => RosterHandlers.refreshEmployees({ setTfUserNames, setTfUserIds, setEmployeeCount });

    useEffect(() => {
        refreshEmployees();
    }, []);

    // 1. Init from Navigation State
    useEffect(() => {
        if (location.state?.initialData && !data) {
            ProcessingHandlers.initFromUpload({
                location,
                policies,
                config,
                tfUserIds,
                tfUserNames,
                setTfUserNames,
                setTfUserIds,
                setData,
                setStep
            });
        }
    }, [location.state, data, config]);

    // [New] Step 4 Transition Logic
    useEffect(() => {
        if (step === 4 && data && !data.v4) {
            const sourceLogs = data.v3 || data.v2;
            StepTransitionHandlers.createV4State({
                sourceLogs,
                tfUserIds,
                tfUserNames
            }).then(v4Logs => {
                setData(prev => prev ? { ...prev, v4: v4Logs } : null);
            });
        }
    }, [step, data, tfUserIds, tfUserNames]);

    const handleTabChange = (tab: SidebarTab) => ViewHandlers.handleTabChange({
        tab,
        data,
        tfUserIds,
        tfUserNames,
        setStickyViolationUserIds,
        setActiveTab
    });

    const handleOvertimeCorrection = () => CorrectionHandlers.handleOvertimeCorrection({
        data,
        policies,
        config,
        tfUserIds,
        tfUserNames,
        setData,
        setActiveTab,
        setStickyViolationUserIds,
        showAlert
    });

    const handleUpdateLog = (id: string, updates: Partial<ProcessedWorkLog>) => CorrectionHandlers.handleUpdateLog({
        id,
        updates,
        data,
        policies,
        config,
        setData
    });

    const comparisonResult = useMemo(() => {
        if (!data?.v3) return null;
        const sourceLogs = data.v2;
        const processedLogs = data.v3;
        let correctionCount = 0;
        processedLogs.forEach(log => {
            const original = sourceLogs.find(o => o.id === log.id);
            if (original && (original.startTime !== log.startTime || original.endTime !== log.endTime || original.overtimeDuration !== log.overtimeDuration)) {
                correctionCount++;
            }
        });
        return { logs: processedLogs, count: correctionCount };
    }, [data?.v2, data?.v3]);

    const filteredLogs = useMemo(() => DataFilterHandlers.getFilteredLogs({
        data,
        step,
        searchTerm,
        activeTab,
        stickyViolationUserIds,
        tfUserIds,
        tfUserNames
    }), [data, step, searchTerm, activeTab, stickyViolationUserIds, tfUserIds, tfUserNames]);

    const filterCounts = useMemo(() => DataFilterHandlers.getFilterCounts({
        data,
        step,
        tfUserIds,
        tfUserNames
    }), [data, step, tfUserIds, tfUserNames]);

    const handleMoveToStep4 = () => StepTransitionHandlers.handleMoveToStep4({
        data,
        tfUserIds,
        tfUserNames,
        setData,
        setStep
    });

    const finalPreviewData = useMemo(() => DataFilterHandlers.getFinalPreviewData({
        data,
        step
    }), [data, step]);

    const handleSaveToDB = () => PersistenceHandlers.handleSaveToDB({
        data,
        showAlert,
        showConfirm,
        setIsProcessing,
        setLoadingMessage
    });

    const handleGlobalNightWorkCorrection = async () => {
        const sourceData = data?.v3 || data?.v2;
        if (!sourceData) return;
        const result = CorrectionHandlers.processNightCorrection(sourceData, config, policies);
        if (result.count === 0) {
            await showAlert("추가로 확인 필요한 야간 근무가 없습니다.", { type: 'info' });
            return;
        }
        setData(prev => {
            if (!prev) return null;
            if (prev.v3) return { ...prev, v3: result.logs };
            return { ...prev, v2: result.logs };
        });
        await showAlert(`${result.count}건의 야간 근무 작업이 일괄 확인되었습니다.`, { type: 'success' });
    };

    const handleDownloadExcel = () => ExportHandlers.handleDownloadExcel({
        data,
        showAlert
    });

    const handleApplyNaturalOvertime = () => CorrectionHandlers.handleApplyNaturalOvertime({
        data,
        policies,
        config,
        tfUserIds,
        tfUserNames,
        setData,
        showAlert
    });

    const handleConfirmAllWeekVacation = (forcedStatus?: LogStatus) => BulkConfirmationHandlers.handleConfirmAllWeekVacation({
        forcedStatus,
        data,
        config,
        policies,
        setData,
        showAlert
    });

    const handleResyncRoster = () => RosterHandlers.handleResyncRoster({
        setHasCheckedMissing,
        showAlert
    });

    const handleTfAutoCorrection = () => CorrectionHandlers.handleTfAutoCorrection({
        data,
        tfUserIds,
        tfUserNames,
        policies,
        config,
        setData,
        showAlert
    });

    useEffect(() => {
        if (step === 2 && data && !hasCheckedMissing) {
            MissingEmployeeHandlers.checkMissing({
                data,
                policies,
                config,
                setData,
                setTfUserIds,
                setTfUserNames,
                setHasCheckedMissing,
                showAlert
            });
        }
    }, [step, data, hasCheckedMissing]);

    const sidebarProps = {
        isReadOnly: false,
        step,
        searchTerm,
        setSearchTerm,
        sortOption,
        setSortOption,
        activeTab,
        handleTabChange,
        filterCounts,
        setStep,
        handleOvertimeCorrection,
        handleSaveToDB,
        handleTfAutoCorrection,
        onConfirmAllWeekVacation: handleConfirmAllWeekVacation,
        onResyncRoster: handleResyncRoster,
        onApplyNaturalOvertime: handleApplyNaturalOvertime,
        hasV3Data: !!data?.v3
    };

    const handleLoadExisting = (start: Date, end: Date) => ProcessingHandlers.handleLoadExisting({
        start,
        end,
        showAlert,
        setData,
        setStep,
        setIsDirectEdit
    });

    return (
        <div className="space-y-6 pb-20">
            <ProcessingHeader
                step={step}
                setStep={(newStep) => {
                    if (isDirectEdit && (newStep === 1 || newStep === 2)) {
                        showAlert("수정 모드에서는 이전 단계(업로드/검증)로 돌아갈 수 없습니다.", { type: 'warning' });
                        return;
                    }
                    if (newStep === 4) {
                        handleMoveToStep4();
                    } else {
                        setStep(newStep);
                    }
                }}
                hasData={!!data}
            />

            {step === 1 && (
                <div className="space-y-4">
                    {employeeCount === 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                            <div>
                                <h3 className="font-medium text-amber-900">시급 데이터가 없습니다</h3>
                                <p className="text-sm text-amber-700 mt-1">
                                    등록된 직원이 없습니다. 정확한 급여 계산을 위해 <strong>[시급 관리]</strong> 메뉴에서 시급 데이터를 먼저 업로드해주세요.<br />
                                    시급 데이터 업로드 시 직원이 자동으로 생성됩니다.
                                </p>
                            </div>
                        </div>
                    )}
                    <Step1Upload
                        setData={setData}
                        setStep={setStep}
                        config={config}
                        policies={policies}
                        tfUserNames={tfUserNames}
                        tfUserIds={tfUserIds}
                        onLoadExisting={handleLoadExisting}
                    />
                </div>
            )}

            {step === 2 && data && (
                <Step2Verification
                    filteredLogs={filteredLogs}
                    sortOption={sortOption}
                    onUpdateLog={handleUpdateLog}
                    sidebarProps={sidebarProps}
                />
            )}

            {step === 3 && data && (
                <Step3Correction
                    data={data}
                    filteredLogs={filteredLogs}
                    sortOption={sortOption}
                    onUpdateLog={handleUpdateLog}
                    sidebarProps={sidebarProps}
                    comparisonResult={comparisonResult}
                    onGlobalNightCorrection={handleGlobalNightWorkCorrection}
                    searchTerm={searchTerm}
                    onMoveToStep4={handleMoveToStep4}
                    onApplyNaturalOvertime={handleApplyNaturalOvertime}
                />
            )}

            {step === 4 && finalPreviewData && (
                <Step4Preview
                    finalPreviewData={finalPreviewData}
                    setStep={setStep}
                    handleSaveToDB={handleSaveToDB}
                    handleDownloadExcel={handleDownloadExcel}
                />
            )}

            <LoadingOverlay isVisible={isProcessing} message={loadingMessage} />
        </div>
    );
};
