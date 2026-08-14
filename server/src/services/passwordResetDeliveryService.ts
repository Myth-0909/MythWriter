import { assertPublicHttpUrl } from "../lib/safeOutboundUrl";

export type PasswordResetDelivery =
  | { mode: "email" }
  | { mode: "development"; code: string };

export function isPasswordResetDeliveryConfigured(): boolean {
  const hasResend = Boolean(
    process.env.RESEND_API_KEY?.trim() && process.env.PASSWORD_RESET_FROM_EMAIL?.trim()
  );
  const developmentMode =
    process.env.NODE_ENV !== "production" &&
    process.env.PASSWORD_RESET_DEV_MODE === "true";
  return hasResend || developmentMode;
}

export async function deliverPasswordResetCode(params: {
  email: string;
  code: string;
  lang: "zh" | "en";
}): Promise<PasswordResetDelivery> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.PASSWORD_RESET_FROM_EMAIL?.trim();

  if (apiKey && from) {
    const endpoint = "https://api.resend.com/emails";
    assertPublicHttpUrl(endpoint);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const isEnglish = params.lang === "en";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [params.email],
          subject: isEnglish ? "Your ZNWriter password reset code" : "ZNWriter 密码重置验证码",
          text: isEnglish
            ? `Your password reset code is ${params.code}. It expires in 10 minutes. If you did not request this, ignore this email.`
            : `您的密码重置验证码是 ${params.code}，10 分钟内有效。如果不是您本人操作，请忽略此邮件。`,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Reset email provider returned ${response.status}`);
      }
      return { mode: "email" };
    } finally {
      clearTimeout(timeout);
    }
  }

  if (process.env.NODE_ENV !== "production" && process.env.PASSWORD_RESET_DEV_MODE === "true") {
    console.info(`[Auth] Local password reset code for ${params.email}: ${params.code}`);
    return { mode: "development", code: params.code };
  }

  throw new Error("PASSWORD_RESET_DELIVERY_UNAVAILABLE");
}
