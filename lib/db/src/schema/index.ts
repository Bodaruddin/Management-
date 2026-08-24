import { pgTable, text, serial, integer, jsonb, timestamp, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const classesTable = pgTable("classes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sectionsTable = pgTable("sections", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const studentsTable = pgTable("students", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  fatherName: text("father_name").notNull().default(""),
  motherName: text("mother_name").notNull().default(""),
  mobileNumber: text("mobile_number").notNull().default(""),
  class: text("class").notNull(),
  section: text("section"),
  admissionNo: text("admission_no"),
  rollNumber: text("roll_number").notNull(),
  dateOfBirth: text("date_of_birth").notNull().default(""),
  address: text("address"),
  photo: text("photo"),
  annualFee: integer("annual_fee"),
  discountType: text("discount_type"),
  discountValue: integer("discount_value"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const teachersTable = pgTable("teachers", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  subject: text("subject").notNull().default(""),
  mobileNumber: text("mobile_number").notNull().default(""),
  salary: integer("salary").notNull().default(0),
  username: text("username").notNull().unique(),
  password: text("password").notNull().default(""),
  joinDate: text("join_date").notNull().default(""),
  photo: text("photo"),
  permissions: jsonb("permissions").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const appSettingsTable = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const subjectsTable = pgTable("subjects", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const attendanceRecordsTable = pgTable("attendance_records", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: text("student_id").notNull(),
  studentName: text("student_name").notNull(),
  class: text("class").notNull(),
  date: text("date").notNull(),
  status: text("status").notNull(),
  takenBy: text("taken_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const inactivationRequestsTable = pgTable("inactivation_requests", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: text("student_id").notNull(),
  studentName: text("student_name").notNull().default(""),
  studentClass: text("student_class").notNull().default(""),
  teacherId: text("teacher_id").notNull(),
  teacherName: text("teacher_name").notNull().default(""),
  reason: text("reason").notNull(),
  documentBase64: text("document_base64"),
  documentName: text("document_name"),
  documentMimeType: text("document_mime_type"),
  status: text("status").notNull().default("pending"),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

export const examsTable = pgTable("exams", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  class: text("class").notNull(),
  subjects: jsonb("subjects").notNull().default([]),
  subjectSchedule: jsonb("subject_schedule"),
  date: text("date").notNull().default(""),
  maxMarks: integer("max_marks").notNull().default(100),
  classSubjects: jsonb("class_subjects"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const examResultsTable = pgTable("exam_results", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  examId: text("exam_id").notNull(),
  studentId: text("student_id").notNull(),
  studentName: text("student_name").notNull(),
  class: text("class").notNull(),
  rollNumber: text("roll_number").notNull(),
  marks: jsonb("marks").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [unique().on(t.examId, t.studentId)]);

export const feeTypesTable = pgTable("fee_types", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  amount: integer("amount").notNull().default(0),
  description: text("description").notNull().default(""),
  category: text("category"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const feeRecordsTable = pgTable("fee_records", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: text("student_id").notNull(),
  studentName: text("student_name").notNull().default(""),
  class: text("class").notNull().default(""),
  amount: integer("amount").notNull(),
  date: text("date").notNull().default(""),
  description: text("description").notNull().default(""),
  feeTypeId: text("fee_type_id"),
  feeTypeName: text("fee_type_name"),
  collectedBy: text("collected_by").notNull().default(""),
  receiptNumber: text("receipt_number"),
  paymentMethod: text("payment_method"),
  feeCategory: text("fee_category"),
  discountApplied: integer("discount_applied"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const salaryRecordsTable = pgTable("salary_records", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  teacherId: text("teacher_id").notNull(),
  teacherName: text("teacher_name").notNull().default(""),
  month: text("month").notNull(),
  year: integer("year").notNull(),
  amount: integer("amount").notNull().default(0),
  status: text("status").notNull().default("pending"),
  paidDate: text("paid_date"),
  receiptNumber: text("receipt_number"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const expensesTable = pgTable("expenses", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  description: text("description").notNull(),
  amount: integer("amount").notNull(),
  date: text("date").notNull().default(""),
  category: text("category").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const promotionRecordsTable = pgTable("promotion_records", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: text("student_id").notNull(),
  studentName: text("student_name").notNull().default(""),
  fromClass: text("from_class").notNull(),
  toClass: text("to_class").notNull(),
  promotedBy: text("promoted_by").notNull().default(""),
  promotedAt: text("promoted_at").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const markSubmissionsTable = pgTable("mark_submissions", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  examId: text("exam_id").notNull(),
  class: text("class").notNull(),
  subject: text("subject").notNull(),
  status: text("status").notNull().default("draft"),
  teacherId: text("teacher_id"),
  teacherName: text("teacher_name"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  lockedBy: text("locked_by"),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [unique().on(t.examId, t.class, t.subject)]);

export const markAuditLogTable = pgTable("mark_audit_log", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  examId: text("exam_id").notNull(),
  class: text("class").notNull(),
  subject: text("subject").notNull(),
  action: text("action").notNull(),
  actorId: text("actor_id").notNull(),
  actorName: text("actor_name").notNull(),
  actorRole: text("actor_role").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const alumniTable = pgTable("alumni", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: text("student_id").notNull(),
  studentName: text("student_name").notNull(),
  class: text("class").notNull(),
  section: text("section"),
  graduationYear: text("graduation_year").notNull(),
  name: text("name").notNull(),
  fatherName: text("father_name").notNull().default(""),
  mobileNumber: text("mobile_number").notNull().default(""),
  batch: text("batch").notNull(),
  passOutClass: text("pass_out_class").notNull(),
  rollNumber: text("roll_number").notNull().default(""),
  admissionNo: text("admission_no"),
  dateOfBirth: text("date_of_birth").notNull().default(""),
  address: text("address"),
  photo: text("photo"),
  achievements: text("achievements"),
  currentStatus: text("current_status"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
