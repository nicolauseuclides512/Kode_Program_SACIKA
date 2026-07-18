import { useState, useMemo } from "react"
import { Input } from "./ui/input"
import { Button } from "./ui/button"
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "./ui/table"
import { 
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from "lucide-react"

export function DataTable({
  columns,
  data,
  searchPlaceholder = "Cari...",
  searchableFields = [],
  pageSize = 10,
}) {
  const [currentPage, setCurrentPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState("")
  const [localPageSize, setLocalPageSize] = useState(pageSize)

  
  const filteredData = useMemo(() => {
    if (!searchTerm) return data

    return data.filter((item) =>
      searchableFields.some((field) =>
        String(item[field]).toLowerCase().includes(searchTerm.toLowerCase())
      )
    )
  }, [data, searchTerm, searchableFields])

  
  const totalPages = Math.ceil(filteredData.length / localPageSize)

  
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * localPageSize
    const endIndex = startIndex + localPageSize
    return filteredData.slice(startIndex, endIndex)
  }, [filteredData, currentPage, localPageSize])

  
  const handleSearch = (value) => {
    setSearchTerm(value)
    setCurrentPage(1)
  }

  return (
    <div className="space-y-4">
      {}
      <div className="flex items-center justify-between gap-4">
        <div className="relative w-72 shrink-0">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9 h-9 border-zinc-200 focus-visible:ring-zinc-950 text-xs bg-white rounded-lg shadow-2xs placeholder:text-zinc-400"
          />
        </div>
        <span className="text-xs text-zinc-400 font-semibold tracking-wider uppercase bg-zinc-50 border px-2.5 py-1 rounded-md">
          {filteredData.length} Data ditemukan
        </span>
      </div>

      {}
      <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white shadow-xs">
        <Table>
          <TableHeader className="bg-zinc-50/60 border-b border-zinc-200">
            <TableRow className="hover:bg-zinc-50/60">
              {columns.map((column) => (
                <TableHead 
                  key={column.key} 
                  style={{ width: column.width }}
                  className="text-xs font-bold text-zinc-500 uppercase tracking-wider h-10 px-4 py-2.5 align-middle"
                >
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-6 text-xs text-zinc-400 font-medium">
                  Tidak ada data yang tersedia.
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((row, rowIndex) => (
                <TableRow key={rowIndex} className="border-b border-zinc-100 hover:bg-zinc-50/40 transition-colors">
                  {columns.map((column) => (
                    <TableCell key={column.key} className="px-4 py-2.5 text-xs text-zinc-700 font-medium align-middle">
                      {column.render 
                        ? column.render(row, (currentPage - 1) * localPageSize + rowIndex) 
                        : row[column.key]}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {}
      <div className="flex items-center justify-between pt-4 border-t border-zinc-100 select-none">
        {}
        <div />

        {}
        <div className="flex flex-wrap items-center gap-6">
          {}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-500">Baris per halaman</span>
            <select
              value={localPageSize}
              onChange={(e) => {
                setLocalPageSize(Number(e.target.value))
                setCurrentPage(1)
              }}
              className="h-8 w-[70px] rounded border border-zinc-200 bg-white text-xs font-semibold text-zinc-800 px-2 py-1 outline-none hover:bg-zinc-50 transition-colors cursor-pointer"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>

          {}
          <span className="text-xs font-semibold text-zinc-500">
            Halaman {currentPage} dari {totalPages || 1}
          </span>

          {}
          <div className="flex items-center gap-1">
            {}
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="h-8 w-8 border border-zinc-200 bg-white hover:bg-zinc-50 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-800 disabled:opacity-40 disabled:pointer-events-none transition-colors shadow-2xs"
            >
              <ChevronsLeft className="h-3.5 w-3.5" />
            </button>

            {}
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="h-8 w-8 border border-zinc-200 bg-white hover:bg-zinc-50 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-800 disabled:opacity-40 disabled:pointer-events-none transition-colors shadow-2xs"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>

            {}
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="h-8 w-8 border border-zinc-200 bg-white hover:bg-zinc-50 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-800 disabled:opacity-40 disabled:pointer-events-none transition-colors shadow-2xs"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>

            {}
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages || totalPages === 0}
              className="h-8 w-8 border border-zinc-200 bg-white hover:bg-zinc-50 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-800 disabled:opacity-40 disabled:pointer-events-none transition-colors shadow-2xs"
            >
              <ChevronsRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
