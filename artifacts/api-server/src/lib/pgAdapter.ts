/**
 * PostgreSQL DataAdapter — wraps Drizzle ORM queries.
 */
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, asc, and, desc, inArray, sql as drizzleSql } from "drizzle-orm";
import * as schema from "@workspace/db";
import type { DataAdapter } from "./adapter.js";

type DB = NodePgDatabase<typeof schema>;

const {
  classesTable,
  sectionsTable,
  studentsTable,
  teachersTable,
  subjectsTable,
  attendanceRecordsTable,
  inactivationRequestsTable,
  examsTable,
  examResultsTable,
  feeTypesTable,
  feeRecordsTable,
  salaryRecordsTable,
  expensesTable,
  promotionRecordsTable,
  appSettingsTable,
  markSubmissionsTable,
  markAuditLogTable,
  alumniTable,
} = schema;

export function createPgAdapter(db: DB): DataAdapter {
  return {
    // ── Classes ───────────────────────────────────────────────────────────────
    classes: {
      async list() {
        const rows = await db.select({ name: classesTable.name }).from(classesTable).orderBy(asc(classesTable.name));
        return rows.map((r) => r.name);
      },
      async create(name: string) {
        const [cls] = await db.insert(classesTable).values({ name }).returning({ name: classesTable.name });
        return cls;
      },
      async rename(oldName, newName) {
        const [updated] = await db
          .update(classesTable)
          .set({ name: newName })
          .where(eq(classesTable.name, oldName))
          .returning({ name: classesTable.name });
        return updated ?? null;
      },
      async delete(name) {
        const deleted = await db.delete(classesTable).where(eq(classesTable.name, name)).returning({ name: classesTable.name });
        return deleted.length > 0;
      },
    },

    // ── Sections ──────────────────────────────────────────────────────────────
    sections: {
      async list() {
        const [rows, assignedRows] = await Promise.all([
          db.select({ name: sectionsTable.name }).from(sectionsTable),
          db.select({ name: studentsTable.section }).from(studentsTable),
        ]);
        return Array.from(new Set([
          ...rows.map((r) => r.name),
          ...assignedRows.map((r) => r.name).filter((name): name is string => Boolean(name?.trim())),
        ])).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
      },
      async create(name: string) {
        const [sec] = await db.insert(sectionsTable).values({ name }).returning({ name: sectionsTable.name });
        return sec;
      },
      async rename(oldName, newName) {
        return db.transaction(async (tx) => {
          const [updated] = await tx
            .update(sectionsTable)
            .set({ name: newName })
            .where(eq(sectionsTable.name, oldName))
            .returning({ name: sectionsTable.name });
          const reassigned = await tx
            .update(studentsTable)
            .set({ section: newName })
            .where(eq(studentsTable.section, oldName))
            .returning({ id: studentsTable.id });
          if (updated) {
            return updated;
          }
          if (reassigned.length === 0) {
            return null;
          }
          const [created] = await tx.insert(sectionsTable).values({ name: newName }).returning({ name: sectionsTable.name });
          return created;
        });
      },
      async delete(name) {
        return db.transaction(async (tx) => {
          const deleted = await tx.delete(sectionsTable).where(eq(sectionsTable.name, name)).returning({ name: sectionsTable.name });
          const cleared = await tx
            .update(studentsTable)
            .set({ section: null })
            .where(eq(studentsTable.section, name))
            .returning({ id: studentsTable.id });
          return deleted.length > 0 || cleared.length > 0;
        });
      },
    },

    // ── Students ──────────────────────────────────────────────────────────────
    students: {
      async list(includeGraduated = false) {
        const query = db.select().from(studentsTable).orderBy(asc(studentsTable.createdAt));
        if (includeGraduated) return query;
        return query.where(drizzleSql`COALESCE(${studentsTable.status}, 'active') <> 'graduated'`);
      },
      async create(data: any) {
        const values: any = {
          name: data.name, fatherName: data.fatherName ?? "", motherName: data.motherName ?? "",
          mobileNumber: data.mobileNumber ?? "", class: data.class, section: data.section ?? null,
          admissionNo: data.admissionNo ?? null, rollNumber: data.rollNumber,
          dateOfBirth: data.dateOfBirth ?? "", address: data.address ?? null, photo: data.photo ?? null,
          gender: data.gender ?? null, caste: data.caste ?? null,
          annualFee: data.annualFee ?? null, discountType: data.discountType ?? null,
          discountValue: data.discountValue ?? null,
          status: data.status ?? "active",
        };
        if (data.id) values.id = data.id;
        const [row] = await db.insert(studentsTable).values(values).returning();
        return row;
      },
      async update(id, data: any) {
        // Build setValues from only the fields that are explicitly provided so
        // a partial update (e.g. only { class }) never nulls out other columns.
        const setValues: any = {};
        if (data.name !== undefined) setValues.name = data.name;
        if (data.fatherName !== undefined) setValues.fatherName = data.fatherName;
        if (data.motherName !== undefined) setValues.motherName = data.motherName;
        if (data.mobileNumber !== undefined) setValues.mobileNumber = data.mobileNumber;
        if (data.class !== undefined) setValues.class = data.class;
        if ("section" in data) setValues.section = data.section ?? null;
        if ("admissionNo" in data) setValues.admissionNo = data.admissionNo ?? null;
        if (data.rollNumber !== undefined) setValues.rollNumber = data.rollNumber;
        if (data.dateOfBirth !== undefined) setValues.dateOfBirth = data.dateOfBirth;
        if ("address" in data) setValues.address = data.address ?? null;
        if ("photo" in data) setValues.photo = data.photo ?? null;
        if ("gender" in data) setValues.gender = data.gender ?? null;
        if ("caste" in data) setValues.caste = data.caste ?? null;
        if ("annualFee" in data) setValues.annualFee = data.annualFee ?? null;
        if ("discountType" in data) setValues.discountType = data.discountType ?? null;
        if ("discountValue" in data) setValues.discountValue = data.discountValue ?? null;
        if (data.status !== undefined) setValues.status = data.status;
        if (Object.keys(setValues).length === 0) return null;
        const [row] = await db.update(studentsTable).set(setValues).where(eq(studentsTable.id, id)).returning();
        return row ?? null;
      },
      async delete(id) {
        await db.delete(studentsTable).where(eq(studentsTable.id, id));
      },
      async setStatus(id, status) {
        const [row] = await db
          .update(studentsTable)
          .set({ status })
          .where(eq(studentsTable.id, id))
          .returning();
        return row ?? null;
      },
    },

    // ── Teachers ──────────────────────────────────────────────────────────────
    teachers: {
      async list() {
        return db.select().from(teachersTable).orderBy(asc(teachersTable.createdAt));
      },
      async create(data: any) {
        const values: any = {
          name: data.name, subject: data.subject ?? "", mobileNumber: data.mobileNumber ?? "",
          salary: data.salary ?? 0, username: data.username, password: data.password ?? "",
          joinDate: data.joinDate ?? "", photo: data.photo ?? null,
          permissions: data.permissions ?? {
            addStudent: false, feeCollection: false, manageClasses: false,
            manageExams: false, manageResults: false, promoteStudents: false, sendFeeReminder: false,
            allowMarkEdit: false,
          },
        };
        if (data.id) values.id = data.id;
        const [row] = await db.insert(teachersTable).values(values).returning();
        return row;
      },
      async update(id, data: any) {
        // Only update fields that are explicitly provided — a partial update
        // (e.g. only permissions) must not overwrite unrelated columns with null.
        const setValues: any = {};
        if (data.name !== undefined) setValues.name = data.name;
        if (data.subject !== undefined) setValues.subject = data.subject;
        if (data.mobileNumber !== undefined) setValues.mobileNumber = data.mobileNumber;
        if (data.salary !== undefined) setValues.salary = data.salary;
        if (data.username !== undefined) setValues.username = data.username;
        if (data.password !== undefined) setValues.password = data.password;
        if (data.joinDate !== undefined) setValues.joinDate = data.joinDate;
        if ("photo" in data) setValues.photo = data.photo ?? null;
        if (data.permissions !== undefined) setValues.permissions = data.permissions;
        if (Object.keys(setValues).length === 0) return null;
        const [row] = await db.update(teachersTable).set(setValues).where(eq(teachersTable.id, id)).returning();
        return row ?? null;
      },
      async delete(id) {
        await db.delete(teachersTable).where(eq(teachersTable.id, id));
      },
    },

    // ── App Settings ───────────────────────────────────────────────────────────
    appSettings: {
      async get(key) {
        const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key)).limit(1);
        return row ?? null;
      },
      async set(key, value) {
        const [row] = await db
          .insert(appSettingsTable)
          .values({ key, value })
          .onConflictDoUpdate({
            target: appSettingsTable.key,
            set: { value: drizzleSql`excluded.value`, updatedAt: new Date() },
          })
          .returning();
        return row;
      },
    },

    // ── Subjects ──────────────────────────────────────────────────────────────
    subjects: {
      async list() {
        const rows = await db.select({ name: subjectsTable.name }).from(subjectsTable).orderBy(asc(subjectsTable.name));
        return rows.map((r) => r.name);
      },
      async create(name, id) {
        const values: any = { name: String(name).trim() };
        if (id) values.id = id;
        const [row] = await db.insert(subjectsTable).values(values).returning({ name: subjectsTable.name });
        return row;
      },
      async delete(name) {
        await db.delete(subjectsTable).where(eq(subjectsTable.name, name));
      },
    },

    // ── Attendance ────────────────────────────────────────────────────────────
    attendance: {
      async list() {
        return db.select().from(attendanceRecordsTable).orderBy(asc(attendanceRecordsTable.date));
      },
      async bulkUpsert(date, cls, records) {
        // Wrapped in a transaction so a crash between delete and insert
        // cannot leave attendance for this date/class partially wiped.
        return db.transaction(async (tx) => {
          await tx.delete(attendanceRecordsTable).where(
            and(eq(attendanceRecordsTable.date, date), eq(attendanceRecordsTable.class, cls)),
          );
          const values = records.map((r: any) => ({
            ...(r.id ? { id: r.id } : {}),
            studentId: r.studentId, studentName: r.studentName, class: r.class,
            date: r.date, status: r.status, takenBy: r.takenBy,
          }));
          return tx.insert(attendanceRecordsTable).values(values).returning();
        });
      },
      async checkAndMarkInactive(date, cls, absentStudentIds) {
        if (!absentStudentIds.length) return [];

        // Get class absent limits from settings
        const settingRow = await db
          .select()
          .from(appSettingsTable)
          .where(eq(appSettingsTable.key, "class_absent_limits"))
          .limit(1);
        const limits: Record<string, number> = (settingRow[0]?.value as any) ?? {};
        const limit = limits[cls];
        if (!limit || limit <= 0) return [];

        const inactivated: string[] = [];

        for (const studentId of absentStudentIds) {
          // Get all attendance for this student ordered by date desc
          const records = await db
            .select({ date: attendanceRecordsTable.date, status: attendanceRecordsTable.status })
            .from(attendanceRecordsTable)
            .where(eq(attendanceRecordsTable.studentId, studentId))
            .orderBy(desc(attendanceRecordsTable.date));

          // Count consecutive absents from the most recent record
          let consecutiveAbsents = 0;
          for (const record of records) {
            if (record.status === "absent") {
              consecutiveAbsents++;
            } else {
              break; // present or holiday breaks the streak
            }
          }

          if (consecutiveAbsents >= limit) {
            // Mark student inactive only if currently active
            const [updated] = await db
              .update(studentsTable)
              .set({ status: "inactive" })
              .where(and(eq(studentsTable.id, studentId), eq(studentsTable.status, "active")))
              .returning({ id: studentsTable.id });
            if (updated) {
              // Keep the transition date in attendance history so reports can
              // show inactive days and include them in the denominator.
              await db
                .delete(attendanceRecordsTable)
                .where(and(
                  eq(attendanceRecordsTable.studentId, studentId),
                  eq(attendanceRecordsTable.date, date),
                ));
              const student = await db
                .select({ studentName: studentsTable.name })
                .from(studentsTable)
                .where(eq(studentsTable.id, studentId))
                .limit(1);
              await db.insert(attendanceRecordsTable).values({
                studentId,
                studentName: student[0]?.studentName ?? "",
                class: cls,
                date,
                status: "inactive",
                takenBy: "System",
              });
              inactivated.push(studentId);
            }
          }
        }

        return inactivated;
      },
    },

    // ── Inactivation Requests ─────────────────────────────────────────────────
    inactivationRequests: {
      async list() {
        return db
          .select()
          .from(inactivationRequestsTable)
          .orderBy(desc(inactivationRequestsTable.createdAt));
      },
      async listByStudent(studentId) {
        return db
          .select()
          .from(inactivationRequestsTable)
          .where(eq(inactivationRequestsTable.studentId, studentId))
          .orderBy(desc(inactivationRequestsTable.createdAt));
      },
      async create(data: any) {
        const values: any = {
          studentId: data.studentId,
          studentName: data.studentName ?? "",
          studentClass: data.studentClass ?? "",
          teacherId: data.teacherId,
          teacherName: data.teacherName ?? "",
          reason: data.reason,
          documentBase64: data.documentBase64 ?? null,
          documentName: data.documentName ?? null,
          documentMimeType: data.documentMimeType ?? null,
          status: "pending",
        };
        if (data.id) values.id = data.id;
        const [row] = await db.insert(inactivationRequestsTable).values(values).returning();
        return row;
      },
      async updateStatus(id, status, adminNote) {
        const [row] = await db
          .update(inactivationRequestsTable)
          .set({
            status,
            adminNote: adminNote ?? null,
            reviewedAt: new Date(),
          })
          .where(eq(inactivationRequestsTable.id, id))
          .returning();
        if (!row) return null;

        // If approved, reactivate the student
        if (status === "approved") {
          await db
            .update(studentsTable)
            .set({ status: "active" })
            .where(eq(studentsTable.id, row.studentId));
        }

        return row;
      },
      async clearDocument(id) {
        const [row] = await db
          .update(inactivationRequestsTable)
          .set({
            documentBase64: null,
            documentName: null,
            documentMimeType: null,
          })
          .where(eq(inactivationRequestsTable.id, id))
          .returning();
        return row ?? null;
      },
      async delete(id) {
        const deleted = await db
          .delete(inactivationRequestsTable)
          .where(eq(inactivationRequestsTable.id, id))
          .returning({ id: inactivationRequestsTable.id });
        return deleted.length > 0;
      },
    },

    // ── Exams ─────────────────────────────────────────────────────────────────
    exams: {
      async list() {
        return db.select().from(examsTable).orderBy(asc(examsTable.date));
      },
      async create(data: any) {
        const values: any = {
          name: data.name, class: data.class, subjects: data.subjects ?? [],
          subjectSchedule: data.subjectSchedule ?? null,
          classSubjects: data.classSubjects ?? null,
          date: data.date ?? "", maxMarks: data.maxMarks ?? 100,
        };
        if (data.id) values.id = data.id;
        const [row] = await db.insert(examsTable).values(values).returning();
        return row;
      },
      async update(id, data: any) {
        // Only update fields that are explicitly provided.
        const setValues: any = {};
        if (data.name !== undefined) setValues.name = data.name;
        if (data.class !== undefined) setValues.class = data.class;
        if (data.subjects !== undefined) setValues.subjects = data.subjects;
        if ("subjectSchedule" in data) setValues.subjectSchedule = data.subjectSchedule ?? null;
        if ("classSubjects" in data) setValues.classSubjects = data.classSubjects ?? null;
        if (data.date !== undefined) setValues.date = data.date;
        if (data.maxMarks !== undefined) setValues.maxMarks = data.maxMarks;
        if (Object.keys(setValues).length === 0) return null;
        const [row] = await db.update(examsTable).set(setValues).where(eq(examsTable.id, id)).returning();
        return row ?? null;
      },
      async delete(id) {
        await db.delete(examsTable).where(eq(examsTable.id, id));
      },
    },

    // ── Exam Results ──────────────────────────────────────────────────────────
    examResults: {
      async list() {
        return db.select().from(examResultsTable).orderBy(asc(examResultsTable.createdAt));
      },
      async create(data: any) {
        const values: any = {
          examId: data.examId, studentId: data.studentId, studentName: data.studentName,
          class: data.class, rollNumber: data.rollNumber, marks: data.marks,
        };
        if (data.id) values.id = data.id;
        const [row] = await db.insert(examResultsTable).values(values).returning();
        return row;
      },
      async bulkUpsert(results) {
        const values = results.map((r: any) => ({
          ...(r.id ? { id: r.id } : {}),
          examId: r.examId, studentId: r.studentId, studentName: r.studentName,
          class: r.class, rollNumber: r.rollNumber, marks: r.marks,
        }));
        return db
          .insert(examResultsTable)
          .values(values)
          .onConflictDoUpdate({
            target: [examResultsTable.examId, examResultsTable.studentId],
            set: {
              // Use excluded.* so the incoming values actually replace the stored ones.
              // Previously this referenced the table columns directly, making every
              // conflict update a no-op that left old marks in place.
              marks: drizzleSql`excluded.marks`,
              studentName: drizzleSql`excluded.student_name`,
              rollNumber: drizzleSql`excluded.roll_number`,
            },
          })
          .returning();
      },
      /** Replace one subject's marks without touching other subjects. */
      async replaceSubjectMarks(examId, cls, subject, rows) {
        const existing = await db
          .select({
            id: examResultsTable.id,
            studentId: examResultsTable.studentId,
            marks: examResultsTable.marks,
          })
          .from(examResultsTable)
          .where(and(eq(examResultsTable.examId, examId), eq(examResultsTable.class, cls)));
        const byStudentId = new Map(rows.map((row) => [row.studentId, row]));

        for (const result of existing) {
          const nextMarks = { ...((result.marks ?? {}) as Record<string, unknown>) };
          delete nextMarks[subject];
          const replacement = byStudentId.get(result.studentId);
          if (replacement) nextMarks[subject] = replacement.mark;
          await db
            .update(examResultsTable)
            .set({ marks: nextMarks })
            .where(eq(examResultsTable.id, result.id));
          byStudentId.delete(result.studentId);
        }

        for (const row of byStudentId.values()) {
          await db.insert(examResultsTable).values({
            examId,
            studentId: row.studentId,
            studentName: row.studentName,
            class: cls,
            rollNumber: row.rollNumber,
            marks: { [subject]: row.mark },
          });
        }
      },
    },

    // ── Mark Submissions ──────────────────────────────────────────────────────
    markSubmissions: {
      async list() {
        return db.select().from(markSubmissionsTable).orderBy(asc(markSubmissionsTable.createdAt));
      },
      async get(examId, cls, subject) {
        const [row] = await db
          .select()
          .from(markSubmissionsTable)
          .where(and(
            eq(markSubmissionsTable.examId, examId),
            eq(markSubmissionsTable.class, cls),
            eq(markSubmissionsTable.subject, subject),
          ))
          .limit(1);
        return row ?? null;
      },
      async upsert(data) {
        const values: any = {
          examId: data.examId,
          class: data.class,
          subject: data.subject,
          status: data.status,
          teacherId: data.teacherId ?? null,
          teacherName: data.teacherName ?? null,
          submittedAt: data.submittedAt ?? null,
          lockedBy: data.lockedBy ?? null,
          lockedAt: data.lockedAt ?? null,
        };
        const [row] = await db
          .insert(markSubmissionsTable)
          .values(values)
          .onConflictDoUpdate({
            target: [markSubmissionsTable.examId, markSubmissionsTable.class, markSubmissionsTable.subject],
            set: {
              status: drizzleSql`excluded.status`,
              teacherId: drizzleSql`excluded.teacher_id`,
              teacherName: drizzleSql`excluded.teacher_name`,
              submittedAt: drizzleSql`excluded.submitted_at`,
              lockedBy: drizzleSql`excluded.locked_by`,
              lockedAt: drizzleSql`excluded.locked_at`,
            },
          })
          .returning();
        return row;
      },
    },

    // ── Mark Audit Log ────────────────────────────────────────────────────────
    markAuditLog: {
      async list() {
        return db.select().from(markAuditLogTable).orderBy(asc(markAuditLogTable.createdAt));
      },
      async create(data) {
        const [row] = await db.insert(markAuditLogTable).values({
          examId: data.examId,
          class: data.class,
          subject: data.subject,
          action: data.action,
          actorId: data.actorId,
          actorName: data.actorName,
          actorRole: data.actorRole,
          notes: data.notes ?? null,
        }).returning();
        return row;
      },
    },

    // ── Fee Types ─────────────────────────────────────────────────────────────
    feeTypes: {
      async list() {
        return db.select().from(feeTypesTable).orderBy(asc(feeTypesTable.createdAt));
      },
      async create(data: any) {
        const values: any = {
          name: data.name, amount: data.amount ?? 0, description: data.description ?? "", category: data.category ?? null,
        };
        if (data.id) values.id = data.id;
        const [row] = await db.insert(feeTypesTable).values(values).returning();
        return row;
      },
      async update(id, data: any) {
        const setValues: any = {};
        if (data.name !== undefined) setValues.name = data.name;
        if (data.amount !== undefined) setValues.amount = data.amount;
        if (data.description !== undefined) setValues.description = data.description;
        if ("category" in data) setValues.category = data.category ?? null;
        if (Object.keys(setValues).length === 0) return null;
        const [row] = await db.update(feeTypesTable).set(setValues).where(eq(feeTypesTable.id, id)).returning();
        return row ?? null;
      },
      async delete(id) {
        await db.delete(feeTypesTable).where(eq(feeTypesTable.id, id));
      },
    },

    // ── Fee Records ───────────────────────────────────────────────────────────
    feeRecords: {
      async list() {
        return db.select().from(feeRecordsTable).orderBy(asc(feeRecordsTable.date));
      },
      async create(data: any) {
        const values: any = {
          studentId: data.studentId, studentName: data.studentName ?? "", class: data.class ?? "",
          amount: data.amount, date: data.date ?? "", description: data.description ?? "",
          feeTypeId: data.feeTypeId ?? null, feeTypeName: data.feeTypeName ?? null,
          collectedBy: data.collectedBy ?? "", receiptNumber: data.receiptNumber ?? null,
          paymentMethod: data.paymentMethod ?? null, feeCategory: data.feeCategory ?? null,
          discountApplied: data.discountApplied ?? null,
        };
        if (data.id) values.id = data.id;
        const [row] = await db.insert(feeRecordsTable).values(values).returning();
        return row;
      },
      async delete(id) {
        await db.delete(feeRecordsTable).where(eq(feeRecordsTable.id, id));
      },
    },

    // ── Salary Records ────────────────────────────────────────────────────────
    salaryRecords: {
      async list() {
        return db.select().from(salaryRecordsTable).orderBy(asc(salaryRecordsTable.createdAt));
      },
      async create(data: any) {
        const values: any = {
          teacherId: data.teacherId, teacherName: data.teacherName ?? "", month: data.month,
          year: data.year, amount: data.amount ?? 0, status: data.status ?? "pending",
          paidDate: data.paidDate ?? null, receiptNumber: data.receiptNumber ?? null,
        };
        if (data.id) values.id = data.id;
        const [row] = await db.insert(salaryRecordsTable).values(values).returning();
        return row;
      },
      async update(id, data: any) {
        const setValues: any = {};
        if (data.status !== undefined) setValues.status = data.status;
        if ("paidDate" in data) setValues.paidDate = data.paidDate ?? null;
        if ("receiptNumber" in data) setValues.receiptNumber = data.receiptNumber ?? null;
        if (data.amount !== undefined) setValues.amount = data.amount;
        if (Object.keys(setValues).length === 0) return null;
        const [row] = await db.update(salaryRecordsTable).set(setValues).where(eq(salaryRecordsTable.id, id)).returning();
        return row ?? null;
      },
      async upsertByTeacher(teacherId, month, year, data) {
        const existing = await db
          .select()
          .from(salaryRecordsTable)
          .where(and(
            eq(salaryRecordsTable.teacherId, teacherId),
            eq(salaryRecordsTable.month, month),
            eq(salaryRecordsTable.year, year),
          ))
          .limit(1);

        if (existing.length > 0) {
          const [row] = await db.update(salaryRecordsTable).set({
            status: data.status, paidDate: data.paidDate ?? null, receiptNumber: data.receiptNumber ?? null,
          }).where(eq(salaryRecordsTable.id, existing[0].id)).returning();
          return { row, created: false };
        } else {
          const [row] = await db.insert(salaryRecordsTable).values({
            teacherId, teacherName: data.teacherName ?? "", month, year: Number(year),
            amount: data.amount ?? 0, status: data.status ?? "pending",
            paidDate: data.paidDate ?? null, receiptNumber: data.receiptNumber ?? null,
          }).returning();
          return { row, created: true };
        }
      },
      async delete(id) {
        await db.delete(salaryRecordsTable).where(eq(salaryRecordsTable.id, id));
      },
    },

    // ── Expenses ──────────────────────────────────────────────────────────────
    expenses: {
      async list() {
        return db.select().from(expensesTable).orderBy(asc(expensesTable.date));
      },
      async create(data: any) {
        const values: any = {
          description: data.description, amount: data.amount, date: data.date ?? "", category: data.category ?? "",
        };
        if (data.id) values.id = data.id;
        const [row] = await db.insert(expensesTable).values(values).returning();
        return row;
      },
      async delete(id) {
        await db.delete(expensesTable).where(eq(expensesTable.id, id));
      },
    },

    // ── Alumni ────────────────────────────────────────────────────────────────
    alumni: {
      async list() {
        return db.select().from(alumniTable).orderBy(asc(alumniTable.batch), asc(alumniTable.name));
      },
      async create(data: any) {
        const values: any = {
          studentId: data.studentId ?? data.id ?? `manual-${Date.now()}`,
          studentName: data.studentName ?? data.name ?? "",
          class: data.class ?? data.passOutClass ?? "",
          section: data.section ?? null,
          graduationYear: data.graduationYear ?? data.batch ?? "",
          name: data.name,
          fatherName: data.fatherName ?? "",
          mobileNumber: data.mobileNumber ?? "",
          batch: data.batch,
          passOutClass: data.passOutClass,
          rollNumber: data.rollNumber ?? "",
          admissionNo: data.admissionNo ?? null,
          dateOfBirth: data.dateOfBirth ?? "",
          address: data.address ?? null,
          photo: data.photo ?? null,
          achievements: data.achievements ?? null,
          currentStatus: data.currentStatus ?? null,
        };
        if (data.id) values.id = data.id;
        return db.transaction(async (tx) => {
          const [row] = await tx.insert(alumniTable).values(values).returning();
          if (data.studentId) {
            await tx.update(studentsTable)
              .set({ status: "graduated" })
              .where(eq(studentsTable.id, String(data.studentId)));
          }
          return row;
        });
      },
      async update(id, data: any) {
        // Only update fields that are explicitly provided.
        const setValues: any = {};
        if (data.name !== undefined) setValues.name = data.name;
        if (data.fatherName !== undefined) setValues.fatherName = data.fatherName ?? "";
        if (data.mobileNumber !== undefined) setValues.mobileNumber = data.mobileNumber ?? "";
        if (data.batch !== undefined) setValues.batch = data.batch;
        if (data.passOutClass !== undefined) setValues.passOutClass = data.passOutClass;
        if (data.rollNumber !== undefined) setValues.rollNumber = data.rollNumber ?? "";
        if ("admissionNo" in data) setValues.admissionNo = data.admissionNo ?? null;
        if (data.dateOfBirth !== undefined) setValues.dateOfBirth = data.dateOfBirth ?? "";
        if ("address" in data) setValues.address = data.address ?? null;
        if ("photo" in data) setValues.photo = data.photo ?? null;
        if ("achievements" in data) setValues.achievements = data.achievements ?? null;
        if ("currentStatus" in data) setValues.currentStatus = data.currentStatus ?? null;
        if (Object.keys(setValues).length === 0) return null;
        const [row] = await db.update(alumniTable).set(setValues).where(eq(alumniTable.id, id)).returning();
        return row ?? null;
      },
      async bulkCreate(records: any[]) {
        const values = records.map((data: any) => {
          const v: any = {
            studentId: data.studentId,
            studentName: data.studentName ?? data.name,
            class: data.class ?? data.passOutClass,
            section: data.section ?? null,
            graduationYear: data.graduationYear ?? data.batch,
            name: data.name,
            fatherName: data.fatherName ?? "",
            mobileNumber: data.mobileNumber ?? "",
            batch: data.batch,
            passOutClass: data.passOutClass,
            rollNumber: data.rollNumber ?? "",
            admissionNo: data.admissionNo ?? null,
            dateOfBirth: data.dateOfBirth ?? "",
            address: data.address ?? null,
            photo: data.photo ?? null,
            achievements: data.achievements ?? null,
            currentStatus: data.currentStatus ?? null,
          };
          if (data.id) v.id = data.id;
          return v;
        });
        const studentIds = Array.from(new Set(records.map((data: any) => String(data.studentId)).filter(Boolean)));
        return db.transaction(async (tx) => {
          const rows = await tx.insert(alumniTable).values(values).onConflictDoUpdate({
            target: alumniTable.studentId,
            set: {
              studentName: drizzleSql`excluded.student_name`,
              class: drizzleSql`excluded.class`,
              section: drizzleSql`excluded.section`,
              graduationYear: drizzleSql`excluded.graduation_year`,
              name: drizzleSql`excluded.name`,
              batch: drizzleSql`excluded.batch`,
              passOutClass: drizzleSql`excluded.pass_out_class`,
              rollNumber: drizzleSql`excluded.roll_number`,
              admissionNo: drizzleSql`excluded.admission_no`,
              dateOfBirth: drizzleSql`excluded.date_of_birth`,
              address: drizzleSql`excluded.address`,
              currentStatus: drizzleSql`excluded.current_status`,
            },
          }).returning();

          if (studentIds.length > 0) {
            await tx.update(studentsTable)
              .set({ status: "graduated" })
              .where(inArray(studentsTable.id, studentIds));
          }
          return rows;
        });
      },
      async delete(id) {
        await db.delete(alumniTable).where(eq(alumniTable.id, id));
      },
    },

    // ── Promotions ────────────────────────────────────────────────────────────
    promotions: {
      async list() {
        return db.select().from(promotionRecordsTable).orderBy(asc(promotionRecordsTable.promotedAt));
      },
      async promoteStudent(studentId, toClass, record) {
        await db.update(studentsTable).set({ class: toClass }).where(eq(studentsTable.id, studentId));
        const values: any = {
          studentId, studentName: record.studentName ?? "", fromClass: record.fromClass,
          toClass, promotedBy: record.promotedBy ?? "", promotedAt: record.promotedAt ?? "",
        };
        if (record.promotionId) values.id = record.promotionId;
        const [row] = await db.insert(promotionRecordsTable).values(values).returning();
        return row;
      },
      async bulkPromote(fromClass, toClass, records) {
        // Wrapped in a transaction so the student class update and the
        // promotion log insert are always in sync — no partial promotions.
        return db.transaction(async (tx) => {
          await tx.update(studentsTable).set({ class: toClass }).where(eq(studentsTable.class, fromClass));
          const values = records.map((r: any) => ({
            ...(r.id ? { id: r.id } : {}),
            studentId: r.studentId, studentName: r.studentName,
            fromClass, toClass, promotedBy: r.promotedBy ?? "", promotedAt: r.promotedAt ?? "",
          }));
          return tx.insert(promotionRecordsTable).values(values).returning();
        });
      },
    },
  };
}
