
import { readFile } from 'fs/promises';
import * as XLSX from 'xlsx';

async function inspectExcel() {
    try {
        const buffer = await readFile('d:\\app3\\auditready_-hr-data-cleansing\\templates\\시급.xlsx');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        console.log("Sheet Name:", sheetName);
        console.log("First 5 rows:");
        data.slice(0, 5).forEach((row, i) => console.log(`Row ${i}:`, row));
    } catch (e) {
        console.error(e);
    }
}

inspectExcel();
