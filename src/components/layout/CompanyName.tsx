import { useAuth } from "@/contexts/AuthContext";

/** Customers see their own company where admins see the customer picker. */
export function CompanyName() {
  const { profile } = useAuth();
  if (!profile?.company_name) return null;
  return <span className="min-w-0 truncate text-sm font-semibold">{profile.company_name}</span>;
}
