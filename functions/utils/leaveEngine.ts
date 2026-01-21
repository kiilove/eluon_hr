
export interface LeaveRecord {
    id: string;
    staffId: string;
    leaveDate: string;
    reason: string;
}

// 1. Helpers
function isWeekend(date: Date) {
    const day = date.getDay();
    return day === 0 || day === 6;
}

function getSolarHolidays(year: number) {
    return [
        { date: new Date(year, 2, 1), name: "삼일절" },
        { date: new Date(year, 4, 5), name: "어린이날" },
        { date: new Date(year, 5, 6), name: "현충일" },
        { date: new Date(year, 7, 15), name: "광복절" },
        { date: new Date(year, 9, 3), name: "개천절" },
        { date: new Date(year, 9, 9), name: "한글날" },
        { date: new Date(year, 11, 25), name: "성탄절" },
    ];
}

// 2. Generator Function
export function generateLeavePlan(staffId: string, year: number, scenario: string = 'month_end'): LeaveRecord[] {
    const leaves: LeaveRecord[] = [];

    if (scenario === 'month_end') {
        for (let month = 0; month < 12; month++) {
            let d = new Date(year, month + 1, 0);
            while (isWeekend(d)) d.setDate(d.getDate() - 1);
            leaves.push({ id: crypto.randomUUID(), staffId, leaveDate: d.toISOString().split('T')[0], reason: `${month + 1}월 정기 연차` });
        }
    }
    else if (scenario === 'random') {
        for (let i = 0; i < 15; i++) {
            const month = Math.floor(Math.random() * 12);
            const day = Math.floor(Math.random() * 28) + 1;
            const d = new Date(year, month, day);
            if (!isWeekend(d)) {
                leaves.push({ id: crypto.randomUUID(), staffId, leaveDate: d.toISOString().split('T')[0], reason: `수시 연차` });
            }
        }
    }
    else if (scenario === 'long_vacation') {
        // Summer (Jul or Aug)
        const summerMonth = Math.random() > 0.5 ? 6 : 7;
        const startDay = Math.floor(Math.random() * 20) + 1;
        for (let i = 0; i < 5; i++) {
            const d = new Date(year, summerMonth, startDay + i);
            if (!isWeekend(d)) leaves.push({ id: crypto.randomUUID(), staffId, leaveDate: d.toISOString().split('T')[0], reason: `하계 휴가` });
        }

        // Winter (Dec)
        for (let i = 0; i < 3; i++) {
            const d = new Date(year, 11, 20 + i);
            if (!isWeekend(d)) leaves.push({ id: crypto.randomUUID(), staffId, leaveDate: d.toISOString().split('T')[0], reason: `동계 휴가` });
        }

        // Fill rest
        for (let month = 0; month < 12; month++) {
            if (month === summerMonth || month === 11) continue;
            if (Math.random() > 0.5) continue;
            let d = new Date(year, month + 1, 0);
            while (isWeekend(d)) d.setDate(d.getDate() - 1);
            leaves.push({ id: crypto.randomUUID(), staffId, leaveDate: d.toISOString().split('T')[0], reason: `${month + 1}월 정기 연차` });
        }
    }
    else if (scenario === 'bridge_holiday') {
        const holidays = getSolarHolidays(year);

        // 1. Bridge
        for (const h of holidays) {
            const day = h.date.getDay();
            let bridgeDate: Date | null = null;

            if (day === 2) { // Tue -> Mon
                bridgeDate = new Date(h.date);
                bridgeDate.setDate(h.date.getDate() - 1);
            } else if (day === 4) { // Thu -> Fri
                bridgeDate = new Date(h.date);
                bridgeDate.setDate(h.date.getDate() + 1);
            }

            if (bridgeDate) {
                leaves.push({
                    id: crypto.randomUUID(),
                    staffId,
                    leaveDate: bridgeDate.toISOString().split('T')[0],
                    reason: `징검다리 휴가 (${h.name} 연계)`
                });
            }
        }

        // 2. Fill (ensure enough leaves, skipping duplicates)
        for (let i = 0; i < 12; i++) {
            const month = Math.floor(Math.random() * 12);
            const day = Math.floor(Math.random() * 28) + 1;
            const d = new Date(year, month, day);

            if (isWeekend(d)) continue;

            const dStr = d.toISOString().split('T')[0];
            if (leaves.some(l => l.leaveDate === dStr)) continue;

            leaves.push({ id: crypto.randomUUID(), staffId, leaveDate: dStr, reason: `개인 연차` });
        }
    }

    return leaves;
}
