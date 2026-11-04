import { onRequest as __api___path___js_onRequest } from "C:\\Users\\ASUS PC\\Downloads\\Telegram Desktop\\Khmer-NER\\frontend\\functions\\api\\[[path]].js"

export const routes = [
    {
      routePath: "/api/:path*",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api___path___js_onRequest],
    },
  ]