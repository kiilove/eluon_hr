export const onRequestGet = async (context: any) => {
    try {
        const { request, env } = context;
        const url = new URL(request.url);
        const startDate = url.searchParams.get('startDate');
        const endDate = url.searchParams.get('endDate');
        const staffId = url.searchParams.get('staffId');

        let query = `
            SELECT 
                l.id, l.work_date as date, l.start_time, l.end_time, l.status as logStatus,
                s.id as userId, s.name as userName, s.department, s.target_persona as userTitle
            FROM project_staff_work_logs l
            JOIN project_staff s ON l.staff_id = s.id
            WHERE 1=1
        `;

        const params = [];

        if (startDate) {
            query += ` AND l.work_date >= ?`;
            params.push(startDate);
        }
        if (endDate) {
            query += ` AND l.work_date <= ?`;
            params.push(endDate);
        }
        if (staffId) {
            query += ` AND l.staff_id = ?`;
            params.push(staffId);
        }

        query += ` ORDER BY l.work_date ASC, s.name ASC`;

        const { results } = await env.DB.prepare(query).bind(...params).all();

        return new Response(JSON.stringify({ success: true, data: results }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err: any) {
        return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500 });
    }
};
