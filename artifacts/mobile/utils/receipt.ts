import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform, Alert, Linking, Image } from 'react-native';
import { SCHOOL_INFO } from '@/constants/schoolInfo';
import { DocumentBranding, FeeRecord, SalaryRecord, Student, Teacher } from '@/context/AppContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(dateStr: string): string {
  const months = ['January','February','March','April','May','June','July',
    'August','September','October','November','December'];
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatMonth(dateStr: string): string {
  const months = ['January','February','March','April','May','June','July',
    'August','September','October','November','December'];
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function toWords(num: number): string {
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
    'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  if (num === 0) return 'Zero Rupees Only';
  const convert = (n: number): string => {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? ' '+ones[n%10] : '');
    if (n < 1000) return ones[Math.floor(n/100)]+' Hundred'+(n%100 ? ' '+convert(n%100) : '');
    if (n < 100000) return convert(Math.floor(n/1000))+' Thousand'+(n%1000 ? ' '+convert(n%1000) : '');
    if (n < 10000000) return convert(Math.floor(n/100000))+' Lakh'+(n%100000 ? ' '+convert(n%100000) : '');
    return convert(Math.floor(n/10000000))+' Crore'+(n%10000000 ? ' '+convert(n%10000000) : '');
  };
  return convert(Math.round(num)) + ' Rupees Only';
}

function schoolLogoHtml(branding?: DocumentBranding, size = 74): string {
  const source = branding?.logoDataUrl
    ? null
    : Image.resolveAssetSource(require('../assets/images/school-logo.png'));
  const uri = branding?.logoDataUrl ?? source?.uri ?? '';
  return uri
    ? `<img src="${uri}" alt="${SCHOOL_INFO.name} logo" width="${size}" height="${size}" style="width:${size}px;height:${size}px;object-fit:contain;display:block" />`
    : `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#0b2b55;color:#f6c65b;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;text-align:center;line-height:1.15">${SCHOOL_INFO.name.split(' ').slice(0, 3).join(' ')}</div>`;
}

// ─── Fee Receipt HTML ─────────────────────────────────────────────────────────
function buildFeeReceiptHTML(record: FeeRecord, student?: Student, branding?: DocumentBranding): string {
  const receiptNo = record.receiptNumber ?? ('FR-'+new Date().getFullYear()+'-'+String(Math.abs(record.id.split('').reduce((a,c)=>a+c.charCodeAt(0),0))).slice(-6).padStart(6,'0'));
  const dateStr  = formatDate(record.date || new Date().toISOString().split('T')[0]);
  const monthStr = formatMonth(record.date || new Date().toISOString().split('T')[0]);
  const amtWords = toWords(record.amount);
  const fatherName = student?.fatherName ?? '—';
  const rollNo = student?.rollNumber ?? '—';
  const amtFmt = record.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 });

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
@page { size:A4 portrait; margin:12mm; }
body { font-family:Arial,sans-serif; background:#f4f7fb; color:#17233d; font-size:13px; }
.page { max-width:760px; margin:0 auto; padding:24px 22px; background:#fff; border-top:8px solid #0b2b55; border-bottom:1px solid #d8e1ee; }
.eyebrow { color:#b48627; font-size:9px; font-weight:800; letter-spacing:2px; text-transform:uppercase; margin-bottom:5px; }
.rule { height:3px; background:linear-gradient(90deg,#0b2b55 0%,#0b2b55 78%,#d9a832 78%,#d9a832 100%); margin-top:15px; }

.hdr { display:flex; align-items:center; gap:16px; padding-bottom:16px; }
.logo-wrap { width:88px; height:88px; flex-shrink:0; display:flex; align-items:center; justify-content:center; border-radius:50%; overflow:hidden; background:#fff; }
.school-info { flex:1; }
.sch-name { font-size:20px; font-weight:900; color:#0b2b55; text-transform:uppercase; line-height:1.2; letter-spacing:.2px; }
.sch-row { display:flex; align-items:center; gap:7px; margin-top:6px; font-size:10.5px; color:#59677c; }
.sch-icon { color:#b48627; font-size:11px; width:14px; text-align:center; }
.rhs { flex-shrink:0; min-width:170px; text-align:right; }
.rhs-title { color:#0b2b55; font-size:22px; font-weight:900; letter-spacing:1px; margin-bottom:9px; }
.meta-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px; text-align:center; }
.meta-box { border:1px solid #d7e1ee; border-radius:5px; overflow:hidden; }
.meta-label { background:#0b2b55; color:#fff; font-size:8px; font-weight:800; padding:5px 4px; letter-spacing:.8px; }
.meta-value { color:#17233d; font-size:10px; font-weight:700; padding:6px 4px; white-space:nowrap; }

.section-kicker { color:#738197; font-size:9px; font-weight:800; letter-spacing:1.5px; text-transform:uppercase; margin-bottom:8px; }
.stu-card { border:1px solid #d8e1ee; border-radius:9px; display:flex; align-items:center; gap:16px; padding:15px 17px; margin:18px 0; background:#f8fafd; }
.stu-avatar { width:62px; height:62px; border-radius:50%; background:linear-gradient(145deg,#d9a832,#0b2b55); flex-shrink:0; display:flex; align-items:center; justify-content:center; color:#fff; font-size:25px; font-weight:800; }
.stu-fields { flex:1; }
.f-row { display:flex; font-size:11.5px; margin-bottom:6px; }
.f-row:last-child { margin-bottom:0; }
.f-lbl { font-weight:800; color:#65748a; width:116px; flex-shrink:0; text-transform:uppercase; font-size:9px; letter-spacing:.3px; }
.f-sep { margin:0 7px; color:#b48627; }
.f-val { color:#17233d; font-weight:700; }
.rupee-circle { width:52px; height:52px; border-radius:50%; border:2px solid #d9a832; display:flex; align-items:center; justify-content:center; font-size:22px; font-weight:800; color:#0b2b55; background:#fff; flex-shrink:0; }
.mo-box { flex-shrink:0; min-width:104px; text-align:center; }
.mo-lbl { background:#d9a832; color:#0b2b55; font-size:8px; font-weight:900; padding:5px 0; letter-spacing:1px; }
.mo-val { border:1px solid #d9a832; border-top:none; font-size:10.5px; font-weight:700; padding:7px 6px; color:#17233d; }

.fee-tbl { width:100%; border-collapse:separate; border-spacing:0; overflow:hidden; border:1px solid #d8e1ee; border-radius:8px; }
.fee-tbl .sec-hdr th { background:#0b2b55; color:#fff; text-align:left; font-size:11px; font-weight:800; letter-spacing:1.8px; padding:10px 13px; }
.fee-tbl .col-hdr th { background:#edf2f8; color:#0b2b55; font-size:10px; font-weight:800; padding:8px 10px; border-bottom:1px solid #d8e1ee; }
.fee-tbl .col-hdr th:first-child { text-align:center; width:50px; }
.fee-tbl .col-hdr th:nth-child(3), .fee-tbl .col-hdr th:nth-child(4) { text-align:right; width:130px; }
.fee-tbl td { border-bottom:1px solid #e7edf5; padding:10px; font-size:11.5px; }
.fee-tbl tr:last-child td { border-bottom:none; }
.fee-tbl td:first-child { text-align:center; color:#738197; }
.fee-tbl td:nth-child(3), .fee-tbl td:nth-child(4) { text-align:right; }
.words-cell { padding:11px 12px !important; }
.words-lbl { font-size:9px; color:#738197; margin-bottom:4px; text-transform:uppercase; letter-spacing:.6px; }
.words-val { font-weight:800; font-size:12px; color:#17233d; }
.total-wrap { display:flex; height:100%; }
.total-lbl { background:#d9a832; color:#0b2b55; font-size:9px; font-weight:900; padding:11px 10px; display:flex; align-items:center; letter-spacing:.4px; white-space:nowrap; }
.total-amt { background:#e8f5ee; color:#087443; font-size:16px; font-weight:900; padding:11px 13px; display:flex; align-items:center; flex:1; justify-content:flex-end; }

.bottom { display:flex; gap:12px; margin-top:15px; }
.b-box { flex:1; border:1px solid #d8e1ee; border-radius:8px; overflow:hidden; }
.b-hdr { display:flex; align-items:center; gap:8px; padding:9px 12px; background:#f8fafd; border-bottom:1px solid #e4ebf4; }
.b-icon { width:22px; height:22px; border-radius:50%; background:#e5edf7; color:#0b2b55; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:900; }
.b-title-green, .b-title-blue { color:#0b2b55; font-size:10px; font-weight:900; letter-spacing:.8px; }
.b-body { padding:10px 12px 12px; }
.p-row { display:flex; font-size:10.5px; margin-bottom:6px; }
.p-row:last-child { margin-bottom:0; }
.p-lbl { font-weight:700; color:#738197; width:102px; flex-shrink:0; }
.p-sep { margin:0 5px; color:#b48627; }
.p-val { color:#17233d; font-weight:600; }
.note { font-size:10px; color:#526176; margin-bottom:6px; display:flex; gap:6px; }
.note:last-child { margin-bottom:0; }
.note-dot { color:#b48627; flex-shrink:0; font-weight:900; }

.sig-row { display:flex; justify-content:space-between; align-items:flex-end; margin-top:30px; padding-top:17px; border-top:1px solid #d8e1ee; }
.sig-col { text-align:center; min-width:150px; }
.sig-name { font-size:12px; font-style:italic; font-weight:700; color:#17233d; margin-bottom:3px; }
.sig-line { width:140px; border-top:1.5px solid #526176; margin:0 auto 6px; }
.sig-lbl { font-size:9px; color:#738197; margin-top:4px; text-transform:uppercase; letter-spacing:.4px; }
.stamp-ring { width:76px; height:76px; border-radius:50%; border:2px dashed #d9a832; display:flex; align-items:center; justify-content:center; margin:0 auto; }
.stamp-inner { width:65px; height:65px; border-radius:50%; border:1px solid #0b2b55; display:flex; align-items:center; justify-content:center; }
.stamp-txt { font-size:5px; font-weight:800; color:#0b2b55; text-transform:uppercase; text-align:center; line-height:1.35; }
.footer { text-align:center; margin-top:21px; padding-top:11px; border-top:1px solid #e2e9f2; color:#8a96a8; font-size:9px; line-height:1.5; }
.footer strong { color:#0b2b55; }
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="hdr">
    <div class="logo-wrap">${schoolLogoHtml(branding, 88)}</div>
    <div class="school-info">
      <div class="sch-name">${SCHOOL_INFO.name}</div>
      <div class="sch-row"><span class="sch-icon">📍</span><span>${SCHOOL_INFO.address}</span></div>
      <div class="sch-row"><span class="sch-icon">📞</span><span>Contact - ${SCHOOL_INFO.contact}</span></div>
      <div class="sch-row"><span class="sch-icon">✉</span><span>Email - ${SCHOOL_INFO.email}</span></div>
    </div>
    <div class="rhs">
      <div class="rhs-title">FEE RECEIPT</div>
      <div class="meta-grid">
        <div class="meta-box"><div class="meta-label">RECEIPT NO.</div><div class="meta-value">${receiptNo}</div></div>
        <div class="meta-box"><div class="meta-label">DATE</div><div class="meta-value">${dateStr}</div></div>
      </div>
    </div>
  </div>
  <div class="rule"></div>

  <!-- STUDENT CARD -->
  <div class="stu-card">
    <div class="stu-avatar">S</div>
    <div class="stu-fields">
      <div class="f-row"><span class="f-lbl">Student Name</span><span class="f-sep">:</span><span class="f-val">${record.studentName}</span></div>
      <div class="f-row"><span class="f-lbl">Father's Name</span><span class="f-sep">:</span><span class="f-val">${fatherName}</span></div>
      <div class="f-row"><span class="f-lbl">Class &amp; Section</span><span class="f-sep">:</span><span class="f-val">${record.class}</span></div>
      <div class="f-row"><span class="f-lbl">Roll No.</span><span class="f-sep">:</span><span class="f-val">${rollNo}</span></div>
    </div>
    <div class="rupee-circle">₹</div>
    <div class="mo-box">
      <div class="mo-lbl">MONTH</div>
      <div class="mo-val">${monthStr}</div>
    </div>
  </div>

  <!-- FEE DETAILS TABLE -->
  <table class="fee-tbl">
    <tr class="sec-hdr"><th colspan="4">FEE DETAILS</th></tr>
    <tr class="col-hdr">
      <th>S.No.</th>
      <th style="text-align:left;">Particulars</th>
      <th>Due Amount (₹)</th>
      <th>Paid Amount (₹)</th>
    </tr>
    <tr>
      <td>1</td>
      <td>${record.description || record.feeTypeName || 'Fee'}</td>
      <td>${amtFmt}</td>
      <td>${amtFmt}</td>
    </tr>
    <tr class="foot-row">
      <td colspan="2" class="words-cell">
        <div class="words-lbl">Amount in Words:</div>
        <div class="words-val">${amtWords}</div>
      </td>
      <td colspan="2" style="padding:0;border:1px solid #ddd;">
        <div class="total-wrap">
          <div class="total-lbl">TOTAL AMOUNT PAID</div>
          <div class="total-amt">₹ ${amtFmt}</div>
        </div>
      </td>
    </tr>
  </table>

  <!-- PAYMENT INFO + NOTES -->
  <div class="bottom">
    <div class="b-box">
      <div class="b-hdr">
        <span class="b-icon">₹</span>
        <span class="b-title-green">PAYMENT INFORMATION</span>
      </div>
      <div class="b-body">
        <div class="p-row"><span class="p-lbl">Payment Mode</span><span class="p-sep">:</span><span class="p-val">Cash</span></div>
        <div class="p-row"><span class="p-lbl">Payment Date</span><span class="p-sep">:</span><span class="p-val">${dateStr}</span></div>
        <div class="p-row"><span class="p-lbl">Received By</span><span class="p-sep">:</span><span class="p-val">${record.collectedBy ?? 'Admin'}</span></div>
      </div>
    </div>
    <div class="b-box">
      <div class="b-hdr">
        <span class="b-icon">i</span>
        <span class="b-title-blue">IMPORTANT NOTES</span>
      </div>
      <div class="b-body">
        <div class="note"><span class="note-dot">•</span><span>This receipt is computer generated.</span></div>
        <div class="note"><span class="note-dot">•</span><span>Fees once paid will not be refunded.</span></div>
        <div class="note"><span class="note-dot">•</span><span>Please keep this receipt for future reference.</span></div>
        <div class="note"><span class="note-dot">•</span><span>For any queries, contact the school office.</span></div>
      </div>
    </div>
  </div>

  <!-- SIGNATURES -->
  <div class="sig-row">
    <div class="sig-col">
      <div class="sig-name">${record.collectedBy ?? 'Admin'}</div>
      <div class="sig-line"></div>
      <div class="sig-lbl">Receiver's Signature</div>
    </div>
    <div class="sig-col">
      <div class="stamp-ring">
        <div class="stamp-inner">
          <div class="stamp-txt">DR. A.P.J<br/>ABDUL KALAM<br/>JATIYA<br/>VIDYALAYA<br/>BUNDURA</div>
        </div>
      </div>
    </div>
    <div class="sig-col">
      <div class="sig-line"></div>
      <div class="sig-lbl">Authorised Signature<br/>(Principal)</div>
    </div>
  </div>

  <div class="footer">
    <p>This is a computer-generated receipt.</p>
    <p><strong>${SCHOOL_INFO.name}</strong> · ${SCHOOL_INFO.email}</p>
  </div>

</div>
</body>
</html>`;
}

// ─── Public: Print / Share fee receipt as PDF ─────────────────────────────────
export async function printFeeReceipt(record: FeeRecord, student?: Student, branding?: DocumentBranding) {
  const html = buildFeeReceiptHTML(record, student, branding);
  await printOrShare(html, `FeeReceipt_${record.studentName.replace(/\s+/g,'_')}_${record.receiptNumber ?? record.id.slice(-6)}`);
}

// ─── Public: Share receipt via WhatsApp (text message) ───────────────────────
export async function shareReceiptWhatsApp(record: FeeRecord, student?: Student, branding?: DocumentBranding) {
  const receiptNo = record.receiptNumber ?? record.id.slice(-8).toUpperCase();
  const dateStr   = formatDate(record.date || new Date().toISOString().split('T')[0]);
  const monthStr  = formatMonth(record.date || new Date().toISOString().split('T')[0]);
  const amtWords  = toWords(record.amount);

  const text =
`🏫 *${SCHOOL_INFO.name}*
📍 ${SCHOOL_INFO.address}  |  📞 ${SCHOOL_INFO.contact}

🧾 *FEE RECEIPT*
━━━━━━━━━━━━━━━━━━━━
📋 Receipt No : *${receiptNo}*
📅 Date       : *${dateStr}*
━━━━━━━━━━━━━━━━━━━━

👤 *Student Details*
• Name    : ${record.studentName}
${student?.fatherName ? `• Father  : ${student.fatherName}` : ''}• Class   : ${record.class}
${student?.rollNumber  ? `• Roll No : ${student.rollNumber}` : ''}
💳 *Fee Details*
• Particulars : ${record.description || record.feeTypeName || 'Fee'}
• Month       : ${monthStr}
• Amount Paid : *₹${record.amount.toLocaleString('en-IN')}*
• In Words    : _${amtWords}_

✅ *Payment Received*
• Mode         : Cash
• Received By  : ${record.collectedBy ?? 'Admin'}
━━━━━━━━━━━━━━━━━━━━
_This is a computer generated receipt._
_${SCHOOL_INFO.email}_`;

  // https://wa.me works on all platforms — opens WhatsApp app on mobile,
  // web.whatsapp.com in browser, no manifest permissions required.
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert(
      'Could not open WhatsApp',
      'Share the PDF receipt instead?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Share PDF', onPress: () => printFeeReceipt(record, student, branding) },
      ]
    );
  }
}

// ─── Premium salary receipt ───────────────────────────────────────────────────
export async function printSalarySlip(record: SalaryRecord, teacher?: Teacher, branding?: DocumentBranding) {
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: A4 portrait; margin: 12mm; }
  body { font-family: Arial, sans-serif; color: #17233d; background: #f4f7fb; }
  .page { max-width: 760px; margin: 0 auto; padding: 24px 22px; background: #fff; border-top: 8px solid #0b2b55; border-bottom: 1px solid #d8e1ee; }
  .header { display: flex; align-items: center; gap: 16px; padding-bottom: 16px; }
  .logo-wrap { width: 88px; height: 88px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: 50%; overflow: hidden; background: #fff; }
  .school-copy { flex: 1; }
  .eyebrow { color: #b48627; font-size: 9px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 5px; }
  .school-name { font-size: 20px; font-weight: 900; color: #0b2b55; text-transform: uppercase; line-height: 1.2; }
  .school-sub { font-size: 10.5px; color: #59677c; margin-top: 7px; }
  .slip-title { color: #0b2b55; font-size: 22px; font-weight: 900; letter-spacing: 1px; text-align: right; white-space: nowrap; }
  .rule { height: 3px; background: linear-gradient(90deg,#0b2b55 0%,#0b2b55 78%,#d9a832 78%,#d9a832 100%); }
  .receipt-meta { display: flex; justify-content: space-between; align-items: center; margin: 14px 0 16px; padding: 10px 13px; border: 1px solid #d8e1ee; border-radius: 8px; background: #f8fafd; }
  .meta-label { color: #738197; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .8px; }
  .meta-value { color: #17233d; font-size: 12px; font-weight: 800; margin-top: 3px; }
  .paid-pill { color: #087443; background: #e8f5ee; border: 1px solid #b9e1ca; border-radius: 999px; padding: 6px 12px; font-size: 9px; font-weight: 900; letter-spacing: .7px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
  .info-box { border: 1px solid #d8e1ee; border-radius: 9px; padding: 13px 14px; background: #fff; }
  .info-box h3 { color: #0b2b55; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 2px solid #d9a832; }
  .info-row { display: flex; justify-content: space-between; gap: 12px; font-size: 11px; margin-bottom: 7px; }
  .info-row:last-child { margin-bottom: 0; }
  .info-label { color: #738197; }
  .info-value { font-weight: 700; color: #17233d; text-align: right; }
  .salary-section { background: linear-gradient(135deg, #0b2b55 0%, #124d83 100%); border-radius: 12px; padding: 26px 20px; text-align: center; margin: 6px 0 24px; position: relative; overflow: hidden; }
  .salary-section:after { content: ''; position: absolute; width: 180px; height: 180px; border: 1px solid rgba(217,168,50,.28); border-radius: 50%; right: -65px; top: -105px; }
  .salary-label { color: #d9a832; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.8px; margin-bottom: 7px; }
  .salary-value { color: #fff; font-size: 40px; font-weight: 900; letter-spacing: .5px; }
  .period { color: rgba(255,255,255,.76); font-size: 11px; margin-top: 7px; }
  .status-badge { display: inline-block; background: #18a66d; color: #fff; font-size: 9px; font-weight: 900; padding: 6px 15px; border-radius: 20px; margin-top: 12px; letter-spacing: .7px; }
  .closing { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; }
  .closing-box { border: 1px solid #d8e1ee; border-radius: 8px; padding: 12px 14px; background: #f8fafd; }
  .closing-label { color: #738197; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .7px; }
  .closing-value { color: #17233d; font-size: 11px; font-weight: 700; margin-top: 5px; }
  .footer { border-top: 1px solid #e2e9f2; padding-top: 13px; text-align: center; font-size: 9px; color: #8a96a8; line-height: 1.5; }
  .footer strong { color: #0b2b55; }
</style>
</head>
<body>
<div class="page">
<div class="header">
  <div class="logo-wrap">${schoolLogoHtml(branding, 88)}</div>
  <div class="school-copy">
    <div class="eyebrow">Official Salary Receipt</div>
    <div class="school-name">${SCHOOL_INFO.name}</div>
    <div class="school-sub">${SCHOOL_INFO.address} · ${SCHOOL_INFO.contact} · ${SCHOOL_INFO.email}</div>
  </div>
  <div class="slip-title">SALARY<br/>RECEIPT</div>
</div>
<div class="rule"></div>
<div class="receipt-meta">
  <div><div class="meta-label">Receipt number</div><div class="meta-value">${record.receiptNumber ?? '—'}</div></div>
  <div><div class="meta-label">Pay period</div><div class="meta-value">${record.month} ${record.year}</div></div>
  <div class="paid-pill">✓ PAID</div>
</div>
<div class="info-grid">
  <div class="info-box">
    <h3>Teacher Details</h3>
    <div class="info-row"><span class="info-label">Name</span><span class="info-value">${record.teacherName}</span></div>
    ${teacher ? `<div class="info-row"><span class="info-label">Subject</span><span class="info-value">${teacher.subject}</span></div>` : ''}
    ${teacher ? `<div class="info-row"><span class="info-label">Mobile</span><span class="info-value">${teacher.mobileNumber}</span></div>` : ''}
  </div>
  <div class="info-box">
    <h3>Pay Period</h3>
    <div class="info-row"><span class="info-label">Month</span><span class="info-value">${record.month} ${record.year}</span></div>
    <div class="info-row"><span class="info-label">Mode</span><span class="info-value">Cash / Bank Transfer</span></div>
    <div class="info-row"><span class="info-label">Status</span><span class="info-value" style="color:#059669;font-weight:700">PAID</span></div>
  </div>
</div>
<div class="salary-section">
  <div class="salary-label">Net salary paid</div>
  <div class="salary-value">₹${record.amount.toLocaleString('en-IN')}</div>
  <div class="period">Payment for ${record.month} ${record.year}</div>
  <div class="status-badge">PAYMENT RECEIVED</div>
</div>
<div class="closing">
  <div class="closing-box">
    <div class="closing-label">Payment date</div>
    <div class="closing-value">${record.paidDate ? formatDate(record.paidDate) : '—'}</div>
  </div>
  <div class="closing-box">
    <div class="closing-label">Payment status</div>
    <div class="closing-value">Salary payment completed successfully</div>
  </div>
</div>
<div class="footer">
  <p>This is a computer-generated salary receipt. No signature required.</p>
  <p><strong>${SCHOOL_INFO.name}</strong> · ${SCHOOL_INFO.email}</p>
</div>
</div>
</body>
</html>`;
  await printOrShare(html, `SalarySlip_${record.teacherName.replace(/\s+/g,'_')}_${record.month}_${record.year}`);
}

// ─── Internal: generate PDF and open share sheet / print dialog ───────────────
async function printOrShare(html: string, filename: string) {
  if (Platform.OS === 'web') {
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); win.print(); }
    return;
  }
  try {
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: filename, UTI: 'com.adobe.pdf' });
    } else {
      await Print.printAsync({ uri });
    }
  } catch {
    Alert.alert('Error', 'Could not generate receipt. Please try again.');
  }
}
