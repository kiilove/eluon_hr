import React from 'react';
import { TimeRecord } from '../types';
import { ArrowLeft, User, FileText, CalendarClock, CalendarDays } from 'lucide-react';

interface Props {
  records: TimeRecord[];
  employeeName: string;
  onBack: () => void;
}

const AuditTable: React.FC<Props> = ({ records, employeeName, onBack }) => {
  // Group records by week number
  const recordsByWeek = records.reduce((acc, record) => {
    const week = record.weekNumber || 1;
    if (!acc[week]) acc[week] = [];
    acc[week].push(record);
    return acc;
  }, {} as Record<number, TimeRecord[]>);

  return (
    <>
      <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 sticky top-0 z-20 backdrop-blur-sm">
        <div className="flex items-center gap-4">
            <button 
                onClick={onBack}
                className="flex items-center justify-center w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300 transition-all shadow-sm"
            >
                <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <User className="w-4 h-4 text-blue-600" />
                    {employeeName} 님 상세 로그
                </h3>
            </div>
        </div>
        <div className="flex items-center gap-2">
             <button className="text-[11px] font-medium text-slate-600 bg-white px-3 py-1.5 border border-slate-200 rounded-md shadow-sm hover:bg-slate-50 flex items-center gap-1">
                <FileText className="w-3 h-3" />
                리포트 다운로드
             </button>
        </div>
      </div>
      
      <div className="overflow-auto flex-1 w-full animate-fade-in bg-slate-50/50 p-6">
        <div className="space-y-6">
        {Object.keys(recordsByWeek).map((weekKey) => {
            const weekNum = Number(weekKey);
            const weekRecords = recordsByWeek[weekNum];
            const weekTotal = weekRecords.reduce((s, r) => s + r.auditWorkMinutes, 0) / 60;
            const isOver = weekTotal > 52;

            return (
                <div key={weekNum} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                        <h4 className="font-bold text-slate-700 flex items-center gap-2 text-sm">
                            <CalendarClock className="w-4 h-4 text-slate-400" />
                            {weekNum}주차 근로 내역
                        </h4>
                        <div className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${isOver ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                            주 합계: {weekTotal.toFixed(1)}h
                        </div>
                    </div>
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="text-xs text-slate-500 font-semibold border-b border-slate-100 bg-slate-50/50">
                            <tr>
                                <th className="px-4 py-3 w-[12%] pl-6">일자</th>
                                <th className="px-2 py-3 w-[15%] text-center">출퇴근(Raw)</th>
                                <th className="px-2 py-3 w-[12%] text-center bg-yellow-50/50 text-yellow-800">1차(법정)</th>
                                <th className="px-2 py-3 w-[12%] text-center text-slate-500">2차(정책)</th>
                                <th className="px-2 py-3 w-[12%] text-center text-slate-500">3차(수동)</th>
                                <th className="px-4 py-3 w-[25%]">조정 사유</th>
                                <th className="px-4 py-3 w-[12%] text-right pr-6">최종 인정</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {weekRecords.map(record => {
                                const isHoliday = record.isHoliday;
                                return (
                                <tr key={record.id} className={`transition-colors ${isHoliday ? 'bg-red-50/40 hover:bg-red-50/70' : 'hover:bg-slate-50'}`}>
                                    <td className="px-4 py-3 pl-6 text-slate-600 font-medium text-xs">
                                        <div className="flex items-center gap-2">
                                            <span>{record.date.split(' ')[0]} <span className={`ml-1 ${isHoliday ? 'text-red-600 font-bold' : 'text-slate-400'}`}>{record.date.split(' ')[1]}</span></span>
                                            {isHoliday && (
                                                <span className="text-[9px] bg-red-100 text-red-600 px-1 py-0.5 rounded border border-red-200 flex items-center gap-0.5">
                                                    <CalendarDays className="w-2.5 h-2.5" />
                                                    휴일
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    
                                    <td className="px-2 py-3 text-center text-slate-400 font-mono text-xs">
                                        {record.rawStartTime} ~ {record.rawEndTime}
                                    </td>

                                    {/* 1st Calc: Statutory */}
                                    <td className="px-2 py-3 text-center font-mono text-xs text-yellow-700 bg-yellow-50/30 font-medium">
                                        -{record.statutoryBreakMinutes}m
                                    </td>

                                    {/* 2nd Calc: Policy */}
                                    <td className="px-2 py-3 text-center font-mono text-xs text-slate-500">
                                        {record.policyDeductionMinutes > 0 ? `-${record.policyDeductionMinutes}m` : '-'}
                                    </td>

                                    {/* 3rd Calc: Manual */}
                                    <td className="px-2 py-3 text-center font-mono text-xs text-slate-500">
                                        {record.manualDeductionMinutes > 0 ? `-${record.manualDeductionMinutes}m` : '-'}
                                    </td>

                                    <td className="px-4 py-3">
                                        <div className="flex flex-wrap gap-1">
                                            {record.changes.length === 0 ? (
                                                <span className="text-slate-300 text-[11px]">-</span>
                                            ) : (
                                                record.changes.map((reason, idx) => (
                                                    <span 
                                                        key={idx} 
                                                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                                                            reason.includes('Buffer') ? 'bg-slate-100 text-slate-500 border-slate-200' :
                                                            reason.includes('석식') ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                                            reason.includes('휴일') ? 'bg-red-100 text-red-600 border-red-200' :
                                                            'bg-amber-50 text-amber-700 border-amber-100'
                                                        }`}
                                                    >
                                                        {reason}
                                                    </span>
                                                ))
                                            )}
                                        </div>
                                    </td>

                                    <td className="px-4 py-3 text-right pr-6">
                                        <span className={`text-sm font-bold ${record.auditWorkMinutes !== record.rawWorkMinutes ? "text-blue-600" : "text-slate-600"}`}>
                                            {(record.auditWorkMinutes / 60).toFixed(1)}h
                                        </span>
                                    </td>
                                </tr>
                            )})}
                        </tbody>
                    </table>
                </div>
            );
        })}
        </div>
      </div>
    </>
  );
};

export default AuditTable;
