import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Save } from 'lucide-react';
import { ProcessedWorkLog, LogStatus } from '../../types';
import { TimeUtils } from '../../lib/timeUtils';
import { calculateActualWork } from '../../lib/correctionUtils';
import { PolicyUtils } from '../../lib/policyUtils';
import { calculateStatusChangeUpdates } from '../../lib/engine/statusChangeEngine';
import { useData } from '../../contexts/DataContext';
import { SpecialWorkCalculator } from '../../lib/specialWorkCalculator';
import { cn } from '../../lib/utils';

interface DayEditDialogProps {
    isOpen: boolean;
    onClose: () => void;
    date: string; // YYYY-MM-DD
    initialLogs: ProcessedWorkLog[];
    onSaveSuccess: () => void;
}

export const DayEditDialog: React.FC<DayEditDialogProps> = ({ isOpen, onClose, date, initialLogs, onSaveSuccess }) => {
    const { config, policies } = useData();
    const [logs, setLogs] = useState<ProcessedWorkLog[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [modifiedIds, setModifiedIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (isOpen) {
            setLogs(JSON.parse(JSON.stringify(initialLogs))); // Deep copy
            setModifiedIds(new Set());
        }
    }, [isOpen, initialLogs]);

    const handleRawTimeChange = (id: string, field: 'startTime' | 'endTime', value: string) => {
        setLogs(prev => prev.map(log => {
            if (log.id !== id) return log;

            // Value comes as HH:mm:ss
            const timeParts = value.split(':');
            let minutes = 0;
            if (timeParts.length >= 2) {
                minutes = parseInt(timeParts[0]) * 60 + parseInt(timeParts[1]);
            }

            const isStart = field === 'startTime';
            const start = isStart ? minutes : log.startTime;
            const end = isStart ? log.endTime : minutes;

            // [Policy Aware] Apply Sanp & Calculation Logic
            const effectivePolicy = PolicyUtils.getPolicyForDate(log.date, policies);
            const activeConfig = effectivePolicy ? PolicyUtils.toGlobalConfig(effectivePolicy) : config;

            const { actualWork, totalDuration, breakDuration } = calculateActualWork(start, end, activeConfig);
            const overtime = Math.max(0, actualWork - (8 * 60)); // Default 8h for overtime threshold

            setModifiedIds(prevIds => new Set(prevIds).add(id));

            return {
                ...log,
                [field]: minutes,
                [`raw${field.charAt(0).toUpperCase() + field.slice(1)}Str`]: value,
                totalDuration,
                breakDuration,
                actualWorkDuration: actualWork,
                overtimeDuration: overtime
            };
        }));
    };

    const handleStatusChange = (id: string, newStatus: LogStatus) => {
        setLogs(prev => prev.map(log => {
            if (log.id !== id) return log;

            // [Policy Aware] Use active config for the specific date
            const effectivePolicy = PolicyUtils.getPolicyForDate(log.date, policies);
            const activeConfig = effectivePolicy ? PolicyUtils.toGlobalConfig(effectivePolicy) : config;

            const updates = calculateStatusChangeUpdates(log, newStatus, activeConfig);

            setModifiedIds(prevIds => new Set(prevIds).add(id));

            return { ...log, ...updates };
        }));
    };

    const CustomTimeInput = ({ value, onChange }: { value: string, onChange: (val: string) => void }) => {
        // Value format: HH:mm:ss (or HH:mm)
        // Parse into distinct parts
        const parts = (value || "00:00:00").split(':');
        const [h, setH] = useState(parts[0] || "00");
        const [m, setM] = useState(parts[1] || "00");
        const [s, setS] = useState(parts[2] || "00");

        useEffect(() => {
            const p = (value || "00:00:00").split(':');
            setH(p[0] || "00");
            setM(p[1] || "00");
            setS(p[2] || "00");
        }, [value]);

        const handleChange = (part: 'h' | 'm' | 's', val: string) => {
            // Allow only numbers
            if (!/^\d*$/.test(val)) return;
            if (val.length > 2) return;

            let newH = h;
            let newM = m;
            let newS = s;

            if (part === 'h') { newH = val; setH(val); }
            if (part === 'm') { newM = val; setM(val); }
            if (part === 's') { newS = val; setS(val); }
        };

        const handleBlur = () => {
            const pad = (v: string) => v.padStart(2, '0');
            const finalH = pad(h);
            const finalM = pad(m);
            const finalS = pad(s);

            // Update local state to show padded
            setH(finalH);
            setM(finalM);
            setS(finalS);

            onChange(`${finalH}:${finalM}:${finalS}`);
        };

        return (
            <div className="flex items-center gap-1 justify-center bg-white border rounded p-1 w-fit mx-auto">
                <input
                    className="w-6 text-center text-sm outline-none font-mono"
                    value={h}
                    onChange={(e) => handleChange('h', e.target.value)}
                    onBlur={handleBlur}
                    placeholder="HH"
                />
                <span className="text-slate-400">:</span>
                <input
                    className="w-6 text-center text-sm outline-none font-mono"
                    value={m}
                    onChange={(e) => handleChange('m', e.target.value)}
                    onBlur={handleBlur}
                    placeholder="MM"
                />
                <span className="text-slate-400">:</span>
                <input
                    className="w-6 text-center text-sm outline-none font-mono"
                    value={s}
                    onChange={(e) => handleChange('s', e.target.value)}
                    onBlur={handleBlur}
                    placeholder="SS"
                />
            </div>
        );
    };

    const handleSave = async () => {
        if (modifiedIds.size === 0) {
            onClose();
            return;
        }

        setIsSaving(true);
        try {
            const updates = logs.filter(l => modifiedIds.has(l.id));

            const res = await fetch('/api/processing/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });

            const json = await res.json() as any;
            if (json.success) {
                onSaveSuccess();
                onClose();
            } else {
                alert('저장 실패: ' + json.message);
            }
        } catch (e) {
            alert('저장 중 오류가 발생했습니다.');
            console.error(e);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>{date} 근태 기록 수정</DialogTitle>
                </DialogHeader>

                <div className="flex-1 min-h-0 border rounded-md mt-4">
                    <div className="h-[400px] overflow-y-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 sticky top-0 z-10">
                                <tr>
                                    <th className="p-2 text-left font-medium text-slate-500">이름/부서</th>
                                    <th className="p-2 text-center font-medium text-slate-500">상태</th>
                                    <th className="p-2 text-center font-medium text-slate-500">출근</th>
                                    <th className="p-2 text-center font-medium text-slate-500">퇴근</th>
                                    <th className="p-2 text-center font-medium text-slate-500">인정 근무</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map(log => {
                                    const isModified = modifiedIds.has(log.id);

                                    return (
                                        <tr key={log.id} className="border-t hover:bg-slate-50">
                                            <td className="p-2">
                                                <div className="font-medium">{log.userName}</div>
                                                <div className="text-xs text-slate-500">{log.department}</div>
                                            </td>
                                            <td className="p-2 text-center">
                                                <select
                                                    value={log.logStatus || LogStatus.NORMAL}
                                                    onChange={(e) => handleStatusChange(log.id, e.target.value as LogStatus)}
                                                    className={cn(
                                                        "text-xs border border-border/50 rounded px-2 py-1 bg-background focus:ring-1 focus:ring-primary outline-none",
                                                        log.logStatus === LogStatus.VACATION && "text-blue-500 border-blue-200 bg-blue-50",
                                                        log.logStatus === LogStatus.TRIP && "text-indigo-500 border-indigo-200 bg-indigo-50",
                                                        log.logStatus === LogStatus.SPECIAL && "text-purple-500 border-purple-200 bg-purple-50",
                                                        log.logStatus === LogStatus.REST && "text-slate-500 border-slate-200 bg-slate-50",
                                                        log.logStatus === LogStatus.SICK && "text-red-500 border-red-200 bg-red-50"
                                                    )}
                                                >
                                                    <option value={LogStatus.NORMAL}>정상</option>
                                                    <option value={LogStatus.REST}>휴무</option>
                                                    <option value={LogStatus.SPECIAL}>특근</option>
                                                    <option value={LogStatus.VACATION}>휴가</option>
                                                    <option value={LogStatus.TRIP}>출장</option>
                                                    <option value={LogStatus.EDUCATION}>교육</option>
                                                    <option value={LogStatus.SICK}>병가</option>
                                                    <option value={LogStatus.OTHER}>기타</option>
                                                </select>
                                            </td>
                                            <td className="p-2 text-center">
                                                <CustomTimeInput
                                                    value={log.rawStartTimeStr || TimeUtils.minutesToColonFormat(log.startTime)}
                                                    onChange={(val) => handleRawTimeChange(log.id, 'startTime', val)}
                                                />
                                            </td>
                                            <td className="p-2 text-center">
                                                <CustomTimeInput
                                                    value={log.rawEndTimeStr || TimeUtils.minutesToColonFormat(log.endTime)}
                                                    onChange={(val) => handleRawTimeChange(log.id, 'endTime', val)}
                                                />
                                            </td>
                                            <td className="p-2 text-center">
                                                <div className={isModified ? "text-blue-600 font-bold" : ""}>
                                                    {SpecialWorkCalculator.toRecognizedHours(log.actualWorkDuration)}h
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {logs.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-slate-500">
                                            기록이 없습니다.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <DialogFooter className="mt-4">
                    <Button variant="outline" onClick={onClose} disabled={isSaving}>취소</Button>
                    <Button onClick={handleSave} disabled={isSaving || modifiedIds.size === 0}>
                        <Save className="w-4 h-4 mr-2" />
                        {isSaving ? '저장 중...' : '변경사항 저장'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
