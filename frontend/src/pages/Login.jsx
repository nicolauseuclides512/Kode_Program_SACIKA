import { useState, useContext } from "react";
import { useNavigate } from "react-router-dom";

import AuthContext from "../auth/AuthContext";
import api from "../api/axios";
import { ENDPOINTS } from "../api/endpoints";
import { LoginForm } from "../components/login-form";

const Login = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.target);
    const username = formData.get("username");
    const password = formData.get("password");

    try {
      const res = await api.post(ENDPOINTS.login, {
        username,
        password,
      });

      login(res.data);
      navigate("/dashboard");
    } catch {
      setError("Username atau password salah");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10 bg-zinc-50/50">
      <div className="w-full max-w-[400px]">
        <LoginForm onSubmit={handleLogin} loading={loading} error={error} />
      </div>
    </div>
  );
};

export default Login;
