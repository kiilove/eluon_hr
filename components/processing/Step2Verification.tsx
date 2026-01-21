import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { WorkLogTable } from '../../components/WorkLogTable';
import { SidebarControls } from './SidebarControls';
import { ProcessedWorkLog } from "../../types";

interface Step2VerificationProps {
    filteredLogs: ProcessedWorkLog[];
    sortOption: 'NAME' | 'DEPT' | 'TITLE';
    onUpdateLog: (id: string, updates: Partial<ProcessedWorkLog>) => void;
    sidebarProps: any; // Pass all props for SidebarControls
}

export const Step2Verification: React.FC<Step2VerificationProps> = ({
    filteredLogs,
    sortOption,
    onUpdateLog,
    sidebarProps
}) => {
    return (
        <div className="flex flex-col lg:flex-row gap-6 items-start relative animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Main Content: WorkLogTable directly */}
            <div className="flex-1 min-w-0 w-full space-y-4">
                <Card className="glass-card">
                    <CardHeader>
                        <CardTitle className="flex justify-between items-center text-lg">
                            <span>일별 근태 내역</span>
                            <div className="flex gap-2 text-sm font-normal">
                                <span className="bg-muted px-2 py-1 rounded text-muted-foreground">
                                    {filteredLogs.length} Records
                                </span>
                            </div>
                        </CardTitle>
                        <CardDescription>
                            업로드된 데이터의 상세 내역입니다. (자동 보정: OFF)
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <WorkLogTable logs={filteredLogs} sortOption={sortOption} onUpdateLog={onUpdateLog} />
                    </CardContent>
                </Card>
            </div>

            {/* Sidebar - Editable Mode */}
            <SidebarControls {...sidebarProps} isReadOnly={false} />
        </div>
    );
};
