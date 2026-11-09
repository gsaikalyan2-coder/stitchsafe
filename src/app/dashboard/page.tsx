import { auth, signOut } from "@/server/auth/auth"
import { redirect } from "next/navigation"
import PhoneOtpForm from "./PhoneOtpForm"
import RoleChoiceForm from "./RoleChoiceForm"

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const { name, email, role, phoneVerified, paypalVerified, roleChosen } = session.user

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="flex flex-col items-center gap-2">
        <p className="text-lg">{name ?? email}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800">
            {role}
          </span>
          {paypalVerified && (
            <span className="rounded-full bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-800">
              PayPal verified
            </span>
          )}
          {phoneVerified ? (
            <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
              Phone verified
            </span>
          ) : (
            <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-500">
              Phone not verified
            </span>
          )}
        </div>
      </div>

      {!roleChosen && <RoleChoiceForm />}

      {!phoneVerified && <PhoneOtpForm />}

      <form
        action={async () => {
          "use server"
          await signOut({ redirectTo: "/login" })
        }}
      >
        <button type="submit" className="rounded border px-4 py-2 text-sm">
          Sign out
        </button>
      </form>
    </main>
  )
}
