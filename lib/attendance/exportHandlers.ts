
import { ExcelReportGenerator } from "../../lib/excelReportGenerator";

export const handleDownloadExcel = async ({
    data,
    showAlert
}: {
    data: any,
    showAlert: (msg: string, options?: any) => void
}) => {
    const sourceData = data?.v4 || data?.v3 || data?.v2;
    if (!sourceData || sourceData.length === 0) return;

    try {
        await ExcelReportGenerator.generateWeeklyReport(sourceData);
    } catch (error) {
        console.error("Excel generation failed", error);
        await showAlert("엑셀 생성 중 오류가 발생했습니다.", { type: 'error' });
    }
};
