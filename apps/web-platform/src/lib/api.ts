import axios from 'axios';
import { useAuthStore, portalForRole, loginPathFor } from '@/store/auth.store';
import { getConnectedWallet } from '@/lib/connected-wallet';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Send an expired session back to the login page it came from, so an issuer
 * is not dropped onto the investor sign-in (and vice versa).
 */
function redirectToLogin() {
  const { user } = useAuthStore.getState();
  useAuthStore.getState().logout();
  window.location.href = loginPathFor(portalForRole(user?.role) ?? 'investor');
}

api.interceptors.request.use(
  (config) => {
    const { token, user } = useAuthStore.getState();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Issuers carry their tenant on the user record; the env var is the
    // fallback the investor portal has always used.
    const tenantId = user?.tenantId || process.env.NEXT_PUBLIC_TENANT_ID;
    if (tenantId) {
      config.headers['X-Tenant-ID'] = tenantId;
    }

    const wallet = getConnectedWallet();
    if (wallet) {
      config.headers['X-Wallet-Address'] = wallet;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const { refreshToken, isAuthenticated } = useAuthStore.getState();
        if (!refreshToken) {
          // Only force logout+redirect if we were actually authenticated.
          // If the store isn't hydrated yet, isAuthenticated is false and we
          // should not redirect — the component will just show an error.
          if (isAuthenticated) {
            redirectToLogin();
          }
          return Promise.reject(error);
        }

        const response = await axios.post(
          `${api.defaults.baseURL}/auth/refresh`,
          { refreshToken }
        );

        const newToken =
          response.data?.tokens?.accessToken || response.data?.accessToken;
        if (!newToken) {
          throw new Error('Refresh token response did not include an access token');
        }
        useAuthStore.getState().setToken(newToken);

        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch {
        redirectToLogin();
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
