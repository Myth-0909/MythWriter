export type ChatIntentOptions = {
  hasManualReferences?: boolean;
};

const WRITE_EDIT_PATTERN =
  /改|修改|润色|重写|扩写|缩写|续写|删除|替换|插入|补充|总结|概括|解释|解读|什么意思|讲了什么|讲的是|校对|优化|整理|完善|更新|编辑|修订|patch|rewrite|edit|revise|polish|expand|summarize|continue|fix|update|insert|append|replace|delete|improve|outline|explain|mean|表格|单元格|工作表|spreadsheet|sheet|cell|row|column|当前(文档|文章|内容|表格)|这篇|这份|本文|全文|这段|这一段|第二段|开头|结尾/;

const MENTION_PATTERN = /@[^\s@]+|#\S+|\[doc:|\[sheet:/;

const CASUAL_ONLY_PATTERN =
  /^(你好|您好|嗨|哈喽|在吗|在不在|早上好|中午好|下午好|晚上好|谢谢|多谢|拜拜|再见|hello|hi|hey|thanks|thankyou|bye|ok|okay|嗯+|哦+|啊+)[!！。.~～？?\s]*$/i;

const CURRENT_WORKSPACE_REVIEW_PATTERN =
  /(?:帮我|请你?)?(?:看看|读一下|阅读|审阅|审稿|检查|分析|评价|点评).*(?:这篇|本文|文章|文档|当前内容|写得|哪里|问题|不足|建议)|(?:这篇|本文|当前文档).*(?:怎么样|哪里不好|有什么问题|给点建议)/i;

export function shouldAttachCurrentWorkspace(
  text: string,
  options: ChatIntentOptions = {}
): boolean {
  const raw = String(text || "").trim();
  if (!raw) return false;
  if (options.hasManualReferences) return true;
  if (MENTION_PATTERN.test(raw)) return true;
  if (CASUAL_ONLY_PATTERN.test(raw.replace(/\s+/g, ""))) return false;
  return WRITE_EDIT_PATTERN.test(raw) || CURRENT_WORKSPACE_REVIEW_PATTERN.test(raw);
}

export type ChatMaxTokenMode = "compact" | "expand";

export function resolveChatMaxTokenMode(text: string): ChatMaxTokenMode {
  const raw = String(text || "").trim();
  if (!raw) return "compact";
  if (WRITE_EDIT_PATTERN.test(raw)) return "expand";
  return "compact";
}
