import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const SignupPage = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        companyId: '' // Default empty
    });
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({ ...prev, [e.target.id]: e.target.value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (formData.password !== formData.confirmPassword) {
            setError('비밀번호가 일치하지 않습니다.');
            return;
        }

        setIsLoading(true);

        try {
            const res = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formData.name,
                    email: formData.email,
                    password: formData.password,
                    companyId: formData.companyId
                }),
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Signup failed');

            // Success -> Auto Login or Redirect to Login
            alert('가입이 완료되었습니다. 로그인해주세요.');
            navigate('/login');

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
                <div className="z-10 flex flex-col items-start justify-center h-full w-full">
                    <img src="/eluon_logo.png?v=2" alt="ELUON" className="w-[80%] object-contain brightness-0 invert mb-8" />
                    <div>
                        <h1 className="text-5xl font-bold mb-6 leading-tight">HR System</h1>
                        <p className="text-white/80 text-xl font-light">
                            구성원의 효율적인 업무 관리를 위한<br />
                            새로운 워크스페이스를 시작하세요.
                        </p>
                    </div>
                </div>
                <div className="absolute bottom-8 left-16 text-xs text-white/40">© 2026 Eluon. All rights reserved.</div>
            </div>

            {/* Right: Form */}
            <div className="flex items-center justify-center p-8 bg-background">
                <div className="w-full max-w-sm space-y-6">
                    <div className="space-y-2 text-center lg:text-left">
                        <h1 className="text-2xl font-semibold tracking-tight">회원가입</h1>
                        <p className="text-sm text-muted-foreground">소속된 회사를 선택하고 계정을 생성하세요.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium" htmlFor="name">이름</label>
                            <Input id="name" value={formData.name} onChange={handleChange} required />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">소속 회사</label>
                            <div className="grid grid-cols-2 gap-3">
                                <div
                                    className={`cursor-pointer rounded-md border p-3 text-center text-sm font-medium transition-all hover:bg-zinc-50 ${formData.companyId === 'comp_eluon' ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary' : 'border-zinc-200 text-zinc-600'}`}
                                    onClick={() => setFormData(prev => ({ ...prev, companyId: 'comp_eluon' }))}
                                >
                                    (주)이루온
                                </div>
                                <div
                                    className={`cursor-pointer rounded-md border p-3 text-center text-sm font-medium transition-all hover:bg-zinc-50 ${formData.companyId === 'comp_eluonins' ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary' : 'border-zinc-200 text-zinc-600'}`}
                                    onClick={() => setFormData(prev => ({ ...prev, companyId: 'comp_eluonins' }))}
                                >
                                    (주)이루온아이앤에스
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium" htmlFor="email">이메일</label>
                            <Input id="email" type="email" placeholder="name@company.com" value={formData.email} onChange={handleChange} required />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium" htmlFor="password">비밀번호</label>
                            <Input id="password" type="password" value={formData.password} onChange={handleChange} required />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium" htmlFor="confirmPassword">비밀번호 확인</label>
                            <Input id="confirmPassword" type="password" value={formData.confirmPassword} onChange={handleChange} required />
                        </div>

                        {error && <div className="text-sm text-red-500 font-medium">{error}</div>}

                        <Button type="submit" className="w-full" disabled={isLoading || !formData.companyId}>
                            {isLoading ? '가입 중...' : '계정 생성'}
                        </Button>
                    </form>

                    <div className="text-center text-sm">
                        이미 계정이 있으신가요?{' '}
                        <Link to="/login" className="underline hover:text-primary">
                            로그인
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};
