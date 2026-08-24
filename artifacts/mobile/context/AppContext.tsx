import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PENDING_CONFIG_KEY, PendingDbConfig } from '@/context/DbSetupContext';

// ─── Types ───────────────────────────────────────────────────────────────────
export interface Student {
  id: string;
  name: string;
  fatherName: string;
  motherName: string;
  mobileNumber: string;
  class: string;
  section?: string;
  admissionNo?: string;
  rollNumber: string;
  dateOfBirth: string;
  address?: string;
  photo?: string;
  gender?: string;
  caste?: string;
  annualFee?: number;
  discountType?: 'fixed' | 'percent';
  discountValue?: number;
  status?: 'active' | 'inactive' | 'graduated';
}

export const STUDENT_GENDER_OPTIONS = ['Male', 'Female', 'Other'] as const;
export const STUDENT_CASTE_OPTIONS = ['General', 'OBC', 'SC', 'ST', 'Other'] as const;

/**
 * Sort roll numbers in the order people expect to see them:
 * 1, 2, 10 instead of the text order 1, 10, 2.
 * Blank or non-numeric roll numbers remain deterministic after numeric ones.
 */
export function compareStudentRollNumbers(a: Pick<Student, 'rollNumber' | 'name'>, b: Pick<Student, 'rollNumber' | 'name'>): number {
  const aRoll = String(a.rollNumber ?? '').trim();
  const bRoll = String(b.rollNumber ?? '').trim();
  const aNumber = Number(aRoll);
  const bNumber = Number(bRoll);
  const aIsNumeric = aRoll !== '' && Number.isFinite(aNumber);
  const bIsNumeric = bRoll !== '' && Number.isFinite(bNumber);

  if (aIsNumeric && bIsNumeric && aNumber !== bNumber) return aNumber - bNumber;
  if (aIsNumeric !== bIsNumeric) return aIsNumeric ? -1 : 1;

  const rollOrder = aRoll.localeCompare(bRoll, undefined, { numeric: true, sensitivity: 'base' });
  return rollOrder || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

export function isGraduatedStudent(student: Pick<Student, 'status'>): boolean {
  return student.status === 'graduated';
}

export function isActiveStudent(student: Pick<Student, 'status'>): boolean {
  return (student.status ?? 'active') === 'active';
}

export function getStudentFeeInfo(student: Student, feeRecords: FeeRecord[]) {
  const annualFee = student.annualFee ?? 0;
  const discountType = student.discountType ?? 'fixed';
  const discountValue = student.discountValue ?? 0;
  const discountAmount = discountType === 'percent'
    ? Math.round((annualFee * discountValue) / 100)
    : discountValue;
  const finalPayable = Math.max(0, annualFee - discountAmount);
  // Only Annual Fee payments count toward the due balance
  const annualRecords = feeRecords.filter(f =>
    f.studentId === student.id && (
      f.feeCategory === 'annual' ||
      (!f.feeCategory && f.feeTypeName?.toLowerCase().includes('annual fee'))
    )
  );
  const totalPaid = annualRecords.reduce((s, f) => s + f.amount, 0);
  const remaining = Math.max(0, finalPayable - totalPaid);
  const status: 'paid' | 'partial' | 'pending' | 'no-fee' =
    annualFee === 0 ? 'no-fee'
    : remaining === 0 ? 'paid'
    : totalPaid > 0 ? 'partial'
    : 'pending';
  return { annualFee, discountAmount, discountValue, discountType, finalPayable, totalPaid, remaining, status };
}

export interface Teacher {
  id: string;
  name: string;
  subject: string;
  mobileNumber: string;
  salary: number;
  username: string;
  password: string;
  joinDate: string;
  photo?: string;
  permissions: {
    addStudent: boolean;
    feeCollection: boolean;
    manageClasses: boolean;
    manageExams: boolean;
    manageResults: boolean;
    promoteStudents: boolean;
    sendFeeReminder: boolean;
    allowMarkEdit: boolean;
  };
}

export interface PromotionRecord {
  id: string;
  studentId: string;
  studentName: string;
  fromClass: string;
  toClass: string;
  promotedBy: string;
  promotedAt: string;
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  studentName: string;
  class: string;
  date: string;
  status: 'present' | 'absent' | 'holiday' | 'inactive';
  takenBy: string;
}

export interface InactivationRequest {
  id: string;
  studentId: string;
  studentName: string;
  studentClass: string;
  teacherId: string;
  teacherName: string;
  reason: string;
  documentBase64?: string;
  documentName?: string;
  documentMimeType?: string;
  status: 'pending' | 'approved' | 'rejected';
  adminNote?: string;
  createdAt: string;
  reviewedAt?: string;
}

export interface SubjectSchedule {
  subject: string;
  date: string;
  maxMarks: number;
  time?: string;
  startTime?: string;
  endTime?: string;
}

/** Per-class subject assignment added to an exam after creation. */
export interface ClassSubjectAssignment {
  class: string;
  subjects: string[];
  subjectSchedule?: SubjectSchedule[];
  subjectSchedules?: SubjectSchedule[];
}

export interface Exam {
  id: string;
  name: string;
  class: string;
  subjects: string[];
  subjectSchedule?: SubjectSchedule[];
  /** Optional multi-class assignment: Exam → Class → Subjects. */
  classSubjects?: ClassSubjectAssignment[];
  date: string;
  maxMarks: number;
}

/**
 * Return the subjects for a specific class on this exam.
 * Checks classSubjects first; falls back to exam.subjects.
 */
export function getExamSubjectsForClass(exam: Exam, className: string): string[] {
  if (exam.classSubjects && exam.classSubjects.length > 0) {
    const entry = exam.classSubjects.find(cs => cs.class === className);
    if (entry) return entry.subjects;
  }
  return exam.subjects;
}

/**
 * Return the subjectSchedule for a specific class on this exam.
 */
export function getExamScheduleForClass(exam: Exam, className: string): SubjectSchedule[] | undefined {
  if (exam.classSubjects && exam.classSubjects.length > 0) {
    const entry = exam.classSubjects.find(cs => cs.class === className);
    if (entry) return entry.subjectSchedule ?? entry.subjectSchedules ?? exam.subjectSchedule;
  }
  return exam.subjectSchedule;
}

/** Return the configured maximum for one subject, with legacy fallback support. */
export function getSubjectMaxMarksForClass(
  exam: Exam,
  subject: string,
  className?: string | null,
): number {
  const schedule = getExamScheduleForClass(exam, className ?? exam.class)
    ?.find(item => item.subject === subject);
  const scheduledMax = Number(
    schedule?.maxMarks
      ?? (schedule as SubjectSchedule & { max_marks?: number } | undefined)?.max_marks,
  );
  if (Number.isFinite(scheduledMax) && scheduledMax > 0) return scheduledMax;

  const examMax = Number(exam.maxMarks);
  return Number.isFinite(examMax) && examMax > 0 ? examMax : 100;
}

export interface ExamResult {
  id: string;
  examId: string;
  studentId: string;
  studentName: string;
  class: string;
  rollNumber: string;
  marks: Record<string, number>;
}

/** Per-subject submission status record (draft → submitted → locked). */
export interface MarkSubmission {
  id: string;
  examId: string;
  class: string;
  subject: string;
  /** 'draft' | 'submitted' | 'locked' */
  status: string;
  teacherId?: string;
  teacherName?: string;
  submittedAt?: string;
  lockedBy?: string;
  lockedAt?: string;
}

export interface MarkAuditEntry {
  id: string;
  examId: string;
  class: string;
  subject: string;
  /** 'submit' | 'lock' | 'unlock' */
  action: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  notes?: string;
  createdAt: string;
}

export interface FeeType {
  id: string;
  name: string;
  amount: number;
  description: string;
  category?: 'annual' | 'additional';
}

export interface FeeRecord {
  id: string;
  studentId: string;
  studentName: string;
  class: string;
  amount: number;
  date: string;
  description: string;
  feeTypeId?: string;
  feeTypeName?: string;
  collectedBy: string;
  receiptNumber?: string;
  paymentMethod?: string;
  feeCategory?: 'annual' | 'additional';
  discountApplied?: number;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  date: string;
  category: string;
}

export interface SalaryRecord {
  id: string;
  teacherId: string;
  teacherName: string;
  month: string;
  year: number;
  amount: number;
  status: 'paid' | 'pending';
  paidDate?: string;
  receiptNumber?: string;
}

const salaryMonthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function compareSalaryRecordsNewestFirst(a: SalaryRecord, b: SalaryRecord): number {
  const periodOrder = b.year - a.year
    || salaryMonthNames.indexOf(b.month) - salaryMonthNames.indexOf(a.month);
  if (periodOrder !== 0) return periodOrder;

  return (b.paidDate ?? '').localeCompare(a.paidDate ?? '');
}

export interface Alumni {
  id: string;
  studentId?: string;
  studentName?: string;
  class?: string;
  section?: string;
  graduationYear?: string;
  name: string;
  fatherName: string;
  mobileNumber: string;
  batch: string;
  passOutClass: string;
  rollNumber: string;
  admissionNo?: string;
  dateOfBirth: string;
  address?: string;
  photo?: string;
  achievements?: string;
  currentStatus?: string;
  createdAt?: string;
}

interface AppState {
  students: Student[];
  teachers: Teacher[];
  classes: string[];
  sections: string[];
  subjects: string[];
  feeTypes: FeeType[];
  attendanceRecords: AttendanceRecord[];
  exams: Exam[];
  examResults: ExamResult[];
  feeRecords: FeeRecord[];
  expenses: Expense[];
  salaryRecords: SalaryRecord[];
  promotionRecords: PromotionRecord[];
  markSubmissions: MarkSubmission[];
  markAuditLog: MarkAuditEntry[];
  inactivationRequests: InactivationRequest[];
  classAbsentLimits: Record<string, number>;
  documentBranding: DocumentBranding;
  alumni: Alumni[];
}

export interface DocumentBranding {
  logoDataUrl: string | null;
  signatureDataUrl: string | null; // legacy – kept for backward compat
  principalSignatureDataUrl: string | null;
  teacherSignatureDataUrl: string | null;
  examInChargeSignatureDataUrl: string | null;
}

interface AppContextType extends AppState {
  addStudent: (s: Omit<Student, 'id'>) => void;
  updateStudent: (id: string, s: Partial<Student>) => Promise<void>;
  deleteStudent: (id: string) => void;
  addTeacher: (t: Omit<Teacher, 'id'>) => void;
  updateTeacher: (id: string, t: Partial<Teacher>) => void;
  refreshTeachers: () => Promise<void>;
  deleteTeacher: (id: string) => void;
  addClass: (name: string) => Promise<void>;
  updateClass: (oldName: string, newName: string) => Promise<void>;
  deleteClass: (name: string) => Promise<void>;
  addSection: (name: string) => Promise<void>;
  updateSection: (oldName: string, newName: string) => Promise<void>;
  deleteSection: (name: string) => Promise<void>;
  addSubject: (name: string) => void;
  deleteSubject: (name: string) => void;
  addFeeType: (f: Omit<FeeType, 'id'>) => void;
  updateFeeType: (id: string, f: Partial<FeeType>) => void;
  deleteFeeType: (id: string) => void;
  addAttendance: (records: Omit<AttendanceRecord, 'id'>[]) => void;
  addExam: (e: Omit<Exam, 'id'>) => void;
  updateExam: (id: string, e: Partial<Exam>) => void;
  deleteExam: (id: string) => void;
  saveExamResults: (results: Omit<ExamResult, 'id'>[]) => void;
  submitSubjectMarks: (params: {
    examId: string; class: string; subject: string;
    teacherId: string; teacherName: string;
    marks: Array<{ studentId: string; studentName: string; rollNumber: string; mark: number | null }>;
  }) => Promise<void>;
  lockSubject: (examId: string, cls: string, subject: string, adminId: string, adminName: string) => Promise<void>;
  unlockSubject: (examId: string, cls: string, subject: string, adminId: string, adminName: string) => Promise<void>;
  addFeeRecord: (r: Omit<FeeRecord, 'id'>) => FeeRecord;
  deleteFeeRecord: (id: string) => void;
  addExpense: (e: Omit<Expense, 'id'>) => void;
  deleteExpense: (id: string) => void;
  updateSalaryStatus: (teacherId: string, month: string, year: number, status: 'paid' | 'pending') => SalaryRecord;
  addSalaryRecord: (r: Omit<SalaryRecord, 'id'>) => SalaryRecord;
  deleteSalaryRecord: (id: string) => void;
  promoteStudent: (studentId: string, toClass: string, promotedBy: string) => void;
  bulkPromoteClass: (fromClass: string, toClass: string, promotedBy: string) => number;
  // ── Inactivation Requests ──
  submitInactivationRequest: (data: {
    studentId: string; studentName: string; studentClass: string;
    teacherId: string; teacherName: string; reason: string;
    documentBase64?: string; documentName?: string; documentMimeType?: string;
  }) => Promise<InactivationRequest>;
  approveInactivationRequest: (id: string, adminNote?: string) => Promise<void>;
  rejectInactivationRequest: (id: string, adminNote?: string) => Promise<void>;
  deleteInactivationRequestDocument: (id: string) => Promise<void>;
  deleteInactivationRequest: (id: string) => Promise<void>;
  refreshInactivationRequests: () => Promise<void>;
  setStudentStatus: (id: string, status: 'active' | 'inactive' | 'graduated') => Promise<void>;
  setClassAbsentLimit: (className: string, maxDays: number) => Promise<void>;
  updateDocumentBranding: (branding: DocumentBranding) => Promise<void>;
  addAlumni: (a: Omit<Alumni, 'id'>) => void;
  updateAlumni: (id: string, a: Partial<Alumni>) => void;
  deleteAlumni: (id: string) => void;
  bulkAddAlumni: (records: Omit<Alumni, 'id' | 'batch'>[], batch: string) => Promise<void>;
}

// ─── Seed data ───────────────────────────────────────────────────────────────
const today = new Date();
const todayStr = today.toISOString().split('T')[0];
const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const SEED_CLASSES = ['Class 1','Class 2','Class 3','Class 4','Class 5','Class 6','Class 7','Class 8','Class 9','Class 10'];
const SEED_SUBJECTS = ['Mathematics','Science','English','Hindi','Social Science','Sanskrit','Computer','Drawing','Physical Education','General Knowledge'];
const SEED_TEACHERS: Teacher[] = [
  { id: 't1', name: 'Rajesh Kumar', subject: 'Mathematics', mobileNumber: '9876543210', salary: 25000, username: 'teacher1', password: 'teacher123', joinDate: '2023-04-01', permissions: { addStudent: true, feeCollection: false, manageClasses: false, manageExams: false, manageResults: false, promoteStudents: false, sendFeeReminder: false, allowMarkEdit: false } },
  { id: 't2', name: 'Priya Sharma', subject: 'Science', mobileNumber: '9876543211', salary: 22000, username: 'teacher2', password: 'teacher123', joinDate: '2023-06-01', permissions: { addStudent: false, feeCollection: true, manageClasses: false, manageExams: true, manageResults: true, promoteStudents: false, sendFeeReminder: false, allowMarkEdit: false } },
];
const SEED_STUDENTS: Student[] = [
  { id: 's1', name: 'Arjun Singh', fatherName: 'Vikram Singh', motherName: 'Sunita Singh', mobileNumber: '9812345670', class: 'Class 5', rollNumber: '01', dateOfBirth: todayStr },
  { id: 's2', name: 'Priya Patel', fatherName: 'Ramesh Patel', motherName: 'Geeta Patel', mobileNumber: '9812345671', class: 'Class 5', rollNumber: '02', dateOfBirth: '2014-03-22' },
  { id: 's3', name: 'Rahul Verma', fatherName: 'Suresh Verma', motherName: 'Kavita Verma', mobileNumber: '9812345672', class: 'Class 6', rollNumber: '01', dateOfBirth: '2013-07-15' },
  { id: 's4', name: 'Ananya Gupta', fatherName: 'Deepak Gupta', motherName: 'Ritu Gupta', mobileNumber: '9812345673', class: 'Class 6', rollNumber: '02', dateOfBirth: '2013-11-30' },
];
const SEED_FEE_TYPES: FeeType[] = [
  { id: 'ft1', name: 'Monthly Fee', amount: 3500, description: 'Regular monthly tuition fee' },
  { id: 'ft2', name: 'Annual Fee', amount: 10000, description: 'Annual school fee' },
  { id: 'ft3', name: 'Exam Fee', amount: 500, description: 'Examination fee' },
  { id: 'ft4', name: 'Sports Fee', amount: 200, description: 'Sports and activities fee' },
  { id: 'ft5', name: 'Library Fee', amount: 150, description: 'Library membership fee' },
];
const SEED_EXAMS: Exam[] = [
  { id: 'e1', name: 'Mid Term Exam 2026', class: 'Class 5', subjects: ['Mathematics','Science','English','Hindi'], date: '2026-07-10', maxMarks: 100 },
  { id: 'e2', name: 'Unit Test 1', class: 'Class 6', subjects: ['Mathematics','Science'], date: '2026-07-12', maxMarks: 50 },
];
const SEED_FEE_RECORDS: FeeRecord[] = [
  { id: 'f1', studentId: 's1', studentName: 'Arjun Singh', class: 'Class 5', amount: 3500, date: todayStr, description: 'Monthly Fee - July 2026', feeTypeId: 'ft1', feeTypeName: 'Monthly Fee', collectedBy: 'Admin', receiptNumber: 'RCP00000001' },
  { id: 'f2', studentId: 's2', studentName: 'Priya Patel', class: 'Class 5', amount: 3500, date: todayStr, description: 'Monthly Fee - July 2026', feeTypeId: 'ft1', feeTypeName: 'Monthly Fee', collectedBy: 'Admin', receiptNumber: 'RCP00000002' },
];
const SEED_EXPENSES: Expense[] = [
  { id: 'ex1', description: 'Stationery Purchase', amount: 2500, date: todayStr, category: 'Supplies' },
  { id: 'ex2', description: 'Electricity Bill', amount: 5000, date: todayStr, category: 'Utilities' },
];
const SEED_RESULTS: ExamResult[] = [
  { id: 'r1', examId: 'e1', studentId: 's1', studentName: 'Arjun Singh', class: 'Class 5', rollNumber: '01', marks: { Mathematics: 85, Science: 78, English: 90, Hindi: 82 } },
  { id: 'r2', examId: 'e1', studentId: 's2', studentName: 'Priya Patel', class: 'Class 5', rollNumber: '02', marks: { Mathematics: 92, Science: 88, English: 95, Hindi: 89 } },
];
const SEED_SALARIES: SalaryRecord[] = [
  { id: 'sal1', teacherId: 't1', teacherName: 'Rajesh Kumar', month: monthNames[today.getMonth()], year: today.getFullYear(), amount: 25000, status: 'paid', paidDate: todayStr, receiptNumber: 'SAL00000001' },
  { id: 'sal2', teacherId: 't2', teacherName: 'Priya Sharma', month: monthNames[today.getMonth()], year: today.getFullYear(), amount: 22000, status: 'pending' },
];

const DEFAULT_STATE: AppState = {
  students: [], teachers: [], classes: [], sections: [], subjects: [], feeTypes: [],
  attendanceRecords: [], exams: [], examResults: [], feeRecords: [], expenses: [],
  salaryRecords: [], promotionRecords: [], markSubmissions: [], markAuditLog: [],
  inactivationRequests: [], classAbsentLimits: {}, alumni: [],
  documentBranding: {
    logoDataUrl: null,
    signatureDataUrl: null,
    principalSignatureDataUrl: null,
    teacherSignatureDataUrl: null,
    examInChargeSignatureDataUrl: null,
  },
};

// ─── API helpers ──────────────────────────────────────────────────────────────
const getApiBase = (): string => {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : '';
};

let receiptCounter = 1;
const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const genReceiptNumber = (prefix = 'RCP') => `${prefix}${String(receiptCounter++).padStart(8, '0')}`;

async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBase()}/api${path}`, init);
  if (!res.ok) throw new Error(`GET /api${path} failed: ${res.status}`);
  return res.json();
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${getApiBase()}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = '';
    try {
      const errorBody = await res.json() as { error?: string };
      detail = errorBody.error ? ` — ${errorBody.error}` : '';
    } catch {
      // Keep the status-only error when the server response is not JSON.
    }
    throw new Error(`POST /api${path} failed: ${res.status}${detail}`);
  }
  return res.json();
}

async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${getApiBase()}/api${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT /api${path} failed: ${res.status}`);
  return res.json();
}

async function apiDelete<T = void>(path: string): Promise<T> {
  const res = await fetch(`${getApiBase()}/api${path}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`DELETE /api${path} failed: ${res.status}`);
  if (res.status === 404 || res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Row → App type mappers (db uses snake_case columns) ─────────────────────
function mapStudent(r: any): Student {
  return {
    id: r.id, name: r.name, fatherName: r.fatherName ?? r.father_name ?? '',
    motherName: r.motherName ?? r.mother_name ?? '', mobileNumber: r.mobileNumber ?? r.mobile_number ?? '',
    class: r.class, section: r.section ?? undefined, admissionNo: r.admissionNo ?? r.admission_no ?? undefined,
    rollNumber: r.rollNumber ?? r.roll_number ?? '', dateOfBirth: r.dateOfBirth ?? r.date_of_birth ?? '',
    address: r.address ?? undefined, photo: r.photo ?? undefined,
    gender: r.gender ?? undefined, caste: r.caste ?? undefined,
    annualFee: r.annualFee ?? r.annual_fee ?? undefined,
    discountType: (r.discountType ?? r.discount_type) as any ?? undefined,
    discountValue: r.discountValue ?? r.discount_value ?? undefined,
    status: (r.status ?? 'active') as 'active' | 'inactive' | 'graduated',
  };
}

function mapTeacher(r: any): Teacher {
  return {
    id: r.id, name: r.name, subject: r.subject,
    mobileNumber: r.mobileNumber ?? r.mobile_number ?? '', salary: r.salary ?? 0,
    username: r.username, password: r.password, joinDate: r.joinDate ?? r.join_date ?? '',
    photo: r.photo ?? undefined,
    permissions: {
      addStudent: false,
      feeCollection: false,
      manageClasses: false,
      manageExams: false,
      manageResults: false,
      promoteStudents: false,
      sendFeeReminder: false,
      allowMarkEdit: false,
      ...(r.permissions ?? {}),
    },
  };
}

function mapFeeType(r: any): FeeType {
  return { id: r.id, name: r.name, amount: r.amount, description: r.description ?? '', category: r.category ?? undefined };
}

function mapAttendance(r: any): AttendanceRecord {
  return {
    id: r.id, studentId: r.studentId ?? r.student_id, studentName: r.studentName ?? r.student_name ?? '',
    class: r.class, date: r.date,
    // Older records used "leave"; display them with the new Holiday label.
    // Inactive is a report-only attendance status for days a student was inactive.
    status: r.status === 'leave' ? 'holiday' : r.status,
    takenBy: r.takenBy ?? r.taken_by ?? '',
  };
}

function mapExam(r: any): Exam {
  const cs = r.classSubjects ?? r.class_subjects;
  return {
    id: r.id, name: r.name, class: r.class,
    subjects: Array.isArray(r.subjects) ? r.subjects : [],
    subjectSchedule: r.subjectSchedule ?? r.subject_schedule ?? undefined,
    classSubjects: Array.isArray(cs)
      ? cs.map((assignment: any) => ({
          ...assignment,
          subjectSchedule: assignment.subjectSchedule ?? assignment.subjectSchedules,
        }))
      : undefined,
    date: r.date, maxMarks: r.maxMarks ?? r.max_marks ?? 100,
  };
}

function mapExamResult(r: any): ExamResult {
  return {
    id: r.id, examId: r.examId ?? r.exam_id, studentId: r.studentId ?? r.student_id,
    studentName: r.studentName ?? r.student_name ?? '', class: r.class,
    rollNumber: r.rollNumber ?? r.roll_number ?? '',
    marks: typeof r.marks === 'object' ? r.marks : {},
  };
}

function mapFeeRecord(r: any): FeeRecord {
  return {
    id: r.id, studentId: r.studentId ?? r.student_id, studentName: r.studentName ?? r.student_name ?? '',
    class: r.class, amount: r.amount, date: r.date, description: r.description ?? '',
    feeTypeId: r.feeTypeId ?? r.fee_type_id ?? undefined, feeTypeName: r.feeTypeName ?? r.fee_type_name ?? undefined,
    collectedBy: r.collectedBy ?? r.collected_by ?? '', receiptNumber: r.receiptNumber ?? r.receipt_number ?? undefined,
    paymentMethod: r.paymentMethod ?? r.payment_method ?? undefined,
    feeCategory: (r.feeCategory ?? r.fee_category) as any ?? undefined,
    discountApplied: r.discountApplied ?? r.discount_applied ?? undefined,
  };
}

function mapExpense(r: any): Expense {
  return { id: r.id, description: r.description, amount: r.amount, date: r.date, category: r.category };
}

function mapSalary(r: any): SalaryRecord {
  return {
    id: r.id, teacherId: r.teacherId ?? r.teacher_id, teacherName: r.teacherName ?? r.teacher_name ?? '',
    month: r.month, year: r.year, amount: r.amount, status: r.status,
    paidDate: r.paidDate ?? r.paid_date ?? undefined, receiptNumber: r.receiptNumber ?? r.receipt_number ?? undefined,
  };
}

function mapPromotion(r: any): PromotionRecord {
  return {
    id: r.id, studentId: r.studentId ?? r.student_id, studentName: r.studentName ?? r.student_name ?? '',
    fromClass: r.fromClass ?? r.from_class ?? '', toClass: r.toClass ?? r.to_class ?? '',
    promotedBy: r.promotedBy ?? r.promoted_by ?? '', promotedAt: r.promotedAt ?? r.promoted_at ?? '',
  };
}

function mapInactivationRequest(r: any): InactivationRequest {
  return {
    id: r.id,
    studentId: r.studentId ?? r.student_id,
    studentName: r.studentName ?? r.student_name ?? '',
    studentClass: r.studentClass ?? r.student_class ?? '',
    teacherId: r.teacherId ?? r.teacher_id,
    teacherName: r.teacherName ?? r.teacher_name ?? '',
    reason: r.reason ?? '',
    documentBase64: r.documentBase64 ?? r.document_base64 ?? undefined,
    documentName: r.documentName ?? r.document_name ?? undefined,
    documentMimeType: r.documentMimeType ?? r.document_mime_type ?? undefined,
    status: r.status ?? 'pending',
    adminNote: r.adminNote ?? r.admin_note ?? undefined,
    createdAt: r.createdAt ?? r.created_at ?? '',
    reviewedAt: r.reviewedAt ?? r.reviewed_at ?? undefined,
  };
}

// ─── Seed helpers ─────────────────────────────────────────────────────────────
async function seedAllData() {
  try {
    await Promise.allSettled(SEED_CLASSES.map(name => apiPost('/classes', { name })));
    await Promise.allSettled(SEED_SUBJECTS.map(name => apiPost('/subjects', { name })));
    await Promise.allSettled(SEED_TEACHERS.map(t => apiPost('/teachers', t)));
    await Promise.allSettled(SEED_STUDENTS.map(s => apiPost('/students', s)));
    await Promise.allSettled(SEED_FEE_TYPES.map(f => apiPost('/fee-types', f)));
    await Promise.allSettled(SEED_EXAMS.map(e => apiPost('/exams', e)));
    await Promise.allSettled(SEED_FEE_RECORDS.map(f => apiPost('/fee-records', f)));
    await Promise.allSettled(SEED_EXPENSES.map(e => apiPost('/expenses', e)));
    await Promise.allSettled(SEED_SALARIES.map(s => apiPost('/salary-records', s)));
    await apiPost('/exam-results/bulk', SEED_RESULTS);
  } catch {
    // Seed errors are non-fatal
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────
const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const loadedRef = React.useRef(false);

  const loadAllData = React.useCallback(async (): Promise<boolean> => {
    try {
      const [classes, sections, students, teachers, subjects, feeTypes, attendance, exams, results, fees, expenses, salaries, promotions, markSubs, auditLog, inactivationReqs, classAbsentLimitsRaw, documentBranding, alumniRows] = await Promise.all([
        apiGet<string[]>('/classes'),
        apiGet<string[]>('/sections').catch(() => [] as string[]),
        apiGet<any[]>('/students?includeGraduated=true'),
        apiGet<any[]>('/teachers'),
        apiGet<string[]>('/subjects'),
        apiGet<any[]>('/fee-types'),
        apiGet<any[]>('/attendance'),
        apiGet<any[]>('/exams'),
        apiGet<any[]>('/exam-results'),
        apiGet<any[]>('/fee-records'),
        apiGet<any[]>('/expenses'),
        apiGet<any[]>('/salary-records'),
        apiGet<any[]>('/promotion-records'),
        apiGet<any[]>('/mark-submissions').catch(() => [] as any[]),
        apiGet<any[]>('/mark-audit-log').catch(() => [] as any[]),
        apiGet<any[]>('/inactivation-requests', { cache: 'no-store' }).catch(() => [] as any[]),
        apiGet<Record<string, number>>('/settings/class-absent-limits').catch(() => ({} as Record<string, number>)),
        apiGet<DocumentBranding>('/settings/document-branding').catch(() => DEFAULT_STATE.documentBranding),
        apiGet<any[]>('/alumni').catch(() => [] as any[]),
      ]);

      const isEmpty = classes.length === 0 && students.length === 0 && teachers.length === 0;

      if (isEmpty) {
        await seedAllData();
        const [c2, sec2, s2, t2, sub2, ft2, att2, ex2, res2, fee2, exp2, sal2, pro2, ms2, auditLog2, ir2, cal2, branding2, alumni2] = await Promise.all([
          apiGet<string[]>('/classes'), apiGet<string[]>('/sections').catch(() => [] as string[]),
          apiGet<any[]>('/students?includeGraduated=true'), apiGet<any[]>('/teachers'),
          apiGet<string[]>('/subjects'), apiGet<any[]>('/fee-types'), apiGet<any[]>('/attendance'),
          apiGet<any[]>('/exams'), apiGet<any[]>('/exam-results'), apiGet<any[]>('/fee-records'),
          apiGet<any[]>('/expenses'), apiGet<any[]>('/salary-records'), apiGet<any[]>('/promotion-records'),
          apiGet<any[]>('/mark-submissions').catch(() => [] as any[]),
          apiGet<any[]>('/mark-audit-log').catch(() => [] as any[]),
          apiGet<any[]>('/inactivation-requests', { cache: 'no-store' }).catch(() => [] as any[]),
          apiGet<Record<string, number>>('/settings/class-absent-limits').catch(() => ({} as Record<string, number>)),
          apiGet<DocumentBranding>('/settings/document-branding').catch(() => DEFAULT_STATE.documentBranding),
          apiGet<any[]>('/alumni').catch(() => [] as any[]),
        ]);
        setState({
          classes: c2.sort((a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })), sections: sec2, students: s2.map(mapStudent), teachers: t2.map(mapTeacher),
          subjects: sub2, feeTypes: ft2.map(mapFeeType), attendanceRecords: att2.map(mapAttendance),
          exams: ex2.map(mapExam), examResults: res2.map(mapExamResult), feeRecords: fee2.map(mapFeeRecord),
          expenses: exp2.map(mapExpense), salaryRecords: sal2.map(mapSalary), promotionRecords: pro2.map(mapPromotion),
          markSubmissions: ms2, markAuditLog: auditLog2,
          inactivationRequests: ir2.map(mapInactivationRequest),
          classAbsentLimits: cal2,
          documentBranding: branding2,
          alumni: alumni2,
        });
      } else {
        setState({
          classes: classes.sort((a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })), sections, students: students.map(mapStudent), teachers: teachers.map(mapTeacher),
          subjects, feeTypes: feeTypes.map(mapFeeType), attendanceRecords: attendance.map(mapAttendance),
          exams: exams.map(mapExam), examResults: results.map(mapExamResult), feeRecords: fees.map(mapFeeRecord),
          expenses: expenses.map(mapExpense), salaryRecords: salaries.map(mapSalary), promotionRecords: promotions.map(mapPromotion),
          markSubmissions: markSubs, markAuditLog: auditLog,
          inactivationRequests: inactivationReqs.map(mapInactivationRequest),
          classAbsentLimits: classAbsentLimitsRaw,
          documentBranding,
          alumni: alumniRows,
        });
      }
      return true;
    } catch (err) {
      console.error('[AppContext] Failed to load from API:', err);
      return false;
    }
  }, []);

  // ── Sync locally-saved DB config to API (set during offline setup) ──────────
  const syncPendingDbConfig = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(PENDING_CONFIG_KEY);
      if (!raw) return;
      const cfg: PendingDbConfig = JSON.parse(raw);
      const dbType = cfg.provider === 'firebase' ? 'firebase' : 'postgresql';
      const body: Record<string, any> = { name: cfg.name, dbType };
      if (cfg.provider !== 'firebase') {
        body.url = cfg.url;
      } else {
        Object.assign(body, {
          projectId: cfg.projectId, apiKey: cfg.apiKey, authDomain: cfg.authDomain,
          storageBucket: cfg.storageBucket, messagingSenderId: cfg.messagingSenderId,
          appId: cfg.appId, serviceAccountJson: cfg.serviceAccountJson,
        });
      }
      const created = await apiPost<{ id: string }>('/db-connections', body);
      const result = await apiPost<{ success: boolean }>(`/db-connections/${created.id}/test`, {});
      if (result.success) {
        await apiPost(`/db-connections/${created.id}/activate`, {});
        await AsyncStorage.removeItem(PENDING_CONFIG_KEY);
        console.log('[AppContext] Pending DB config synced and activated.');
      } else {
        // Delete bad entry — user will need to reconfigure
        await fetch(`${getApiBase()}/api/db-connections/${created.id}`, { method: 'DELETE' }).catch(() => {});
      }
    } catch (_e) {
      // Ignore — will retry next time API loads successfully
    }
  }, []);

  useEffect(() => {
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const attempt = async (delay = 0) => {
      if (cancelled) return;
      if (delay > 0) await new Promise(r => setTimeout(r, delay));
      if (cancelled) return;
      const ok = await loadAllData();
      if (ok) {
        loadedRef.current = true;
        syncPendingDbConfig(); // best-effort, non-blocking
      } else if (!cancelled) {
        // Retry every 3 s until data loads
        retryTimer = setTimeout(() => attempt(0), 3000);
      }
    };

    attempt();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [loadAllData]);

  // ── Students ──
  const addStudent = useCallback((s: Omit<Student, 'id'>) => {
    const ns: Student = { ...s, id: genId() };
    setState(prev => ({ ...prev, students: [...prev.students, ns] }));
    apiPost('/students', ns).then(row => {
      setState(prev => ({ ...prev, students: prev.students.map(x => x.id === ns.id ? mapStudent(row as any) : x) }));
    }).catch(console.error);
  }, []);

  const updateStudent = useCallback(async (id: string, s: Partial<Student>) => {
    setState(prev => ({ ...prev, students: prev.students.map(x => x.id === id ? { ...x, ...s } : x) }));
    await apiPut(`/students/${id}`, s);
  }, []);

  const deleteStudent = useCallback((id: string) => {
    setState(prev => ({ ...prev, students: prev.students.filter(x => x.id !== id) }));
    apiDelete(`/students/${id}`).catch(console.error);
  }, []);

  // ── Teachers ──
  const addTeacher = useCallback((t: Omit<Teacher, 'id'>) => {
    const nt: Teacher = { ...t, id: genId() };
    setState(prev => ({ ...prev, teachers: [...prev.teachers, nt] }));
    apiPost('/teachers', nt).then(row => {
      setState(prev => ({ ...prev, teachers: prev.teachers.map(x => x.id === nt.id ? mapTeacher(row as any) : x) }));
    }).catch(console.error);
  }, []);

  const updateTeacher = useCallback((id: string, t: Partial<Teacher>) => {
    setState(prev => ({ ...prev, teachers: prev.teachers.map(x => x.id === id ? { ...x, ...t } : x) }));
    apiPut(`/teachers/${id}`, t).then(row => {
      setState(prev => ({ ...prev, teachers: prev.teachers.map(x => x.id === id ? mapTeacher(row as any) : x) }));
    }).catch(console.error);
  }, []);

  const refreshTeachers = useCallback(async (): Promise<void> => {
    const rows = await apiGet<any[]>(`/teachers?refresh=${Date.now()}`);
    setState(prev => ({ ...prev, teachers: rows.map(mapTeacher) }));
  }, []);

  const deleteTeacher = useCallback((id: string) => {
    setState(prev => ({ ...prev, teachers: prev.teachers.filter(x => x.id !== id) }));
    apiDelete(`/teachers/${id}`).catch(console.error);
  }, []);

  // ── Classes (API-backed, stays synchronous for compat) ──
  const addClass = async (name: string): Promise<void> => {
    const res = await fetch(`${getApiBase()}/api/classes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    if (res.status === 409) throw new Error('Class already exists');
    if (!res.ok) throw new Error(`POST /api/classes failed: ${res.status}`);
    setState(prev => {
      if (prev.classes.includes(name)) return prev;
      return { ...prev, classes: [...prev.classes, name].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })) };
    });
  };

  const updateClass = async (oldName: string, newName: string): Promise<void> => {
    const trimmed = newName.trim();
    const res = await fetch(`${getApiBase()}/api/classes/${encodeURIComponent(oldName)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newName: trimmed }),
    });
    if (res.status === 404) throw new Error('Class not found');
    if (res.status === 409) throw new Error('Class already exists');
    if (!res.ok) throw new Error(`PUT /api/classes failed: ${res.status}`);
    setState(prev => ({ ...prev, classes: prev.classes.map(c => c === oldName ? trimmed : c).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })) }));
  };

  const deleteClass = async (name: string): Promise<void> => {
    const res = await fetch(`${getApiBase()}/api/classes/${encodeURIComponent(name)}`, { method: 'DELETE' });
    if (res.status === 404) throw new Error('Class not found');
    if (!res.ok) throw new Error(`DELETE /api/classes failed: ${res.status}`);
    setState(prev => ({ ...prev, classes: prev.classes.filter(c => c !== name) }));
  };

  // ── Sections ──
  const addSection = async (name: string): Promise<void> => {
    const trimmed = name.trim();
    const res = await fetch(`${getApiBase()}/api/sections`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: trimmed }),
    });
    if (res.status === 409) throw new Error('Section already exists');
    if (!res.ok) throw new Error(`POST /api/sections failed: ${res.status}`);
    setState(prev => {
      if (prev.sections.includes(trimmed)) return prev;
      return { ...prev, sections: [...prev.sections, trimmed].sort() };
    });
  };

  const updateSection = async (oldName: string, newName: string): Promise<void> => {
    const trimmed = newName.trim();
    const res = await fetch(`${getApiBase()}/api/sections/${encodeURIComponent(oldName)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newName: trimmed }),
    });
    if (res.status === 404) throw new Error('Section not found');
    if (res.status === 409) throw new Error('Section already exists');
    if (!res.ok) throw new Error(`PUT /api/sections failed: ${res.status}`);
    setState(prev => ({
      ...prev,
      sections: Array.from(new Set(prev.sections.map(s => s === oldName ? trimmed : s))).sort(),
      students: prev.students.map(student => student.section === oldName ? { ...student, section: trimmed } : student),
    }));
  };

  const deleteSection = async (name: string): Promise<void> => {
    const res = await fetch(`${getApiBase()}/api/sections/${encodeURIComponent(name)}`, { method: 'DELETE' });
    if (res.status === 404) throw new Error('Section not found');
    if (!res.ok) throw new Error(`DELETE /api/sections failed: ${res.status}`);
    setState(prev => ({
      ...prev,
      sections: prev.sections.filter(s => s !== name),
      students: prev.students.map(student => student.section === name ? { ...student, section: undefined } : student),
    }));
  };

  // ── Subjects ──
  const addSubject = useCallback((name: string) => {
    setState(prev => {
      if (prev.subjects.includes(name)) return prev;
      return { ...prev, subjects: [...prev.subjects, name] };
    });
    apiPost('/subjects', { name }).catch(console.error);
  }, []);

  const deleteSubject = useCallback((name: string) => {
    setState(prev => ({ ...prev, subjects: prev.subjects.filter(s => s !== name) }));
    apiDelete(`/subjects/${encodeURIComponent(name)}`).catch(console.error);
  }, []);

  // ── Fee Types ──
  const addFeeType = useCallback((f: Omit<FeeType, 'id'>) => {
    const nf: FeeType = { ...f, id: genId() };
    setState(prev => ({ ...prev, feeTypes: [...prev.feeTypes, nf] }));
    apiPost('/fee-types', nf).then(row => {
      setState(prev => ({ ...prev, feeTypes: prev.feeTypes.map(x => x.id === nf.id ? mapFeeType(row as any) : x) }));
    }).catch(console.error);
  }, []);

  const updateFeeType = useCallback((id: string, f: Partial<FeeType>) => {
    setState(prev => ({ ...prev, feeTypes: prev.feeTypes.map(x => x.id === id ? { ...x, ...f } : x) }));
    apiPut(`/fee-types/${id}`, f).catch(console.error);
  }, []);

  const deleteFeeType = useCallback((id: string) => {
    setState(prev => ({ ...prev, feeTypes: prev.feeTypes.filter(x => x.id !== id) }));
    apiDelete(`/fee-types/${id}`).catch(console.error);
  }, []);

  // ── Attendance ──
  const addAttendance = useCallback((records: Omit<AttendanceRecord, 'id'>[]) => {
    const nr = records.map(r => ({ ...r, id: genId() }));
    setState(prev => {
      const filtered = prev.attendanceRecords.filter(r => !(r.date === records[0]?.date && r.class === records[0]?.class));
      return { ...prev, attendanceRecords: [...filtered, ...nr] };
    });
    apiPost<any>('/attendance', nr).then(resp => {
      // Update records with server IDs
      if (resp?.records && Array.isArray(resp.records)) {
        setState(prev => {
          const filtered = prev.attendanceRecords.filter(r => !(r.date === records[0]?.date && r.class === records[0]?.class));
          return { ...prev, attendanceRecords: [...filtered, ...resp.records.map(mapAttendance)] };
        });
      }
      // Auto-mark newly inactivated students in local state
      if (resp?.inactivated && Array.isArray(resp.inactivated) && resp.inactivated.length > 0) {
        setState(prev => ({
          ...prev,
          students: prev.students.map(s =>
            resp.inactivated.includes(s.id) ? { ...s, status: 'inactive' as const } : s
          ),
        }));
      }
    }).catch(console.error);
  }, []);

  // ── Exams ──
  const addExam = useCallback((e: Omit<Exam, 'id'>) => {
    const ne: Exam = { ...e, id: genId() };
    setState(prev => ({ ...prev, exams: [...prev.exams, ne] }));
    apiPost('/exams', ne).then(row => {
      setState(prev => ({ ...prev, exams: prev.exams.map(x => x.id === ne.id ? mapExam(row as any) : x) }));
    }).catch(console.error);
  }, []);

  const updateExam = useCallback((id: string, e: Partial<Exam>) => {
    setState(prev => ({ ...prev, exams: prev.exams.map(x => x.id === id ? { ...x, ...e } : x) }));
    apiPut(`/exams/${id}`, e).catch(console.error);
  }, []);

  const deleteExam = useCallback((id: string) => {
    setState(prev => ({ ...prev, exams: prev.exams.filter(x => x.id !== id) }));
    apiDelete(`/exams/${id}`).catch(console.error);
  }, []);

  // ── Mark Submissions ──
  const submitSubjectMarks = useCallback(async (params: {
    examId: string; class: string; subject: string;
    teacherId: string; teacherName: string;
    marks: Array<{ studentId: string; studentName: string; rollNumber: string; mark: number | null }>;
  }) => {
    const res = await fetch(`${getApiBase()}/api/mark-submissions/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `Submit failed: ${res.status}`);
    }
    const submission: MarkSubmission = await res.json();
    setState(prev => {
      const { examId, class: cls, subject, marks } = params;
      const updated = prev.examResults.map(r => {
        if (r.examId !== examId || r.class !== cls) return r;
        const found = marks.find(m => m.studentId === r.studentId);
        if (!found) return r;
        const nextMarks = { ...r.marks };
        if (found.mark === null) delete nextMarks[subject];
        else nextMarks[subject] = found.mark;
        return { ...r, marks: nextMarks };
      });
      const existingStudentIds = new Set(prev.examResults.filter(r => r.examId === examId && r.class === cls).map(r => r.studentId));
      const newRows: ExamResult[] = marks.flatMap(m =>
        !existingStudentIds.has(m.studentId) && m.mark !== null
          ? [{
              id: genId(), examId, studentId: m.studentId, studentName: m.studentName,
              class: cls, rollNumber: m.rollNumber, marks: { [subject]: m.mark },
            }]
          : [],
      );
      const subExists = prev.markSubmissions.some(s => s.examId === examId && s.class === cls && s.subject === subject);
      const newMarkSubs = subExists
        ? prev.markSubmissions.map(s => s.examId === examId && s.class === cls && s.subject === subject ? submission : s)
        : [...prev.markSubmissions, submission];
      return { ...prev, examResults: [...updated, ...newRows], markSubmissions: newMarkSubs };
    });
  }, []);

  const lockSubject = useCallback(async (examId: string, cls: string, subject: string, adminId: string, adminName: string) => {
    const res = await fetch(`${getApiBase()}/api/mark-submissions/lock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ examId, class: cls, subject, adminId, adminName }),
    });
    if (!res.ok) throw new Error(`Lock failed: ${res.status}`);
    const submission: MarkSubmission = await res.json();
    setState(prev => {
      const subExists = prev.markSubmissions.some(s => s.examId === examId && s.class === cls && s.subject === subject);
      const newMarkSubs = subExists
        ? prev.markSubmissions.map(s => s.examId === examId && s.class === cls && s.subject === subject ? submission : s)
        : [...prev.markSubmissions, submission];
      return { ...prev, markSubmissions: newMarkSubs };
    });
  }, []);

  const unlockSubject = useCallback(async (examId: string, cls: string, subject: string, adminId: string, adminName: string) => {
    const res = await fetch(`${getApiBase()}/api/mark-submissions/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ examId, class: cls, subject, adminId, adminName }),
    });
    if (!res.ok) throw new Error(`Unlock failed: ${res.status}`);
    const submission: MarkSubmission = await res.json();
    setState(prev => {
      const subExists = prev.markSubmissions.some(s => s.examId === examId && s.class === cls && s.subject === subject);
      const newMarkSubs = subExists
        ? prev.markSubmissions.map(s => s.examId === examId && s.class === cls && s.subject === subject ? submission : s)
        : [...prev.markSubmissions, submission];
      return { ...prev, markSubmissions: newMarkSubs };
    });
  }, []);

  // ── Exam Results ──
  const saveExamResults = useCallback((results: Omit<ExamResult, 'id'>[]) => {
    const nr = results.map(r => ({ ...r, id: genId() }));
    setState(prev => {
      const examId = nr[0]?.examId;
      const classFilter = nr[0]?.class;
      const filtered = examId
        ? prev.examResults.filter(r => !(r.examId === examId && r.class === classFilter))
        : prev.examResults;
      return { ...prev, examResults: [...filtered, ...nr] };
    });
    apiPost('/exam-results/bulk', nr).catch(console.error);
  }, []);

  // ── Fee Records ──
  const addFeeRecord = useCallback((r: Omit<FeeRecord, 'id'>): FeeRecord => {
    const nr: FeeRecord = { ...r, id: genId(), receiptNumber: r.receiptNumber ?? genReceiptNumber() };
    setState(prev => ({ ...prev, feeRecords: [...prev.feeRecords, nr] }));
    apiPost('/fee-records', nr).then(row => {
      setState(prev => ({ ...prev, feeRecords: prev.feeRecords.map(x => x.id === nr.id ? mapFeeRecord(row as any) : x) }));
    }).catch(console.error);
    return nr;
  }, []);

  const deleteFeeRecord = useCallback((id: string) => {
    setState(prev => ({ ...prev, feeRecords: prev.feeRecords.filter(x => x.id !== id) }));
    apiDelete(`/fee-records/${id}`).catch(console.error);
  }, []);

  // ── Expenses ──
  const addExpense = useCallback((e: Omit<Expense, 'id'>) => {
    const ne: Expense = { ...e, id: genId() };
    setState(prev => ({ ...prev, expenses: [...prev.expenses, ne] }));
    apiPost('/expenses', ne).then(row => {
      setState(prev => ({ ...prev, expenses: prev.expenses.map(x => x.id === ne.id ? mapExpense(row as any) : x) }));
    }).catch(console.error);
  }, []);

  const deleteExpense = useCallback((id: string) => {
    setState(prev => ({ ...prev, expenses: prev.expenses.filter(x => x.id !== id) }));
    apiDelete(`/expenses/${id}`).catch(console.error);
  }, []);

  // ── Salary Records ──
  const updateSalaryStatus = useCallback((teacherId: string, month: string, year: number, status: 'paid' | 'pending'): SalaryRecord => {
    let updated: SalaryRecord | undefined;
    setState(prev => {
      const existing = prev.salaryRecords.find(r => r.teacherId === teacherId && r.month === month && r.year === year);
      if (existing) {
        updated = { ...existing, status, paidDate: status === 'paid' ? todayStr : undefined };
        const records = prev.salaryRecords.map(r => r.id === existing.id ? updated! : r);
        apiPut(`/salary-records/${existing.id}`, updated).catch(console.error);
        return { ...prev, salaryRecords: records };
      } else {
        const teacher = prev.teachers.find(t => t.id === teacherId);
        updated = { id: genId(), teacherId, teacherName: teacher?.name ?? '', month, year, amount: teacher?.salary ?? 0, status, paidDate: status === 'paid' ? todayStr : undefined, receiptNumber: genReceiptNumber('SAL') };
        apiPost('/salary-records', updated).catch(console.error);
        return { ...prev, salaryRecords: [...prev.salaryRecords, updated!] };
      }
    });
    return updated!;
  }, []);

  const addSalaryRecord = useCallback((r: Omit<SalaryRecord, 'id'>): SalaryRecord => {
    const nr: SalaryRecord = { ...r, id: genId(), receiptNumber: r.receiptNumber ?? genReceiptNumber('SAL') };
    setState(prev => ({ ...prev, salaryRecords: [...prev.salaryRecords, nr] }));
    apiPost('/salary-records', nr).catch(console.error);
    return nr;
  }, []);

  const deleteSalaryRecord = useCallback((id: string) => {
    setState(prev => ({ ...prev, salaryRecords: prev.salaryRecords.filter(x => x.id !== id) }));
    apiDelete(`/salary-records/${id}`).catch(console.error);
  }, []);

  // ── Promotions ──
  const promoteStudent = useCallback((studentId: string, toClass: string, promotedBy: string) => {
    const promotionId = genId();
    setState(prev => {
      const student = prev.students.find(s => s.id === studentId);
      if (!student) return prev;
      const record: PromotionRecord = { id: promotionId, studentId, studentName: student.name, fromClass: student.class, toClass, promotedBy, promotedAt: todayStr };
      apiPost('/promotions/student', { studentId, studentName: student.name, fromClass: student.class, toClass, promotedBy, promotedAt: todayStr, promotionId }).catch(console.error);
      return {
        ...prev,
        students: prev.students.map(s => s.id === studentId ? { ...s, class: toClass } : s),
        promotionRecords: [...prev.promotionRecords, record],
      };
    });
  }, []);

  const bulkPromoteClass = useCallback((fromClass: string, toClass: string, promotedBy: string): number => {
    let count = 0;
    setState(prev => {
      const toPromote = prev.students.filter(s => s.class === fromClass && isActiveStudent(s));
      count = toPromote.length;
      if (count === 0) return prev;
      const records: PromotionRecord[] = toPromote.map(s => ({ id: genId(), studentId: s.id, studentName: s.name, fromClass, toClass, promotedBy, promotedAt: todayStr }));
      apiPost('/promotions/bulk', { fromClass, toClass, promotedBy, promotedAt: todayStr, records }).catch(console.error);
      return {
        ...prev,
        students: prev.students.map(s => s.class === fromClass && isActiveStudent(s) ? { ...s, class: toClass } : s),
        promotionRecords: [...prev.promotionRecords, ...records],
      };
    });
    return count;
  }, []);

  // ── Manual student status toggle ──
  const setStudentStatus = useCallback(async (id: string, status: 'active' | 'inactive' | 'graduated'): Promise<void> => {
    setState(prev => ({
      ...prev,
      students: prev.students.map(s => s.id === id ? { ...s, status } : s),
    }));
    const res = await fetch(`${getApiBase()}/api/students/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      // Rollback optimistic update on failure
      const row = await res.json().catch(() => ({}));
      setState(prev => ({
        ...prev,
        students: prev.students.map(s => s.id === id ? { ...s, status: status === 'active' ? 'inactive' : 'active' } : s),
      }));
      throw new Error(row?.error ?? `Failed to update student status`);
    }
  }, []);

  // ── Inactivation Requests ──
  const submitInactivationRequest = useCallback(async (data: {
    studentId: string; studentName: string; studentClass: string;
    teacherId: string; teacherName: string; reason: string;
    documentBase64?: string; documentName?: string; documentMimeType?: string;
  }): Promise<InactivationRequest> => {
    const row = await apiPost<any>('/inactivation-requests', data);
    const req = mapInactivationRequest(row);
    setState(prev => ({ ...prev, inactivationRequests: [req, ...prev.inactivationRequests] }));
    return req;
  }, []);

  const approveInactivationRequest = useCallback(async (id: string, adminNote?: string): Promise<void> => {
    const row = await apiPut<any>(`/inactivation-requests/${id}/approve`, { adminNote });
    const req = mapInactivationRequest(row);
    setState(prev => ({
      ...prev,
      inactivationRequests: prev.inactivationRequests.map(r => r.id === id ? req : r),
      // Reactivate student in local state
      students: prev.students.map(s => s.id === req.studentId ? { ...s, status: 'active' as const } : s),
    }));
  }, []);

  const rejectInactivationRequest = useCallback(async (id: string, adminNote?: string): Promise<void> => {
    const row = await apiPut<any>(`/inactivation-requests/${id}/reject`, { adminNote });
    const req = mapInactivationRequest(row);
    setState(prev => ({
      ...prev,
      inactivationRequests: prev.inactivationRequests.map(r => r.id === id ? req : r),
    }));
  }, []);

  const deleteInactivationRequestDocument = useCallback(async (id: string): Promise<void> => {
    await apiDelete<any>(`/inactivation-requests/${id}/document`);
    setState(prev => ({
      ...prev,
      inactivationRequests: prev.inactivationRequests.map(r => r.id === id
        ? { ...r, documentBase64: undefined, documentName: undefined, documentMimeType: undefined }
        : r),
    }));
  }, []);

  const deleteInactivationRequest = useCallback(async (id: string): Promise<void> => {
    const result = await apiDelete<{ deleted?: boolean; id?: string }>(`/inactivation-requests/${id}`);
    if (!result?.deleted || result.id !== id) {
      throw new Error('The request was not confirmed as deleted from the database.');
    }

    // Reload the canonical database list before updating the UI so a stale
    // in-memory or cached request cannot reappear after closing the modal.
    const rows = await apiGet<any[]>(`/inactivation-requests?refresh=${Date.now()}`, { cache: 'no-store' });
    if (rows.some(row => row.id === id)) {
      throw new Error('The request still exists in the database. It was not deleted.');
    }
    setState(prev => ({ ...prev, inactivationRequests: rows.map(mapInactivationRequest) }));
  }, []);

  const refreshInactivationRequests = useCallback(async (): Promise<void> => {
    const rows = await apiGet<any[]>(`/inactivation-requests?refresh=${Date.now()}`, { cache: 'no-store' });
    setState(prev => ({ ...prev, inactivationRequests: rows.map(mapInactivationRequest) }));
  }, []);

  const setClassAbsentLimit = useCallback(async (className: string, maxDays: number): Promise<void> => {
    const limits = await apiPut<Record<string, number>>('/settings/class-absent-limits', {
      className, maxDays, adminId: 'admin',
    });
    setState(prev => ({ ...prev, classAbsentLimits: limits }));
  }, []);

  const updateDocumentBranding = useCallback(async (branding: DocumentBranding): Promise<void> => {
    const saved = await apiPut<DocumentBranding>('/settings/document-branding', {
      ...branding,
      adminId: 'admin',
    });
    setState(prev => ({ ...prev, documentBranding: saved }));
  }, []);

  // ── Alumni ──
  const addAlumni = useCallback((a: Omit<Alumni, 'id'>) => {
    const na: Alumni = { ...a, id: genId() };
    setState(prev => ({ ...prev, alumni: [...prev.alumni, na] }));
    apiPost('/alumni', na).then(row => {
      setState(prev => ({ ...prev, alumni: prev.alumni.map(x => x.id === na.id ? row as Alumni : x) }));
    }).catch(console.error);
  }, []);

  const updateAlumni = useCallback((id: string, a: Partial<Alumni>) => {
    setState(prev => ({ ...prev, alumni: prev.alumni.map(x => x.id === id ? { ...x, ...a } : x) }));
    apiPut(`/alumni/${id}`, a).catch(console.error);
  }, []);

  const deleteAlumni = useCallback((id: string) => {
    setState(prev => ({ ...prev, alumni: prev.alumni.filter(x => x.id !== id) }));
    apiDelete(`/alumni/${id}`).catch(console.error);
  }, []);

  const bulkAddAlumni = useCallback(async (records: Omit<Alumni, 'id' | 'batch'>[], batch: string): Promise<void> => {
    const withIds: Alumni[] = records.map(r => ({ ...r, id: genId(), batch }));
    // Optimistic update — show immediately in UI
    setState(prev => ({ ...prev, alumni: [...prev.alumni, ...withIds] }));
    try {
      // Strip photos before sending — base64 images can exceed the 10 MB API limit
      // for a whole-class import.  Photos can be added individually after import.
      const payload = withIds.map(r => ({ ...r, photo: undefined }));
      await apiPost<any[]>('/alumni/bulk', { records: payload });
      // Reload the canonical list so duplicate updates and server-generated IDs
      // are reflected immediately after an import.
      const [refreshed, refreshedStudents] = await Promise.all([
        apiGet<Alumni[]>('/alumni'),
        apiGet<any[]>('/students?includeGraduated=true'),
      ]);
      setState(prev => ({
        ...prev,
        alumni: refreshed,
        students: refreshedStudents.map(mapStudent),
      }));
    } catch (e) {
      // Roll back the optimistic update so the UI stays in sync with the DB
      setState(prev => ({
        ...prev,
        alumni: prev.alumni.filter(x => !withIds.some(w => w.id === x.id)),
      }));
      throw e; // re-throw so handleBulkImport can show "Import Failed"
    }
  }, []);

  return (
    <AppContext.Provider value={{
      ...state,
      addStudent, updateStudent, deleteStudent,
      addTeacher, updateTeacher, refreshTeachers, deleteTeacher,
      addClass, updateClass, deleteClass,
      addSection, updateSection, deleteSection,
      addSubject, deleteSubject,
      addFeeType, updateFeeType, deleteFeeType,
      addAttendance,
      addExam, updateExam, deleteExam, saveExamResults,
      submitSubjectMarks, lockSubject, unlockSubject,
      addFeeRecord, deleteFeeRecord,
      addExpense, deleteExpense,
      updateSalaryStatus, addSalaryRecord, deleteSalaryRecord,
      promoteStudent, bulkPromoteClass,
      submitInactivationRequest, approveInactivationRequest, rejectInactivationRequest,
      deleteInactivationRequestDocument, deleteInactivationRequest,
      refreshInactivationRequests, setStudentStatus, setClassAbsentLimit, updateDocumentBranding,
      addAlumni, updateAlumni, deleteAlumni, bulkAddAlumni,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
