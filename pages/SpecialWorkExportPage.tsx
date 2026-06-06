import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, FileSpreadsheet, Calendar, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';
import { SpecialWorkCalculator } from '../lib/specialWorkCalculator';

import { ApiResponse } from '../types';
import { useMessageModal } from '@/contexts/MessageModalContext';

const SpecialWorkExportPage = () => {
    const navigate = useNavigate();
    const { showAlert } = useMessageModal();
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [isLoading, setIsLoading] = useState(false);

    const handleExport = async () => {
        setIsLoading(true);
        try {
            // 1. Fetch Data
            const response = await fetch(`/api/special-work/export-logs?month=${selectedMonth}`);
            const result = await response.json() as ApiResponse<any[]>;

            if (!result.success) {
                await showAlert(`데이터 조회 실패: ${result.message}`, { type: 'error' });
                return;
            }

            if (!result.data || result.data.length === 0) {
                await showAlert("해당 월에 조회된 특근 데이터가 없습니다.", { type: 'info' });
                return;
            }

            // 2. Generate Excel
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('특근상세내역');

            // Columns
            worksheet.columns = [
                { header: '날짜', key: 'date', width: 12 },
                { header: '성명', key: 'name', width: 10 },
                { header: '부서', key: 'dept', width: 15 },
                { header: '직위', key: 'position', width: 10 },
                { header: '시작시간', key: 'start', width: 12 },
                { header: '종료시간', key: 'end', width: 12 },
                { header: '인정시간(분)', key: 'minutes', width: 15 },
                { header: '인정시간(시간)', key: 'hours', width: 15 },
                { header: '적용단가', key: 'wage', width: 15 },
                { header: '지급액', key: 'amount', width: 15 },
            ];

            // Header Style
            const headerRow = worksheet.getRow(1);
            headerRow.font = { bold: true };
            headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
            headerRow.eachCell((cell) => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFE0E0E0' } // Light Gray
                };
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });

            // Data Rows
            let totalAmount = 0;
            let totalMinutes = 0;

            result.data.forEach((item: any) => {
                const minutes = item.actual_work_minutes || 0;
                const wage = item.special_hourly_wage || 0;

                // [Refactor] Use Unified Calculator
                const recognizedHours = SpecialWorkCalculator.toRecognizedHours(minutes);
                const amount = SpecialWorkCalculator.calculateTotalPay(recognizedHours, wage);

                totalAmount += amount;
                totalMinutes += minutes;

                const row = worksheet.addRow({
                    date: item.work_date,
                    name: item.name,
                    dept: item.department,
                    position: item.position,
                    start: item.start_time,
                    end: item.end_time,
                    minutes: minutes,
                    hours: Number(recognizedHours.toFixed(2)), // Integer mostly, but format safe
                    wage: wage,
                    amount: amount
                });

                // Style
                row.alignment = { vertical: 'middle', horizontal: 'center' };
                // Number Formats
                row.getCell('minutes').numFmt = '#,##0';
                row.getCell('hours').numFmt = '#,##0.00';
                row.getCell('wage').numFmt = '#,##0';
                row.getCell('amount').numFmt = '#,##0';
            });

            // Summary Row
            const lastRowIdx = worksheet.rowCount + 1;
            const summaryRow = worksheet.addRow({
                date: '합계',
                minutes: totalMinutes,
                amount: totalAmount
            });
            summaryRow.font = { bold: true };
            summaryRow.getCell('date').alignment = { horizontal: 'center' };
            summaryRow.getCell('minutes').numFmt = '#,##0';
            summaryRow.getCell('amount').numFmt = '#,##0';

            // Generate File
            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            saveAs(blob, `${selectedMonth}_특근상세내역_검증용.xlsx`);

        } catch (e) {
            console.error(e);
            await showAlert("엑셀 생성 중 오류가 발생했습니다.", { type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-6">
            <div className="flex items-center gap-4 mb-6">
                <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                    <ArrowLeft className="w-5 h-5" />
                </Button>
                <h1 className="text-2xl font-bold text-slate-900">특근 데이터 엑셀 내보내기</h1>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileSpreadsheet className="w-6 h-6 text-green-600" />
                        엑셀 데이터 추출
                    </CardTitle>
                    <CardDescription>
                        DB에 저장된 최종 특근 내역(상세 로그 + 적용 단가)을 엑셀로 추출하여 검증합니다.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-slate-700">대상 월 선택</label>
                        <div className="flex items-center gap-4">
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="month"
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                    className="pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                            <Button
                                onClick={handleExport}
                                disabled={isLoading}
                                className="bg-green-600 hover:bg-green-700 text-white gap-2"
                            >
                                <Download className="w-4 h-4" />
                                {isLoading ? "생성 중..." : "엑셀 다운로드"}
                            </Button>
                        </div>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
                        <h4 className="font-bold mb-2">💡 참고사항</h4>
                        <ul className="list-disc pl-5 space-y-1">
                            <li>이용 가능한 데이터는 <strong>특근 관리 페이지에서 '확정(저장)'된 데이터</strong>입니다.</li>
                            <li>지급액은 <code>(인정시간(분) ÷ 60) × 적용단가</code> 로 계산되며, 소수점 처리에 따라 실제 지급액과 1~10원 내외의 차이가 있을 수 있습니다.</li>
                            <li>이 엑셀은 최종 급여 대장 생성 전 <strong>중간 검증용</strong>으로 활용하시기 바랍니다.</li>
                        </ul>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default SpecialWorkExportPage;
