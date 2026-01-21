import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useData } from '@/contexts/DataContext';

export const LoginPage = () => {
    const navigate = useNavigate();
    const { login } = useData(); // We will add login to DataContext later
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Login failed');

            // Success
            // In a real app, you might save token here. 
            // For now, we update Context state.
            // Assuming DataContext has a setUser or similar (we need to update it).
            // For now, let's store in localStorage and reload/redirect.
            localStorage.setItem('user', JSON.stringify(data.user));
            window.location.href = '/'; // Simple reload to refresh context

        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen grid lg:grid-cols-2">
            {/* Left: Branding */}
            <div className="hidden lg:flex flex-col bg-[#5A2F14] text-white p-16 justify-center items-center relative overflow-hidden">
                <div className="absolute inset-0 bg-[url('/eluon_logo.png?v=2')] bg-center bg-no-repeat bg-contain opacity-10 scale-150 transform translate-x-1/2"></div> {/* Background watermark effect */}

                <div className="z-10 flex flex-col items-start justify-center h-full w-full">
                    <img src="/eluon_logo.png?v=2" alt="ELUON" className="w-[80%] object-contain brightness-0 invert mb-8" /> {/* Huge Logo */}

                    <div>
                        <h1 className="text-5xl font-bold mb-6 leading-tight">HR System</h1>
                        <p className="text-white/80 text-xl font-light">
                            미래를 선도하는 IT 기술력,<br />
                            이루온의 통합 HR 시스템입니다.
                        </p>
                    </div>
                </div>

                <div className="absolute bottom-8 left-16 text-xs text-white/40">© 2026 Eluon. All rights reserved.</div>
            </div>

            {/* Right: Form */}
            <div className="flex items-center justify-center p-8 bg-background">
                <div className="w-full max-w-sm space-y-6">
                    <div className="space-y-2 text-center lg:text-left">
                        <h1 className="text-2xl font-semibold tracking-tight">로그인</h1>
                        <p className="text-sm text-muted-foreground">관리자 계정으로 로그인하세요.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70" htmlFor="email">
                                이메일
                            </label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="name@company.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70" htmlFor="password">
                                비밀번호
                            </label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>

                        {error && <div className="text-sm text-red-500 font-medium">{error}</div>}

                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading ? '로그인 중...' : '로그인'}
                        </Button>
                    </form>

                    <div className="text-center text-sm">
                        계정이 없으신가요?{' '}
                        <Link to="/signup" className="underline hover:text-primary">
                            회원가입
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};
