import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';
import { WorkLogTable } from '../../components/WorkLogTable';
import { SidebarControls } from './SidebarControls';
import { ProcessedWorkLog } from "../../types";

interface Step3CorrectionProps {
    data: any; // ProcessedData
    filteredLogs: ProcessedWorkLog[]; // For Preparation Mode
    sortOption: 'NAME' | 'DEPT' | 'TITLE';
    onUpdateLog: (id: string, updates: Partial<ProcessedWorkLog>) => void;
    sidebarProps: any;
    comparisonResult: any; // Result from useMemo
    searchTerm: string;
    onGlobalNightCorrection: () => void;
    onMoveToStep4: () => void; // [NEW] Handler
}

export const Step3Correction: React.FC<Step3CorrectionProps> = ({
    data,
    filteredLogs,
    sortOption,
    onUpdateLog,
    sidebarProps,
    comparisonResult,
    searchTerm,
    onGlobalNightCorrection,
    onMoveToStep4
}) => {
    const v2Logs = data?.v2 || [];
    const v3Logs = data?.v3;

    // ... (Preparation Mode Remains Unchanged) ...
    if (!v3Logs) {
        return (
            <div className="flex flex-col lg:flex-row gap-6 items-start relative animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex-1 min-w-0 w-full space-y-4">
                    <Card className="glass-card">
                        <CardHeader>
                            <CardTitle className="flex justify-between items-center text-lg">
                                <span>연장근로 관리 준비</span>
                                <div className="flex gap-2 text-sm font-normal">
                                    <span className="bg-muted px-2 py-1 rounded text-muted-foreground">
                                        {v2Logs.length} Records
                                    </span>
                                </div>
                            </CardTitle>
                            <CardDescription>
                                "연장근로 관리 실행" 버튼을 클릭하여 연장근로를 자동으로 관리(확인)합니다.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <WorkLogTable logs={filteredLogs} sortOption={sortOption} onUpdateLog={onUpdateLog} />
                        </CardContent>
                    </Card>
                </div>
                <SidebarControls
                    {...sidebarProps}
                    isReadOnly={false}
                    onGlobalNightCorrection={onGlobalNightCorrection}
                />
            </div>
        );
    }

    // V3 exists - Show Result Mode
    const { changeMap } = comparisonResult!;
    const finalDisplayLogs = filteredLogs;

    return (
        <div className="flex flex-col lg:flex-row gap-6 items-start relative animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex-1 min-w-0 w-full space-y-4">
                <Card className="glass-card border-green-200 bg-green-50/10">
                    <CardHeader className="bg-gradient-to-r from-indigo-50 to-white pb-6 border-b border-indigo-50">
                        <div className="flex justify-between items-center">
                            <div>
                                <CardTitle className="text-xl text-indigo-900">연장근로 조치 완료 ({comparisonResult?.changedCount || 0}건)</CardTitle>
                                <CardDescription className="text-indigo-700 mt-1">
                                    조치된 데이터를 확인하세요. <span className="inline-block w-3 h-3 bg-green-500 rounded-full mx-1"></span> 녹색 색상은 변경된 값입니다. (마우스 오버 시 이전 값 표시)
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <WorkLogTable
                            logs={finalDisplayLogs}
                            sortOption={sortOption}
                            onUpdateLog={onUpdateLog}
                            changeMap={changeMap}
                        />
                    </CardContent>
                </Card>
            </div>
            <SidebarControls
                {...sidebarProps}
                isReadOnly={false}
                onGlobalNightCorrection={onGlobalNightCorrection}
            />
        </div>
    );
};
