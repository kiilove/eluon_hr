import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Mail, KeyRound, Lock, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useMessageModal } from '@/contexts/MessageModalContext';

export const ForgotPasswordPage = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [email, setEmail] = useState("");
    const [pin, setPin] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const { showAlert } = useMessageModal();

    // Step 1: Send PIN
    const handleSendPin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
            const res = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await res.json() as any;
            if (res.ok) {
                setStep(2);
            } else {
                setError(data.error || "이메일 발송 실패");
            }
        } catch (err) {
            setError("네트워크 오류");
        } finally {
            setLoading(false);
        }
    };

    // Step 2: Verify PIN
    const handleVerifyPin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
            const res = await fetch('/api/auth/verify-pin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, pin })
            });
            const data = await res.json() as any;
            if (res.ok) {
                setStep(3);
            } else {
                setError(data.error || "인증 실패");
            }
        } catch (err) {
            setError("네트워크 오류");
        } finally {
            setLoading(false);
        }
    };

    // Step 3: Reset Password
    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, pin, newPassword: password })
            });
            const data = await res.json() as any;
            if (res.ok) {
                await showAlert("비밀번호가 변경되었습니다. 로그인해주세요.", { type: 'success' });
                navigate('/login');
            } else {
                setError(data.error || "비밀번호 변경 실패");
            }
        } catch (err) {
            setError("네트워크 오류");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md shadow-lg border-slate-200">
                <CardHeader className="space-y-1">
                    <div className="flex items-center gap-2 mb-2">
                        <Button variant="ghost" size="icon" className="h-8 w-8 -ml-2" onClick={() => navigate('/login')}>
                            <ArrowLeft className="w-4 h-4" />
                        </Button>
                        <CardTitle className="text-xl">비밀번호 찾기</CardTitle>
                    </div>
                    <CardDescription>
                        {step === 1 && "가입하신 이메일로 인증번호를 발송합니다."}
                        {step === 2 && "이메일로 전송된 6자리 인증번호를 입력하세요."}
                        {step === 3 && "새로운 비밀번호를 설정해주세요."}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {step === 1 && (
                        <form onSubmit={handleSendPin} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email">이메일</Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="user@example.com"
                                        className="pl-9"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        required
                                        autoFocus
                                    />
                                </div>
                            </div>
                            {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
                            <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={loading}>
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "인증번호 발송"}
                            </Button>
                        </form>
                    )}

                    {step === 2 && (
                        <form onSubmit={handleVerifyPin} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="pin">인증번호</Label>
                                <div className="relative">
                                    <KeyRound className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                    <Input
                                        id="pin"
                                        type="text"
                                        placeholder="123456"
                                        className="pl-9 font-mono tracking-widest text-lg"
                                        maxLength={6}
                                        value={pin}
                                        onChange={e => setPin(e.target.value)}
                                        required
                                        autoFocus
                                    />
                                </div>
                                <p className="text-[10px] text-slate-400">
                                    * 서버 콘솔(터미널)에서 인증번호를 확인하세요 (Test)
                                </p>
                            </div>
                            {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
                            <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={loading}>
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "확인"}
                            </Button>
                            <div className="text-center">
                                <button type="button" onClick={() => setStep(1)} className="text-xs text-slate-500 hover:underline">
                                    이메일 다시 입력하기
                                </button>
                            </div>
                        </form>
                    )}

                    {step === 3 && (
                        <form onSubmit={handleResetPassword} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="password">새 비밀번호</Label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                    <Input
                                        id="password"
                                        type="password"
                                        className="pl-9"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        required
                                        minLength={6}
                                        autoFocus
                                    />
                                </div>
                            </div>
                            {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
                            <Button type="submit" className="w-full bg-green-600 hover:bg-green-700" disabled={loading}>
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "비밀번호 변경 완료"}
                            </Button>
                        </form>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};
