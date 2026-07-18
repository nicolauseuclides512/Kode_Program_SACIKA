import React, { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Search, ChevronDown, Check, X } from "lucide-react";

export function SearchableSelect({
  options = [],
  value = "",
  onValueChange,
  placeholder = "Pilih produk...",
  searchPlaceholder = "Cari...",
  className = "",
  disabled = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current.focus();
      }, 50);
    } else {
      setSearchQuery("");
    }
  }, [isOpen]);

  
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const selectedOption = options.find((opt) => String(opt.value) === String(value));

  const filteredOptions = options.filter((opt) => {
    const labelMatch = opt.label?.toLowerCase().includes(searchQuery.toLowerCase());
    const sublabelMatch = opt.sublabel
      ? String(opt.sublabel).toLowerCase().includes(searchQuery.toLowerCase())
      : false;
    return labelMatch || sublabelMatch;
  });

  const handleSelect = (val) => {
    onValueChange(val);
    setIsOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onValueChange("");
  };

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      {}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-2xs transition-all hover:bg-zinc-50 focus:outline-none focus:ring-1 focus:ring-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 text-left",
          !selectedOption && "text-zinc-400"
        )}
      >
        <span className="truncate pr-4">
          {selectedOption ? (
            <span className="flex items-center gap-1.5 text-zinc-900 font-medium">
              <span>{selectedOption.label}</span>
              {selectedOption.sublabel && (
                <span className="text-xs text-zinc-400 font-normal">
                  ({selectedOption.sublabel})
                </span>
              )}
            </span>
          ) : (
            placeholder
          )}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {selectedOption && !disabled && (
            <span
              onClick={handleClear}
              className="rounded-md p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors"
            >
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronDown className={cn("h-4 w-4 text-zinc-400 transition-transform duration-200", isOpen && "rotate-180")} />
        </div>
      </button>

      {}
      {isOpen && (
        <div className="absolute z-50 mt-1.5 max-h-60 w-full overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg animate-in fade-in-50 slide-in-from-top-1">
          {}
          <div className="flex items-center border-b border-zinc-100 px-2.5 py-1.5 bg-zinc-50/50">
            <Search className="mr-2 h-3.5 w-3.5 shrink-0 text-zinc-400" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex h-7 w-full rounded-md bg-transparent py-2 text-sm outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:opacity-50 text-zinc-900 font-medium"
            />
          </div>

          {}
          <div className="max-h-[180px] overflow-y-auto p-1 scrollbar-thin">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => {
                const isSelected = String(opt.value) === String(value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={cn(
                      "relative flex w-full cursor-pointer select-none items-center justify-between rounded-md px-2.5 py-2 text-sm outline-none hover:bg-zinc-100 hover:text-zinc-900 text-zinc-700 transition-all font-medium text-left",
                      isSelected && "bg-zinc-50 text-zinc-950 font-semibold"
                    )}
                  >
                    <div className="flex flex-col gap-0.5 truncate">
                      <span className="truncate">{opt.label}</span>
                      {opt.sublabel && (
                        <span className="text-xs text-zinc-400 font-normal truncate">
                          {opt.sublabel}
                        </span>
                      )}
                    </div>
                    {isSelected && <Check className="ml-2 h-3.5 w-3.5 shrink-0 text-zinc-900" />}
                  </button>
                );
              })
            ) : (
              <div className="py-6 text-center text-sm text-zinc-400 font-medium">
                Tidak ada data ditemukan
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
