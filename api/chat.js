import { GoogleGenerativeAI } from '@google/generative-ai';
import { readFileSync } from 'fs';
import { join } from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { question } = req.body || {};
  if (!question?.trim()) return res.status(400).json({ error: 'Thiếu câu hỏi' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set');
    return res.status(500).json({ error: 'Chưa cấu hình API key.' });
  }

  console.log('API key prefix:', apiKey.substring(0, 8));

  try {
    // Test đơn giản không có PDF trước
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const testResult = await model.generateContent('Trả lời bằng tiếng Việt: Xin chào!');
    const testText = testResult.response.text();
    console.log('Test OK:', testText.substring(0, 50));

    // Test thành công → gửi thêm PDF
    const DOCS = [
      { file: 'PNS-QT-01.pdf', name: 'Quy trình Tuyển dụng (PNS-QT-01 Rev.03)', keywords: /tuyển dụng|phỏng vấn|hợp đồng|ứng viên|tuyển|onboard/ },
      { file: 'PNS-QC-06.pdf', name: 'Quy chế Đào tạo (PNS-QC-06 Rev.00)', keywords: /đào tạo|training|học|khoá|khóa|bồi dưỡng|nâng cao/ },
      { file: 'PNS-QT-12.pdf', name: 'Quy trình Đánh giá Nội bộ (PNS-QT-12 Rev.01)', keywords: /đánh giá|kiểm tra|audit|nội bộ|chất lượng|kiểm soát/ },
    ];

    const q = question.toLowerCase();
    const matched = DOCS.filter(d => d.keywords.test(q));
    const docsToSend = matched.length > 0 ? matched : [DOCS[0]]; // fallback 1 file

    const parts = [
      { text: `Bạn là trợ lý AI nội bộ công ty Đại Việt. Trả lời ngắn gọn bằng tiếng Việt dựa trên tài liệu đính kèm.\n\nCâu hỏi: ${question}` }
    ];

    for (const doc of docsToSend) {
      const pdfPath = join(process.cwd(), 'public', 'docs', doc.file);
      const pdfData = readFileSync(pdfPath).toString('base64');
      parts.push({ text: `--- ${doc.name} ---` });
      parts.push({ inlineData: { mimeType: 'application/pdf', data: pdfData } });
    }

    const result = await model.generateContent(parts);
    res.json({ answer: result.response.text() });

  } catch (err) {
    const msg = err?.message || String(err);
    console.error('Full error:', msg);

    if (msg.includes('API_KEY_INVALID') || msg.includes('400') || msg.includes('API key'))
      return res.status(500).json({ error: '❌ API key không hợp lệ. Kiểm tra lại GEMINI_API_KEY trong Vercel.' });
    if (msg.includes('403'))
      return res.status(500).json({ error: '❌ API key bị từ chối. Cần bật Gemini API trong Google Cloud.' });
    if (msg.includes('429'))
      return res.status(500).json({ error: '⏳ Đã đạt giới hạn, thử lại sau vài phút.' });

    res.status(500).json({ error: `Lỗi: ${msg.substring(0, 100)}` });
  }
}
