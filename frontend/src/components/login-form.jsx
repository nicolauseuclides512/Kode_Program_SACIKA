import { cn } from "@/lib/utils"
import { Button } from "./ui/button"
import { Card, CardContent } from "./ui/card"
import { Input } from "./ui/input"

export function LoginForm({
  className,
  onSubmit,
  loading,
  error,
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center w-full", className)}>
      {}
      <div className="flex items-center gap-2.5 mb-6 select-none">
        <div className="h-6 w-6 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-black text-xs tracking-wider shadow-2xs">
          S
        </div>
        <span className="font-bold text-sm tracking-tight text-zinc-900">Sacika Koperasi</span>
      </div>

      {}
      <Card className="rounded-2xl border border-zinc-200/80 bg-white p-8 w-full shadow-xs max-w-[400px]">
        <CardContent className="p-0">
          {}
          <div className="flex flex-col space-y-1.5 text-center mb-6 select-none">
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">Selamat datang kembali</h1>
            <p className="text-xs text-zinc-400 font-medium">
              Masukkan kredensial Anda untuk masuk ke sistem
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            {}
            <div className="space-y-1.5">
              <label htmlFor="username" className="text-xs font-bold text-zinc-800 leading-none">
                Username
              </label>
              <Input
                id="username"
                name="username"
                type="text"
                placeholder="admin"
                required
                className="h-10 border-zinc-200 focus-visible:ring-primary text-xs bg-white rounded-lg shadow-2xs placeholder:text-zinc-300"
              />
            </div>

            {}
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-bold text-zinc-800 leading-none">
                Password
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                className="h-10 border-zinc-200 focus-visible:ring-primary text-xs bg-white rounded-lg shadow-2xs"
              />
            </div>

            {}
            {error && (
              <p className="text-xs font-semibold text-destructive text-center py-1">
                {error}
              </p>
            )}

            {}
            <Button 
              type="submit" 
              className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg text-xs font-bold shadow-xs mt-2 transition-all" 
              disabled={loading}
            >
              {loading ? "Memproses..." : "Masuk"}
            </Button>
          </form>

        </CardContent>
      </Card>
    </div>
  )
}
