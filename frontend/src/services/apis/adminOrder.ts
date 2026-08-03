import { useDefineApi } from "@/stores/useDefineApi";
import type { AdminOrder, PageResult } from "@/types/business";

export const listAdminOrders = useDefineApi<
  {
    params?: {
      page?: number;
      page_size?: number;
      status?: number;
      type?: number;
      keyword?: string;
    };
  },
  PageResult<AdminOrder>
>({
  url: "/api/admin/orders",
  method: "GET"
});

export const getAdminOrderDetail = useDefineApi<
  {
    params: {
      uuid: string;
    };
  },
  AdminOrder
>({
  url: "/api/admin/orders",
  method: "GET"
});

export const retryProvisionOrder = useDefineApi<
  {
    params: {
      uuid: string;
    };
  },
  boolean
>({
  url: "/api/admin/orders",
  method: "POST"
});

export const refundOrder = useDefineApi<
  {
    params: {
      uuid: string;
    };
    data: {
      reason?: string;
    };
  },
  boolean
>({
  url: "/api/admin/orders",
  method: "POST"
});

export const markOrderPaid = useDefineApi<
  {
    params: {
      uuid: string;
    };
  },
  boolean
>({
  url: "/api/admin/orders",
  method: "POST"
});
