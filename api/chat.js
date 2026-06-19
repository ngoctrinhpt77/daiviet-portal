import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join } from 'path';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DOCS = [
  { file: 'PNS-QT-01.pdf', name: 'Quy trình Tuyển dụng (PNS-QT-01 Rev.03)' },
  { file: 'PNS-QC-06.pdf', name: 'Quy chế Đào tạo (PNS-QC-06 Rev.00)' },
  { file: 'PNS-QT-12.pdf', name: 'Quy trình Đánh giá Nội bộ (PNS-QT-12 Rev.01)' },
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { question } = req.body;
  if (!question?.trim()) return res.status(400).json({ error: 'Thiếu câu hỏi' });

  try {
    const content = [];

    for (const doc of DOCS) {
      const pdfPath = join(process.cwd(), 'public', 'docs', doc.file);
      const pdfData = readFileSync(pdfPath).toString('base64');
      content.push({
        type: 'text',
        text: `--- Tài liệu: ${doc.name} ---`,
      });
      content.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: pdfData,
        },
      });
    }

    content.push({
      type: 'text',
      text: `Câu hỏi của nhân viên: ${question}`,
    });

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: `Bạn là trợ lý hỏi đáp nội bộ của công ty Đại Việt.
Nhiệm vụ: trả lời câu hỏi của nhân viên dựa trên các tài liệu quy trình và quy chế được cung cấp.
Quy tắc:
- Chỉ trả lời dựa trên nội dung tài liệu. Nếu không tìm thấy thông tin, nói rõ là không có trong tài liệu.
- Trả lời ngắn gọn, rõ ràng bằng tiếng Việt.
- Trích dẫn tên tài liệu và mục cụ thể nếu có thể.
- Thân thiện với nhân viên mới.`,
      messages: [{ role: 'user', content }],
    });

    res.json({ answer: message.content[0].text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi hệ thống, vui lòng thử lại.' });
  }
}
