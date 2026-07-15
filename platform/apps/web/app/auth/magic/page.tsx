import { redirect } from "next/navigation";

// Magic-link login was removed — Google is the only passwordless option now.
// (This folder can be deleted; kept as a redirect so old emailed links don't 404.)
export default function RemovedMagicPage() {
  redirect("/login");
}
