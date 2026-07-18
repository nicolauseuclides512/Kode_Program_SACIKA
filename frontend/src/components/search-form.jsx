import { Search } from "lucide-react"
import { Input } from "./ui/input"

export function SearchForm({ ...props }) {
  return (
    <form {...props} className="py-2">
      <div className="relative">
        <label htmlFor="search" className="sr-only">
          Search
        </label>
        <Input
          id="search"
          placeholder="Search..."
          className="pl-8"
        />
        <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 opacity-50 select-none" />
      </div>
    </form>
  )
}
