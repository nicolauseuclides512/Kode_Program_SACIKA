import React, { useEffect } from "react";
import { CheckCircle, AlertCircle, X, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export const Toast = ({ message, type = "success", onClose, duration = 4000 }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const icons = {
    success: <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />,
    error: <AlertCircle className="h-5 w-5 text-destructive shrink-0" />,
    info: <Info className="h-5 w-5 text-blue-500 shrink-0" />,
  };

  const themes = {
    success: "bg-emerald-50/95 border-emerald-200/60 text-emerald-950 shadow-lg shadow-emerald-900/5",
    error: "bg-destructive/5 border-destructive/20 text-destructive shadow-lg shadow-destructive/5",
    info: "bg-blue-50/95 border-blue-200/60 text-blue-950 shadow-lg shadow-blue-900/5",
  };

  return (
    <div className={cn(
      "fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-lg border px-4 py-3 shadow-md backdrop-blur-sm transition-all duration-300 animate-in fade-in slide-in-from-bottom-5 sm:max-w-md",
      themes[type]
    )}>
      {icons[type]}
      <span className="text-sm font-medium pr-2">{message}</span>
      <button 
        type="button"
        onClick={onClose} 
        className="ml-auto rounded-md p-1 opacity-70 hover:opacity-100 transition-opacity focus:outline-none"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};
