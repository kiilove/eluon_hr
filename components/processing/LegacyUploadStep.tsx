import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, Upload } from "lucide-react";
import { cn } from '@/lib/utils';

interface LegacyUploadStepProps {
    isProcessing: boolean;
    onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const LegacyUploadStep: React.FC<LegacyUploadStepProps> = ({ isProcessing, onUpload }) => {
    return (
        <Card className="h-96 border-dashed flex flex-col items-center justify-center bg-slate-50/50">
            <CardContent className="text-center space-y-6">
                <div className={cn(
                    "p-6 rounded-full bg-white shadow-lg mx-auto w-fit transition-transform duration-500",
                    isProcessing && "scale-110"
                )}>
                    {isProcessing ? (
                        <RefreshCw className="w-10 h-10 text-primary animate-spin" />
                    ) : (
                        <Upload className="w-10 h-10 text-primary" />
                    )}
                </div>
                <div className="space-y-2">
                    <h3 className="text-2xl font-bold text-slate-800">
                        {isProcessing ? '데이터 처리 중...' : '근태 데이터 업로드'}
                    </h3>
                    <p className="text-muted-foreground max-w-sm mx-auto">
                        엑셀 파일(.xlsx)을 업로드하면 자동으로 분석 및 1차 보정이 수행됩니다.
                    </p>
                </div>

                {!isProcessing && (
                    <div className="relative">
                        <Input
                            type="file"
                            accept=".xlsx, .xls"
                            className="hidden"
                            id="hidden-upload-legacy"
                            onChange={onUpload}
                        />
                        <Button size="lg" onClick={() => document.getElementById('hidden-upload-legacy')?.click()}>
                            파일 선택하기
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
