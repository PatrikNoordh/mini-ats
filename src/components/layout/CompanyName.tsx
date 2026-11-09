import { useActiveCustomer } from "@/contexts/ActiveCustomerContext";

/** Customers see their own company where admins see the customer picker. */
export function CompanyName() {
  const { customer } = useActiveCustomer();
  if (!customer) return null;
  return <span className="min-w-0 truncate text-sm font-semibold">{customer.name}</span>;
}
