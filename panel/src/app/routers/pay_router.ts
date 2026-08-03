import Koa from "koa";
import Router from "@koa/router";
import { OrderType } from "../entity/order";
import { $t } from "../i18n";
import permission from "../middleware/permission";
import { logger } from "../service/log";
import orderSystem from "../service/order_service";
import payService from "../service/pay_service";
import provisionService from "../service/provision_service";
import subscriptionService from "../service/subscription_service";

const router = new Router({ prefix: "/pay" });

/**
 * Fire the post-payment handling asynchronously so the gateway callback can
 * reply with "success" without waiting for the work to finish. Both handlers
 * are idempotent, so duplicate callbacks / return hits are safe.
 */
function triggerProvision(orderNo: string) {
  if (!orderNo) return;
  const order = orderSystem.getByOrderNo(orderNo);
  if (!order) return;
  if (order.type === OrderType.RENEW) {
    subscriptionService.renewFromOrder(orderNo).catch(() => {});
  } else {
    provisionService.provision(orderNo).catch(() => {});
  }
}

/**
 * Write a raw plain-text response directly to the socket.
 * The global protocol middleware wraps bodies into the panel JSON envelope,
 * which payment gateways do not understand - they expect the literal string
 * "success" / "failure". Disabling koa's respond handling skips that wrapper.
 */
function respondRaw(ctx: Koa.ParameterizedContext, text: string) {
  ctx.respond = false;
  ctx.res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  ctx.res.end(text);
}

/** Redirect the browser while bypassing the JSON response wrapper. */
function respondRedirect(ctx: Koa.ParameterizedContext, url: string) {
  ctx.respond = false;
  ctx.res.writeHead(302, { Location: url });
  ctx.res.end();
}

// [Public Permission - Payment Gateway]
// Async payment callback. The gateway retries until it receives "success".
router.post(
  "/callback/:gateway",
  permission({ token: false, level: null, speedLimit: false }),
  async (ctx: Koa.ParameterizedContext) => {
    const gatewayName = String(ctx.params.gateway);
    const gateway = payService.getGateway(gatewayName);
    if (!gateway) {
      logger.error($t("TXT_CODE_PAY_GATEWAY_UNKNOWN", { gateway: gatewayName }));
      return respondRaw(ctx, "failure");
    }

    const result = await gateway.verifyCallback(ctx.query, ctx.request.body);
    if (!result.success) {
      logger.warn(
        $t("TXT_CODE_PAY_CALLBACK_REJECTED", {
          gateway: gatewayName,
          err: result.error || "unknown"
        })
      );
      return respondRaw(ctx, "failure");
    }

    const orderNo = String(result.rawData?.out_trade_no || "");
    const order = orderNo ? orderSystem.getByOrderNo(orderNo) : null;
    if (!order) {
      logger.warn($t("TXT_CODE_PAY_CALLBACK_ORDER_MISSING", { orderNo: orderNo || "unknown" }));
      return respondRaw(ctx, "failure");
    }

    const accepted = await orderSystem.handlePaymentSuccess(order, {
      gateway: gatewayName,
      gatewayOrderNo: result.gatewayOrderNo,
      amount: result.amount,
      rawData: result.rawData
    });
    if (accepted) triggerProvision(orderNo);

    return respondRaw(ctx, accepted ? "success" : "failure");
  }
);

// [Public Permission - Payment Gateway]
// Sync return after the user finishes payment on the gateway page.
router.get(
  "/return/:gateway",
  permission({ token: false, level: null, speedLimit: false }),
  async (ctx: Koa.ParameterizedContext) => {
    const gatewayName = String(ctx.params.gateway);
    const gateway = payService.getGateway(gatewayName);
    const prefix = "/#/order-result";
    if (!gateway) {
      logger.error($t("TXT_CODE_PAY_GATEWAY_UNKNOWN", { gateway: gatewayName }));
      return respondRedirect(ctx, `${prefix}?result=failure`);
    }

    const result = await gateway.verifyReturn(ctx.query);
    const orderNo = String(result.rawData?.out_trade_no || "");
    if (result.success) {
      const order = orderNo ? orderSystem.getByOrderNo(orderNo) : null;
      if (order) {
        await orderSystem.handlePaymentSuccess(order, {
          gateway: gatewayName,
          gatewayOrderNo: result.gatewayOrderNo,
          amount: result.amount,
          rawData: result.rawData
        });
        triggerProvision(orderNo);
      }
      const query = `orderNo=${encodeURIComponent(orderNo)}&result=success`;
      return respondRedirect(ctx, `${prefix}?${query}`);
    }

    logger.warn(
      $t("TXT_CODE_PAY_RETURN_REJECTED", {
        gateway: gatewayName,
        err: result.error || "unknown"
      })
    );
    const query = `orderNo=${encodeURIComponent(orderNo)}&result=failure`;
    return respondRedirect(ctx, `${prefix}?${query}`);
  }
);

export default router;
