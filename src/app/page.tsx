import { redirect } from "next/navigation";

export default function Home() {
  // Middleware routes unauthenticated users to /login.
  redirect("/dashboard");
}
