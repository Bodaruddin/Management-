/**
 * Firebase Firestore DataAdapter — wraps Firebase Admin SDK.
 * Each PostgreSQL table maps to a Firestore collection of the same name.
 */
import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import crypto from "node:crypto";
import type { DataAdapter } from "./adapter.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function mapDoc(doc: QueryDocumentSnapshot): any {
  return { id: doc.id, ...doc.data() };
}

function newId(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

function stamp(data: any): any {
  return { ...data, createdAt: now() };
}

export function createFirebaseAdapter(fs: Firestore): DataAdapter {
  const col = (name: string) => fs.collection(name);

  return {
    // ── Classes ───────────────────────────────────────────────────────────────
    classes: {
      async list() {
        const snap = await col("classes").orderBy("name").get();
        return snap.docs.map((d) => d.data().name as string);
      },
      async create(name: string) {
        const id = newId();
        await col("classes").doc(id).set({ name, createdAt: now() });
        return { name };
      },
      async rename(oldName, newName) {
        const snap = await col("classes").where("name", "==", oldName).limit(1).get();
        if (snap.empty) return null;
        await snap.docs[0].ref.update({ name: newName });
        return { name: newName };
      },
      async delete(name) {
        const snap = await col("classes").where("name", "==", name).limit(1).get();
        if (snap.empty) return false;
        await snap.docs[0].ref.delete();
        return true;
      },
    },

    // ── Sections ──────────────────────────────────────────────────────────────
    sections: {
      async list() {
        const [sectionSnap, studentSnap] = await Promise.all([
          col("sections").orderBy("name").get(),
          col("students").get(),
        ]);
        return Array.from(new Set([
          ...sectionSnap.docs.map((d) => d.data().name as string),
          ...studentSnap.docs
            .map((d) => d.data().section as string | undefined)
            .filter((name): name is string => Boolean(name?.trim())),
        ])).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
      },
      async create(name: string) {
        const id = newId();
        await col("sections").doc(id).set({ name, createdAt: now() });
        return { name };
      },
      async rename(oldName: string, newName: string) {
        const snap = await col("sections").where("name", "==", oldName).limit(1).get();
        const students = await col("students").where("section", "==", oldName).get();
        if (snap.empty && students.empty) return null;
        const batch = fs.batch();
        if (!snap.empty) {
          batch.update(snap.docs[0].ref, { name: newName });
        } else {
          batch.set(col("sections").doc(newId()), { name: newName, createdAt: now() });
        }
        if (!students.empty) {
          students.docs.forEach((student) => batch.update(student.ref, { section: newName }));
        }
        await batch.commit();
        return { name: newName };
      },
      async delete(name: string) {
        const snap = await col("sections").where("name", "==", name).limit(1).get();
        const students = await col("students").where("section", "==", name).get();
        if (snap.empty && students.empty) return false;
        const batch = fs.batch();
        snap.docs.forEach((section) => batch.delete(section.ref));
        students.docs.forEach((student) => batch.update(student.ref, { section: FieldValue.delete() }));
        await batch.commit();
        return true;
      },
    },

    // ── Students ──────────────────────────────────────────────────────────────
    students: {
      async list(includeGraduated = false) {
        const snap = await col("students").orderBy("createdAt").get();
        const students = snap.docs.map(mapDoc);
        return includeGraduated ? students : students.filter((student) => student.status !== "graduated");
      },
      async create(data: any) {
        const id = data.id ?? newId();
        const doc = stamp({
          name: data.name, fatherName: data.fatherName ?? "", motherName: data.motherName ?? "",
          mobileNumber: data.mobileNumber ?? "", class: data.class, section: data.section ?? null,
          admissionNo: data.admissionNo ?? null, rollNumber: data.rollNumber,
          dateOfBirth: data.dateOfBirth ?? "", address: data.address ?? null, photo: data.photo ?? null,
          annualFee: data.annualFee ?? null, discountType: data.discountType ?? null, discountValue: data.discountValue ?? null,
          status: data.status ?? "active",
        });
        await col("students").doc(id).set(doc);
        return { id, ...doc };
      },
      async update(id, data: any) {
        const ref = col("students").doc(id);
        const existing = await ref.get();
        if (!existing.exists) return null;
        // Only include fields that are explicitly provided so partial updates
        // don't overwrite existing data with undefined/null.
        const updates: any = {};
        if (data.name !== undefined) updates.name = data.name;
        if (data.fatherName !== undefined) updates.fatherName = data.fatherName;
        if (data.motherName !== undefined) updates.motherName = data.motherName;
        if (data.mobileNumber !== undefined) updates.mobileNumber = data.mobileNumber;
        if (data.class !== undefined) updates.class = data.class;
        if ("section" in data) updates.section = data.section ?? null;
        if ("admissionNo" in data) updates.admissionNo = data.admissionNo ?? null;
        if (data.rollNumber !== undefined) updates.rollNumber = data.rollNumber;
        if (data.dateOfBirth !== undefined) updates.dateOfBirth = data.dateOfBirth;
        if ("address" in data) updates.address = data.address ?? null;
        if ("photo" in data) updates.photo = data.photo ?? null;
        if ("annualFee" in data) updates.annualFee = data.annualFee ?? null;
        if ("discountType" in data) updates.discountType = data.discountType ?? null;
        if ("discountValue" in data) updates.discountValue = data.discountValue ?? null;
        if (data.status !== undefined) updates.status = data.status;
        if (Object.keys(updates).length === 0) return { id, ...existing.data() };
        await ref.update(updates);
        return { id, ...existing.data(), ...updates };
      },
      async delete(id) {
        await col("students").doc(id).delete();
      },
      async setStatus(id, status) {
        const ref = col("students").doc(id);
        const snap = await ref.get();
        if (!snap.exists) return null;
        await ref.update({ status });
        return { id, ...snap.data(), status };
      },
    },

    // ── Alumni ────────────────────────────────────────────────────────────────
    alumni: {
      async list() {
        const snap = await col("alumni").orderBy("batch").get();
        return snap.docs
          .map(mapDoc)
          .sort((a, b) => String(a.batch).localeCompare(String(b.batch)) || String(a.name).localeCompare(String(b.name)));
      },
      async syncGraduatedStudents() {
        const snap = await col("alumni").get();
        const studentIds = Array.from(new Set(
          snap.docs.map(doc => String(doc.data().studentId ?? "")).filter(Boolean),
        ));
        const studentSnapshots = await Promise.all(
          studentIds.map(id => col("students").doc(id).get()),
        );
        const writes = studentSnapshots
          .filter(student => student.exists)
          .map(student => ({
            ref: student.ref,
            data: { status: "graduated", class: "", section: FieldValue.delete() },
          }));
        for (let i = 0; i < writes.length; i += 450) {
          const batch = fs.batch();
          writes.slice(i, i + 450).forEach(({ ref, data }) => batch.set(ref, data, { merge: true }));
          await batch.commit();
        }
      },
      async create(data: any) {
        const id = data.id ?? newId();
        const doc = stamp({
          studentId: data.studentId ?? id,
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
        });
        await col("alumni").doc(id).set(doc);
        if (data.studentId) {
          const studentRef = col("students").doc(String(data.studentId));
          const student = await studentRef.get();
          if (student.exists) {
            // Alumni keeps the historical pass-out class; the student row must
            // no longer have an active class/section assignment.
            await studentRef.update({ status: "graduated", class: "", section: FieldValue.delete() });
          }
        }
        return { id, ...doc };
      },
      async bulkCreate(records: any[]) {
        const rows: any[] = [];
        const updates: Array<{ id: string }> = [];
        for (const data of records) {
          const studentId = String(data.studentId);
          const existing = await col("alumni").where("studentId", "==", studentId).limit(1).get();
          const id = existing.empty ? (data.id ?? newId()) : existing.docs[0].id;
          const doc = stamp({
            studentId,
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
          });
          await col("alumni").doc(id).set(doc, { merge: true });
          rows.push({ id, ...doc });
          const student = await col("students").doc(studentId).get();
          if (student.exists) updates.push({ id: studentId });
        }

        // Firestore batches are limited to 500 writes. Chunking preserves the
        // same migration behavior for large classes without deleting history.
        const writes = updates.map(({ id }) => ({
          ref: col("students").doc(id),
          // Keep historical placement in Alumni, but remove active placement.
          data: { status: "graduated", class: "", section: FieldValue.delete() },
        }));
        for (let i = 0; i < writes.length; i += 450) {
          const batch = fs.batch();
          writes.slice(i, i + 450).forEach(({ ref, data }) => batch.update(ref, data));
          await batch.commit();
        }
        return rows;
      },
      async update(id, data: any) {
        const ref = col("alumni").doc(id);
        const existing = await ref.get();
        if (!existing.exists) return null;
        const updates: any = {};
        if (data.name !== undefined) updates.name = data.name;
        if (data.fatherName !== undefined) updates.fatherName = data.fatherName ?? "";
        if (data.mobileNumber !== undefined) updates.mobileNumber = data.mobileNumber ?? "";
        if (data.batch !== undefined) updates.batch = data.batch;
        if (data.passOutClass !== undefined) updates.passOutClass = data.passOutClass;
        if (data.rollNumber !== undefined) updates.rollNumber = data.rollNumber ?? "";
        if ("admissionNo" in data) updates.admissionNo = data.admissionNo ?? null;
        if (data.dateOfBirth !== undefined) updates.dateOfBirth = data.dateOfBirth ?? "";
        if ("address" in data) updates.address = data.address ?? null;
        if ("photo" in data) updates.photo = data.photo ?? null;
        if ("achievements" in data) updates.achievements = data.achievements ?? null;
        if ("currentStatus" in data) updates.currentStatus = data.currentStatus ?? null;
        if (Object.keys(updates).length === 0) return { id, ...existing.data() };
        await ref.update(updates);
        return { id, ...existing.data(), ...updates };
      },
      async delete(id) {
        await col("alumni").doc(id).delete();
      },
    },

    // ── Teachers ──────────────────────────────────────────────────────────────
    teachers: {
      async list() {
        const snap = await col("teachers").orderBy("createdAt").get();
        return snap.docs.map(mapDoc);
      },
      async create(data: any) {
        const id = data.id ?? newId();
        const doc = stamp({
          name: data.name, subject: data.subject ?? "", mobileNumber: data.mobileNumber ?? "",
          salary: data.salary ?? 0, username: data.username, password: data.password ?? "",
          joinDate: data.joinDate ?? "", photo: data.photo ?? null,
          permissions: data.permissions ?? {
            addStudent: false, feeCollection: false, manageClasses: false,
            manageExams: false, manageResults: false, promoteStudents: false, sendFeeReminder: false,
            allowMarkEdit: false,
          },
        });
        await col("teachers").doc(id).set(doc);
        return { id, ...doc };
      },
      async update(id, data: any) {
        const ref = col("teachers").doc(id);
        const existing = await ref.get();
        if (!existing.exists) return null;
        const updates: any = {};
        if (data.name !== undefined) updates.name = data.name;
        if (data.subject !== undefined) updates.subject = data.subject;
        if (data.mobileNumber !== undefined) updates.mobileNumber = data.mobileNumber;
        if (data.salary !== undefined) updates.salary = data.salary;
        if (data.username !== undefined) updates.username = data.username;
        if (data.password !== undefined) updates.password = data.password;
        if (data.joinDate !== undefined) updates.joinDate = data.joinDate;
        if ("photo" in data) updates.photo = data.photo ?? null;
        if (data.permissions !== undefined) updates.permissions = data.permissions;
        if (Object.keys(updates).length === 0) return { id, ...existing.data() };
        await ref.update(updates);
        return { id, ...existing.data(), ...updates };
      },
      async delete(id) {
        await col("teachers").doc(id).delete();
      },
    },

    // ── App Settings ───────────────────────────────────────────────────────────
    appSettings: {
      async get(key) {
        const snap = await col("app_settings").doc(key).get();
        return snap.exists ? { key: snap.id, ...snap.data() } : null;
      },
      async set(key, value) {
        const doc = { key, value, updatedAt: now() };
        await col("app_settings").doc(key).set(doc, { merge: true });
        return doc;
      },
    },

    // ── Subjects ──────────────────────────────────────────────────────────────
    subjects: {
      async list() {
        const snap = await col("subjects").orderBy("name").get();
        return snap.docs.map((d) => d.data().name as string);
      },
      async create(name, id) {
        const docId = id ?? newId();
        await col("subjects").doc(docId).set({ name: String(name).trim(), createdAt: now() });
        return { name: String(name).trim() };
      },
      async delete(name) {
        const snap = await col("subjects").where("name", "==", name).limit(1).get();
        if (!snap.empty) await snap.docs[0].ref.delete();
      },
    },

    // ── Attendance ────────────────────────────────────────────────────────────
    attendance: {
      async list() {
        const snap = await col("attendance_records").orderBy("date").get();
        return snap.docs.map(mapDoc);
      },
      async bulkUpsert(date, cls, records) {
        // Delete existing records for this date+class
        const existing = await col("attendance_records")
          .where("date", "==", date)
          .where("class", "==", cls)
          .get();
        const batch = fs.batch();
        existing.docs.forEach((d) => batch.delete(d.ref));

        const results: any[] = [];
        for (const r of records) {
          const id = r.id ?? newId();
          const doc = stamp({
            studentId: r.studentId, studentName: r.studentName, class: r.class,
            date: r.date, status: r.status, takenBy: r.takenBy,
          });
          batch.set(col("attendance_records").doc(id), doc);
          results.push({ id, ...doc });
        }
        await batch.commit();
        return results;
      },
      async checkAndMarkInactive(_date, _cls, _absentStudentIds) {
        // Firebase stub — auto-inactive logic not implemented for Firestore
        return [];
      },
    },

    // ── Inactivation Requests ─────────────────────────────────────────────────
    inactivationRequests: {
      async list() {
        const snap = await col("inactivation_requests").orderBy("createdAt", "desc").get();
        return snap.docs.map(mapDoc);
      },
      async listByStudent(studentId) {
        const snap = await col("inactivation_requests")
          .where("studentId", "==", studentId)
          .orderBy("createdAt", "desc")
          .get();
        return snap.docs.map(mapDoc);
      },
      async create(data: any) {
        const id = data.id ?? newId();
        const doc = stamp({
          studentId: data.studentId, studentName: data.studentName ?? "",
          studentClass: data.studentClass ?? "", teacherId: data.teacherId,
          teacherName: data.teacherName ?? "", reason: data.reason,
          documentBase64: data.documentBase64 ?? null,
          documentName: data.documentName ?? null,
          documentMimeType: data.documentMimeType ?? null,
          status: "pending", adminNote: null, reviewedAt: null,
        });
        await col("inactivation_requests").doc(id).set(doc);
        return { id, ...doc };
      },
      async updateStatus(id, status, adminNote) {
        const ref = col("inactivation_requests").doc(id);
        const snap = await ref.get();
        if (!snap.exists) return null;
        const updates = { status, adminNote: adminNote ?? null, reviewedAt: now() };
        await ref.update(updates);
        const updated = { id, ...snap.data(), ...updates };
        // If approved, reactivate student
        if (status === "approved") {
          const studentId = snap.data()?.studentId;
          if (studentId) await col("students").doc(studentId).update({ status: "active" });
        }
        return updated;
      },
      async clearDocument(id) {
        const ref = col("inactivation_requests").doc(id);
        const snap = await ref.get();
        if (!snap.exists) return null;
        const updates = {
          documentBase64: null,
          documentName: null,
          documentMimeType: null,
        };
        await ref.update(updates);
        return { id, ...snap.data(), ...updates };
      },
      async delete(id) {
        const ref = col("inactivation_requests").doc(id);
        const snap = await ref.get();
        if (!snap.exists) return false;
        await ref.delete();
        return true;
      },
    },

    // ── Exams ─────────────────────────────────────────────────────────────────
    exams: {
      async list() {
        const snap = await col("exams").orderBy("date").get();
        return snap.docs.map(mapDoc);
      },
      async create(data: any) {
        const id = data.id ?? newId();
        const doc = stamp({
          name: data.name, class: data.class, subjects: data.subjects ?? [],
          subjectSchedule: data.subjectSchedule ?? null,
          classSubjects: data.classSubjects ?? null,
          date: data.date ?? "", maxMarks: data.maxMarks ?? 100,
        });
        await col("exams").doc(id).set(doc);
        return { id, ...doc };
      },
      async update(id, data: any) {
        const ref = col("exams").doc(id);
        const existing = await ref.get();
        if (!existing.exists) return null;
        const updates: any = {};
        if (data.name !== undefined) updates.name = data.name;
        if (data.class !== undefined) updates.class = data.class;
        if (data.subjects !== undefined) updates.subjects = data.subjects;
        if ("subjectSchedule" in data) updates.subjectSchedule = data.subjectSchedule ?? null;
        if ("classSubjects" in data) updates.classSubjects = data.classSubjects ?? null;
        if (data.date !== undefined) updates.date = data.date;
        if (data.maxMarks !== undefined) updates.maxMarks = data.maxMarks;
        if (Object.keys(updates).length === 0) return { id, ...existing.data() };
        await ref.update(updates);
        return { id, ...existing.data(), ...updates };
      },
      async delete(id) {
        await col("exams").doc(id).delete();
      },
    },

    // ── Exam Results ──────────────────────────────────────────────────────────
    examResults: {
      async list() {
        const snap = await col("exam_results").orderBy("createdAt").get();
        return snap.docs.map(mapDoc);
      },
      async create(data: any) {
        const id = data.id ?? newId();
        const doc = stamp({
          examId: data.examId, studentId: data.studentId, studentName: data.studentName,
          class: data.class, rollNumber: data.rollNumber, marks: data.marks,
        });
        await col("exam_results").doc(id).set(doc);
        return { id, ...doc };
      },
      async bulkUpsert(results) {
        const batch = fs.batch();
        const output: any[] = [];
        for (const r of results) {
          // Upsert by examId+studentId: query for existing
          const existing = await col("exam_results")
            .where("examId", "==", r.examId)
            .where("studentId", "==", r.studentId)
            .limit(1)
            .get();
          if (!existing.empty) {
            const updates = { marks: r.marks, studentName: r.studentName, rollNumber: r.rollNumber };
            batch.update(existing.docs[0].ref, updates);
            output.push({ id: existing.docs[0].id, ...existing.docs[0].data(), ...updates });
          } else {
            const id = r.id ?? newId();
            const doc = stamp({
              examId: r.examId, studentId: r.studentId, studentName: r.studentName,
              class: r.class, rollNumber: r.rollNumber, marks: r.marks,
            });
            batch.set(col("exam_results").doc(id), doc);
            output.push({ id, ...doc });
          }
        }
        await batch.commit();
        return output;
      },
      /** Replace one subject's marks without touching other subjects. */
      async replaceSubjectMarks(examId, cls, subject, rows) {
        const existing = await col("exam_results").where("examId", "==", examId).get();
        const byStudentId = new Map(rows.map((row) => [row.studentId, row]));

        for (const doc of existing.docs) {
          const data = doc.data();
          if (data.class !== cls) continue;
          const nextMarks = { ...(data.marks ?? {}) };
          delete nextMarks[subject];
          const replacement = byStudentId.get(data.studentId);
          if (replacement) nextMarks[subject] = replacement.mark;
          await doc.ref.update({ marks: nextMarks });
          byStudentId.delete(data.studentId);
        }

        for (const row of byStudentId.values()) {
          const id = newId();
          const doc = stamp({
            examId, studentId: row.studentId, studentName: row.studentName,
            class: cls, rollNumber: row.rollNumber, marks: { [subject]: row.mark },
          });
          await col("exam_results").doc(id).set(doc);
        }
      },
    },

    // ── Mark Submissions ──────────────────────────────────────────────────────
    markSubmissions: {
      async list() {
        const snap = await col("mark_submissions").orderBy("createdAt").get();
        return snap.docs.map(mapDoc);
      },
      async get(examId, cls, subject) {
        const snap = await col("mark_submissions")
          .where("examId", "==", examId)
          .where("class", "==", cls)
          .where("subject", "==", subject)
          .limit(1)
          .get();
        return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
      },
      async upsert(data) {
        const snap = await col("mark_submissions")
          .where("examId", "==", data.examId)
          .where("class", "==", data.class)
          .where("subject", "==", data.subject)
          .limit(1)
          .get();
        const doc: any = {
          examId: data.examId, class: data.class, subject: data.subject,
          status: data.status,
          teacherId: data.teacherId ?? null, teacherName: data.teacherName ?? null,
          submittedAt: data.submittedAt ?? null,
          lockedBy: data.lockedBy ?? null, lockedAt: data.lockedAt ?? null,
        };
        if (!snap.empty) {
          await snap.docs[0].ref.update(doc);
          return { id: snap.docs[0].id, ...snap.docs[0].data(), ...doc };
        } else {
          const id = newId();
          const full = stamp(doc);
          await col("mark_submissions").doc(id).set(full);
          return { id, ...full };
        }
      },
    },

    // ── Mark Audit Log ────────────────────────────────────────────────────────
    markAuditLog: {
      async list() {
        const snap = await col("mark_audit_log").orderBy("createdAt").get();
        return snap.docs.map(mapDoc);
      },
      async create(data) {
        const id = newId();
        const doc = stamp({
          examId: data.examId, class: data.class, subject: data.subject,
          action: data.action, actorId: data.actorId, actorName: data.actorName,
          actorRole: data.actorRole, notes: data.notes ?? null,
        });
        await col("mark_audit_log").doc(id).set(doc);
        return { id, ...doc };
      },
    },

    // ── Fee Types ─────────────────────────────────────────────────────────────
    feeTypes: {
      async list() {
        const snap = await col("fee_types").orderBy("createdAt").get();
        return snap.docs.map(mapDoc);
      },
      async create(data: any) {
        const id = data.id ?? newId();
        const doc = stamp({
          name: data.name, amount: data.amount ?? 0, description: data.description ?? "", category: data.category ?? null,
        });
        await col("fee_types").doc(id).set(doc);
        return { id, ...doc };
      },
      async update(id, data: any) {
        const ref = col("fee_types").doc(id);
        const existing = await ref.get();
        if (!existing.exists) return null;
        const updates = { name: data.name, amount: data.amount, description: data.description, category: data.category ?? null };
        await ref.update(updates);
        return { id, ...existing.data(), ...updates };
      },
      async delete(id) {
        await col("fee_types").doc(id).delete();
      },
    },

    // ── Fee Records ───────────────────────────────────────────────────────────
    feeRecords: {
      async list() {
        const snap = await col("fee_records").orderBy("date").get();
        return snap.docs.map(mapDoc);
      },
      async create(data: any) {
        const id = data.id ?? newId();
        const doc = stamp({
          studentId: data.studentId, studentName: data.studentName ?? "", class: data.class ?? "",
          amount: data.amount, date: data.date ?? "", description: data.description ?? "",
          feeTypeId: data.feeTypeId ?? null, feeTypeName: data.feeTypeName ?? null,
          collectedBy: data.collectedBy ?? "", receiptNumber: data.receiptNumber ?? null,
          paymentMethod: data.paymentMethod ?? null, feeCategory: data.feeCategory ?? null,
          discountApplied: data.discountApplied ?? null,
        });
        await col("fee_records").doc(id).set(doc);
        return { id, ...doc };
      },
      async update(id, data: any) {
        const ref = col("fee_records").doc(id);
        const existing = await ref.get();
        if (!existing.exists) return null;
        const updates: any = {};
        for (const key of ["amount", "date", "description", "paymentMethod"]) {
          if (data[key] !== undefined) updates[key] = data[key];
        }
        if (Object.keys(updates).length === 0) return null;
        await ref.update(updates);
        return { id, ...existing.data(), ...updates };
      },
      async delete(id) {
        await col("fee_records").doc(id).delete();
      },
    },

    // ── Salary Records ────────────────────────────────────────────────────────
    salaryRecords: {
      async list() {
        const snap = await col("salary_records").orderBy("createdAt").get();
        return snap.docs.map(mapDoc);
      },
      async create(data: any) {
        const id = data.id ?? newId();
        const doc = stamp({
          teacherId: data.teacherId, teacherName: data.teacherName ?? "", month: data.month,
          year: data.year, amount: data.amount ?? 0, status: data.status ?? "pending",
          paidDate: data.paidDate ?? null, receiptNumber: data.receiptNumber ?? null,
        });
        await col("salary_records").doc(id).set(doc);
        return { id, ...doc };
      },
      async update(id, data: any) {
        const ref = col("salary_records").doc(id);
        const existing = await ref.get();
        if (!existing.exists) return null;
        const updates = {
          status: data.status, paidDate: data.paidDate ?? null,
          receiptNumber: data.receiptNumber ?? null, amount: data.amount,
        };
        await ref.update(updates);
        return { id, ...existing.data(), ...updates };
      },
      async upsertByTeacher(teacherId, month, year, data) {
        const snap = await col("salary_records")
          .where("teacherId", "==", teacherId)
          .where("month", "==", month)
          .where("year", "==", year)
          .limit(1)
          .get();

        if (!snap.empty) {
          const updates = { status: data.status, paidDate: data.paidDate ?? null, receiptNumber: data.receiptNumber ?? null };
          await snap.docs[0].ref.update(updates);
          return { row: { id: snap.docs[0].id, ...snap.docs[0].data(), ...updates }, created: false };
        } else {
          const id = newId();
          const doc = stamp({
            teacherId, teacherName: data.teacherName ?? "", month, year: Number(year),
            amount: data.amount ?? 0, status: data.status ?? "pending",
            paidDate: data.paidDate ?? null, receiptNumber: data.receiptNumber ?? null,
          });
          await col("salary_records").doc(id).set(doc);
          return { row: { id, ...doc }, created: true };
        }
      },
      async delete(id) {
        await col("salary_records").doc(id).delete();
      },
    },

    // ── Expenses ──────────────────────────────────────────────────────────────
    expenses: {
      async list() {
        const snap = await col("expenses").orderBy("date").get();
        return snap.docs.map(mapDoc);
      },
      async create(data: any) {
        const id = data.id ?? newId();
        const doc = stamp({ description: data.description, amount: data.amount, date: data.date ?? "", category: data.category ?? "" });
        await col("expenses").doc(id).set(doc);
        return { id, ...doc };
      },
      async delete(id) {
        await col("expenses").doc(id).delete();
      },
    },

    // ── Promotions ────────────────────────────────────────────────────────────
    promotions: {
      async list() {
        const snap = await col("promotion_records").orderBy("promotedAt").get();
        return snap.docs.map(mapDoc);
      },
      async promoteStudent(studentId, toClass, record) {
        // Update student's class
        const studentRef = col("students").doc(studentId);
        await studentRef.update({ class: toClass });
        // Insert promotion record
        const id = record.promotionId ?? newId();
        const doc = stamp({
          studentId, studentName: record.studentName ?? "", fromClass: record.fromClass,
          toClass, promotedBy: record.promotedBy ?? "", promotedAt: record.promotedAt ?? "",
        });
        await col("promotion_records").doc(id).set(doc);
        return { id, ...doc };
      },
      async bulkPromote(fromClass, toClass, records) {
        // Update all students from fromClass
        const studentSnap = await col("students").where("class", "==", fromClass).get();
        const batch = fs.batch();
        studentSnap.docs.forEach((d) => batch.update(d.ref, { class: toClass }));

        const output: any[] = [];
        for (const r of records) {
          const id = r.id ?? newId();
          const doc = stamp({
            studentId: r.studentId, studentName: r.studentName,
            fromClass, toClass, promotedBy: r.promotedBy ?? "", promotedAt: r.promotedAt ?? "",
          });
          batch.set(col("promotion_records").doc(id), doc);
          output.push({ id, ...doc });
        }
        await batch.commit();
        return output;
      },
    },
  };
}
