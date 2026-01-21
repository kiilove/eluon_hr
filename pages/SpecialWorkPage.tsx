import React, { useState } from 'react';
import { SpecialWorkUploadView } from '@/components/special-work/SpecialWorkUploadView';
import { SpecialWorkManageView } from '@/components/special-work/SpecialWorkManageView';
import { UploadCloud, Layers, Info } from 'lucide-react';
import {
    PageContainer,
    PageHeader,
    PageSidebar,
    PageContent,
    SidebarSection,
    SidebarMenuItem
} from '@/components/layout/PageLayout';
import { Card } from '@/components/ui/card';

export const SpecialWorkPage = () => {
    const [activeTab, setActiveTab] = useState<'upload' | 'manage'>("upload");

    return (
        <PageContainer>
            <PageHeader
                title="특근 데이터 관리"
                description="특근 엑셀 데이터를 업로드하고 정산 내역을 관리하는 통합 페이지입니다."
                badges={[{ label: 'Beta', color: 'bg-orange-100 text-orange-700 border-orange-200' }]}
            />

            <div className="flex flex-col lg:flex-row gap-6 items-start">
                {/* Sidebar */}
                <PageSidebar>
                    <SidebarSection title="메뉴 선택" icon={Layers}>
                        <div className="flex flex-col gap-1">
                            <SidebarMenuItem
                                label="데이터 업로드"
                                icon={UploadCloud}
                                isActive={activeTab === 'upload'}
                                onClick={() => setActiveTab('upload')}
                            />
                            <SidebarMenuItem
                                label="데이터 목록 관리"
                                icon={Layers}
                                isActive={activeTab === 'manage'}
                                onClick={() => setActiveTab('manage')}
                            />
                        </div>
                    </SidebarSection>

                    {/* Info Card - Orange Theme */}
                    <Card className="border-none shadow-lg bg-gradient-to-br from-orange-950 to-slate-900 text-white p-5 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 w-24 h-24 bg-white/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none group-hover:bg-white/10 transition-colors"></div>
                        <h4 className="font-bold text-xs mb-3 text-orange-200 flex items-center gap-2 uppercase tracking-wider">
                            <Info className="w-3.5 h-3.5" />
                            업무 가이드
                        </h4>
                        <p className="text-xs text-slate-300 leading-relaxed font-medium">
                            {activeTab === 'upload'
                                ? '기존에 사용하시던 특근 신청 양식(엑셀)을 그대로 업로드하시면 됩니다. 시스템이 날짜와 내역을 자동으로 분석합니다.'
                                : '저장된 분석 내역을 확인하고, 필요한 경우 근태 데이터로 변환하여 시스템에 적용할 수 있습니다.'}
                        </p>
                    </Card>
                </PageSidebar>

                {/* Main Content */}
                <PageContent>
                    {activeTab === 'upload' && <SpecialWorkUploadView setActiveTab={setActiveTab} />}
                    {activeTab === 'manage' && <SpecialWorkManageView active={activeTab === 'manage'} />}
                </PageContent>
            </div>
        </PageContainer>
    );
};
