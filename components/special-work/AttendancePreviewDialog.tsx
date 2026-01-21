import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, ArrowRight, FileDown } from 'lucide-react';
import { SpecialWorkExcelUtils } from '../../lib/excel/SpecialWorkExcelUtils';

export const AttendancePreviewDialog = ({ open, onOpenChange, logs, targets, onSave, onRegenerate, isSaving, isGenerating }: { open: boolean, onOpenChange: (o: boolean) => void, logs: any[], targets: Record<string, number>, onSave: () => void, onRegenerate: () => void, isSaving: boolean, isGenerating: boolean }) => {
    const [search, setSearch] = useState("");

    // Helper to calc duration
    const getDuration = (start: string, end: string, breakMin: number) => {
        const [sh, sm] = start.split(':').map(Number);
        const [eh, em] = end.split(':').map(Number);
        const diff = (eh * 60 + em) - (sh * 60 + sm);
        const actual = diff - breakMin;
        return { total: diff, actual };
    };

    // Grouping & Sorting
    const sortedGroups = React.useMemo(() => {
        const map = new Map<string, any[]>();
        logs.forEach(log => {
            const key = log.employeeName;
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(log);
        });

        const list = Array.from(map.entries()).map(([name, groupLogs]) => {
            // Sort by Date
            groupLogs.sort((a: any, b: any) => a.date.localeCompare(b.date));

            // Calc Error Status - Use RECOGNIZED hours (rounded) not actual
            let totalRecognizedMin = 0;
            const empId = groupLogs[0].employeeId;
            groupLogs.forEach((l: any) => {
                const { actual } = getDuration(l.startTime, l.endTime, l.breakMinutes);
                const recognizedMin = Math.round(actual / 60) * 60; // Round to nearest hour
                totalRecognizedMin += recognizedMin;
            });
            const generatedHours = Math.floor(totalRecognizedMin / 60);
            const targetHours = targets[empId] || 0;
            const errorDiff = Math.abs(generatedHours - targetHours);
            const hasError = errorDiff > 0.1; // Allow float variance

            return { name, groupLogs, hasError, generatedHours, targetHours };
        });

        // Sort: Error First, then Name
        return list.sort((a, b) => {
            if (a.hasError !== b.hasError) return a.hasError ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
    }, [logs, targets]);

    const filteredGroups = React.useMemo(() => {
        if (!search.trim()) return sortedGroups;
        const lower = search.toLowerCase();
        return sortedGroups.filter(g => g.name.toLowerCase().includes(lower));
    }, [sortedGroups, search]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
                <DialogHeader className="flex flex-row items-center justify-between pr-8 border-b pb-4">
                    <div className="space-y-1">
                        <DialogTitle className="flex items-center gap-2">
                            근태 생성 미리보기
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={onRegenerate}
                                disabled={isGenerating}
                                className="h-6 text-xs ml-2 gap-1 border-slate-300 text-slate-600 hover:text-blue-600 hover:border-blue-300"
                            >
                                {isGenerating ? "생성 중..." : "🔄 재생성"}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => SpecialWorkExcelUtils.exportToExcel(logs, targets)}
                                className="h-6 text-xs ml-2 gap-1 border-green-300 text-green-700 hover:bg-green-50 hover:border-green-400"
                            >
                                <FileDown size={12} /> 엑셀 저장
                            </Button>
                        </DialogTitle>
                        <CardDescription>
                            자동 생성된 근태 기록입니다. '적용하기'를 누르면 실제 근태 기록(WorkLogs)에 저장됩니다.
                            <br /><span className="text-red-500 font-bold text-xs">주의: 해당 날짜의 기존 근태 기록은 덮어쓰기 됩니다.</span>
                        </CardDescription>
                    </div>
                    <div className="relative w-[240px]">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="이름 검색..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full h-9 pl-9 pr-4 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white transition-colors"
                        />
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-auto bg-slate-50 p-4 space-y-4 rounded-md mt-2">
                    {filteredGroups.map(({ name, groupLogs, hasError, generatedHours, targetHours }) => {
                        const isMatch = !hasError;

                        return (
                            <div key={name} className={`border rounded-md bg-white shadow-sm overflow-hidden ${hasError ? 'ring-2 ring-red-100 border-red-200' : ''}`}>
                                <div className={`px-4 py-3 border-b flex justify-between items-center ${isMatch ? 'bg-slate-50' : 'bg-red-50/50'}`}>
                                    <div className="font-bold text-slate-800 flex items-center gap-2">
                                        {name}
                                        <span className="text-xs font-normal text-slate-500">({groupLogs.length}건)</span>
                                        {groupLogs[0].persona && (
                                            <span className="ml-2 text-xs font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100">
                                                {groupLogs[0].persona}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-sm space-x-4 flex items-center">
                                        <span className="text-slate-500">목표: <strong className="text-slate-800">{targetHours}시간</strong></span>
                                        <ArrowRight size={14} className="text-slate-300" />
                                        <span className="text-slate-500">생성: <strong className={`${isMatch ? 'text-green-600' : 'text-red-600'}`}>{generatedHours}시간</strong></span>
                                        {!isMatch && <span className="text-xs text-red-500 font-bold bg-red-100 px-2 py-0.5 rounded-full">오차 발생</span>}
                                    </div>
                                </div>
                                <table className="min-w-full text-xs text-left">
                                    <thead className="bg-slate-100 text-slate-600">
                                        <tr>
                                            <th className="px-4 py-1.5 w-32 border-b">날짜</th>
                                            <th className="px-4 py-1.5 text-center w-20 border-b">출근</th>
                                            <th className="px-4 py-1.5 text-center w-20 border-b">퇴근</th>
                                            <th className="px-4 py-1.5 text-center w-20 border-b">휴게</th>
                                            <th className="px-4 py-1.5 text-center w-24 border-b text-slate-600">실제근무</th>
                                            <th className="px-4 py-1.5 text-center w-24 border-b font-bold text-green-700">인정근무</th>
                                            <th className="px-4 py-1.5 w-32 border-b">비고 (사유)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {groupLogs.map((log: any, i: number) => {
                                            const { actual } = getDuration(log.startTime, log.endTime, log.breakMinutes);
                                            const h = Math.floor(actual / 60);
                                            const m = actual % 60;
                                            const actualTimeStr = `${h}시간` + (m > 0 ? ` ${m}분` : '');

                                            // Recognized hours (rounded to nearest hour)
                                            const recognizedHours = Math.round(actual / 60);
                                            const recognizedTimeStr = `${recognizedHours}시간`;

                                            return (
                                                <tr key={i} className="hover:bg-slate-50">
                                                    <td className="px-4 py-2 font-mono text-slate-600">{log.date}</td>
                                                    <td className="px-4 py-2 text-center text-blue-600 font-mono">{log.startTime}</td>
                                                    <td className="px-4 py-2 text-center text-blue-600 font-mono">{log.endTime}</td>
                                                    <td className="px-4 py-2 text-center text-slate-400">{log.breakMinutes > 0 ? `${log.breakMinutes}분` : '-'}</td>
                                                    <td className="px-4 py-2 text-center text-slate-600">{actualTimeStr}</td>
                                                    <td className="px-4 py-2 text-center font-bold text-green-700 bg-green-50/30">{recognizedTimeStr}</td>
                                                    <td className="px-4 py-2 text-slate-500 truncate max-w-[200px]">{log.description}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        );
                    })}
                    {filteredGroups.length === 0 && (
                        <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
                            표시할 데이터가 없습니다.
                        </div>
                    )}
                </div>

                <div className="flex justify-between items-center pt-4 border-t mt-0">
                    <div className="text-xs text-slate-500 pl-1">
                        총 {filteredGroups.length}명 / {logs.length}건
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
                        <Button onClick={onSave} disabled={isSaving || logs.length === 0} className="bg-blue-600 text-white hover:bg-blue-700">
                            {isSaving ? "저장 중..." : `적용하기 (${logs.length}건)`}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
