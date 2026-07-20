import { useContext } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";

import AuthContext from "./AuthContext";
import AuthProvider from "./AuthProvider";

function AuthProbe() {
  const { user, login, logout } = useContext(AuthContext);

  return (
    <div>
      <span data-testid="username">{user?.username || "guest"}</span>
      <button type="button" onClick={() => login({ token: "new-token", username: "staff" })}>
        Login test
      </button>
      <button type="button" onClick={logout}>Logout test</button>
    </div>
  );
}

describe("AuthProvider", () => {
  test("memulihkan sesi dari localStorage", async () => {
    localStorage.setItem("token", "stored-token");
    localStorage.setItem("username", "admin");

    render(<AuthProvider><AuthProbe /></AuthProvider>);

    await waitFor(() => expect(screen.getByTestId("username")).toHaveTextContent("admin"));
  });

  test("login dan logout menyinkronkan state serta localStorage", async () => {
    const user = userEvent.setup();
    render(<AuthProvider><AuthProbe /></AuthProvider>);

    await user.click(screen.getByRole("button", { name: "Login test" }));
    expect(screen.getByTestId("username")).toHaveTextContent("staff");
    expect(localStorage.getItem("token")).toBe("new-token");
    expect(localStorage.getItem("username")).toBe("staff");

    await user.click(screen.getByRole("button", { name: "Logout test" }));
    expect(screen.getByTestId("username")).toHaveTextContent("guest");
    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("username")).toBeNull();
  });
});
