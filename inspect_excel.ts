
import ExcelJS from 'exceljs';
import path from 'path';

async function inspect() {
    const workbook = new ExcelJS.Workbook();
    // Path: d:\app3\auditready_-hr-data-cleansing\templates\이루온_근태대장_2025-12-01_김진배_1768347881500.xlsx
    const filePath = path.resolve('d:\\app3\\auditready_-hr-data-cleansing\\templates\\이루온_근태대장_2025-12-01_김진배_1768347881500.xlsx');

    await workbook.xlsx.readFile(filePath);

    console.log("Worksheets:", workbook.worksheets.length);

    workbook.worksheets.forEach((ws, idx) => {
        console.log(`\nSheet ${idx + 1}: ${ws.name}`);
        console.log("PageSetup:", ws.pageSetup);
        console.log("Views:", ws.views);

        // specific check for repeating heads
        console.log("PrintTitlesRow:", ws.pageSetup.printTitlesRow);

        // Check content of first few rows
        console.log("Row 1 Values:", ws.getRow(1).values);
        console.log("Row 2 Values:", ws.getRow(2).values);
        console.log("Row 3 Values:", ws.getRow(3).values);
    });
}

inspect().catch(console.error);
