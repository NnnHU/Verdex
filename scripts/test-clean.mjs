/** 测试 cleanText 是否能正常工作（真实 API 调用） */
import { readFileSync } from "fs";

const BASE_URL = "https://api.siliconflow.cn/v1";
const API_KEY = "sk-nhnspnlphcljnmzwxftciuqdswicgoadjqegelqssmzoncse";
const MODEL = "deepseek-ai/DeepSeek-V3";

// 读一份格兰瑟姆 txt 的前 2000 字（够测清洗）
const text = readFileSync("C:/Users/k/Documents/project/no/lufei/test-samples/g1.txt", "utf-8").slice(0, 2000);

const sysPrompt = [
  "你是语音转文字(ASR)文本清洗器。修正常见的语音识别错误,只做以下几类修正:",
  "1. 实体名归一化: 同一人名/地名/机构名的不同误写统一成正确写法",
  "2. 数字修正: 明显的数字识别错误",
  "3. 明显错别字: 同音/近音导致的明显错误",
  "严格要求: 只修正错误,不要改写句意,不确定的保留原文,直接输出清洗后的全文",
].join("\n");

console.log("调用清洗 API...");
const t0 = Date.now();
try {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: sysPrompt },
        { role: "user", content: text },
      ],
      temperature: 0.1,
      max_tokens: 4096,
      stream: false,
    }),
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  if (!res.ok) {
    console.log(`❌ HTTP ${res.status} @ ${elapsed}s`);
    console.log((await res.text()).slice(0, 300));
    process.exit(1);
  }
  const data = await res.json();
  const cleaned = data.choices?.[0]?.message?.content ?? "";
  console.log(`✅ 成功 @ ${elapsed}s, 输出 ${cleaned.length} 字符`);
  console.log("\n=== 原文前 200 字 ===");
  console.log(text.slice(0, 200));
  console.log("\n=== 清洗后前 200 字 ===");
  console.log(cleaned.slice(0, 200));
} catch (e) {
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`❌ 异常 @ ${elapsed}s: ${e.message}`);
}
