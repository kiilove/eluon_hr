import React, { useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { ExcelParser } from '../lib/engine/excelParser';
import { useData } from '../contexts/DataContext';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';

export const UploadPage = () => {
    const [isDragActive, setIsDragActive] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { setRawLogs } = useData();
    const navigate = useNavigate();

    const processFile = async (file: File) => {
        setIsProcessing(true);
        setError(null);
        try {
            const rawLogs = await ExcelParser.parse(file);

            if (rawLogs.length === 0) {
                throw new Error("엑셀 파일에서 유효한 데이터를 찾을 수 없습니다.");
            }

            // [New Logic] Filter & Extract Employees
            const empMap = new Map();

            rawLogs.forEach(log => {
                if (log.originalClockIn || (log.clockIn && log.clockOut)) {
                    if (!empMap.has(log.userName)) {
                        empMap.set(log.userName, {
                            name: log.userName,
                            department: log.department,
                            position: log.userTitle,
                            source: 'excel'
                        });
                    }
                }
            });

            const employeesToSync = Array.from(empMap.values());
            console.log("Employees to sync:", employeesToSync);

            if (employeesToSync.length > 0) {
                const userStr = localStorage.getItem('user');
                const user = userStr ? JSON.parse(userStr) : null;
                const companyId = user?.company_id || 'comp_eluon';

                const payload = employeesToSync.map(e => ({ ...e, companyId }));

                const res = await fetch('/api/employees', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!res.ok) throw new Error("서버 동기화 실패");
            }

            // Update Context & Navigate
            setRawLogs(rawLogs);
            // navigate('/dashboard'); // OLD
            // NEW: Redirect to Data Processing Page
            navigate('/processing', { state: { initialData: rawLogs } });

        } catch (err: any) {
            console.error(err);
            setError(err.message || "파일 처리에 실패했습니다.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragActive(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragActive(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processFile(e.dataTransfer.files[0]);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            processFile(e.target.files[0]);
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="space-y-2 text-center mb-10">
                <h2 className="text-3xl font-bold tracking-tight">출퇴근 데이터 업로드</h2>
                <p className="text-muted-foreground">
                    엑셀 파일을 업로드하여 근로시간과 법규 준수 여부를 자동으로 계산하세요.
                </p>
            </div>

            <Card className="glass-card border-dashed border-2 overflow-hidden relative group">
                <div
                    className={cn(
                        "p-12 transition-all duration-300 flex flex-col items-center justify-center gap-4 cursor-pointer min-h-[300px]",
                        isDragActive ? "bg-primary/5 border-primary" : "border-border/50 hover:bg-card/40"
                    )}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => document.getElementById('file-upload')?.click()}
                >
                    <input
                        id="file-upload"
                        type="file"
                        className="hidden"
                        accept=".xlsx, .xls"
                        onChange={handleFileChange}
                    />

                    <div className={cn(
                        "w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4 transition-transform duration-500",
                        isDragActive ? "scale-110 bg-primary/20" : "group-hover:scale-105"
                    )}>
                        {isProcessing ? (
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                        ) : (
                            <Upload className="w-10 h-10 text-primary" />
                        )}
                    </div>

                    <div className="text-center space-y-2">
                        <h3 className="text-xl font-semibold">
                            {isProcessing ? "데이터 처리 중..." : "클릭하여 업로드하거나 파일을 드래그하세요"}
                        </h3>
                        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                            Supported formats: .xlsx, .xls (Max 10MB)
                        </p>
                    </div>
                </div>

                {isProcessing && (
                    <div className="absolute bottom-0 left-0 w-full h-1 bg-secondary">
                        <div className="h-full bg-primary animate-progress-indeterminate"></div>
                    </div>
                )}
            </Card>

            {error && (
                <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center gap-3 text-destructive animate-in fade-in slide-in-from-top-2">
                    <AlertCircle size={20} />
                    <p className="text-sm font-medium">{error}</p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
                <Card className="bg-card/30 border-none">
                    <CardContent className="pt-6 flex items-start gap-4">
                        <div className="p-2 rounded-md bg-green-500/10 text-green-500">
                            <FileSpreadsheet size={24} />
                        </div>
                        <div>
                            <h4 className="font-semibold mb-1">표준 템플릿</h4>
                            <p className="text-xs text-muted-foreground mb-3">업로드에 필요한 엑셀 양식을 다운로드합니다.</p>
                            <Button variant="link" className="h-auto p-0 text-primary text-xs">템플릿 다운로드</Button>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-card/30 border-none">
                    <CardContent className="pt-6 flex items-start gap-4">
                        <div className="p-2 rounded-md bg-blue-500/10 text-blue-500">
                            <CheckCircle size={24} />
                        </div>
                        <div>
                            <h4 className="font-semibold mb-1">자동 유효성 검사</h4>
                            <p className="text-xs text-muted-foreground">
                                시스템이 누락된 필드와 중복 데이터를 자동으로 확인합니다.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};
