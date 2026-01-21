import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Search, Filter, ArrowUpDown } from 'lucide-react';

// --- Page Container ---
interface PageContainerProps {
    children: ReactNode;
    className?: string;
}
export const PageContainer = ({ children, className }: PageContainerProps) => {
    return (
        <div className={cn("space-y-8 max-w-[1600px] mx-auto", className)}>
            {children}
        </div>
    );
};

// --- Page Header ---
interface PageHeaderProps {
    title: string;
    description?: string;
    badges?: { label: string; color: string }[];
    actions?: ReactNode;
}
export const PageHeader = ({ title, description, badges, actions }: PageHeaderProps) => {
    return (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
            <div className="space-y-1">
                <h2 className="text-3xl font-extrabold tracking-tight flex items-center gap-2 text-slate-900 font-sans">
                    {title}
                    {badges?.map((b, i) => (
                        <span key={i} className={cn("px-2.5 py-0.5 rounded-full text-xs font-bold border", b.color)}>
                            {b.label}
                        </span>
                    ))}
                </h2>
                {description && <p className="text-slate-500 text-sm font-medium">{description}</p>}
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
    );
};

// --- Page Sidebar ---
interface PageSidebarProps {
    children: ReactNode;
    className?: string;
}
export const PageSidebar = ({ children, className }: PageSidebarProps) => {
    return (
        <aside className={cn("w-full lg:w-72 shrink-0 space-y-4 lg:sticky lg:top-6 h-fit", className)}>
            {children}
        </aside>
    );
};

// --- Sidebar Section ---
interface SidebarSectionProps {
    title: string;
    icon?: React.ElementType; // Lucide icon
    children: ReactNode;
    className?: string;
}
export const SidebarSection = ({ title, icon: Icon, children, className }: SidebarSectionProps) => {
    return (
        <Card className={cn("glass-card p-4 space-y-3 border-orange-100 bg-orange-50/30 shadow-none", className)}>
            <h3 className="text-xs font-bold text-orange-900/80 uppercase tracking-widest mb-2 flex items-center gap-2 px-1">
                {Icon && <Icon className="w-3.5 h-3.5" />}
                {title}
            </h3>
            {children}
        </Card>
    );
};

// --- Sidebar Menu Item ---
interface SidebarMenuItemProps {
    label: string;
    icon?: React.ElementType;
    isActive?: boolean;
    count?: number;
    onClick?: () => void;
    colorClass?: string;
}
export const SidebarMenuItem = ({ label, icon: Icon, isActive, count, onClick, colorClass }: SidebarMenuItemProps) => {
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex items-center justify-between w-full px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 group",
                isActive
                    ? "bg-orange-50 text-orange-800 shadow-sm ring-1 ring-orange-200"
                    : "text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-sm"
            )}
        >
            <div className="flex items-center">
                {Icon && <Icon className={cn("w-4 h-4 mr-3 transition-colors",
                    isActive ? "text-orange-600" : (colorClass || "text-slate-400 group-hover:text-slate-600")
                )} />}
                {label}
            </div>
            {count !== undefined && (
                <span className={cn(
                    "px-1.5 py-0.5 rounded-md text-[10px] font-bold min-w-[20px] text-center transition-colors",
                    isActive ? "bg-orange-200 text-orange-900" : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
                )}>
                    {count}
                </span>
            )}
        </button>
    );
};

// --- Page Content ---
interface PageContentProps {
    children: ReactNode;
    className?: string;
}
export const PageContent = ({ children, className }: PageContentProps) => {
    return (
        <main className={cn("flex-1 w-full min-w-0 space-y-6", className)}>
            {children}
        </main>
    );
};

// --- Standard Search Bar ---
interface StandardSearchProps {
    placeholder?: string;
    value: string;
    onChange: (val: string) => void;
    className?: string;
}
export const StandardSearch = ({ placeholder = "검색...", value, onChange, className }: StandardSearchProps) => {
    return (
        <div className={cn("relative", className)}>
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
                type="text"
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 h-10 transition-all font-medium placeholder:text-slate-400"
            />
        </div>
    );
};
