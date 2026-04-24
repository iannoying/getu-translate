import guest from "@/assets/icons/avatars/guest.svg"
import { Button } from "@/components/ui/base-ui/button"
import { authClient } from "@/utils/auth/auth-client"
import { WEBSITE_URL } from "@/utils/constants/url"
import { cn } from "@/utils/styles/utils"

export function UserAccount() {
  const { data, isPending } = authClient.useSession()
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => window.open(WEBSITE_URL, "_blank", "noopener,noreferrer")}
        className="flex items-center gap-2 cursor-pointer rounded-md transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title={WEBSITE_URL}
      >
        <img
          src={data?.user.image ?? guest}
          alt="User"
          className={cn("rounded-full border size-6", !data?.user.image && "p-1", isPending && "animate-pulse")}
        />
        <span>{isPending ? "Loading..." : data?.user.name || data?.user.email?.split("@")[0] || "Guest"}</span>
      </button>
      {!isPending && !data && (
        <Button
          size="xs"
          variant="outline"
          onClick={() =>
            window.open(`${WEBSITE_URL}/log-in`, "_blank")}
        >
          Log in
        </Button>
      )}
    </div>
  )
}
