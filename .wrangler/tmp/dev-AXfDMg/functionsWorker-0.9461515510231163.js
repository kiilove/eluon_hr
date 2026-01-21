var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-3hhNbW/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// .wrangler/tmp/pages-q33aEM/functionsWorker-0.9461515510231163.mjs
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var urls2 = /* @__PURE__ */ new Set();
function checkURL2(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls2.has(url.toString())) {
      urls2.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL2, "checkURL");
__name2(checkURL2, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL2(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});
async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: 1e5,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const exported = await crypto.subtle.exportKey("raw", key);
  return Array.from(new Uint8Array(exported)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hashPassword, "hashPassword");
__name2(hashPassword, "hashPassword");
var onRequestPost = /* @__PURE__ */ __name2(async (context) => {
  try {
    const { email, password } = await context.request.json();
    const result = await context.env.DB.prepare(`
        SELECT u.*, uc.password_hash, uc.salt 
        FROM users u
        JOIN user_credentials uc ON u.id = uc.user_id
        WHERE u.email = ?
    `).bind(email).first();
    if (!result) {
      return new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401 });
    }
    const derivedHash = await hashPassword(password, result.salt);
    if (derivedHash !== result.password_hash) {
      return new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401 });
    }
    return new Response(JSON.stringify({
      success: true,
      user: {
        id: result.id,
        email: result.email,
        name: result.name,
        company_id: result.company_id,
        role: result.role
      }
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}, "onRequestPost");
async function hashPassword2(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: 1e5,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const exported = await crypto.subtle.exportKey("raw", key);
  return Array.from(new Uint8Array(exported)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hashPassword2, "hashPassword2");
__name2(hashPassword2, "hashPassword");
var onRequestPost2 = /* @__PURE__ */ __name2(async (context) => {
  try {
    const { email, password, name, companyId: manualCompanyId } = await context.request.json();
    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Email and password required" }), { status: 400 });
    }
    const existing = await context.env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
    if (existing) {
      return new Response(JSON.stringify({ error: "User already exists" }), { status: 409 });
    }
    let companyId = manualCompanyId;
    if (companyId !== "comp_eluon" && companyId !== "comp_eluonins") {
      return new Response(JSON.stringify({ error: "Invalid company selection" }), { status: 400 });
    }
    const salt = crypto.randomUUID();
    const passwordHash = await hashPassword2(password, salt);
    const userId = crypto.randomUUID();
    await context.env.DB.batch([
      // Insert Profile
      context.env.DB.prepare(
        "INSERT INTO users (id, email, company_id, name) VALUES (?, ?, ?, ?)"
      ).bind(userId, email, companyId, name || email.split("@")[0]),
      // Insert Credentials
      context.env.DB.prepare(
        "INSERT INTO user_credentials (user_id, password_hash, salt) VALUES (?, ?, ?)"
      ).bind(userId, passwordHash, salt)
    ]);
    return new Response(JSON.stringify({ success: true, user: { id: userId, email, companyId, name } }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}, "onRequestPost");
var TimeUtils = {
  // Convert "HH:mm" to minutes from midnight
  timeToMinutes: /* @__PURE__ */ __name2((timeStr) => {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(":").map(Number);
    return hours * 60 + minutes;
  }, "timeToMinutes"),
  // Convert minutes to "HH:mm"
  minutesToTime: /* @__PURE__ */ __name2((minutes) => {
    const h = Math.floor(minutes / 60);
    const m = Math.floor(minutes % 60);
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  }, "minutesToTime"),
  // Convert minutes to "Xh Ym" format for display
  minutesToDisplay: /* @__PURE__ */ __name2((minutes) => {
    if (minutes <= 0) return "0h 0m";
    const h = Math.floor(minutes / 60);
    const m = Math.floor(minutes % 60);
    return `${h}h ${m}m`;
  }, "minutesToDisplay"),
  // Convert minutes to "H:MM:SS" format for Excel-like display
  minutesToColonFormat: /* @__PURE__ */ __name2((minutes) => {
    const val = Math.max(0, minutes);
    const h = Math.floor(val / 60);
    const m = Math.floor(val % 60);
    const s = Math.round((val - Math.floor(val)) * 60);
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }, "minutesToColonFormat"),
  // 4h+ -> 30m, 8h+ -> 1h
  calculateBreakMinutes: /* @__PURE__ */ __name2((totalDurationMinutes) => {
    if (totalDurationMinutes >= 480) {
      return 60;
    } else if (totalDurationMinutes >= 240) {
      return 30;
    }
    return 0;
  }, "calculateBreakMinutes"),
  // Extract "HH:mm" from a potentially messy string, but try to preserve more info if needed for display? 
  // Actually, for "timeToMinutes", we only need HH:mm. 
  // For Display, we want the full string.
  // Let's make sanitizeTime lenient:
  sanitizeTime: /* @__PURE__ */ __name2((val) => {
    if (!val) return void 0;
    const match2 = String(val).match(/(\d{1,2}:\d{2}(:\d{2})?)/);
    const time = match2 ? match2[0] : void 0;
    return time === "00:00" || time === "0:00" ? void 0 : time;
  }, "sanitizeTime"),
  // Format date string from Excel header label
  formatDateString: /* @__PURE__ */ __name2((dateLabel, baseYear, baseMonth) => {
    const fullDateMatch = String(dateLabel).match(/(\d{4})[\.\-](\d{2})[\.\-](\d{2})/);
    if (fullDateMatch) {
      return `${fullDateMatch[1]}-${fullDateMatch[2]}-${fullDateMatch[3]}`;
    }
    const dayMatch = String(dateLabel).match(/\d+/);
    if (dayMatch) {
      const day = dayMatch[0].padStart(2, "0");
      return `${baseYear}-${String(baseMonth).padStart(2, "0")}-${day}`;
    }
    return null;
  }, "formatDateString"),
  // Get week number of month (1-5)
  getWeekOfMonth: /* @__PURE__ */ __name2((date) => {
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    const dayOfWeek = firstDay.getDay();
    const offsetDate = date.getDate() + dayOfWeek - 1;
    return Math.floor(offsetDate / 7) + 1;
  }, "getWeekOfMonth")
};
var onRequestPost3 = /* @__PURE__ */ __name2(async (context) => {
  try {
    const { request, env } = context;
    const logs = await request.json();
    if (!logs || !Array.isArray(logs) || logs.length === 0) {
      return new Response(JSON.stringify({ success: false, message: "No logs provided" }), { status: 400 });
    }
    const uniqueUsers = /* @__PURE__ */ new Map();
    logs.forEach((log) => {
      if (log.userName) {
        uniqueUsers.set(log.userName, {
          name: log.userName,
          dept: log.department,
          title: log.userTitle
        });
      }
    });
    const staffIdMap = /* @__PURE__ */ new Map();
    for (const [name, info] of uniqueUsers.entries()) {
      const existing = await env.DB.prepare("SELECT id FROM project_staff WHERE name = ?").bind(name).first();
      let staffId = existing?.id;
      if (!staffId) {
        staffId = crypto.randomUUID();
        await env.DB.prepare(`
                INSERT INTO project_staff(id, company_id, name, target_persona, risk_level)
VALUES(?, ?, ?, ?, ?)
            `).bind(
          staffId,
          "comp_eluon",
          // Default Company
          name,
          "Regular Employee",
          // Marker
          "low"
        ).run();
      }
      staffIdMap.set(name, staffId);
    }
    const statements = [];
    for (const log of logs) {
      const staffId = staffIdMap.get(log.userName);
      if (!staffId) continue;
      const startTimeStr = TimeUtils.minutesToColonFormat(log.startTime || 0);
      const endTimeStr = TimeUtils.minutesToColonFormat(log.endTime || 0);
      statements.push(
        env.DB.prepare("DELETE FROM project_staff_work_logs WHERE staff_id = ? AND work_date = ?").bind(staffId, log.date)
      );
      statements.push(
        env.DB.prepare(`
                INSERT INTO project_staff_work_logs(
    id, staff_id, work_date, start_time, end_time, status
) VALUES(?, ?, ?, ?, ?, ?)
            `).bind(
          crypto.randomUUID(),
          staffId,
          log.date,
          startTimeStr,
          endTimeStr,
          log.logStatus || "NORMAL"
        )
      );
    }
    const BATCH_SIZE = 50;
    for (let i = 0; i < statements.length; i += BATCH_SIZE) {
      const batch = statements.slice(i, i + BATCH_SIZE);
      await env.DB.batch(batch);
    }
    return new Response(JSON.stringify({
      success: true,
      message: `Successfully saved ${logs.length} logs for ${uniqueUsers.size} staff members.`
    }), { status: 200 });
  } catch (err) {
    console.error("Save logs error:", err);
    return new Response(JSON.stringify({ success: false, message: err.message || String(err) }), { status: 500 });
  }
}, "onRequestPost");
function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}
__name(isWeekend, "isWeekend");
__name2(isWeekend, "isWeekend");
var pad = /* @__PURE__ */ __name2((n) => n.toString().padStart(2, "0"), "pad");
function formatTime(h, m, s) {
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
__name(formatTime, "formatTime");
__name2(formatTime, "formatTime");
function generateMonthlyAttendance(staffId, year, month, existingLeaveDates, targetStart = "09:00", targetEnd = "18:00") {
  const logs = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  const [tSh, tSm] = targetStart.split(":").map(Number);
  const [tEh, tEm] = targetEnd.split(":").map(Number);
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${pad(month)}-${pad(day)}`;
    const dateObj = new Date(year, month - 1, day);
    if (isWeekend(dateObj)) continue;
    if (existingLeaveDates.has(dateStr)) continue;
    let startHour = tSh;
    let startMin = tSm;
    const rStart = Math.random();
    if (rStart < 0.7) {
      startMin = tSm - 15 + Math.floor(Math.random() * 16);
    } else {
      startMin = tSm + 1 + Math.floor(Math.random() * 10);
    }
    while (startMin < 0) {
      startMin += 60;
      startHour--;
    }
    while (startMin >= 60) {
      startMin -= 60;
      startHour++;
    }
    let endHour = tEh;
    let endMin = tEm;
    const rEnd = Math.random();
    if (rEnd < 0.8) {
      endMin = tEm + Math.floor(Math.random() * 21);
    } else {
      endMin = tEm + 21 + Math.floor(Math.random() * 40);
    }
    while (endMin >= 60) {
      endMin -= 60;
      endHour++;
    }
    logs.push({
      id: crypto.randomUUID(),
      staff_id: staffId,
      work_date: dateStr,
      start_time: formatTime(startHour, startMin, Math.floor(Math.random() * 60)),
      end_time: formatTime(endHour, endMin, Math.floor(Math.random() * 60)),
      status: "NORMAL"
    });
  }
  return logs;
}
__name(generateMonthlyAttendance, "generateMonthlyAttendance");
__name2(generateMonthlyAttendance, "generateMonthlyAttendance");
var pad2 = /* @__PURE__ */ __name2((n) => n.toString().padStart(2, "0"), "pad");
var onRequestPost4 = /* @__PURE__ */ __name2(async (context) => {
  try {
    const payload = await context.request.json();
    const { staffId, year, month } = payload;
    if (!staffId || !year || !month) {
      return new Response("Missing required fields (staffId, year, month)", { status: 400 });
    }
    const startDate = `${year} -${pad2(month)}-01`;
    const endDate = `${year} -${pad2(month)} -31`;
    const { results: leaves } = await context.env.DB.prepare(
      "SELECT leave_date FROM project_staff_leaves WHERE staff_id = ? AND leave_date BETWEEN ? AND ?"
    ).bind(staffId, startDate, endDate).all();
    const leaveDates = new Set(leaves.map((l) => l.leave_date));
    await context.env.DB.prepare(
      "DELETE FROM project_staff_work_logs WHERE staff_id = ? AND work_date BETWEEN ? AND ?"
    ).bind(staffId, startDate, endDate).run();
    const { work_start_time = "09:00", work_end_time = "18:00" } = payload;
    const generatedLogs = generateMonthlyAttendance(staffId, year, month, leaveDates, work_start_time, work_end_time);
    if (generatedLogs.length > 0) {
      const stmt = context.env.DB.prepare(
        `INSERT INTO project_staff_work_logs(id, staff_id, work_date, start_time, end_time, status) VALUES(?, ?, ?, ?, ?, ?)`
      );
      const stmts = generatedLogs.map((l) => stmt.bind(l.id, l.staff_id, l.work_date, l.start_time, l.end_time, l.status));
      await context.env.DB.batch(stmts);
    }
    return new Response(JSON.stringify({ success: true, count: generatedLogs.length, logs: generatedLogs }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}, "onRequestPost");
var onRequestGet = /* @__PURE__ */ __name2(async (context) => {
  try {
    const url = new URL(context.request.url);
    const staffId = url.searchParams.get("staffId");
    const year = url.searchParams.get("year");
    const month = url.searchParams.get("month");
    if (!staffId || !year || !month) return new Response("Missing params", { status: 400 });
    const startDate = `${year} -${pad2(Number(month))}-01`;
    const endDate = `${year} -${pad2(Number(month))} -31`;
    const { results } = await context.env.DB.prepare(
      "SELECT * FROM project_staff_work_logs WHERE staff_id = ? AND work_date BETWEEN ? AND ? ORDER BY work_date ASC"
    ).bind(staffId, startDate, endDate).all();
    return new Response(JSON.stringify(results), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}, "onRequestGet");
var onRequestPost5 = /* @__PURE__ */ __name2(async (context) => {
  try {
    const { count = 1, persona = "Specialist" } = await context.request.json();
    const generated = [];
    const firstNames = ["Kim", "Lee", "Park", "Choi", "Jung", "Kang", "Yoon", "Jang", "Lim", "Han"];
    const lastNames = ["Min-su", "Ji-won", "Do-hyun", "Seo-yoon", "Ha-eun", "Jun-ho", "Ji-min", "Ye-jun", "So-yoon"];
    const stmt = context.env.DB.prepare(
      `INSERT INTO project_staff (id, company_id, name, target_persona, daily_work_hours, risk_level) VALUES (?, ?, ?, ?, ?, ?)`
    );
    const inputs = [];
    for (let i = 0; i < count; i++) {
      const id = crypto.randomUUID();
      const randFirst = firstNames[Math.floor(Math.random() * firstNames.length)];
      const randLast = lastNames[Math.floor(Math.random() * lastNames.length)];
      const name = `${randFirst} ${randLast}`;
      const companyId = Math.random() > 0.5 ? "comp_eluon" : "comp_eluonins";
      inputs.push({
        id,
        companyId,
        name,
        target_persona: persona,
        daily_work_hours: "09:00-18:00",
        risk_level: Math.random() > 0.9 ? "high" : "low"
        // Risk is internal metric
      });
    }
    const stmts = inputs.map((g) => stmt.bind(g.id, g.companyId, g.name, g.target_persona, g.daily_work_hours, g.risk_level));
    if (stmts.length > 0) {
      await context.env.DB.batch(stmts);
    }
    return new Response(JSON.stringify({ success: true, count: inputs.length, generated: inputs }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}, "onRequestPost");
function isWeekend2(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}
__name(isWeekend2, "isWeekend2");
__name2(isWeekend2, "isWeekend");
function getSolarHolidays(year) {
  return [
    { date: new Date(year, 2, 1), name: "\uC0BC\uC77C\uC808" },
    { date: new Date(year, 4, 5), name: "\uC5B4\uB9B0\uC774\uB0A0" },
    { date: new Date(year, 5, 6), name: "\uD604\uCDA9\uC77C" },
    { date: new Date(year, 7, 15), name: "\uAD11\uBCF5\uC808" },
    { date: new Date(year, 9, 3), name: "\uAC1C\uCC9C\uC808" },
    { date: new Date(year, 9, 9), name: "\uD55C\uAE00\uB0A0" },
    { date: new Date(year, 11, 25), name: "\uC131\uD0C4\uC808" }
  ];
}
__name(getSolarHolidays, "getSolarHolidays");
__name2(getSolarHolidays, "getSolarHolidays");
function generateLeavePlan(staffId, year, scenario = "month_end") {
  const leaves = [];
  if (scenario === "month_end") {
    for (let month = 0; month < 12; month++) {
      let d = new Date(year, month + 1, 0);
      while (isWeekend2(d)) d.setDate(d.getDate() - 1);
      leaves.push({ id: crypto.randomUUID(), staffId, leaveDate: d.toISOString().split("T")[0], reason: `${month + 1}\uC6D4 \uC815\uAE30 \uC5F0\uCC28` });
    }
  } else if (scenario === "random") {
    for (let i = 0; i < 15; i++) {
      const month = Math.floor(Math.random() * 12);
      const day = Math.floor(Math.random() * 28) + 1;
      const d = new Date(year, month, day);
      if (!isWeekend2(d)) {
        leaves.push({ id: crypto.randomUUID(), staffId, leaveDate: d.toISOString().split("T")[0], reason: `\uC218\uC2DC \uC5F0\uCC28` });
      }
    }
  } else if (scenario === "long_vacation") {
    const summerMonth = Math.random() > 0.5 ? 6 : 7;
    const startDay = Math.floor(Math.random() * 20) + 1;
    for (let i = 0; i < 5; i++) {
      const d = new Date(year, summerMonth, startDay + i);
      if (!isWeekend2(d)) leaves.push({ id: crypto.randomUUID(), staffId, leaveDate: d.toISOString().split("T")[0], reason: `\uD558\uACC4 \uD734\uAC00` });
    }
    for (let i = 0; i < 3; i++) {
      const d = new Date(year, 11, 20 + i);
      if (!isWeekend2(d)) leaves.push({ id: crypto.randomUUID(), staffId, leaveDate: d.toISOString().split("T")[0], reason: `\uB3D9\uACC4 \uD734\uAC00` });
    }
    for (let month = 0; month < 12; month++) {
      if (month === summerMonth || month === 11) continue;
      if (Math.random() > 0.5) continue;
      let d = new Date(year, month + 1, 0);
      while (isWeekend2(d)) d.setDate(d.getDate() - 1);
      leaves.push({ id: crypto.randomUUID(), staffId, leaveDate: d.toISOString().split("T")[0], reason: `${month + 1}\uC6D4 \uC815\uAE30 \uC5F0\uCC28` });
    }
  } else if (scenario === "bridge_holiday") {
    const holidays = getSolarHolidays(year);
    for (const h of holidays) {
      const day = h.date.getDay();
      let bridgeDate = null;
      if (day === 2) {
        bridgeDate = new Date(h.date);
        bridgeDate.setDate(h.date.getDate() - 1);
      } else if (day === 4) {
        bridgeDate = new Date(h.date);
        bridgeDate.setDate(h.date.getDate() + 1);
      }
      if (bridgeDate) {
        leaves.push({
          id: crypto.randomUUID(),
          staffId,
          leaveDate: bridgeDate.toISOString().split("T")[0],
          reason: `\uC9D5\uAC80\uB2E4\uB9AC \uD734\uAC00 (${h.name} \uC5F0\uACC4)`
        });
      }
    }
    for (let i = 0; i < 12; i++) {
      const month = Math.floor(Math.random() * 12);
      const day = Math.floor(Math.random() * 28) + 1;
      const d = new Date(year, month, day);
      if (isWeekend2(d)) continue;
      const dStr = d.toISOString().split("T")[0];
      if (leaves.some((l) => l.leaveDate === dStr)) continue;
      leaves.push({ id: crypto.randomUUID(), staffId, leaveDate: dStr, reason: `\uAC1C\uC778 \uC5F0\uCC28` });
    }
  }
  return leaves;
}
__name(generateLeavePlan, "generateLeavePlan");
__name2(generateLeavePlan, "generateLeavePlan");
var onRequestPost6 = /* @__PURE__ */ __name2(async (context) => {
  try {
    const payload = await context.request.json();
    const { action, staffId, year = (/* @__PURE__ */ new Date()).getFullYear(), date, reason } = payload;
    if (!staffId) return new Response("Staff ID required", { status: 400 });
    if (action === "generate") {
      const { scenario = "month_end" } = payload;
      const leaves = generateLeavePlan(staffId, year, scenario);
      const stmt = context.env.DB.prepare(
        `INSERT INTO project_staff_leaves (id, staff_id, leave_date, reason) VALUES (?, ?, ?, ?)`
      );
      const stmts = leaves.map((l) => stmt.bind(l.id, l.staffId, l.leaveDate, l.reason));
      if (stmts.length > 0) await context.env.DB.batch(stmts);
      return new Response(JSON.stringify({ success: true, count: leaves.length, leaves }), {
        headers: { "Content-Type": "application/json" }
      });
    } else if (action === "add") {
      if (!date) return new Response("Date required", { status: 400 });
      const id = crypto.randomUUID();
      await context.env.DB.prepare(
        `INSERT INTO project_staff_leaves (id, staff_id, leave_date, reason) VALUES (?, ?, ?, ?)`
      ).bind(id, staffId, date, reason || "\uC218\uB3D9 \uB4F1\uB85D").run();
      return new Response(JSON.stringify({ success: true, id }), {
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response("Invalid action", { status: 400 });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}, "onRequestPost");
var onRequestGet2 = /* @__PURE__ */ __name2(async (context) => {
  try {
    const url = new URL(context.request.url);
    const staffId = url.searchParams.get("staffId");
    if (!staffId) return new Response("Staff ID required", { status: 400 });
    const { results } = await context.env.DB.prepare(
      "SELECT * FROM project_staff_leaves WHERE staff_id = ? ORDER BY leave_date ASC"
    ).bind(staffId).all();
    return new Response(JSON.stringify(results), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}, "onRequestGet");
var onRequestDelete = /* @__PURE__ */ __name2(async (context) => {
  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    if (!id) return new Response("ID required", { status: 400 });
    await context.env.DB.prepare(
      "DELETE FROM project_staff_leaves WHERE id = ?"
    ).bind(id).run();
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}, "onRequestDelete");
var onRequestPut = /* @__PURE__ */ __name2(async (context) => {
  try {
    const id = context.params.id;
    const { name, employee_code, target_persona, daily_work_hours, risk_level } = await context.request.json();
    if (!id) return new Response("ID required", { status: 400 });
    await context.env.DB.prepare(
      `UPDATE project_staff 
             SET name = ?, employee_code = ?, target_persona = ?, daily_work_hours = ?, risk_level = ?
             WHERE id = ?`
    ).bind(name, employee_code, target_persona, daily_work_hours, risk_level, id).run();
    return new Response(JSON.stringify({ success: true, id }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}, "onRequestPut");
var onRequestDelete2 = /* @__PURE__ */ __name2(async (context) => {
  try {
    const id = context.params.id;
    if (!id) return new Response("ID required", { status: 400 });
    await context.env.DB.prepare(
      "DELETE FROM project_staff WHERE id = ?"
    ).bind(id).run();
    return new Response(JSON.stringify({ success: true, id }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}, "onRequestDelete");
var onRequestGet3 = /* @__PURE__ */ __name2(async (context) => {
  try {
    const { results } = await context.env.DB.prepare(
      "SELECT * FROM regular_employees ORDER BY created_at DESC"
    ).all();
    return new Response(JSON.stringify(results), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}, "onRequestGet");
var onRequestPost7 = /* @__PURE__ */ __name2(async (context) => {
  try {
    const payload = await context.request.json();
    const items = Array.isArray(payload) ? payload : [payload];
    const results = [];
    const stmts = [];
    for (const item of items) {
      const {
        employee_code,
        name,
        department,
        position,
        email,
        phone,
        source,
        companyId: explicitCompanyId
      } = item;
      let companyId = explicitCompanyId;
      if (!companyId && email && email.includes("@")) {
        let domain = email.split("@")[1];
        const company = await context.env.DB.prepare("SELECT id FROM companies WHERE domain = ?").bind(domain).first();
        if (company) companyId = company.id;
        else if (domain === "eluonins.com") companyId = "comp_eluonins";
        else companyId = "comp_eluon";
      }
      if (!companyId) companyId = "comp_eluon";
      const id = crypto.randomUUID();
      stmts.push(
        context.env.DB.prepare(
          `INSERT INTO regular_employees (id, company_id, employee_code, name, department, position, email, phone, source, last_synced_at) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          id,
          companyId,
          employee_code || null,
          name,
          department,
          position,
          email || null,
          phone || null,
          source || "excel",
          Date.now()
        )
      );
      results.push({ id, name, companyId });
    }
    if (stmts.length > 0) {
      await context.env.DB.batch(stmts);
    }
    return new Response(JSON.stringify({ success: true, count: results.length, results }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}, "onRequestPost");
var onRequestPost8 = /* @__PURE__ */ __name2(async (context) => {
  try {
    const payload = await context.request.json();
    const { name, employee_code, target_persona, daily_work_hours, risk_level, companyId, scenario = "month_end" } = payload;
    if (!companyId || !name || !employee_code) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
    }
    const id = crypto.randomUUID();
    await context.env.DB.prepare(
      `INSERT INTO project_staff (id, company_id, name, employee_code, target_persona, daily_work_hours, risk_level, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      companyId,
      name,
      employee_code,
      target_persona,
      daily_work_hours || "09:00-18:00",
      risk_level || "low",
      Date.now()
    ).run();
    const leaves = generateLeavePlan(id, (/* @__PURE__ */ new Date()).getFullYear(), scenario);
    if (leaves.length > 0) {
      const stmt = context.env.DB.prepare(
        `INSERT INTO project_staff_leaves (id, staff_id, leave_date, reason) VALUES (?, ?, ?, ?)`
      );
      const stmts = leaves.map((l) => stmt.bind(l.id, l.staffId, l.leaveDate, l.reason));
      await context.env.DB.batch(stmts);
    }
    return new Response(JSON.stringify({ success: true, id, leavesCount: leaves.length, ...payload }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}, "onRequestPost");
var onRequestGet4 = /* @__PURE__ */ __name2(async (context) => {
  try {
    const url = new URL(context.request.url);
    const companyId = url.searchParams.get("companyId");
    if (!companyId) {
      return new Response(JSON.stringify({ error: "Company ID required" }), { status: 400 });
    }
    const { results } = await context.env.DB.prepare(
      "SELECT * FROM project_staff WHERE company_id = ? ORDER BY created_at DESC"
    ).bind(companyId).all();
    return new Response(JSON.stringify(results), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}, "onRequestGet");
var routes = [
  {
    routePath: "/api/auth/login",
    mountPath: "/api/auth",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/auth/signup",
    mountPath: "/api/auth",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/api/processing/save",
    mountPath: "/api/processing",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost3]
  },
  {
    routePath: "/api/strategic/attendance",
    mountPath: "/api/strategic",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/strategic/attendance",
    mountPath: "/api/strategic",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost4]
  },
  {
    routePath: "/api/strategic/generate",
    mountPath: "/api/strategic",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost5]
  },
  {
    routePath: "/api/strategic/leaves",
    mountPath: "/api/strategic",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete]
  },
  {
    routePath: "/api/strategic/leaves",
    mountPath: "/api/strategic",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/api/strategic/leaves",
    mountPath: "/api/strategic",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost6]
  },
  {
    routePath: "/api/strategic/:id",
    mountPath: "/api/strategic",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete2]
  },
  {
    routePath: "/api/strategic/:id",
    mountPath: "/api/strategic",
    method: "PUT",
    middlewares: [],
    modules: [onRequestPut]
  },
  {
    routePath: "/api/employees",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet3]
  },
  {
    routePath: "/api/employees",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost7]
  },
  {
    routePath: "/api/strategic",
    mountPath: "/api/strategic",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet4]
  },
  {
    routePath: "/api/strategic",
    mountPath: "/api/strategic",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost8]
  }
];
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
__name2(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name2(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name2(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name2(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name2(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name2(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
__name2(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
__name2(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name2(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
__name2(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
__name2(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
__name2(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
__name2(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
__name2(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
__name2(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
__name2(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");
__name2(pathToRegexp, "pathToRegexp");
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
__name2(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name2(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name2(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name2((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
var drainBody = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
__name2(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = pages_template_worker_default;
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
__name2(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
__name2(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");
__name2(__facade_invoke__, "__facade_invoke__");
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  static {
    __name(this, "___Facade_ScheduledController__");
  }
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name2(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name2(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name2(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
__name2(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name2((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name2((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
__name2(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default2 = drainBody2;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError2(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError2(e.cause)
  };
}
__name(reduceError2, "reduceError");
var jsonError2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError2(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default2 = jsonError2;

// .wrangler/tmp/bundle-3hhNbW/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__2 = [
  middleware_ensure_req_body_drained_default2,
  middleware_miniflare3_json_error_default2
];
var middleware_insertion_facade_default2 = middleware_loader_entry_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__2 = [];
function __facade_register__2(...args) {
  __facade_middleware__2.push(...args.flat());
}
__name(__facade_register__2, "__facade_register__");
function __facade_invokeChain__2(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__2(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__2, "__facade_invokeChain__");
function __facade_invoke__2(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__2(request, env, ctx, dispatch, [
    ...__facade_middleware__2,
    finalMiddleware
  ]);
}
__name(__facade_invoke__2, "__facade_invoke__");

// .wrangler/tmp/bundle-3hhNbW/middleware-loader.entry.ts
var __Facade_ScheduledController__2 = class ___Facade_ScheduledController__2 {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__2)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler2(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__2(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__2(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler2, "wrapExportedHandler");
function wrapWorkerEntrypoint2(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__2(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__2(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint2, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY2;
if (typeof middleware_insertion_facade_default2 === "object") {
  WRAPPED_ENTRY2 = wrapExportedHandler2(middleware_insertion_facade_default2);
} else if (typeof middleware_insertion_facade_default2 === "function") {
  WRAPPED_ENTRY2 = wrapWorkerEntrypoint2(middleware_insertion_facade_default2);
}
var middleware_loader_entry_default2 = WRAPPED_ENTRY2;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__2 as __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default2 as default
};
//# sourceMappingURL=functionsWorker-0.9461515510231163.js.map
