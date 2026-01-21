import React from 'react';

interface CorrectionBadgeProps {
    original?: string;
    current?: string;
    simple?: boolean;
}

export function CorrectionBadge({ original, current, simple }: CorrectionBadgeProps) {
    // Basic normalization: Check if original exists and differs from current
    if (!original || !current) return null;

    // Normalize to compare
    const normOriginal = original.length > 5 ? original.substring(0, 5) : original;
    const normCurrent = current.length > 5 ? current.substring(0, 5) : current;

    if (normOriginal === normCurrent) return null;

    return (
        <div className="relative group inline-block ml-1 align-middle">
            {simple ? (
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 ring-4 ring-transparent cursor-help"></div>
            ) : (
                <span className="bg-amber-100 text-amber-700 text-[9px] px-1 py-0.5 rounded border border-amber-200 cursor-help font-normal flex items-center justify-center leading-none h-[14px]">
                    보정
                </span>
            )}

            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block min-w-[140px] bg-slate-800 text-white text-xs p-2.5 rounded shadow-xl z-[100] border border-slate-600">
                <div className="font-bold text-amber-400 mb-1.5 border-b border-slate-600 pb-1">원본 데이터</div>
                <div className="flex flex-col gap-1">
                    <div className="text-slate-300 flex justify-between">
                        <span>변경전:</span> <span className="text-white font-mono">{original}</span>
                    </div>
                    <div className="text-slate-300 flex justify-between">
                        <span>변경후:</span> <span className="text-green-400 font-mono">{current}</span>
                    </div>
                </div>
                <div className="text-slate-500 text-[10px] mt-2 text-right">(자동 보정됨)</div>
            </div>
        </div>
    )
}
