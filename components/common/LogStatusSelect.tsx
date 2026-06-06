import React from 'react';
import { cn } from '@/lib/utils';
import { LogStatus } from '../../types';

interface LogStatusSelectProps {
    value: LogStatus;
    onChange: (value: LogStatus) => void;
    className?: string;
    disabled?: boolean;
    variant?: 'default' | 'badge';
}

export const LogStatusSelect: React.FC<LogStatusSelectProps> = ({ value, onChange, className, disabled, variant = 'default' }) => {
    // Generate options dynamically or static tailored list
    const options = [
        { value: LogStatus.NORMAL, label: '정상', className: '' },
        { value: LogStatus.REST, label: '휴무', className: 'text-slate-500 bg-slate-50' },
        { value: LogStatus.SPECIAL, label: '특근', className: 'text-purple-500 bg-purple-50' },
        { value: LogStatus.VACATION, label: '휴가', className: 'text-blue-500 bg-blue-50' },
        { value: LogStatus.TRIP, label: '출장', className: 'text-indigo-500 bg-indigo-50' },
        { value: LogStatus.EDUCATION, label: '교육', className: 'text-teal-500 bg-teal-50' },
        { value: LogStatus.SICK, label: '병가', className: 'text-red-500 bg-red-50' },
        { value: LogStatus.OTHER, label: '기타', className: 'text-gray-500 bg-gray-50' },
        { value: LogStatus.RESIGNED, label: '퇴사', className: 'text-slate-400 decoration-line-through bg-slate-100' },
        { value: LogStatus.PRE_JOIN, label: '입사전', className: 'text-cyan-600 bg-cyan-50' },
    ];

    // Helper to get color for current value
    const getCurrentStyle = (val: LogStatus) => {
        const match = options.find(o => o.value === val);
        if (match && match.value !== LogStatus.NORMAL) {
            // Extract colors roughly
            if (val === LogStatus.VACATION) return "text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100";
            if (val === LogStatus.TRIP) return "text-indigo-600 border-indigo-200 bg-indigo-50 hover:bg-indigo-100";
            if (val === LogStatus.SPECIAL) return "text-purple-600 border-purple-200 bg-purple-50 hover:bg-purple-100";
            if (val === LogStatus.REST) return "text-slate-600 border-slate-200 bg-slate-50 hover:bg-slate-100";
            if (val === LogStatus.SICK) return "text-red-600 border-red-200 bg-red-50 hover:bg-red-100";
            if (val === LogStatus.EDUCATION) return "text-teal-600 border-teal-200 bg-teal-50 hover:bg-teal-100";
            if (val === LogStatus.RESIGNED) return "text-slate-500 border-slate-300 bg-slate-100 line-through decoration-slate-400";
            if (val === LogStatus.PRE_JOIN) return "text-cyan-700 border-cyan-200 bg-cyan-50 hover:bg-cyan-100";
            if (val === LogStatus.OTHER) return "text-gray-600 border-gray-200 bg-gray-50 hover:bg-gray-100";
        }
        return "text-slate-900 border-slate-200 bg-white hover:bg-slate-50";
    };

    const isBadge = variant === 'badge';

    return (
        <div className="relative group inline-block">
            <select
                value={value || LogStatus.NORMAL}
                onChange={(e) => onChange(e.target.value as LogStatus)}
                disabled={disabled}
                className={cn(
                    "appearance-none cursor-pointer font-medium transition-all shadow-sm outline-none focus:ring-1 focus:ring-offset-1",
                    // Base styles based on variant
                    isBadge
                        ? "text-[10px] rounded-full border py-0.5 px-2 text-center min-w-[50px] leading-none h-auto"
                        : "text-xs rounded-md border py-1.5 pl-2 pr-6 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400",
                    // Color styles
                    getCurrentStyle(value),
                    className
                )}
            >
                {options.map(opt => (
                    <option key={opt.value} value={opt.value} className={cn("bg-white text-slate-900 py-1", opt.className)}>
                        {opt.label}
                    </option>
                ))}
            </select>
            {/* Custom Arrow Icon - Hide for Badge */}
            {!isBadge && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-current opacity-50 flex items-center justify-center">
                    <svg width="8" height="6" viewBox="0 0 10 6" fill="none" className="stroke-current w-2 h-2">
                        <path d="M1 1L5 5L9 1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </div>
            )}
        </div>
    );
};
