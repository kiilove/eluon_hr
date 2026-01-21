import * as XLSX from 'xlsx';

export interface SettlementDetail {
    name: string;
    regularCount: number; // ◎
    remoteCount: number;  // ★
    totalAllowance: number;
}

export interface SettlementReport {
    reportTitle: string;
    targetMonth: string; // 사용자 입력 값
    totalPayout: number;
    details: SettlementDetail[];
}

export const MixedPeriodParser = {
    /**
     * @param file 엑셀 파일
     * @param userInputMonth 사용자가 입력한 정산 대상 월 (예: "2025-11")
     */
    parse: (file: File, userInputMonth: string): Promise<SettlementReport> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = e.target?.result;
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false }) as any[][];

                    if (!rows || rows.length < 8) {
                        throw new Error("데이터가 부족하거나 잘못된 파일 형식입니다.");
                    }

                    // 1. A1에서 원본 타이틀 추출 (날짜 확인용)
                    const originalTitle = String(rows[0][0] || "제목 없음").trim();

                    // 2. '성명' 헤더 행 및 열 찾기 (보통 6번 행)
                    let headerRowIndex = -1;
                    let nameColumnIndex = -1;
                    for (let r = 0; r < 15; r++) { // 15행까지 탐색
                        const row = rows[r];
                        const idx = row?.findIndex(c => String(c || "").trim() === '성명');
                        if (idx !== -1 && idx !== undefined) {
                            headerRowIndex = r;
                            nameColumnIndex = idx;
                            break;
                        }
                    }

                    if (headerRowIndex === -1) throw new Error("'성명' 헤더를 찾을 수 없습니다.");

                    // 3. 기호 검사 범위(Column) 설정
                    // '성명' 다음 칸부터 '합계' 혹은 '수당액' 직전 칸까지
                    let totalColIndex = rows[headerRowIndex].findIndex(c => String(c || "").includes('합계'));
                    if (totalColIndex === -1) {
                        // 6번 행에 없으면 7번 행에서 한 번 더 검색
                        totalColIndex = rows[headerRowIndex + 1].findIndex(c => String(c || "").includes('합계'));
                    }

                    const startCol = nameColumnIndex + 1;
                    const endCol = totalColIndex !== -1 ? totalColIndex : rows[headerRowIndex].length;

                    // 4. 상수 정의
                    const UNIT_PRICE = { REGULAR: 70000, REMOTE: 50000 };
                    const SYMBOLS = { REGULAR: '◎', REMOTE: '★' };

                    let totalPayout = 0;
                    const details: SettlementDetail[] = [];

                    // 5. 데이터 순회 (성명 헤더 + 2행 아래부터 시작)
                    const dataStartRow = headerRowIndex + 2;

                    for (let i = dataStartRow; i < rows.length; i++) {
                        const row = rows[i];
                        if (!row) continue;

                        const name = String(row[nameColumnIndex] || "").trim();

                        // 중단 조건: 합계 라인을 만나거나 범례 행을 만날 때
                        if (!name || name === '합계' || name === '소계' || name.includes('◎')) break;

                        let regular = 0;
                        let remote = 0;

                        // 해당 월/소급분 영역 내의 기호 카운트
                        for (let c = startCol; c < endCol; c++) {
                            const cellVal = String(row[c] || "").trim();
                            if (cellVal === SYMBOLS.REGULAR) regular++;
                            else if (cellVal === SYMBOLS.REMOTE) remote++;
                        }

                        // 근무 기록이 있는 경우에만 리스트에 추가
                        if (regular > 0 || remote > 0) {
                            const allowance = (regular * UNIT_PRICE.REGULAR) + (remote * UNIT_PRICE.REMOTE);
                            totalPayout += allowance;

                            details.push({
                                name,
                                regularCount: regular,
                                remoteCount: remote,
                                totalAllowance: allowance
                            });
                        }
                    }

                    resolve({
                        reportTitle: originalTitle,
                        targetMonth: userInputMonth,
                        totalPayout,
                        details
                    });

                } catch (error) {
                    reject(error);
                }
            };
            reader.readAsArrayBuffer(file);
        });
    }
};
