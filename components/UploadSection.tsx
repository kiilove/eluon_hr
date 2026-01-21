import React, { useRef, useState } from 'react';
import { UploadCloud, FileSpreadsheet, ShieldCheck, ArrowRight, FileCheck } from 'lucide-react';

interface Props {
  onUpload: (file: File) => void;
  isLoading: boolean;
}

const UploadSection: React.FC<Props> = ({ onUpload, isLoading }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleClick = () => {
    if (!isLoading) fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        onUpload(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
  };

  const handleDragLeave = () => {
      setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) {
          onUpload(file);
      }
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
        {/* Hero Text */}
        <div className="text-center mb-10 space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-100 mb-2">
                <ShieldCheck className="w-3 h-3" />
                Audit-Ready Protocol v2.0
            </div>
            <h2 className="text-4xl font-bold text-slate-800 tracking-tight">
                근태 데이터, <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">법적 리스크 없이</span> 최적화하세요.
            </h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto leading-relaxed">
                업로드 한 번으로 비업무 시간을 자동 소명하고, <br className="sm:hidden"/>주 52시간 준수 여부를 즉시 진단합니다.
            </p>
        </div>

        {/* Upload Card */}
        <div 
            className={`
                relative overflow-hidden rounded-2xl transition-all duration-300 group
                ${isDragging 
                    ? 'bg-blue-50 border-2 border-blue-400 scale-[1.02] shadow-xl' 
                    : 'bg-white border border-slate-200 shadow-lg hover:shadow-xl hover:border-blue-300'
                }
            `}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleClick}
        >
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
                accept=".xlsx, .xls, .csv"
            />
            
            {/* Background Decoration */}
            <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-full blur-3xl opacity-50 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-40 h-40 bg-gradient-to-tr from-emerald-50 to-teal-50 rounded-full blur-3xl opacity-50 pointer-events-none"></div>

            <div className="relative z-10 flex flex-col items-center justify-center py-20 px-6 cursor-pointer">
                {isLoading ? (
                    <div className="flex flex-col items-center animate-pulse">
                         <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-6 shadow-inner">
                            <UploadCloud className="w-10 h-10 animate-bounce" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-700">데이터 분석 중...</h3>
                        <p className="text-slate-400 mt-2 text-sm">잠시만 기다려주세요.</p>
                    </div>
                ) : (
                    <>
                        <div className={`
                            w-20 h-20 rounded-2xl flex items-center justify-center mb-6 transition-all duration-300 shadow-sm
                            ${isDragging ? 'bg-blue-600 text-white rotate-12 scale-110' : 'bg-slate-50 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600'}
                        `}>
                            <UploadCloud className="w-10 h-10" />
                        </div>
                        
                        <h3 className="text-2xl font-bold text-slate-800 mb-2 group-hover:text-blue-700 transition-colors">
                            {isDragging ? '파일을 여기에 놓으세요' : '엑셀 파일 업로드'}
                        </h3>
                        
                        <p className="text-slate-500 text-center mb-8 max-w-sm mx-auto text-sm leading-relaxed group-hover:text-slate-600">
                            드래그 앤 드롭 또는 클릭하여 파일을 선택하세요.<br/>
                            (.xlsx, .csv 형식 지원)
                        </p>

                        <div className="flex items-center gap-6">
                             <div className="flex flex-col items-center gap-2 group/item">
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 group-hover/item:border-blue-200 transition-colors">
                                    <FileSpreadsheet className="w-5 h-5 text-slate-400 group-hover/item:text-blue-500" />
                                </div>
                                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Excel/CSV</span>
                             </div>
                             <div className="w-px h-8 bg-slate-200"></div>
                             <div className="flex flex-col items-center gap-2 group/item">
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 group-hover/item:border-green-200 transition-colors">
                                    <FileCheck className="w-5 h-5 text-slate-400 group-hover/item:text-green-500" />
                                </div>
                                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Auto-Detect</span>
                             </div>
                        </div>
                        
                        <div className="mt-10 flex items-center gap-2 text-xs font-medium text-slate-400 bg-white px-4 py-2 rounded-full border border-slate-100 shadow-sm">
                            <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
                            <span>모든 데이터는 브라우저 내에서만 처리되며 서버로 전송되지 않습니다.</span>
                        </div>
                    </>
                )}
            </div>
        </div>

        {/* Feature Highlights (Bottom) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 px-4">
            {[
                { title: '근로시간 자동 분류', desc: '업무, 비업무, 휴게시간 자동 태깅' },
                { title: '위험군 선제 식별', desc: '주 52시간 초과 예상자 즉시 경고' },
                { title: '감사 리포트 생성', desc: '소명 자료용 엑셀 파일 다운로드' }
            ].map((item, idx) => (
                <div key={idx} className="flex flex-col items-center text-center p-4">
                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm mb-3">
                        {idx + 1}
                    </div>
                    <h4 className="font-bold text-slate-700 text-sm mb-1">{item.title}</h4>
                    <p className="text-xs text-slate-400">{item.desc}</p>
                </div>
            ))}
        </div>
    </div>
  );
};

export default UploadSection;