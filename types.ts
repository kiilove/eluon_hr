export enum LogStatus {
  NORMAL = 'NORMAL',
  VACATION = 'VACATION',
  TRIP = 'TRIP',
  EDUCATION = 'EDUCATION',
  SICK = 'SICK',
  REST = 'REST',
  SPECIAL = 'SPECIAL',
  OTHER = 'OTHER',
  BRIDGE_DAY = 'BRIDGE_DAY'
}

export enum WorkType {
  STANDARD = 'STANDARD',
  SELECTIVE = 'SELECTIVE',
}

export interface User {
  id: string; // Employee ID
  name: string;
  department: string;
  workType: WorkType;
}

export interface RawCommuteLog {
  id: string; // Unique ID for the log entry
  userId: string;
  userName: string;
  userTitle?: string; // Added Title
  department?: string; // Added department (optional)
  date: string; // YYYY-MM-DD
  clockIn: string; // HH:mm (Sanitized for Calc)
  clockOut: string; // HH:mm (Sanitized for Calc)
  originalClockIn?: string; // Raw String from Excel (e.g. 09:00:23.45)
  originalClockOut?: string; // Raw String from Excel (e.g. 18:00:01.12)
  logStatus?: LogStatus; // Added to allow passing existing status
}

// ... (existing fields)

export interface ProcessedWorkLog {
  id: string;
  userId: string;
  employeeId?: string; // Linked DB UUID
  userName: string;
  userTitle?: string;
  department?: string;
  date: string;

  // Work times in Minutes
  startTime: number;
  endTime: number;

  rawStartTime?: number;
  rawEndTime?: number;

  rawStartTimeStr?: string;
  rawEndTimeStr?: string;
  originalStartTimeStr?: string; // True Original from Excel (for Popover)
  originalEndTimeStr?: string; // True Original from Excel (for Popover)

  totalDuration: number;
  breakDuration: number;
  actualWorkDuration: number;

  overtimeDuration: number;
  specialWorkMinutes?: number; // Added
  nightWorkDuration: number; // Added
  restDuration: number; // Added

  workType: 'BASIC' | 'ELASTIC' | 'SELECTIVE'; // Added

  isHoliday: boolean;
  status: 'NORMAL' | 'WARNING' | 'ERROR' | 'MISSING'; // Added MISSING
  logStatus?: LogStatus;
  correctionMemo?: string; // Added
  note?: string;
  candidates?: Employee[]; // Added for Duplicate Resolution
}

export interface WeeklySummary {
  userId?: string;
  userName?: string;
  employeeName?: string; // Alias for Excel processing
  startDate?: string; // Week start
  totalWorkMinutes: number;
  basicWorkMinutes?: number;
  overtimeMinutes?: number;
  specialWorkMinutes?: number;
  complianceStatus: 'PASS' | 'WARNING' | 'VIOLATION';

  // Excel Parser Extras
  totalRawMinutes?: number;
  totalAuditMinutes?: number;
  violationRisk?: boolean;
  maxExcessHours?: number;
  maxRawHours?: number;
  maxAuditHours?: number;
  weeks?: WeekStat[];
  actionPlan?: string;
}



export interface GlobalConfig {
  standardStartTime: string; // "09:00"
  standardEndTime: string;   // "18:00"
  clockInCutoffTime: string; // e.g. "08:45"
  clockOutCutoffTime: string; // e.g. "18:10"
  lateClockInGraceMinutes: number; // e.g. 10 -> 09:10 arrive = 09:00
  breakTimeMinutes: number; // Legacy: e.g. 60 (for >8h)

  // Granular Break Rules (Priority over breakTimeMinutes)
  breakTime4hDeduction?: number; // e.g. 30
  breakTime8hDeduction?: number; // e.g. 60

  maxWeeklyOvertimeMinutes: number; // e.g. 12 * 60 -> 12 hours max overtime per week
  disableSnap?: boolean; // Force raw time usage (No automated snapping)
}

export interface WorkPolicy {
  id: string;
  effective_date: string;
  standard_start_time: string;
  standard_end_time: string;
  break_time_4h_deduction: number;
  break_time_8h_deduction: number;
  clock_in_grace_minutes: number;
  clock_in_cutoff_time: string | null;
  clock_out_cutoff_time: string | null;
  max_weekly_overtime_minutes: number;
  weekly_basic_work_minutes?: number;
}

export interface Employee {
  id: string;
  company_id: string;
  employee_code?: string;
  name: string;
  department?: string;
  position?: string;
  email?: string;
  phone?: string;
  source?: string;
  is_TF?: boolean; // Added
  profile_image?: string; // Base64 or URL
  current_status?: string; // Derived field
  created_at?: number;
  last_synced_at?: number;
}

export interface WagePolicy {
  id?: string;
  name: string;
  effective_date: string;
  base_multiplier: number;
  special_work_multiplier: number;
  night_work_multiplier: number;
}

export interface SpecialWorkItem {
  id: string;
  policy_id?: string;
  name: string;
  code: string;
  symbol: string;
  rate: number;
}

export interface SpecialWorkPolicySet {
  id: string;
  company_id: string;
  effective_date: string;
  items: SpecialWorkItem[];
}

export interface TimeRecord {
  id: string;
  employeeName: string;
  date: string;
  rawStartTime: string;
  rawEndTime: string;
  auditStartTime: string;
  auditEndTime: string;
  rawWorkMinutes: number;
  statutoryBreakMinutes: number;
  policyDeductionMinutes: number;
  manualDeductionMinutes: number;
  auditWorkMinutes: number;
  changes: string[];
  isViolation: boolean;
  weekNumber: number;
  isHoliday: boolean;
  originalIndex?: number;
}

export interface CleansingSettings {
  startBufferMinutes: number;
  endBufferMinutes: number;
  autoDinnerBreak: boolean;
  dinnerBreakThreshold: string; // HH:mm
  dinnerBreakDuration: number;
  maxWeeklyHours: number; // e.g. 52
  enforceCap: boolean;
  safetyRandomness: boolean;
}

export interface WeekStat {
  weekIndex: number;
  rawMinutes: number;
  auditMinutes: number;
  isViolation: boolean;
  status: 'safe' | 'warning' | 'danger';
}
