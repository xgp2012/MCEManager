import { useDefineApi } from "@/stores/useDefineApi";
import type {
  RenewResult,
  Subscription,
  SubscriptionListResult
} from "@/types/business";

// NOTE: routes use RESTful path params (e.g. /api/subscription/:uuid), so
// callers pass the concrete `url` (e.g. `/api/subscription/${uuid}/renew`)
// together with `params`.

export const listMySubscriptions = useDefineApi<
  any,
  SubscriptionListResult
>({
  url: "/api/subscription/list",
  method: "GET"
});

export const getSubscription = useDefineApi<
  {
    params: {
      uuid: string;
    };
  },
  Subscription
>({
  url: "/api/subscription",
  method: "GET"
});

export const cancelSubscription = useDefineApi<
  {
    params: {
      uuid: string;
    };
  },
  boolean
>({
  url: "/api/subscription",
  method: "POST"
});

export const setSubscriptionAutoRenew = useDefineApi<
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
  url: "/api/subscription",
  method: "PUT"
});

export const renewSubscription = useDefineApi<
  {
    params: {
      uuid: string;
    };
  },
  RenewResult
>({
  url: "/api/subscription",
  method: "POST"
});
