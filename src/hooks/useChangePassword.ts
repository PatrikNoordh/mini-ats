import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { changePassword } from "@/lib/api/auth";

/**
 * Changes the signed-in user's own password. Always the signed-in account: an admin acting for a
 * customer changes their own password, never the customer's (ATS-34, AC6).
 */
export function useChangePassword() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: ({ current, next }: { current: string; next: string }) =>
      changePassword(user?.email ?? "", current, next),
  });
}
