export type AttendanceStatus = 'present' | 'absent' | 'inactive' | 'holiday';

export interface AttendanceCounts {
  present: number;
  absent: number;
  inactive: number;
  holiday: number;
  total: number;
  attendanceDays: number;
  percentage: number;
}

export function getAttendanceCounts<T extends { status: string }>(records: T[]): AttendanceCounts {
  const present = records.filter(record => record.status === 'present').length;
  const absent = records.filter(record => record.status === 'absent').length;
  const inactive = records.filter(record => record.status === 'inactive').length;
  const holiday = records.filter(record => record.status === 'holiday').length;
  const attendanceDays = present + absent + inactive;

  return {
    present,
    absent,
    inactive,
    holiday,
    total: records.length,
    attendanceDays,
    percentage: attendanceDays > 0 ? Math.round((present / attendanceDays) * 100) : 0,
  };
}