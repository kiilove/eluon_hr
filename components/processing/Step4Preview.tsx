import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ArrowRight, Save, Download, Search } from 'lucide-react';
import { ProcessedWorkLog } from "../../types";
import { WeeklyPreviewTable } from './WeeklyPreviewTable';

interface Step4PreviewProps {
    finalPreviewData: {
        weekGroups: Record<string, ProcessedWorkLog[]>;
        sortedMondays: string[];
    };
    setStep: (step: 1 | 2 | 3 | 4) => void;
    handleSaveToDB: () => void; // [Retored]
    handleDownloadExcel: () => void;
}

export const Step4Preview: React.FC<Step4PreviewProps> = ({
    finalPreviewData,
    setStep,
    handleSaveToDB,
    handleDownloadExcel
}) => {
    const [searchTerm, setSearchTerm] = useState("");

    // Filter Logic
    const filteredWeekGroups = useMemo(() => {
        if (!searchTerm.trim()) return finalPreviewData.weekGroups;

        const filtered: Record<string, ProcessedWorkLog[]> = {};
        Object.entries(finalPreviewData.weekGroups).forEach(([monday, logs]) => {
            const matchedLogs = logs.filter(log =>
                log.userName.includes(searchTerm) ||
                (log.department || "").includes(searchTerm) ||
                (log.employeeId || "").includes(searchTerm)
            );
            if (matchedLogs.length > 0) {
                filtered[monday] = matchedLogs;
            }
        });
        return filtered;
    }, [finalPreviewData, searchTerm]);

    const activeMondays = Object.keys(filteredWeekGroups).sort();

    return (
        <div className="space-y-6 animate-in zoom-in-95 duration-500 min-h-screen">
            {/* Header / Toolbar */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white p-4 rounded-xl border border-indigo-100 shadow-sm">
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="p-2 bg-green-100 rounded-full">
                        <CheckCircle2 className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-900">최종 확인 및 리포트</h3>
                        <p className="text-sm text-slate-500">생성된 최종 데이터를 검토하고 저장하세요.</p>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                    {/* Search */}
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="이름, 부서 검색..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 transition-all"
                        />
                    </div>

                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setStep(3)} className="text-slate-600">
                            <ArrowRight className="w-4 h-4 mr-2 rotate-180" />
                            이전
                        </Button>
                        <Button onClick={handleSaveToDB} className="bg-blue-600 hover:bg-blue-700 text-white shadow-md">
                            <Save className="w-4 h-4 mr-2" />
                            DB 저장
                        </Button>
                        <Button onClick={handleDownloadExcel} className="bg-green-700 hover:bg-green-800 text-white shadow-md">
                            <Download className="w-4 h-4 mr-2" />
                            다운로드
                        </Button>
                    </div>
                </div>
            </div>

            {/* Preview Tables */}
            {activeMondays.length > 0 ? (
                activeMondays.map(mondayStr => (
                    <WeeklyPreviewTable
                        key={mondayStr}
                        mondayStr={mondayStr}
                        weekLogs={filteredWeekGroups[mondayStr]}
                    />
                ))
            ) : (
                <div className="text-center py-20 text-slate-400">
                    검색 결과가 없습니다.
                </div>
            )}
        </div>
    );
};
