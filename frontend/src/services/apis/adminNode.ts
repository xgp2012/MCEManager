import { useDefineApi } from "@/stores/useDefineApi";
import type { AdminNode } from "@/types/business";

export const listAdminNodes = useDefineApi<any, AdminNode[]>({
  url: "/api/admin/nodes",
  method: "GET"
});

export const updateAdminNode = useDefineApi<
  {
    params: {
      uuid: string;
    };
    data: {
      ip?: string;
      port?: number;
      remarks?: string;
      apiKey?: string;
      prefix?: string;
    };
  },
  boolean
>({
  url: "/api/admin/nodes",
  method: "PUT"
});

export const syncAdminNode = useDefineApi<
  {
    params: {
      uuid: string;
    };
  },
  {
    available: boolean;
    instanceCount: number;
  }
>({
  url: "/api/admin/nodes",
  method: "POST"
});
