import { initializeApp, getApps, type App } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"

function getApp(): App {
  if (getApps().length > 0) return getApps()[0]!
  return initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID })
}

export async function verifyFirebaseToken(
  idToken: string
): Promise<{ uid: string; phoneNumber: string }> {
  const decoded = await getAuth(getApp()).verifyIdToken(idToken)
  if (!decoded.phone_number) {
    throw new Error("Token does not contain a phone number")
  }
  return { uid: decoded.uid, phoneNumber: decoded.phone_number }
}
