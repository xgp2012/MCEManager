import { useDefineApi } from "@/stores/useDefineApi";
import type { AdminInstance, PageResult } from "@/types/business";

export const listAdminInstances = useDefineApi<
  {
    params?: {
      page?: number;
      page_size?: number;
      status?: number;
      keyword?: string;
      daemonId?: string;
    };
  },
  PageResult<AdminInstance>
>({
  url: "/api/admin/instances",
  method: "GET"
});

export const getAdminInstanceDetail = useDefineApi<
  {
    params: {
      uuid: string;
    };
  },
  AdminInstance
>({
  url: "/api/admin/instances",
  method: "GET"
});

export const extendAdminInstance = useDefineApi<
  {
    params: {
      uuid: string;
    };
    data: {
      endTime: number;
    };
  },
  boolean
>({
  url: "/api/admin/instances",
  method: "POST"
});

export const suspendAdminInstance = useDefineApi<
  {
    params: {
      uuid: string;
    };
  },
  boolean
>({
  url: "/api/admin/instances",
  method: "POST"
});

export const resumeAdminInstance = useDefineApi<
  {
    params: {
      uuid: string;
    };
  },
  boolean
>({
  url: "/api/admin/instances",
  method: "POST"
});

export const deleteAdminInstance = useDefineApi<
  {
    params: {
      uuid: string;
    };
    data: {
      deleteFile: boolean;
    };
  },
  any
>({
  url: "/api/admin/instances",
  method: "DELETE"
});

export const updateAdminInstanceBandwidth = useDefineApi<
  {
    params: {
      uuid: string;
    };
    data: {
      uploadLimit: number;
      downloadLimit: number;
    };
  },
  boolean
>({
  url: "/api/admin/instances",
  method: "PUT"
});
