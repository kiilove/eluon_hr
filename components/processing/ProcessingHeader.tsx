import React from 'react';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Upload, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProcessingHeaderProps {
    step: 1 | 2 | 3 | 4;
    setStep: (step: 1 | 2 | 3 | 4) => void;
    hasData: boolean;
}

export const ProcessingHeader: React.FC<ProcessingHeaderProps> = ({ step, setStep, hasData }) => {
    return (
        <div className="space-y-6">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        근태 데이터 관리
                        <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold border border-blue-200">Beta</span>
                    </h2>
                    <p className="text-muted-foreground mt-1">
                        데이터 업로드 및 확인, 최종 관리 프로세스입니다.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => window.location.reload()}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        초기화
                    </Button>
                </div>
            </div>

            {/* Stepper / Progress */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                    { s: 1, label: '원본 업로드', icon: Upload, desc: '엑셀 파일 원본' },
                    { s: 2, label: '데이터 확인', icon: ShieldCheck, desc: '데이터 검수 및 확인' },
                    { s: 3, label: '연장 관리', icon: CheckCircle2, desc: '연장근로 확인' },
                    { s: 4, label: '최종 확인', icon: CheckCircle2, desc: '완료' }
                ].map((item) => (
                    <Card
                        key={item.s}
                        className={cn(
                            "transition-all duration-200 cursor-pointer hover:shadow-lg",
                            step === item.s ? "border-primary border-2 shadow-md bg-primary/5" : "border-border/50",
                            step > item.s ? "bg-muted/50 opacity-70 hover:opacity-90" : "",
                            // Disable navigation to future steps or step 1 if no data
                            (item.s > step || (item.s === 1 && hasData)) && "pointer-events-none opacity-50"
                        )}
                        onClick={() => {
                            // Allow navigation to current or previous steps
                            if (item.s <= step && hasData) {
                                setStep(item.s as 1 | 2 | 3 | 4);
                            }
                        }}
                    >
                        <CardHeader className="p-4 flex flex-row items-center space-y-0 gap-3">
                            <div className={cn(
                                "p-2 rounded-full transition-colors",
                                "transition-colors duration-300",
                                step === item.s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                                step > item.s && "bg-green-100 text-green-700"
                            )}>
                                <item.icon className="w-5 h-5" />
                            </div>
                            <div>
                                <div className={cn("font-bold text-sm", step === item.s && "text-primary")}>{item.label}</div>
                                <div className="text-xs text-muted-foreground">{item.desc}</div>
                            </div>
                        </CardHeader>
                    </Card>
                ))}
            </div>
        </div>
    );
};
