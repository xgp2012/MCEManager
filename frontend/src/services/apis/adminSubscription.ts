import { useDefineApi } from "@/stores/useDefineApi";
import type {
  AdminSubscription,
  PageResult,
  RenewResult
} from "@/types/business";

export const listAdminSubscriptions = useDefineApi<
  {
    params?: {
      page?: number;
      page_size?: number;
      status?: number;
      keyword?: string;
    };
  },
  PageResult<AdminSubscription>
>({
  url: "/api/admin/subscriptions",
  method: "GET"
});

export const getAdminSubscriptionDetail = useDefineApi<
  {
    params: {
      uuid: string;
    };
  },
  AdminSubscription
>({
  url: "/api/admin/subscriptions",
  method: "GET"
});

export const forceCancelSubscription = useDefineApi<
  {
    params: {
      uuid: string;
    };
  },
  boolean
>({
  url: "/api/admin/subscriptions",
  method: "POST"
});

export const renewSubscriptionNow = useDefineApi<
  {
    params: {
      uuid: string;
    };
  },
  RenewResult
>({
  url: "/api/admin/subscriptions",
  method: "POST"
});

export const setAdminSubscriptionAutoRenew = useDefineApi<
  {
    params: {
      uuid: string;
    };
    data: {
      enabled: boolean;
    };
  },
  boolean
>({
  url: "/api/admin/subscriptions",
  method: "PUT"
});
