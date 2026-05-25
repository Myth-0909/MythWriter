const INJECTION_PATTERNS = [
  /ignore\s*(all\s*)?(previous|above|prior)\s*instructions?/i,
  /忽略\s*(所有|之前的|上面的)?\s*指令/i,
  /system\s*prompt/i,
  /系统\s*提示/,
  /你的\s*(指令|提示词|prompt)/i,
  /tell\s*me\s*your\s*(instructions?|prompt)/i,
  /repeat\s*(the\s*)?(above|previous|system)/i,
  /DAN\s*mode/i,
  /jailbreak/i,
  /越狱/,
  /假装|扮演.*角色.*不要.*助手/,
  /pretend.*you.*are.*not/i,
  /你是.*GPT/,
  /输出.*你的.*(指令|prompt|设定)/,
  /show\s*me\s*your\s*(instructions?|prompt|config)/i,
  /what\s*(are|were)\s*you\s*(programmed|told|instructed)/i,
];

export function detectInjection(content: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(content));
}

const DELETE_KEYWORDS = ["删除", "删掉", "移除", "清空", "delete", "remove", "clear", "erase", "trash"];

export function detectDeleteCommand(content: string): boolean {
  return DELETE_KEYWORDS.some((kw) => content.includes(kw));
}
