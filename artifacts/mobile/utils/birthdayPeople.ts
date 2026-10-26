import type { Student } from '@/context/AppContext';
import { extractMMDD } from '@/utils/dateUtils';

type BirthdaySource = 'student' | 'alumni';

function normalizeName(name: string | undefined): string {
  return String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeRoll(rollNumber: string | undefined): string {
  const value = String(rollNumber ?? '').trim();
  return /^\d+$/.test(value) ? String(Number(value)) : value.toLowerCase();
}

function isSamePerson(a: Student, b: Student): boolean {
  if (a.id && b.id && a.id === b.id) return true;
  if (normalizeName(a.name) !== normalizeName(b.name)) return false;

  const aRoll = normalizeRoll(a.rollNumber);
  const bRoll = normalizeRoll(b.rollNumber);
  const aBirthday = extractMMDD(a.dateOfBirth);
  const bBirthday = extractMMDD(b.dateOfBirth);

  return (aRoll !== '' && bRoll !== '' && aRoll === bRoll)
    || (!!aBirthday && !!bBirthday && aBirthday === bBirthday);
}

function priority(student: Student, source: BirthdaySource): number {
  const hasClass = String(student.class ?? '').trim() !== '';
  const isActive = (student.status ?? 'active') === 'active';
  return (hasClass ? 100 : 0) + (isActive ? 20 : 0) + (source === 'student' ? 10 : 0);
}

/** Merge active student and alumni records without hiding a valid birthday. */
export function mergeBirthdayPeople(
  students: Student[],
  alumniStudents: Student[],
): Student[] {
  const people: Array<{ person: Student; source: BirthdaySource }> = [];

  const addPerson = (person: Student, source: BirthdaySource) => {
    const existingIndex = people.findIndex(entry => isSamePerson(entry.person, person));
    if (existingIndex === -1) {
      people.push({ person, source });
      return;
    }

    const existing = people[existingIndex];
    if (priority(person, source) > priority(existing.person, existing.source)) {
      people[existingIndex] = { person, source };
    }
  };

  students.forEach(student => addPerson(student, 'student'));
  alumniStudents.forEach(student => addPerson(student, 'alumni'));
  return people.map(entry => entry.person);
}
