import { SCHOOL_INFO } from '@/constants/schoolInfo';
import type { DocumentBranding, Expense, FeeRecord, SalaryRecord } from '@/context/AppContext';
import { documentLogoHtml } from '@/utils/documentBranding';

export interface FinancialReportData {
  periodLabel: string;
  rangeLabel: string;
  feeRecords: FeeRecord[];
  salaryRecords: SalaryRecord[];
  expenses: Expense[];
  totalFees: number;
  totalSalaryPaid: number;
  totalSalaryPending: number;
  totalExpenses: number;
  netBalance: number;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function amount(value: number): string {
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

function formatDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, year, month, day] = match;
    const monthName = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ][Number(month) - 1];
    return monthName ? `${day} ${monthName} ${year}` : value;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function emptyRow(message: string, columns: number): string {
  return `<tr><td class="empty" colspan="${columns}">${escapeHtml(message)}</td></tr>`;
}

export function buildFinancialReportHtml(
  data: FinancialReportData,
  branding: DocumentBranding,
): string {
  const feeGroups = new Map<string, { count: number; amount: number }>();
  data.feeRecords.forEach(record => {
    const key = record.feeTypeName ?? record.description ?? 'Other';
    const current = feeGroups.get(key) ?? { count: 0, amount: 0 };
    feeGroups.set(key, { count: current.count + 1, amount: current.amount + record.amount });
  });

  const salaryGroups = new Map<string, { count: number; amount: number }>();
  data.salaryRecords
    .filter(record => record.status === 'paid')
    .forEach(record => {
      const current = salaryGroups.get(record.teacherName) ?? { count: 0, amount: 0 };
      salaryGroups.set(record.teacherName, {
        count: current.count + 1,
        amount: current.amount + record.amount,
      });
    });

  const expenseGroups = new Map<string, { count: number; amount: number }>();
  data.expenses.forEach(expense => {
    const current = expenseGroups.get(expense.category) ?? { count: 0, amount: 0 };
    expenseGroups.set(expense.category, {
      count: current.count + 1,
      amount: current.amount + expense.amount,
    });
  });

  const sortedGroups = (groups: Map<string, { count: number; amount: number }>) =>
    Array.from(groups.entries()).sort((a, b) => b[1].amount - a[1].amount);

  const feeRows = sortedGroups(feeGroups)
    .map(([name, value]) => `
      <tr>
        <td>${escapeHtml(name)}</td>
        <td class="count">${value.count}</td>
        <td class="money">${amount(value.amount)}</td>
      </tr>
    `)
    .join('');

  const salaryRows = sortedGroups(salaryGroups)
    .map(([name, value]) => `
      <tr>
        <td>${escapeHtml(name)}</td>
        <td class="count">${value.count}</td>
        <td class="money">${amount(value.amount)}</td>
      </tr>
    `)
    .join('');

  const expenseRows = sortedGroups(expenseGroups)
    .map(([name, value]) => `
      <tr>
        <td>${escapeHtml(name)}</td>
        <td class="count">${value.count}</td>
        <td class="money">${amount(value.amount)}</td>
      </tr>
    `)
    .join('');

  // Keep each expense detail table within a printable A4 page. The shared
  // PDF exporter captures every `.page` element as its own PDF page, while
  // native printing uses the same elements as explicit print page breaks.
  const sortedExpenses = [...data.expenses].sort((a, b) => b.date.localeCompare(a.date));
  const EXPENSES_ON_SUMMARY_PAGE = 6;
  const MAX_EXPENSES_PER_PAGE = 32;
  const summaryExpenseRows = sortedExpenses
    .slice(0, EXPENSES_ON_SUMMARY_PAGE)
    .map(expense => `
      <tr>
        <td class="date">${escapeHtml(formatDate(expense.date))}</td>
        <td>${escapeHtml(expense.description || 'Unspecified expense')}</td>
        <td>${escapeHtml(expense.category || 'Other')}</td>
        <td class="money">${amount(expense.amount)}</td>
      </tr>
    `)
    .join('');
  const remainingExpenses = sortedExpenses.slice(EXPENSES_ON_SUMMARY_PAGE);
  const expensePageCount = remainingExpenses.length > 0
    ? Math.ceil(remainingExpenses.length / MAX_EXPENSES_PER_PAGE)
    : 0;
  const expensesPerDetailPage = expensePageCount > 0
    ? Math.ceil(remainingExpenses.length / expensePageCount)
    : 0;
  const expensePageRows = Array.from(
    { length: expensePageCount },
    (_, pageIndex) => remainingExpenses
      .slice(
        pageIndex * expensesPerDetailPage,
        (pageIndex + 1) * expensesPerDetailPage,
      )
      .map(expense => `
        <tr>
          <td class="date">${escapeHtml(formatDate(expense.date))}</td>
          <td>${escapeHtml(expense.description || 'Unspecified expense')}</td>
          <td>${escapeHtml(expense.category || 'Other')}</td>
          <td class="money">${amount(expense.amount)}</td>
        </tr>
      `)
      .join(''),
  );

  const logo = branding.logoDataUrl
    ? documentLogoHtml(branding, 72, 72, `${SCHOOL_INFO.name} logo`)
    : `<div class="logo-fallback">${escapeHtml(SCHOOL_INFO.name.split(' ').slice(0, 3).join(' '))}</div>`;

  const balanceClass = data.netBalance >= 0 ? 'positive' : 'negative';
  const renderHeader = (title: string) => `
    <div class="header">
      <div class="logo">${logo}</div>
      <div class="school">
        <div class="school-name">${escapeHtml(SCHOOL_INFO.name)}</div>
        <div class="school-meta">${escapeHtml(SCHOOL_INFO.address)}<br/>Contact: ${escapeHtml(SCHOOL_INFO.contact)} · ${escapeHtml(SCHOOL_INFO.email)}</div>
      </div>
      <div class="report-meta">
        <div class="report-label">School Finance</div>
        <div class="report-title">${escapeHtml(title)}</div>
        <div class="report-period">${escapeHtml(data.periodLabel)}<br/>${escapeHtml(data.rangeLabel)}</div>
      </div>
    </div>`;

  const expenseDetailPages = expensePageRows.length > 0
    ? expensePageRows.map((rows, index) => `
      <div class="page expense-detail-page">
        ${renderHeader(index === 0 ? 'Expense Details' : 'Expense Details · Continued')}
        <div class="section">
          <div class="section-title">
            <span>Expense details</span>
            <span class="section-total">Page ${index + 2} of ${expensePageRows.length + 1}</span>
          </div>
          <table>
            <thead><tr><th class="date">Date</th><th>Description</th><th>Category</th><th class="money">Amount</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="footer">
          <span>Generated from School Finance</span>
          <span>${escapeHtml(new Date().toISOString().split('T')[0])}</span>
        </div>
      </div>
    `).join('')
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    * { box-sizing: border-box; }
    @page { size: A4 portrait; margin: 10mm; }
    html, body { margin: 0; padding: 0; background: #f4f7fb; color: #17233d; font-family: Arial, sans-serif; }
    body { font-size: 11px; }
    .page { width: 100%; max-width: 760px; margin: 0 auto; padding: 24px; background: #fff; border-top: 8px solid #0b2b55; page-break-after: always; break-after: page; }
    .page:not(:first-child) { padding: 0 12px; }
    .page:last-child { page-break-after: auto; break-after: auto; }
    .header { display: flex; align-items: center; gap: 16px; padding-bottom: 15px; border-bottom: 2px solid #d9a832; }
    .logo { width: 72px; height: 72px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
    .logo img { max-width: 72px; max-height: 72px; object-fit: contain; }
    .logo-fallback { width: 72px; height: 72px; border-radius: 50%; background: #0b2b55; color: #f6c65b; display: flex; align-items: center; justify-content: center; padding: 8px; text-align: center; font-size: 9px; font-weight: 800; line-height: 1.15; }
    .school { flex: 1; }
    .school-name { color: #0b2b55; font-size: 18px; line-height: 1.2; font-weight: 900; }
    .school-meta { color: #66758a; font-size: 9px; margin-top: 5px; line-height: 1.5; }
    .report-meta { min-width: 130px; text-align: right; }
    .report-label { color: #b48627; font-size: 9px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; }
    .report-title { color: #0b2b55; font-size: 17px; font-weight: 900; margin-top: 4px; }
    .report-period { color: #66758a; font-size: 9px; margin-top: 6px; }
    .summary { display: grid; grid-template-columns: repeat(2, 1fr); gap: 9px; margin: 18px 0; }
    .summary-card { border: 1px solid #d8e1ee; border-radius: 8px; padding: 11px; background: #f8fafd; }
    .summary-label { color: #66758a; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; }
    .summary-value { font-size: 18px; font-weight: 900; margin-top: 6px; }
    .fees { color: #087443; }
    .salary { color: #6d4ab5; }
    .expenses { color: #c5374a; }
    .positive { color: #0b5aa2; }
    .negative { color: #c5374a; }
    .summary-note { color: #7b899b; font-size: 9px; margin-top: 4px; }
    .section { margin-top: 16px; }
    .section-title { display: flex; justify-content: space-between; align-items: baseline; color: #0b2b55; font-size: 12px; font-weight: 900; padding-bottom: 7px; border-bottom: 2px solid #0b2b55; }
    .section-total { color: #66758a; font-size: 10px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-top: 5px; }
    th { background: #edf2f8; color: #0b2b55; font-size: 9px; font-weight: 800; text-align: left; padding: 7px 8px; }
    td { border-bottom: 1px solid #e7edf5; padding: 7px 8px; font-size: 10px; }
    tr:last-child td { border-bottom: none; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    .count { width: 70px; text-align: center; color: #66758a; }
    .money { width: 125px; text-align: right; font-weight: 800; white-space: nowrap; }
    .date { width: 100px; white-space: nowrap; color: #66758a; }
    .empty { color: #8a98aa; text-align: center; padding: 13px; font-style: italic; }
    .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #d8e1ee; color: #7b899b; font-size: 9px; display: flex; justify-content: space-between; }
  </style>
</head>
<body class="financial-report">
  <div class="page">
    ${renderHeader('Financial Report')}

    <div class="summary">
      <div class="summary-card">
        <div class="summary-label">Total fee collected</div>
        <div class="summary-value fees">${amount(data.totalFees)}</div>
        <div class="summary-note">${data.feeRecords.length} collection${data.feeRecords.length === 1 ? '' : 's'}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Total salary paid</div>
        <div class="summary-value salary">${amount(data.totalSalaryPaid)}</div>
        <div class="summary-note">${data.salaryRecords.filter(record => record.status === 'paid').length} paid record${data.salaryRecords.filter(record => record.status === 'paid').length === 1 ? '' : 's'}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Total expenses</div>
        <div class="summary-value expenses">${amount(data.totalExpenses)}</div>
        <div class="summary-note">${data.expenses.length} expense${data.expenses.length === 1 ? '' : 's'}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Net balance</div>
        <div class="summary-value ${balanceClass}">${amount(data.netBalance)}</div>
        <div class="summary-note">${amount(data.totalSalaryPending)} salary pending</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title"><span>Fee collection breakdown</span><span class="section-total">${amount(data.totalFees)}</span></div>
      <table>
        <thead><tr><th>Fee type</th><th class="count">Entries</th><th class="money">Collected</th></tr></thead>
        <tbody>${feeRows || emptyRow('No fee collections for this period', 3)}</tbody>
      </table>
    </div>

    <div class="section">
      <div class="section-title"><span>Salary paid breakdown</span><span class="section-total">${amount(data.totalSalaryPaid)}</span></div>
      <table>
        <thead><tr><th>Teacher</th><th class="count">Records</th><th class="money">Paid</th></tr></thead>
        <tbody>${salaryRows || emptyRow('No salary payments for this period', 3)}</tbody>
      </table>
    </div>

    <div class="section">
      <div class="section-title"><span>Expense breakdown</span><span class="section-total">${amount(data.totalExpenses)}</span></div>
      <table>
        <thead><tr><th>Category</th><th class="count">Entries</th><th class="money">Spent</th></tr></thead>
        <tbody>${expenseRows || emptyRow('No expenses for this period', 3)}</tbody>
      </table>
    </div>

    <div class="section">
      <div class="section-title"><span>Expense details</span><span class="section-total">${data.expenses.length} item${data.expenses.length === 1 ? '' : 's'}</span></div>
      <table>
        <thead><tr><th class="date">Date</th><th>Description</th><th>Category</th><th class="money">Amount</th></tr></thead>
        <tbody>${data.expenses.length > 0
          ? `${summaryExpenseRows}${remainingExpenses.length > 0
            ? `<tr><td class="empty" colspan="4">${remainingExpenses.length} more expense${remainingExpenses.length === 1 ? '' : 's'} continue on the following page${expensePageRows.length === 1 ? '' : 's'}.</td></tr>`
            : ''}`
          : emptyRow('No expense details for this period', 4)}</tbody>
      </table>
    </div>

    <div class="footer">
      <span>Generated from School Finance</span>
      <span>${escapeHtml(new Date().toISOString().split('T')[0])}</span>
    </div>
  </div>
  ${expenseDetailPages}
</body>
</html>`;
}