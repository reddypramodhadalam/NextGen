import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface AuthUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  isSuperAdmin: boolean | null;
  isActive: boolean | null;
  mustChangePassword: boolean | null;
}

async function fetchUser(): Promise<AuthUser | null> {
  const response = await fetch("/api/auth/user", {
    credentials: "include",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText}`);
  }

  return response.json();
}

async function logoutRequest(): Promise<void> {
  await apiRequest("POST", "/api/auth/logout");
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const logoutMutation = useMutation({
    mutationFn: logoutRequest,
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], null);
      window.location.href = "/";
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    mustChangePassword: user?.mustChangePassword || false,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
