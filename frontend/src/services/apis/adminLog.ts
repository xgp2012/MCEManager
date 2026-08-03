import { useDefineApi } from "@/stores/useDefineApi";
import type { PaymentLogEntry, PageResult } from "@/types/business";
import type { OperationLoggerItem } from "@/types/operationLog";

export const getOperationLogPage = useDefineApi<
  {
    params?: {
      page?: number;
      page_size?: number;
      level?: string;
      type?: string;
      keyword?: string;
    };
  },
  PageResult<OperationLoggerItem>
>({
  url: "/api/admin/logs/operation",
  method: "GET"
});

export const getPaymentLogPage = useDefineApi<
  {
    params?: {
      page?: number;
      page_size?: number;
      gateway?: string;
      status?: number;
    };
  },
  PageResult<PaymentLogEntry>
>({
  url: "/api/admin/logs/payment",
  method: "GET"
});

export const exportOperationLog = useDefineApi<
  {
    params?: {
      level?: string;
      type?: string;
      keyword?: string;
    };
  },
  string
>({
  url: "/api/admin/logs/operation/export",
  method: "GET"
});

export const exportPaymentLog = useDefineApi<
  {
    params?: {
      gateway?: string;
      status?: number;
    };
  },
  string
>({
  url: "/api/admin/logs/payment/export",
  method: "GET"
});
