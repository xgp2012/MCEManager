import { useDefineApi } from "@/stores/useDefineApi";
import type { MarketTemplate, PageResult, Template } from "@/types/business";

// NOTE: routes use RESTful path params (e.g. /api/template/:uuid), so callers
// pass the concrete `url` (e.g. `/api/template/${uuid}`) together with `params`.

export const listTemplates = useDefineApi<
  {
    params?: {
      name?: string;
      category?: number;
      page?: number;
      page_size?: number;
    };
  },
  PageResult<Template>
>({
  url: "/api/template",
  method: "GET"
});

export const listPublicTemplates = useDefineApi<
  {
    params?: {
      category?: number;
    };
  },
  Template[]
>({
  url: "/api/template/list",
  method: "GET"
});

export const getTemplate = useDefineApi<
  {
    params: {
      uuid: string;
    };
  },
  Template
>({
  url: "/api/template",
  method: "GET"
});

export const getTemplateCategories = useDefineApi<
  any,
  Array<{
    value: number;
    label: string;
  }>
>({
  url: "/api/template/categories",
  method: "GET"
});

export const getMarketTemplates = useDefineApi<
  {
    params?: {
      category?: number;
    };
  },
  MarketTemplate[]
>({
  url: "/api/template/market",
  method: "GET"
});

export const createTemplate = useDefineApi<
  {
    data: Partial<Template>;
  },
  Template
>({
  url: "/api/template",
  method: "POST"
});

export const updateTemplate = useDefineApi<
  {
    params: {
      uuid: string;
    };
    data: Partial<Template>;
  },
  Template
>({
  url: "/api/template",
  method: "PUT"
});

export const deleteTemplate = useDefineApi<
  {
    params: {
      uuid: string;
    };
  },
  boolean
>({
  url: "/api/template",
  method: "DELETE"
});

export const updateTemplateStatus = useDefineApi<
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
  url: "/api/template",
  method: "PUT"
});

export const cloneTemplate = useDefineApi<
  {
    params: {
      uuid: string;
    };
  },
  Template
>({
  url: "/api/template",
  method: "PUT"
});

export const importTemplate = useDefineApi<
  {
    data: {
      template: Record<string, any>;
    };
  },
  Template
>({
  url: "/api/template/import",
  method: "POST"
});

export const exportTemplate = useDefineApi<
  {
    params: {
      uuid: string;
    };
  },
  Template
>({
  url: "/api/template/export",
  method: "GET"
});
