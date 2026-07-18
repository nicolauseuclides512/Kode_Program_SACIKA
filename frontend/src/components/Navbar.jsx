import { useContext } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, User } from "lucide-react";
import AuthContext from "../auth/AuthContext";
import { Button } from "../components/ui/button";

const Navbar = () => {
  const { logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const username = localStorage.getItem("username");

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="flex items-center justify-between px-6 py-4">
      <h5 className="text-lg font-semibold">Dashboard</h5>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          <User className="w-4 h-4" />
          <span>{username}</span>
        </div>
        <Button variant="outline" size="sm" onClick={handleLogout}>
          <LogOut className="w-4 h-4 mr-2" />
          Logout
        </Button>
      </div>
    </div>
  );
};

export default Navbar;
