import axios from "axios";
import md5 from "md5";
import { $t } from "../i18n";
import { systemConfig } from "../setting";
import { logger } from "./log";

export interface CreateOrderParams {
  orderNo: string; // local order number
  amount: number; // amount in cents (fen)
  subject: string; // goods title
  body: string; // goods description
  notifyUrl: string; // async callback URL
  returnUrl: string; // sync return URL
  extra?: Record<string, any>;
}

export interface CreateOrderResult {
  payUrl: string; // payment page URL
  gatewayOrderNo?: string; // gateway order number
  rawData?: any; // raw response
}

export interface VerifyResult {
  success: boolean;
  gatewayOrderNo?: string;
  amount?: number; // amount in cents (fen)
  rawData?: any;
  error?: string;
}

// Unified payment gateway interface. Every supported gateway implements this
// contract so the order layer can switch gateways transparently.
export interface PayGateway {
  name: string;
  createOrder(params: CreateOrderParams): Promise<CreateOrderResult>;
  verifyCallback(query: any, body: any): Promise<VerifyResult>;
  verifyReturn(query: any): Promise<VerifyResult>;
}

export interface YipayConfig {
  apiUrl: string;
  pid: string; // merchant ID
  key: string; // merchant key
  signType: string; // "MD5" for the standard implementation
}

// Standard Yipay (易支付) gateway implementation.
// Protocol reference:
//   - Create order: POST apiUrl with pid/type/out_trade_no/notify_url/return_url/name/money/sign
//   - Callback:     POST with pid/trade_no/out_trade_no/type/name/money/trade_status/sign
//   - Return:       GET  with the same parameters as the callback
//   - Sign:         MD5(sorted `k=v` joined by `&` + `&key=KEY`)
//   - Success text: "success" stops gateway retries.
export class YipayGateway implements PayGateway {
  name = "yipay";

  constructor(private readonly config: YipayConfig) {}

  private buildSign(params: Record<string, any>): string {
    const filtered: Record<string, string> = {};
    for (const key of Object.keys(params)) {
      const value = params[key];
      if (value === "" || value == null || key === "sign" || key === "sign_type") continue;
      filtered[key] = String(value);
    }
    const text = Object.keys(filtered)
      .sort()
      .map((key) => `${key}=${filtered[key]}`)
      .join("&");
    return md5(text + this.config.key);
  }

  private verifySign(params: Record<string, any>): boolean {
    const sign = String(params?.sign || "");
    if (!sign) return false;
    return this.buildSign(params) === sign;
  }

  async createOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
    const money = (params.amount / 100).toFixed(2);
    const body: Record<string, any> = {
      pid: this.config.pid,
      type: String(params.extra?.type || "alipay"),
      out_trade_no: params.orderNo,
      notify_url: params.notifyUrl,
      return_url: params.returnUrl,
      name: params.subject,
      money
    };
    body.sign = this.buildSign(body);

    let response;
    try {
      response = await axios.post(this.config.apiUrl, new URLSearchParams(body).toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 15000
      });
    } catch (err: any) {
      logger.error(
        $t("TXT_CODE_PAY_YIPAY_CREATE_FAILED", { orderNo: params.orderNo, err: String(err?.message || err) })
      );
      throw err;
    }

    const data = response?.data;
    // Standard Yipay returns { code: 1, msg, trade_no, payurl }.
    if (data && Number(data.code) === 1 && data.payurl) {
      return {
        payUrl: String(data.payurl),
        gatewayOrderNo: data.trade_no ? String(data.trade_no) : undefined,
        rawData: data
      };
    }
    logger.error(
      $t("TXT_CODE_PAY_YIPAY_RESPONSE_ERROR", { orderNo: params.orderNo, msg: String(data?.msg || "unknown") })
    );
    throw new Error($t("TXT_CODE_PAY_CREATE_ORDER_FAILED"));
  }

  async verifyCallback(query: any, body: any): Promise<VerifyResult> {
    const params = { ...(query || {}), ...(body || {}) };
    return this.verify(params);
  }

  async verifyReturn(query: any): Promise<VerifyResult> {
    return this.verify(query || {});
  }

  private verify(params: Record<string, any>): VerifyResult {
    if (!this.verifySign(params)) {
      return { success: false, error: $t("TXT_CODE_PAY_SIGN_INVALID") };
    }
    if (String(params.trade_status) !== "TRADE_SUCCESS") {
      return { success: false, error: $t("TXT_CODE_PAY_TRADE_NOT_SUCCESS") };
    }
    const money = Number(params.money);
    const amount = isNaN(money) ? undefined : Math.round(money * 100);
    return {
      success: true,
      gatewayOrderNo: params.trade_no ? String(params.trade_no) : undefined,
      amount,
      rawData: params
    };
  }
}

class PaySubsystem {
  /**
   * Build the configured gateway instance for the given gateway name.
   * Returns null when the gateway is unknown or its config is incomplete.
   */
  getGateway(name: string): PayGateway | null {
    const config = systemConfig;
    if (!config || !config.payEnabled) return null;
    switch (name) {
      case "yipay": {
        if (!config.yipayApiUrl || !config.yipayPid || !config.yipayKey) return null;
        return new YipayGateway({
          apiUrl: config.yipayApiUrl,
          pid: config.yipayPid,
          key: config.yipayKey,
          signType: config.yipaySignType || "MD5"
        });
      }
      default:
        return null;
    }
  }
}

export default new PaySubsystem();
