import Router from "@koa/router";
import configRouter from "./admin_config_router";
import dashboardRouter from "./admin_dashboard_router";
import instanceRouter from "./admin_instance_router";
import logRouter from "./admin_log_router";
import nodeRouter from "./admin_node_router";
import orderRouter from "./admin_order_router";
import subscriptionRouter from "./admin_subscription_router";
import userRouter from "./admin_user_router";

// Aggregator for the business admin panel. Every sub-router lives under the
// `/admin` prefix; the individual routers declare their own sub-paths.
const router = new Router({ prefix: "/admin" });

router.use(dashboardRouter.routes()).use(dashboardRouter.allowedMethods());
router.use(userRouter.routes()).use(userRouter.allowedMethods());
router.use(orderRouter.routes()).use(orderRouter.allowedMethods());
router.use(subscriptionRouter.routes()).use(subscriptionRouter.allowedMethods());
router.use(instanceRouter.routes()).use(instanceRouter.allowedMethods());
router.use(nodeRouter.routes()).use(nodeRouter.allowedMethods());
router.use(configRouter.routes()).use(configRouter.allowedMethods());
router.use(logRouter.routes()).use(logRouter.allowedMethods());

export default router;
