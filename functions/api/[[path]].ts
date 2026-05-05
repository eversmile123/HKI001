/// <reference types="@cloudflare/workers-types" />

// Cloudflare Pages Function to help bridge the API
// This allows you to host the backend directly on Cloudflare if you port the logic
// For now, it provides a placeholder and instructions.

export const onRequest: PagesFunction = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  // If you host your Express server elsewhere, you can proxy requests here:
  // const backendUrl = env.BACKEND_URL || "https://your-express-server.com";
  // return fetch(`${backendUrl}${url.pathname}${url.search}`, request);

  return new Response(JSON.stringify({ 
    message: "Cloudflare Pages Function Active",
    path: url.pathname,
    hint: "To run the full backend on Cloudflare, port the logic from server.ts to Hono or Pages Functions here."
  }), {
    headers: { "Content-Type": "application/json" }
  });
};
