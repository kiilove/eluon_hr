import { read, utils } from 'xlsx';

export interface HourlyWageItem {
    name: string;
    amount: number;
    department?: string;
    position?: string;
    employeeCode?: string;
}

export class HourlyWageParser {
    static async parse(file: File): Promise<HourlyWageItem[]> {
        const buffer = await file.arrayBuffer();
        const workbook = read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows: any[][] = utils.sheet_to_json(sheet, { header: 1 });

        // Find header row: "성  명" or similar
        let headerIndex = -1;
        let nameColIdx = -1;
        let amountColIdx = -1;
        // Optional Columns
        let deptColIdx = -1;
        let posColIdx = -1;
        let codeColIdx = -1; // 사번 or 주민번호

        for (let i = 0; i < Math.min(rows.length, 20); i++) {
            const row = rows[i];
            // Look for "성 명" or "이름"
            const nIdx = row.findIndex(c => typeof c === 'string' && (c.includes('성') && c.includes('명') || c.includes('이름')));
            // Look for "시급"
            const aIdx = row.findIndex(c => typeof c === 'string' && c.includes('시급'));

            if (nIdx !== -1 && aIdx !== -1) {
                headerIndex = i;
                nameColIdx = nIdx;
                amountColIdx = aIdx;

                // Try to find optional columns in the same row
                deptColIdx = row.findIndex(c => typeof c === 'string' && (c.includes('부서')));
                posColIdx = row.findIndex(c => typeof c === 'string' && (c.includes('직위') || c.includes('직책')));
                codeColIdx = row.findIndex(c => typeof c === 'string' && (c.includes('사번') || c.includes('주민')));
                break;
            }
        }

        if (headerIndex === -1) {
            throw new Error("헤더('성명', '시급')를 찾을 수 없습니다.");
        }

        const items: HourlyWageItem[] = [];
        for (let i = headerIndex + 1; i < rows.length; i++) {
            const row = rows[i];
            const name = row[nameColIdx];
            const amount = row[amountColIdx];

            if (name && typeof amount === 'number') {
                const item: HourlyWageItem = {
                    name: String(name).trim(),
                    amount: Math.round(Number(amount))
                };

                if (deptColIdx !== -1 && row[deptColIdx]) item.department = String(row[deptColIdx]).trim();
                if (posColIdx !== -1 && row[posColIdx]) item.position = String(row[posColIdx]).trim();
                if (codeColIdx !== -1 && row[codeColIdx]) item.employeeCode = String(row[codeColIdx]).trim();

                items.push(item);
            }
        }

        return items;
    }
}
