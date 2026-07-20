import { http, HttpResponse } from "msw";

export const handlers = [
  http.post("*/login", async ({ request }) => {
    const body = await request.json();

    if (body.username !== "admin" || body.password !== "AdminSacika2026") {
      return HttpResponse.json(
        { message: "Username atau password salah" },
        { status: 401 },
      );
    }

    return HttpResponse.json({
      token: "test-jwt-token",
      username: "admin",
      user: {
        id: 1,
        nama: "Administrator SACIKA",
        username: "admin",
        role: "admin",
      },
    });
  }),
];
