import * as React from "react"
import { GalleryVerticalEnd } from "lucide-react"

export function VersionSwitcher({
  versions,
  defaultVersion,
}) {
  const [selectedVersion, setSelectedVersion] = React.useState(defaultVersion)

  return (
    <div className="flex items-center gap-2 p-2 border-b">
      <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-slate-900 text-white">
        <GalleryVerticalEnd className="size-4" />
      </div>
      <div className="flex flex-col gap-0.5 leading-none">
        <span className="font-medium">Koperasi Sacika</span>
        <span className="text-xs text-muted-foreground">v{selectedVersion}</span>
      </div>
    </div>
  )
}
