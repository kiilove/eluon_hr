import React, { useState } from 'react';
import { WeeklySummary, CleansingSettings } from '../types';
import { ChevronRight, AlertTriangle, CheckCircle, ArrowRight, Scissors, Briefcase, FileSignature, Filter, Settings2 } from 'lucide-react';

interface Props {
  summaries: WeeklySummary[];
  onSelect: (employeeName: string) => void;
  settings: CleansingSettings;
}

const EmployeeList: React.FC<Props> = ({ summaries, onSelect, settings }) => {
  const [filterMode, setFilterMode] = useState<'all' | 'risky'>('risky');
  
  // Sort: Danger first
  const sortedSummaries = [...summaries].sort((a, b) => {
    // 1. Violation Risk (True first)
    if (a.violationRisk && !b.violationRisk) return -1;
    if (!a.violationRisk && b.violationRisk) return 1;
    // 2. Max Raw Hours (Desc)
    return b.maxRawHours - a.maxRawHours;
  });

  const filteredSummaries = filterMode === 'risky' 
    ? sortedSummaries.filter(s => s.weeks.some(w => w.status === 'danger' || w.status === 'warning'))
    : sortedSummaries;

  return (
    <>
      {/* Header & Filter */}
      <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-20">
        <div>
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <span className="w-1.5 h-4 bg-red-600 rounded-full"></span>
                초과 근로자 집중 관리
            </h3>
            <p className="text-xs text-slate-400 mt-1">1차 자동 보정 후에도 주 52시간을 초과하는 대상자 리스트입니다.</p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-lg">
            <button 
                onClick={() => setFilterMode('risky')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${filterMode === 'risky' ? 'bg-white text-red-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
            >
                <AlertTriangle className="w-3 h-3" />
                조치 필요 ({sortedSummaries.filter(s => s.violationRisk).length})
            </button>
            <button 
                onClick={() => setFilterMode('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${filterMode === 'all' ? 'bg-white text-blue-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
            >
                <Filter className="w-3 h-3" />
                전체 보기
            </button>
        </div>
      </div>
      
      <div className="overflow-auto flex-1 w-full bg-slate-50/30">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="bg-slate-50 text-slate-500 font-semibold sticky top-0 z-10 shadow-sm border-b border-slate-200">
            <tr>
              <th className="px-6 py-3 w-[20%]">대상자</th>
              <th className="px-6 py-3 w-[35%]">보정 전후 비교 (Worst Week)</th>
              <th className="px-6 py-3 w-[15%] text-center">최종 초과분</th>
              <th className="px-6 py-3 w-[20%]">추가 소명 항목 (Action)</th>
              <th className="px-6 py-3 w-[10%] text-right">상세</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {filteredSummaries.map((summary) => {
                const isDanger = summary.violationRisk; // Still > 52h after audit
                const isWarning = !isDanger && summary.maxRawHours > 52; // Fixed by audit
                
                // Calculate percentage for visual bar (Max 70h base)
                const rawPercent = Math.min(100, (summary.maxRawHours / 70) * 100);
                const auditPercent = Math.min(100, (summary.maxAuditHours / 70) * 100);
                const limitPercent = (52 / 70) * 100;

                return (
                  <tr 
                    key={summary.employeeName} 
                    onClick={() => onSelect(summary.employeeName)}
                    className={`hover:bg-slate-50 transition-colors cursor-pointer group ${isDanger ? 'bg-red-50/10' : ''}`}
                  >
                    {/* Name */}
                    <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${isDanger ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                                {summary.employeeName[0]}
                            </div>
                            <div>
                                <div className="font-bold text-slate-700">{summary.employeeName}</div>
                                <div className="text-[11px] text-slate-400 mt-0.5">개발팀 / 선임</div>
                            </div>
                        </div>
                    </td>
                    
                    {/* Before & After Graph */}
                    <td className="px-6 py-4 align-middle">
                        <div className="relative w-full h-8 bg-slate-100 rounded-md overflow-hidden mt-1">
                            {/* 52h Limit Line */}
                            <div className="absolute top-0 bottom-0 border-l-2 border-dashed border-red-300 z-10" style={{ left: `${limitPercent}%` }}></div>
                            
                            {/* Raw Bar (Background) */}
                            <div className="absolute top-2 bottom-2 left-0 bg-slate-300 rounded-r-sm" style={{ width: `${rawPercent}%` }}></div>
                            
                            {/* Audit Bar (Foreground) */}
                            <div className={`absolute top-2 bottom-2 left-0 rounded-r-sm transition-all duration-500 ${isDanger ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${auditPercent}%` }}></div>
                        </div>
                        <div className="flex justify-between text-[11px] mt-1.5 font-mono">
                            <span className="text-slate-500">Raw: <strong>{summary.maxRawHours}h</strong></span>
                            <div className="flex items-center gap-1 text-slate-400">
                                <ArrowRight className="w-3 h-3" />
                                <span className="text-[10px]">1차 보정</span>
                            </div>
                            <span className={`${isDanger ? 'text-red-600' : 'text-emerald-600'} font-bold`}>
                                After: {summary.maxAuditHours}h
                            </span>
                        </div>
                    </td>

                    {/* Excess */}
                    <td className="px-6 py-4 text-center">
                        {isDanger ? (
                            <div className="inline-flex flex-col items-center">
                                <span className="text-red-600 font-black text-sm">+{summary.maxExcessHours}h</span>
                                <span className="text-[10px] text-red-400 font-medium">위반 위험</span>
                            </div>
                        ) : (
                             <div className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-100">
                                <CheckCircle className="w-3 h-3" />
                                <span className="text-xs font-bold">Safe</span>
                             </div>
                        )}
                    </td>

                    {/* Action Items (Manual Intervention) */}
                    <td className="px-6 py-4">
                        {isDanger ? (
                            <div className="flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                                {settings.manualActions.length > 0 ? (
                                    settings.manualActions.map(action => (
                                        <button 
                                            key={action.id}
                                            onClick={() => alert(`${action.label} 적용: -${(action.deductionMinutes/60).toFixed(1)}시간 차감 (기능 시뮬레이션)`)}
                                            className="flex items-center justify-between text-[11px] bg-white border border-slate-200 hover:border-red-300 hover:text-red-600 text-slate-600 px-2 py-1.5 rounded shadow-sm transition-colors text-left group/btn"
                                        >
                                            <div className="flex items-center gap-2">
                                                <FileSignature className="w-3 h-3 flex-none text-slate-400 group-hover/btn:text-red-400" />
                                                <span className="truncate max-w-[80px]">{action.label}</span>
                                            </div>
                                            <span className="font-mono text-[10px] bg-slate-100 px-1 rounded ml-1 group-hover/btn:bg-red-50 text-slate-500 group-hover/btn:text-red-500">
                                                -{(action.deductionMinutes / 60).toFixed(1)}h
                                            </span>
                                        </button>
                                    ))
                                ) : (
                                    <div className="text-[10px] text-slate-400 italic flex items-center gap-1">
                                        <Settings2 className="w-3 h-3" />
                                        설정에서 항목 추가 필요
                                    </div>
                                )}
                            </div>
                        ) : isWarning ? (
                             <div className="text-xs text-slate-400 flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" />
                                <span>자동 보정 완료됨</span>
                             </div>
                        ) : (
                            <span className="text-xs text-slate-300">-</span>
                        )}
                    </td>

                    <td className="px-6 py-4 text-right">
                        <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-colors inline-block" />
                    </td>
                  </tr>
                );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
};

export default EmployeeList;