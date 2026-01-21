import { RawCommuteLog } from "../../types";

interface ExtractedEmployee {
    name: string;
    description?: string; // mapped to title/position
    department?: string;
    position?: string;
    employee_code?: string;
    email?: string;
    phone?: string;
    companyId?: string; // [New] Context Isolation
}

export const EmployeeExtractor = {
    /**
     * Extracts unique employees from parsed commute logs.
     * Filters out users starting with "퇴사-"
     * Filters out users already in DB (checks Name + Department + Position)
     */
    extractFromLogs: (logs: RawCommuteLog[], existingEmployees: any[] = []): ExtractedEmployee[] => {
        const uniqueMap = new Map<string, ExtractedEmployee>();
        // [Fix] Deduplication Key: Name only (Per User Request)
        // Company isolation is handled by caller passing filtered existingEmployees
        const existingSet = new Set(existingEmployees.map(e => e.name.trim()));

        logs.forEach(log => {
            const name = log.userName;
            if (!name || name.trim() === "") return;
            if (name.startsWith("퇴사-")) return;

            const dept = log.department || "";
            const pos = log.userTitle || "";
            const key = name.trim(); // Key is now just Name

            // Deduplicate against existing DB
            if (existingSet.has(key)) return;

            // Deduplicate within current file
            if (!uniqueMap.has(key)) {
                uniqueMap.set(key, {
                    name: name,
                    position: pos, // Map Title to Position
                    department: dept,
                    employee_code: "", // Empty as requested ("없는 값은 비워두게")
                });
            }
        });

        return Array.from(uniqueMap.values());
    },

    /**
     * Sends extracted employees to the backend API
     */
    saveEmployees: async (employees: ExtractedEmployee[]) => {
        if (employees.length === 0) return;

        try {
            const response = await fetch('/api/employees', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(employees)
            });

            if (!response.ok) {
                const err = await response.json() as any;
                throw new Error(err.error || "Failed to save employees");
            }

            console.log(`Successfully saved ${employees.length} employees.`);
            return await response.json();
        } catch (error) {
            console.error("Error saving employees:", error);
            throw error;
        }
    }
};
