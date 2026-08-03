import { useDefineApi } from "@/stores/useDefineApi";
import type { Order, PageResult } from "@/types/business";

// NOTE: routes use RESTful path params (e.g. /api/order/:uuid), so callers pass
// the concrete `url` (e.g. `/api/order/${uuid}/pay`) together with `params`.

export const createOrder = useDefineApi<
  {
    data: {
      planUuid: string;
      type?: number;
      autoRenew?: boolean;
    };
  },
  {
    order: Order;
    payUrl: string;
    gatewayOrderNo?: string;
  }
>({
  url: "/api/order/create",
  method: "POST"
});

export const listMyOrders = useDefineApi<
  {
    params?: {
      page?: number;
      page_size?: number;
    };
  },
  PageResult<Order>
>({
  url: "/api/order/list",
  method: "GET"
});

export const getOrder = useDefineApi<
  {
    params: {
      uuid: string;
    };
  },
  Order
>({
  url: "/api/order",
  method: "GET"
});

export const getOrderPayLink = useDefineApi<
  {
    params: {
      uuid: string;
    };
  },
  {
    order: Order;
    payUrl: string;
    gatewayOrderNo?: string;
  }
>({
  url: "/api/order",
  method: "GET"
});

export const cancelOrder = useDefineApi<
  {
    params: {
      uuid: string;
    };
  },
  boolean
>({
  url: "/api/order",
  method: "POST"
});
