import { GoogleGenerativeAI } from '@google/generative-ai';
import { readFileSync } from 'fs';
import { join } from 'path';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const DOCS = [
  { file: 'PNS-QT-01.pdf', name: 'Quy trình Tuyển dụng (PNS-QT-01 Rev.03)' },
  { file: 'PNS-QC-06.pdf', name: 'Quy chế Đào tạo (PNS-QC-06 Rev.00)' },
  { file: 'PNS-QT-12.pdf', name: 'Quy trình Đánh giá Nội bộ (PNS-QT-12 Rev.01)' },
];

const SYSTEM_PROMPT = `Bạn là trợ lý hỏi đáp nội bộ của công ty Đại Việt.
Trả lời câu hỏi của nhân viên dựa trên nội dung các tài liệu đính kèm.
Quy tắc:
- Chỉ trả lời dựa trên tài liệu. Nếu không có thông tin, nói rõ.
- Ngắn gọn, rõ ràng, bằng tiếng Việt.
- Trích dẫn tên tài liệu nếu có thể.
- Thân thiện với nhân viên mới.`;

// Chọn tài liệu liên quan dựa trên từ khóa trong câu hỏi
function selectDocs(question) {
  const q = question.toLowerCase();
  const selected = [];

  if (q.match(/tuyển dụng|phỏng vấn|hợp đồng|ứng viên|tuyển|onboard|nhận việc/))
    selected.push(DOCS[0]);
  if (q.match(/đào tạo|training|học|khoá|khóa|bồi dưỡng|nâng cao|kỹ năng/))
    selected.push(DOCS[1]);
  if (q.match(/đánh giá|kiểm tra|audit|nội bộ|chất lượng|kiểm soát|báo cáo/))
    selected.push(DOCS[2]);

  // Nếu không khớp từ khóa nào → gửi tất cả (nhưng giới hạn 1 file để tránh quá tải)
  return selected.length > 0 ? selected : [DOCS[0], DOCS[1], DOCS[2]];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { question } = req.body || {};
  if (!question?.trim()) return res.status(400).json({ error: 'Thiếu câu hỏi' });

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Chưa cấu hình API key. Vui lòng liên hệ quản trị viên.' });
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const docsToSend = selectDocs(question);

    const parts = [{ text: SYSTEM_PROMPT + '\n\nCâu hỏi: ' + question }];

    for (const doc of docsToSend) {
      const pdfPath = join(process.cwd(), 'public', 'docs', doc.file);
      const pdfData = readFileSync(pdfPath).toString('base64');
      parts.push({ text: `--- ${doc.name} ---` });
      parts.push({ inlineData: { mimeType: 'application/pdf', data: pdfData } });
    }

    const result = await model.generateContent(parts);
    const answer = result.response.text();

    res.json({ answer });
  } catch (err) {
    console.error('Chat error:', err?.message || err);
    const msg = err?.message || '';
    if (msg.includes('API_KEY') || msg.includes('403'))
      return res.status(500).json({ error: 'API key không hợp lệ. Vui lòng liên hệ quản trị viên.' });
    if (msg.includes('quota') || msg.includes('429'))
      return res.status(500).json({ error: 'Đã đạt giới hạn câu hỏi, vui lòng thử lại sau vài phút.' });
    res.status(500).json({ error: 'Lỗi hệ thống, vui lòng thử lại.' });
  }
}
