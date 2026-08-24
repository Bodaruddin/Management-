/**
 * Unified DataAdapter interface — implemented by both PostgreSQL (Drizzle) and
 * Firebase (Firestore). All routes import getAdapter() and use this interface.
 */

export interface DataAdapter {
  classes: {
    list(): Promise<string[]>;
    create(name: string): Promise<{ name: string }>;
    rename(oldName: string, newName: string): Promise<{ name: string } | null>;
    delete(name: string): Promise<boolean>;
  };
  sections: {
    list(): Promise<string[]>;
    create(name: string): Promise<{ name: string }>;
    rename(oldName: string, newName: string): Promise<{ name: string } | null>;
    delete(name: string): Promise<boolean>;
  };
  students: {
    list(includeGraduated?: boolean): Promise<any[]>;
    create(data: any): Promise<any>;
    update(id: string, data: any): Promise<any | null>;
    delete(id: string): Promise<void>;
    setStatus(id: string, status: "active" | "inactive" | "graduated"): Promise<any | null>;
  };
  teachers: {
    list(): Promise<any[]>;
    create(data: any): Promise<any>;
    update(id: string, data: any): Promise<any | null>;
    delete(id: string): Promise<void>;
  };
  appSettings: {
    get(key: string): Promise<any | null>;
    set(key: string, value: any): Promise<any>;
  };
  subjects: {
    list(): Promise<string[]>;
    create(name: string, id?: string): Promise<{ name: string }>;
    delete(name: string): Promise<void>;
  };
  attendance: {
    list(): Promise<any[]>;
    bulkUpsert(date: string, cls: string, records: any[]): Promise<any[]>;
    /** After attendance upsert: count consecutive absents and mark students inactive if over limit. Returns newly inactivated student IDs. */
    checkAndMarkInactive(date: string, cls: string, absentStudentIds: string[]): Promise<string[]>;
  };
  inactivationRequests: {
    list(): Promise<any[]>;
    listByStudent(studentId: string): Promise<any[]>;
    create(data: any): Promise<any>;
    updateStatus(id: string, status: "approved" | "rejected", adminNote?: string): Promise<any | null>;
    clearDocument(id: string): Promise<any | null>;
    delete(id: string): Promise<boolean>;
  };
  exams: {
    list(): Promise<any[]>;
    create(data: any): Promise<any>;
    update(id: string, data: any): Promise<any | null>;
    delete(id: string): Promise<void>;
  };
  feeTypes: {
    list(): Promise<any[]>;
    create(data: any): Promise<any>;
    update(id: string, data: any): Promise<any | null>;
    delete(id: string): Promise<void>;
  };
  feeRecords: {
    list(): Promise<any[]>;
    create(data: any): Promise<any>;
    update(id: string, data: any): Promise<any | null>;
    delete(id: string): Promise<void>;
  };
  salaryRecords: {
    list(): Promise<any[]>;
    create(data: any): Promise<any>;
    update(id: string, data: any): Promise<any | null>;
    upsertByTeacher(
      teacherId: string,
      month: string,
      year: number,
      data: any,
    ): Promise<{ row: any; created: boolean }>;
    delete(id: string): Promise<void>;
  };
  expenses: {
    list(): Promise<any[]>;
    create(data: any): Promise<any>;
    delete(id: string): Promise<void>;
  };
  promotions: {
    list(): Promise<any[]>;
    promoteStudent(studentId: string, toClass: string, record: any): Promise<any>;
    bulkPromote(fromClass: string, toClass: string, records: any[]): Promise<any[]>;
  };
  markSubmissions: {
    list(): Promise<any[]>;
    get(examId: string, cls: string, subject: string): Promise<any | null>;
    upsert(data: {
      examId: string; class: string; subject: string; status: string;
      teacherId?: string | null; teacherName?: string | null;
      submittedAt?: Date | null; lockedBy?: string | null; lockedAt?: Date | null;
    }): Promise<any>;
  };
  markAuditLog: {
    list(): Promise<any[]>;
    create(data: {
      examId: string; class: string; subject: string; action: string;
      actorId: string; actorName: string; actorRole: string; notes?: string;
    }): Promise<any>;
  };
  alumni: {
    list(): Promise<any[]>;
    /** Repair legacy Alumni imports so graduated students have no active placement. */
    syncGraduatedStudents(): Promise<void>;
    create(data: any): Promise<any>;
    /** Upsert alumni records and mark matching students as graduated without deleting history. */
    bulkCreate(records: any[]): Promise<any[]>;
    update(id: string, data: any): Promise<any | null>;
    delete(id: string): Promise<void>;
  };
  examResults: {
    list(): Promise<any[]>;
    create(data: any): Promise<any>;
    bulkUpsert(results: any[]): Promise<any[]>;
    /** Replace marks for a single subject without touching other subjects' marks. */
    replaceSubjectMarks(
      examId: string, cls: string, subject: string,
      rows: Array<{ studentId: string; studentName: string; rollNumber: string; mark: number }>
    ): Promise<void>;
  };
}
