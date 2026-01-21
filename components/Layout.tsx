
import { LayoutDashboard, Upload, FileText, Settings, Users, UserCheck, UserPlus, Briefcase, LogOut, DollarSign } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { useNavigate, useLocation } from 'react-router-dom';
import React, { useEffect, useState } from 'react';

interface LayoutProps {
    children: React.ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
    const navigate = useNavigate();
    const [user, setUser] = useState<{ name: string; email: string; company_id: string } | null>(null);

    useEffect(() => {
        const userStr = localStorage.getItem('user');
        if (userStr) {
            setUser(JSON.parse(userStr));
        }
    }, []);

    const handleLogout = () => {
        if (confirm('로그아웃 하시겠습니까?')) {
            localStorage.removeItem('user');
            navigate('/login');
        }
    };

    return (
        <div className="min-h-screen bg-background text-foreground flex font-sans antialiased selection:bg-black selection:text-white">
            {/* Sidebar */}
            <aside className="w-64 border-r border-border bg-[#FAFAFA] fixed h-full z-20 hidden md:flex flex-col">
                <div className="p-6 pb-2">
                    <div className="flex flex-col items-start gap-1">
                        {/* Restore Logo */}
                        <img src="/eluon_logo.png?v=2" alt="ELUON" className="h-12 object-contain mb-2" />
                        <span className="text-[10px] text-primary/80 uppercase tracking-widest font-medium pl-0.5">HR System</span>
                    </div>
                </div>

                <nav className="flex-1 px-3 space-y-0.5 py-4">
                    <p className="px-3 text-[11px] font-semibold text-muted-foreground mb-2 mt-2 uppercase tracking-wider">인사 현황</p>
                    <NavItem icon={<LayoutDashboard size={16} />} label="대시보드" to="/" />
                    <NavItem icon={<DollarSign size={16} />} label="근태 캘린더" to="/attendance-calendar" />

                    <p className="px-3 text-[11px] font-semibold text-muted-foreground mb-2 mt-6 uppercase tracking-wider">근태 관리</p>
                    <NavItem icon={<Upload size={16} />} label="근태 데이터 관리" to="/processing" />
                    <NavItem icon={<Briefcase size={16} />} label="특근 데이터 관리" to="/special-work-management" />
                    <NavItem icon={<FileText size={16} />} label="최종 리포트" to="/reports" />

                    <p className="px-3 text-[11px] font-semibold text-muted-foreground mb-2 mt-6 uppercase tracking-wider">구성원 관리</p>
                    <NavItem icon={<Users size={16} />} label="직원 관리" to="/employees/regular" />
                    <NavItem icon={<UserCheck size={16} />} label="임원 관리" to="/employees/executives" />
                </nav>

                <nav className="px-3 space-y-0.5 py-4 pb-8">
                    <p className="px-3 text-[11px] font-semibold text-muted-foreground mb-2 mt-2 uppercase tracking-wider">전자 결재</p>
                    <NavItem icon={<FileText size={16} />} label="결재 관리" to="/approvals/management" />

                    <p className="px-3 text-[11px] font-semibold text-muted-foreground mb-2 mt-6 uppercase tracking-wider">시스템 설정</p>
                    <NavItem icon={<DollarSign size={16} />} label="시급/수당 설정" to="/hourly-wage" />
                    <NavItem icon={<Settings size={16} />} label="환경 설정" to="/settings" />
                    <NavItem icon={<UserPlus size={16} />} label="사번 일괄 업데이트(임시)" to="/temp/update-codes" />
                </nav>

                <div className="p-4 border-t border-border mt-auto">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold ring-1 ring-primary/20">
                            {user?.name?.[0] || 'U'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{user?.name || '사용자'}</p>
                            <p className="text-xs text-muted-foreground truncate">{user?.email || 'guest@example.com'}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={handleLogout}>
                            <LogOut size={16} />
                        </Button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 md:ml-64 relative min-h-screen flex flex-col bg-background">
                <header className="h-14 border-b border-border bg-white sticky top-0 z-10 flex items-center justify-between px-6 transition-all">
                    <div className="flex items-center text-sm">
                        <span className="text-muted-foreground mr-2">워크스페이스 /</span>
                        <span className="font-semibold">{user?.company_id === 'comp_eluon' ? '(주)이루온' : user?.company_id === 'comp_eluonins' ? '(주)이루온아이앤에스' : '개요'}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="sm" className="h-8 text-xs font-medium text-muted-foreground hover:text-foreground">사용 가이드</Button>
                        <Button variant="ghost" size="sm" className="h-8 text-xs font-medium text-muted-foreground hover:text-foreground">고객 지원</Button>
                    </div>
                </header>

                <div className="flex-1 p-6 md:p-8 w-full"> {/* Removed max-w-7xl, now full width */}
                    {children}
                </div>
            </main>
        </div>
    );
};



const NavItem = ({ icon, label, to }: { icon: React.ReactNode; label: string; to: string }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const active = location.pathname === to;

    return (
        <button
            onClick={() => navigate(to)}
            className={cn(
                "w-full flex items-center gap-2.5 h-9 px-3 rounded-md text-sm transition-all duration-200 outline-none",
                active
                    ? "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] text-foreground font-medium border border-border/50"
                    : "text-muted-foreground hover:text-foreground hover:bg-black/5"
            )}
        >
            <span className={cn("opacity-70", active && "opacity-100")}>{icon}</span>
            <span>{label}</span>
        </button>
    );
};

