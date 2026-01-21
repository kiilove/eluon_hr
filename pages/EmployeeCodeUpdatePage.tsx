import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, FileDown, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';

interface UpdateResult {
    success: boolean;
    processed: number;
    successCount: number;
    failCount: number;
    failedNames: string[];
}

const EmployeeCodeUpdatePage = () => {
    const [user, setUser] = useState<{ company_id: string } | null>(null);
    const [file, setFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [previewData, setPreviewData] = useState<{ name: string, code: string }[]>([]);
    const [result, setResult] = useState<UpdateResult | null>(null);

    useEffect(() => {
        const userStr = localStorage.getItem('user');
        if (userStr) {
            setUser(JSON.parse(userStr));
        }
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setResult(null);
            parseExcel(e.target.files[0]);
        }
    };

    const parseExcel = async (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = e.target?.result;
            const workbook = XLSX.read(data, { type: 'binary' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

            // Simple Header Search
            let nameIdx = -1;
            let codeIdx = -1;
            let startRow = 0;

            for (let i = 0; i < Math.min(jsonData.length, 10); i++) {
                const row = jsonData[i] as any[];
                row.forEach((cell, idx) => {
                    if (typeof cell === 'string') {
                        if (cell.includes('사원명') || cell.includes('성명') || cell.includes('이름')) nameIdx = idx;
                        if (cell.includes('사원코드') || cell.includes('사번')) codeIdx = idx;
                    }
                });
                if (nameIdx !== -1 && codeIdx !== -1) {
                    startRow = i + 1;
                    break;
                }
            }

            if (nameIdx === -1 || codeIdx === -1) {
                alert('엑셀에서 "사원명"과 "사원코드" 열을 찾을 수 없습니다.');
                return;
            }

            const updates: { name: string, code: string }[] = [];
            for (let i = startRow; i < jsonData.length; i++) {
                const row = jsonData[i] as any[];
                if (!row || row.length === 0) continue;

                const name = row[nameIdx];
                const code = row[codeIdx];

                if (name && code) {
                    updates.push({ name: String(name).trim(), code: String(code).trim() });
                }
            }

            setPreviewData(updates);
        };
        reader.readAsBinaryString(file);
    };

    const handleUpdate = async () => {
        if (!user?.company_id || previewData.length === 0) return;

        if (!confirm(`${previewData.length}건의 사원코드를 업데이트하시겠습니까?`)) return;

        setIsProcessing(true);
        try {
            const res = await fetch('/api/management/update-codes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    companyId: user.company_id,
                    updates: previewData
                })
            });

            const data = await res.json();
            if (data.success) {
                setResult(data);
            } else {
                alert('업데이트 실패: ' + data.message);
            }
        } catch (e: any) {
            console.error(e);
            alert('오류 발생: ' + e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    console.log("EmployeeCodeUpdatePage Mounted");
    return (
        <div className="p-6 space-y-6" style={{ border: '5px solid red', minHeight: '500px' }}>
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold tracking-tight">사원코드 일괄 업데이트 (임시)</h1>
                <p className="text-muted-foreground">엑셀 파일을 업로드하여 사원코드를 업데이트합니다.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
                {/* Upload Card */}
                <Card>
                    <CardHeader>
                        <CardTitle>엑셀 파일 업로드</CardTitle>
                        <CardDescription>
                            '사원명', '사원코드' 컬럼이 포함된 엑셀 파일을 선택하세요.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center text-center hover:bg-slate-50 transition-colors">
                            <Input
                                type="file"
                                accept=".xlsx, .xls"
                                onChange={handleFileChange}
                                className="hidden"
                                id="excel-upload"
                            />
                            <label htmlFor="excel-upload" className="cursor-pointer flex flex-col items-center">
                                <FileDown className="w-10 h-10 text-slate-400 mb-2" />
                                <span className="text-sm font-medium text-slate-700">
                                    {file ? file.name : "파일 선택 클릭"}
                                </span>
                                <span className="text-xs text-slate-400 mt-1">
                                    .xlsx, .xls 형식 지원
                                </span>
                            </label>
                        </div>

                        {previewData.length > 0 && (
                            <div className="bg-slate-50 p-4 rounded-lg">
                                <p className="text-sm text-slate-600 font-medium mb-2">미리보기 (상위 5건)</p>
                                <div className="space-y-1">
                                    {previewData.slice(0, 5).map((item, idx) => (
                                        <div key={idx} className="flex justify-between text-xs border-b border-slate-200 pb-1 last:border-0">
                                            <span>{item.name}</span>
                                            <span className="font-mono text-indigo-600">{item.code}</span>
                                        </div>
                                    ))}
                                    {previewData.length > 5 && (
                                        <div className="text-xs text-slate-400 text-center pt-1">
                                            ... 외 {previewData.length - 5}건
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <Button
                            className="w-full"
                            disabled={!file || previewData.length === 0 || isProcessing}
                            onClick={handleUpdate}
                        >
                            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                            {previewData.length}건 업데이트 실행
                        </Button>
                    </CardContent>
                </Card>

                {/* Result Card */}
                <Card>
                    <CardHeader>
                        <CardTitle>처리 결과</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {result ? (
                            <div className="space-y-4">
                                <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
                                    <CheckCircle className="w-8 h-8 text-green-600" />
                                    <div>
                                        <div className="font-bold text-green-800">업데이트 완료</div>
                                        <div className="text-sm text-green-700">
                                            총 {result.processed}건 중 <span className="font-bold">{result.successCount}</span>건 성공
                                        </div>
                                    </div>
                                </div>

                                {result.failCount > 0 && (
                                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                                        <div className="flex items-center gap-2 mb-2 font-bold text-red-800">
                                            <AlertTriangle className="w-4 h-4" />
                                            실패: {result.failCount}건
                                        </div>
                                        <div className="text-xs text-red-600 max-h-40 overflow-y-auto bg-white p-2 rounded border border-red-100">
                                            <p className="font-medium mb-1">이름 매칭 실패 목록:</p>
                                            {result.failedNames.join(', ')}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-300 text-sm">
                                결과 대기 중...
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default EmployeeCodeUpdatePage;
