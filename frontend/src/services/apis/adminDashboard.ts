import { useDefineApi } from "@/stores/useDefineApi";
import type { DashboardStats, TrendPoint } from "@/types/business";

export const getDashboardStats = useDefineApi<any, DashboardStats>({
  url: "/api/admin/dashboard/stats",
  method: "GET"
});

export const getRevenueTrend = useDefineApi<
  {
    params?: {
      days?: number;
    };
  },
  TrendPoint[]
>({
  url: "/api/admin/dashboard/revenue",
  method: "GET"
});

export const getRegistrationTrend = useDefineApi<
  {
    params?: {
      days?: number;
    };
  },
  TrendPoint[]
>({
  url: "/api/admin/dashboard/registrations",
  method: "GET"
});
