import type {
  SalaryRecord,
  TeacherAttendanceRecord,
  TeacherAttendanceSettings,
  TeacherHoliday,
  TeacherLeaveApplication,
} from '@/context/AppContext';

const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export interface TeacherSalaryBreakdown {
  present: number;
  late: number;
  absent: number;
  holidays: number;
  leave: number;
  deduction: number;
  payable: number;
}

type PayrollSettings = Pick<
  TeacherAttendanceSettings,
  'workingDaysPerMonth' | 'deductionType' | 'lateDeductionAmount'
>;

export function calculateTeacherMonthlySalary(
  month: string,
  year: number,
  teacherId: string,
  baseSalary: number,
  attendanceRecords: readonly TeacherAttendanceRecord[],
  teacherHolidays: readonly TeacherHoliday[],
  teacherLeaves: readonly TeacherLeaveApplication[],
  settings: PayrollSettings,
  throughDate?: string,
): TeacherSalaryBreakdown {
  const monthIndex = monthNames.indexOf(month);
  const salary = Number(baseSalary) || 0;

  if (monthIndex < 0) {
    return { present: 0, late: 0, absent: 0, holidays: 0, leave: 0, deduction: 0, payable: salary };
  }

  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  const cutoffDate = throughDate?.startsWith(monthKey) ? throughDate : undefined;
  const holidayDates = new Set(
    teacherHolidays
      .filter(holiday => holiday.date.startsWith(monthKey))
      .map(holiday => holiday.date),
  );
  const leaveDates = new Set<string>();

  teacherLeaves
    .filter(leave => leave.teacherId === teacherId && leave.status === 'approved')
    .forEach(leave => {
      const cursor = new Date(`${leave.startDate}T12:00:00Z`);
      const end = new Date(`${leave.endDate}T12:00:00Z`);
      while (cursor <= end) {
        const date = cursor.toISOString().slice(0, 10);
        if (date.startsWith(monthKey)) leaveDates.add(date);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    });

  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const workingDates = Array.from({ length: daysInMonth }, (_, index) => {
    const date = `${monthKey}-${String(index + 1).padStart(2, '0')}`;
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    return weekday !== 0
      && weekday !== 6
      && !holidayDates.has(date)
      && !leaveDates.has(date)
      && (!cutoffDate || date <= cutoffDate)
      ? date
      : null;
  }).filter((date): date is string => Boolean(date));

  const recordsByDate = new Map<string, TeacherAttendanceRecord>();
  attendanceRecords
    .filter(item =>
      item.teacherId === teacherId
      && item.date.startsWith(monthKey)
      && (!cutoffDate || item.date <= cutoffDate)
    )
    .forEach(item => recordsByDate.set(item.date, item));
  const rows = Array.from(recordsByDate.values());
  const absent = workingDates.filter(date => {
    const record = recordsByDate.get(date);
    return !record || record.status === 'absent';
  }).length;
  const present = rows.filter(item => item.status === 'present').length;
  const late = rows.filter(item => item.status === 'late').length;
  const dailyRateDivisor = settings.workingDaysPerMonth || workingDates.length || 26;
  const noAttendanceForWorkingDays = present === 0 && late === 0 && absent > 0;
  const absentDeduction = noAttendanceForWorkingDays
    ? salary
    : settings.deductionType === 'fixed'
    ? absent * settings.lateDeductionAmount
    : absent * (salary / dailyRateDivisor);
  const lateDeduction = late * settings.lateDeductionAmount;
  const payable = noAttendanceForWorkingDays
    ? 0
    : Math.max(0, Math.round(salary - absentDeduction - lateDeduction));

  return {
    present,
    late,
    absent,
    holidays: holidayDates.size,
    leave: leaveDates.size,
    deduction: Math.max(0, salary - payable),
    payable,
  };
}

export function getTeacherSalaryBreakdown(
  record: Pick<SalaryRecord, 'month' | 'year' | 'amount'>,
  teacherId: string,
  baseSalary: number,
  attendanceRecords: readonly TeacherAttendanceRecord[],
  teacherHolidays: readonly TeacherHoliday[],
  teacherLeaves: readonly TeacherLeaveApplication[],
  settings: PayrollSettings,
  throughDate?: string,
): TeacherSalaryBreakdown {
  const payable = Number(record.amount) || 0;
  const calculation = calculateTeacherMonthlySalary(
    record.month,
    record.year,
    teacherId,
    baseSalary,
    attendanceRecords,
    teacherHolidays,
    teacherLeaves,
    settings,
    throughDate,
  );
  return {
    ...calculation,
    deduction: Math.max(0, (Number(baseSalary) || 0) - payable),
    payable,
  };
}