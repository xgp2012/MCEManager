import { useDefineApi } from "@/stores/useDefineApi";
import type { PageResult, Plan } from "@/types/business";

// NOTE: routes use RESTful path params (e.g. /api/plan/:uuid), so callers pass
// the concrete `url` (e.g. `/api/plan/${uuid}`) together with `params`.

export const listPlans = useDefineApi<
  {
    params?: {
      name?: string;
      page?: number;
      page_size?: number;
    };
  },
  PageResult<Plan>
>({
  url: "/api/plan",
  method: "GET"
});

export const listPublicPlans = useDefineApi<any, Plan[]>({
  url: "/api/plan/list",
  method: "GET"
});

export const getPlan = useDefineApi<
  {
    params: {
      uuid: string;
    };
  },
  Plan
>({
  url: "/api/plan",
  method: "GET"
});

export const createPlan = useDefineApi<
  {
    data: Partial<Plan>;
  },
  Plan
>({
  url: "/api/plan",
  method: "POST"
});

export const updatePlan = useDefineApi<
  {
    params: {
      uuid: string;
    };
    data: Partial<Plan>;
  },
  Plan
>({
  url: "/api/plan",
  method: "PUT"
});

export const deletePlan = useDefineApi<
  {
    params: {
      uuid: string;
    };
  },
  boolean
>({
  url: "/api/plan",
  method: "DELETE"
});

export const updatePlanStatus = useDefineApi<
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
  url: "/api/plan",
  method: "PUT"
});
