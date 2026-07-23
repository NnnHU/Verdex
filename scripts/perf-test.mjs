/**
 * 真实 API 耗时对比测试：单次 Extract vs Map-Reduce
 * 用硅基流动 DeepSeek-V3，测真实场景下的速度差异。
 *
 * 用法: node scripts/perf-test.mjs
 * (走 10808 代理)
 *
 * 测试矩阵:
 *   - 5 份文档 (g1-g5, ~5.3万字符): 单次 vs Map-Reduce
 *   - 7 份文档 (g1-g7, ~7.4万字符): 单次 vs Map-Reduce
 *   - 3 份大文件 (F-big1/2/3, ~9.7万字符): 单次 vs Map-Reduce
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = join(__dirname, "..", "..", "test-samples");

const BASE_URL = "https://api.siliconflow.cn/v1";
const API_KEY = "sk-nhnspnlphcljnmzwxftciuqdswicgoadjqegelqssmzoncse";
const MODEL = "deepseek-ai/DeepSeek-V3";

const SCHEMA_PROMPT = `你是抽取引擎。阅读源材料,抽取思维模型、因果链、交易模型的结构化库。
输出 JSON 对象,含这些顶层键:
  "思维模型": 对象数组,每项 {"名称":..., "定义":..., "关键数据":{}, "应用规则":...};
  "因果链": 对象数组,每项 {"名称":..., "链条":..., "关键节点":{}};
  "交易模型": 对象数组,每项 {"名称":..., "操作":..., "案例":...}。
只输出 JSON,不要解释。`;

const REDUCE_PROMPT = `把以下各文档的抽取结果合并、去重、归纳成一份完整的 JSON 对象(结构同原 schema)。
保留所有不重复的条目,互补的细节合并,不要遗漏。只输出 JSON,不要解释。`;

function readDoc(name) {
  const text = readFileSync(join(SAMPLES_DIR, name), "utf-8");
  return { name, text, chars: text.length };
}

async function callAPI(systemPrompt, userPrompt, label) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 8192,
        stream: false,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    return { ok: true, content, elapsed, tokens: data.usage };
  } catch (e) {
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    return { ok: false, error: e.message, elapsed };
  }
}

/** 单次 Extract: 所有文档拼一起,一次调用 */
async function singleExtract(docs, question) {
  const corpus = docs.map((d) => `【文档: ${d.name}】\n${d.text}`).join("\n\n");
  const userPrompt = `${corpus}\n\n${question}`;
  return callAPI(SCHEMA_PROMPT, userPrompt, "single");
}

/** Map-Reduce: 每份并行 Map, 再 Reduce 合并 */
async function mapReduce(docs, question) {
  const t0 = Date.now();
  // Phase Map: 并行
  const mapStart = Date.now();
  const mapPromises = docs.map((d) => {
    const userPrompt = `【文档: ${d.name}】\n${d.text}\n\n${question}`;
    return callAPI(SCHEMA_PROMPT, userPrompt, `map-${d.name}`);
  });
  const mapResults = await Promise.all(mapPromises);
  const mapElapsed = ((Date.now() - mapStart) / 1000).toFixed(1);

  const okMaps = mapResults.filter((r) => r.ok);
  if (okMaps.length === 0) {
    return { ok: false, error: "all maps failed", elapsed: ((Date.now() - t0) / 1000).toFixed(1) };
  }

  // Phase Reduce: 合并
  const reduceStart = Date.now();
  const mergedBlock = okMaps
    .map((r, i) => `### 文档${i + 1}\n\`\`\`json\n${r.content}\n\`\`\``)
    .join("\n\n");
  const reduceResult = await callAPI(
    SCHEMA_PROMPT.replace("{PANELS}", mergedBlock),
    `${question}\n\n${REDUCE_PROMPT}\n\n${mergedBlock}`,
    "reduce"
  );
  const reduceElapsed = ((Date.now() - reduceStart) / 1000).toFixed(1);
  const totalElapsed = ((Date.now() - t0) / 1000).toFixed(1);

  return {
    ok: reduceResult.ok,
    mapElapsed,
    reduceElapsed,
    totalElapsed,
    mapSuccess: okMaps.length,
    mapTotal: docs.length,
  };
}

async function runCombo(name, docFiles, question) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`组合: ${name}`);
  console.log(`${"=".repeat(60)}`);
  const docs = docFiles.map(readDoc);
  const totalChars = docs.reduce((s, d) => s + d.chars, 0);
  console.log(`文档: ${docs.length} 份, 共 ${totalChars.toLocaleString()} 字符`);

  // 单次 Extract
  console.log(`\n[1/2] 单次 Extract...`);
  const single = await singleExtract(docs, question);
  if (single.ok) {
    console.log(`  ✅ 成功 | ${single.elapsed}s | ${single.content.length} 字符输出`);
  } else {
    console.log(`  ❌ 失败 | ${single.elapsed}s | ${single.error}`);
  }

  // Map-Reduce
  console.log(`\n[2/2] Map-Reduce...`);
  const mr = await mapReduce(docs, question);
  if (mr.ok) {
    console.log(`  ✅ 成功 | Map ${mr.mapElapsed}s + Reduce ${mr.reduceElapsed}s = 总 ${mr.totalElapsed}s`);
    console.log(`         | Map 成功 ${mr.mapSuccess}/${mr.mapTotal}`);
  } else {
    console.log(`  ❌ 失败 | ${mr.totalElapsed}s | ${mr.error ?? "reduce failed"}`);
  }

  // 对比
  console.log(`\n📊 对比:`);
  if (single.ok && mr.ok) {
    const diff = (parseFloat(mr.totalElapsed) - parseFloat(single.elapsed)).toFixed(1);
    const faster = parseFloat(mr.totalElapsed) < parseFloat(single.elapsed) ? "Map-Reduce 更快" : "单次更快";
    console.log(`  单次 ${single.elapsed}s vs Map-Reduce ${mr.totalElapsed}s → ${faster} (差 ${Math.abs(diff)}s)`);
  }
}

async function main() {
  const question = "提取思维模型、因果链、交易模型";

  console.log("Verdex 性能测试: 单次 Extract vs Map-Reduce");
  console.log(`API: ${MODEL} @ SiliconFlow`);
  console.log(`时间: ${new Date().toISOString()}`);

  // 组合 C: 5 份 (~5.3万)
  await runCombo("C: 5 份 × ~1万 (共 ~5.3万)", ["g1.txt", "g2.txt", "g3.txt", "g4.txt", "g5.txt"], question);

  // 组合 D: 7 份 (~7.4万)
  await runCombo("D: 7 份 × ~1万 (共 ~7.4万)", ["g1.txt", "g2.txt", "g3.txt", "g4.txt", "g5.txt", "g6.txt", "g7.txt"], question);

  // 组合 F: 3 份大文件 (~9.7万)
  await runCombo("F: 3 份 × ~3万 (共 ~9.7万)", ["F-big1.txt", "F-big2.txt", "F-big3.txt"], question);

  console.log(`\n${"=".repeat(60)}`);
  console.log("测试完成");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
