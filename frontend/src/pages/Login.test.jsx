import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { describe, expect, test, vi } from "vitest";

import AuthContext from "../auth/AuthContext";
import { server } from "../test/mocks/server";
import Login from "./Login";

function renderLogin(login = vi.fn()) {
  render(
    <AuthContext.Provider value={{ user: null, login, logout: vi.fn() }}>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<h1>Dashboard Test</h1>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  return { login };
}

describe("Login", () => {
  test("mengirim kredensial, menyimpan sesi melalui context, lalu membuka dashboard", async () => {
    const user = userEvent.setup();
    const login = vi.fn();
    renderLogin(login);

    await user.type(screen.getByLabelText(/username/i), "admin");
    await user.type(screen.getByLabelText(/password/i), "AdminSacika2026");
    await user.click(screen.getByRole("button", { name: /^masuk$/i }));

    expect(await screen.findByRole("heading", { name: "Dashboard Test" })).toBeInTheDocument();
    expect(login).toHaveBeenCalledTimes(1);
    expect(login).toHaveBeenCalledWith(expect.objectContaining({
      token: "test-jwt-token",
      username: "admin",
    }));
  });

  test("menampilkan pesan yang aman ketika API menolak login", async () => {
    server.use(
      http.post("*/login", () => HttpResponse.json(
        { message: "Detail internal tidak boleh tampil" },
        { status: 401 },
      )),
    );

    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/username/i), "admin");
    await user.type(screen.getByLabelText(/password/i), "salah");
    await user.click(screen.getByRole("button", { name: /^masuk$/i }));

    expect(await screen.findByText("Username atau password salah")).toBeInTheDocument();
    expect(screen.queryByText("Detail internal tidak boleh tampil")).not.toBeInTheDocument();
  });
});
